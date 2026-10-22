BEGIN;
-- Additive operational evolution. Existing memberships, orders and history are retained.
ALTER TABLE organization_members DROP CONSTRAINT organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check CHECK(role IN ('owner','admin','staff','manager','cashier','waiter','kitchen'));
ALTER TABLE organization_members ADD COLUMN revoked_at timestamptz;
CREATE TABLE restaurant_member_permissions (
 organization_id uuid NOT NULL,user_id text NOT NULL,permission text NOT NULL CHECK(permission IN ('reports','manage')),
 PRIMARY KEY(organization_id,user_id,permission),
 FOREIGN KEY(organization_id,user_id) REFERENCES organization_members(organization_id,user_id)
);
CREATE OR REPLACE FUNCTION authorized_establishment(p_user text) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT m.organization_id FROM organization_members m
 JOIN organization_owner_claims c ON c.organization_id=m.organization_id
 JOIN organization_members owner ON owner.organization_id=c.organization_id AND owner.user_id=c.user_id AND owner.role='owner' AND owner.revoked_at IS NULL
 WHERE m.user_id=p_user AND m.revoked_at IS NULL
 AND (SELECT count(*) FROM organization_members WHERE user_id=p_user)=1
 AND NOT EXISTS(SELECT 1 FROM organization_ownership_conflicts conflict WHERE conflict.user_id=c.user_id)
$$;
CREATE FUNCTION restaurant_has_permission(p_org uuid,p_user text,p_permission text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=p_org AND m.user_id=p_user AND m.revoked_at IS NULL
 AND authorized_establishment(p_user)=p_org AND (
 m.role='owner' OR (m.role='admin' AND p_permission<>'staff') OR
 (m.role='manager' AND (p_permission IN ('serve','prepare','deliver','cash') OR EXISTS(SELECT 1 FROM restaurant_member_permissions g WHERE g.organization_id=p_org AND g.user_id=p_user AND g.permission=p_permission))) OR
 (m.role='cashier' AND p_permission IN ('serve','deliver','cash')) OR
 (m.role IN ('waiter','staff') AND p_permission IN ('serve','deliver')) OR
 (m.role='kitchen' AND p_permission='prepare')))
$$;
ALTER TABLE restaurant_menu_items ADD COLUMN requires_preparation boolean NOT NULL DEFAULT true;
ALTER TABLE restaurant_order_items ADD COLUMN requires_preparation boolean NOT NULL DEFAULT true;
ALTER TABLE restaurant_order_items ADD COLUMN batch_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE restaurant_order_items ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- Legacy item state was never advanced by kitchen transitions. Reconcile to its known order state once.
UPDATE restaurant_order_items i SET status=o.status FROM restaurant_orders o WHERE i.order_id=o.id AND i.organization_id=o.organization_id AND i.status='recebido' AND o.status IN ('preparando','pronto','entregue');
CREATE TABLE restaurant_item_requests (
 organization_id uuid NOT NULL REFERENCES organizations(id),request_id uuid NOT NULL,order_id uuid NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(organization_id,request_id),FOREIGN KEY(order_id,organization_id) REFERENCES restaurant_orders(id,organization_id)
);
CREATE TABLE restaurant_order_participants (
 organization_id uuid NOT NULL,order_id uuid NOT NULL,user_id text NOT NULL REFERENCES "user"(id),
 PRIMARY KEY(organization_id,order_id,user_id),FOREIGN KEY(order_id,organization_id) REFERENCES restaurant_orders(id,organization_id)
);
CREATE TABLE restaurant_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),event_type text NOT NULL,entity_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,organization_id)
);
CREATE INDEX restaurant_events_org_time ON restaurant_events(organization_id,created_at DESC);
CREATE TABLE restaurant_live_versions(organization_id uuid PRIMARY KEY REFERENCES organizations(id),version bigint NOT NULL DEFAULT 0);
CREATE TABLE restaurant_notifications(
 event_id uuid NOT NULL,organization_id uuid NOT NULL,user_id text NOT NULL REFERENCES "user"(id),read_at timestamptz,
 PRIMARY KEY(event_id,user_id),FOREIGN KEY(event_id,organization_id) REFERENCES restaurant_events(id,organization_id)
);
CREATE INDEX restaurant_notifications_recipient ON restaurant_notifications(organization_id,user_id,event_id);
CREATE TABLE restaurant_notification_preferences(
 organization_id uuid NOT NULL,user_id text NOT NULL,sound_enabled boolean NOT NULL DEFAULT false,push_enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(organization_id,user_id),FOREIGN KEY(organization_id,user_id) REFERENCES organization_members(organization_id,user_id)
);
CREATE FUNCTION restaurant_emit(p_org uuid,p_type text,p_entity uuid,p_order uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid;
BEGIN
 INSERT INTO restaurant_events(organization_id,event_type,entity_id) VALUES(p_org,p_type,p_entity) RETURNING id INTO result;
 INSERT INTO restaurant_live_versions VALUES(p_org,1) ON CONFLICT(organization_id) DO UPDATE SET version=restaurant_live_versions.version+1;
 INSERT INTO restaurant_notifications(event_id,organization_id,user_id)
 SELECT result,p_org,m.user_id FROM organization_members m WHERE m.organization_id=p_org AND m.revoked_at IS NULL AND (
 m.role IN ('owner','admin','manager','cashier') OR
 (m.role='kitchen' AND p_type IN ('order.created','order.items_added','order.cancelled','kitchen.order_received')) OR
 (m.role IN ('waiter','staff') AND p_type NOT LIKE 'cash_register.%' AND (EXISTS(SELECT 1 FROM restaurant_order_participants p WHERE p.organization_id=p_org AND p.order_id=p_order AND p.user_id=m.user_id) OR EXISTS(SELECT 1 FROM restaurant_orders o WHERE o.id=p_order AND o.organization_id=p_org AND o.created_by=m.user_id)))
 );
 RETURN result;
END $$;
CREATE FUNCTION restaurant_operational_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text;
BEGIN
 IF TG_TABLE_NAME='restaurant_orders' THEN
  IF TG_OP='INSERT' THEN kind:='order.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN kind:=CASE NEW.status WHEN 'preparando' THEN 'kitchen.preparation_started' WHEN 'pronto' THEN 'kitchen.order_ready' WHEN 'cancelado' THEN 'order.cancelled' ELSE 'order.status_changed' END;
  ELSIF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN kind:='table.closed';
  ELSE kind:='table.updated'; END IF;
  PERFORM restaurant_emit(NEW.organization_id,kind,NEW.id,NEW.id);
 ELSIF TG_TABLE_NAME='restaurant_order_items' THEN
  IF TG_OP='INSERT' THEN kind:='order.items_added';
  ELSE kind:=CASE NEW.status WHEN 'preparando' THEN 'kitchen.preparation_started' WHEN 'pronto' THEN 'kitchen.order_ready' ELSE 'order.status_changed' END; END IF;
  PERFORM restaurant_emit(NEW.organization_id,kind,NEW.order_id,NEW.order_id);
 ELSIF TG_TABLE_NAME='restaurant_payments' THEN PERFORM restaurant_emit(NEW.organization_id,'payment.confirmed',NEW.order_id,NEW.order_id);
 ELSIF TG_TABLE_NAME='restaurant_tables' THEN PERFORM restaurant_emit(NEW.organization_id,'table.updated',NEW.id);
 ELSE PERFORM restaurant_emit(NEW.organization_id,'cash_register.updated',NEW.id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER restaurant_order_events AFTER INSERT OR UPDATE ON restaurant_orders FOR EACH ROW EXECUTE FUNCTION restaurant_operational_event();
CREATE TRIGGER restaurant_item_events AFTER INSERT OR UPDATE OF status,order_id ON restaurant_order_items FOR EACH ROW EXECUTE FUNCTION restaurant_operational_event();
CREATE TRIGGER restaurant_payment_events AFTER INSERT ON restaurant_payments FOR EACH ROW EXECUTE FUNCTION restaurant_operational_event();
CREATE TRIGGER restaurant_table_events AFTER INSERT OR UPDATE ON restaurant_tables FOR EACH ROW EXECUTE FUNCTION restaurant_operational_event();
CREATE TRIGGER restaurant_cash_events AFTER INSERT OR UPDATE ON restaurant_cash_sessions FOR EACH ROW EXECUTE FUNCTION restaurant_operational_event();
CREATE TRIGGER restaurant_cash_movement_events AFTER INSERT ON restaurant_cash_movements FOR EACH ROW EXECUTE FUNCTION restaurant_operational_event();
CREATE OR REPLACE FUNCTION restaurant_guard_order_item_changes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent restaurant_orders%ROWTYPE;
BEGIN
 SELECT * INTO parent FROM restaurant_orders WHERE id=NEW.order_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF NOT FOUND OR parent.completed_at IS NOT NULL OR parent.status='cancelado' THEN RAISE EXCEPTION 'order_not_editable'; END IF;
 IF TG_OP='UPDATE' AND (parent.status<>'recebido' OR OLD.status<>'recebido') THEN RAISE EXCEPTION 'order_not_editable_after_preparation'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT requires_preparation INTO NEW.requires_preparation FROM restaurant_menu_items WHERE id=NEW.menu_item_id AND organization_id=NEW.organization_id;
  NEW.batch_id:=coalesce(nullif(current_setting('meupedido.batch',true),'')::uuid,NEW.batch_id);
  IF NOT NEW.requires_preparation THEN NEW.status:='pronto'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION restaurant_create_order(
 p_org uuid,p_user text,p_channel text,p_table uuid,p_customer uuid,p_notes text,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order uuid; v_line jsonb; v_menu restaurant_menu_items%ROWTYPE;
v_qty integer; v_item uuid; v_addons integer; v_addon jsonb; v_addon_row restaurant_addons%ROWTYPE; v_subtotal bigint:=0;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_channel NOT IN ('balcao','mesa','retirada','delivery') THEN RAISE EXCEPTION 'invalid_channel'; END IF;
 IF p_channel='mesa' AND p_table IS NULL THEN RAISE EXCEPTION 'table_required'; END IF;
 IF p_table IS NOT NULL AND NOT EXISTS(SELECT 1 FROM restaurant_tables WHERE id=p_table AND organization_id=p_org AND active)
 THEN RAISE EXCEPTION 'invalid_table'; END IF;
 IF p_customer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM restaurant_customers WHERE id=p_customer AND organization_id=p_org)
 THEN RAISE EXCEPTION 'invalid_customer'; END IF;
 IF jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_items'; END IF;
 INSERT INTO restaurant_orders(organization_id,channel,table_id,customer_id,created_by,notes)
 VALUES(p_org,p_channel,p_table,p_customer,p_user,left(coalesce(p_notes,''),1000)) RETURNING id INTO v_order;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
 LOOP
  IF jsonb_typeof(v_line)<>'object' THEN RAISE EXCEPTION 'invalid_item'; END IF;
  SELECT * INTO v_menu FROM restaurant_menu_items WHERE id=(v_line->>'menuItemId')::uuid AND organization_id=p_org AND available;
  IF NOT FOUND THEN RAISE EXCEPTION 'unavailable_item'; END IF;
  v_qty:=(v_line->>'quantity')::integer;
  IF v_qty NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF jsonb_typeof(coalesce(v_line->'addons','[]'::jsonb))<>'array' OR jsonb_array_length(coalesce(v_line->'addons','[]'::jsonb))>20
  THEN RAISE EXCEPTION 'invalid_addons'; END IF;
  v_addons:=0;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(coalesce(v_line->'addons','[]'::jsonb))
  LOOP
   SELECT * INTO v_addon_row FROM restaurant_addons WHERE id=(v_addon#>>'{}')::uuid AND organization_id=p_org AND menu_item_id=v_menu.id AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_addon'; END IF;
   v_addons:=v_addons+v_addon_row.price_cents;
  END LOOP;
  INSERT INTO restaurant_order_items(organization_id,order_id,menu_item_id,name_snapshot,quantity,unit_price_cents,addons_cents,notes)
  VALUES(p_org,v_order,v_menu.id,v_menu.name,v_qty,v_menu.price_cents,v_addons,left(coalesce(v_line->>'notes',''),500))
  RETURNING id INTO v_item;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(coalesce(v_line->'addons','[]'::jsonb))
  LOOP
   SELECT * INTO v_addon_row FROM restaurant_addons WHERE id=(v_addon#>>'{}')::uuid AND organization_id=p_org AND menu_item_id=v_menu.id AND active;
   INSERT INTO restaurant_order_item_addons(organization_id,order_item_id,addon_id,name_snapshot,price_cents)
   VALUES(p_org,v_item,v_addon_row.id,v_addon_row.name,v_addon_row.price_cents);
  END LOOP;
  v_subtotal:=v_subtotal+(v_menu.price_cents+v_addons)*v_qty;
  IF v_subtotal>1000000000 THEN RAISE EXCEPTION 'order_too_large'; END IF;
 END LOOP;
 UPDATE restaurant_orders SET subtotal_cents=v_subtotal,total_cents=v_subtotal WHERE id=v_order;
 RETURN v_order;
END $$;

CREATE OR REPLACE FUNCTION restaurant_create_delivery_order(
 p_org uuid,p_user text,p_customer uuid,p_address uuid,p_fee integer,p_notes text,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order uuid;
BEGIN
 IF p_customer IS NULL OR p_address IS NULL THEN RAISE EXCEPTION 'delivery_customer_address_required'; END IF;
 IF p_fee IS NULL OR p_fee<0 OR p_fee>1000000 THEN RAISE EXCEPTION 'invalid_delivery_fee'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM restaurant_customer_addresses a
  WHERE a.id=p_address AND a.customer_id=p_customer AND a.organization_id=p_org
 ) THEN RAISE EXCEPTION 'invalid_delivery_address'; END IF;
 v_order:=restaurant_create_order(p_org,p_user,'delivery',NULL,p_customer,p_notes,p_lines);
 UPDATE restaurant_orders o
 SET delivery_address_id=p_address,delivery_fee_cents=p_fee,
 total_cents=o.total_cents+p_fee,updated_at=now()
 WHERE o.id=v_order AND o.organization_id=p_org AND o.total_cents+p_fee<=1000000000;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_too_large'; END IF;
 RETURN v_order;
END $$;

CREATE OR REPLACE FUNCTION restaurant_add_order_items(p_org uuid,p_user text,p_order uuid,p_lines jsonb)
RETURNS TABLE(order_id uuid, subtotal_cents integer, total_cents integer)
LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE; v_line jsonb; v_menu restaurant_menu_items%ROWTYPE;
v_qty integer; v_item uuid; v_addons integer; v_addon jsonb; v_addon_row restaurant_addons%ROWTYPE; v_extra bigint:=0;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.completed_at IS NOT NULL OR v_order.status='cancelado' THEN RAISE EXCEPTION 'order_not_editable'; END IF;
 IF jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_items'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT * INTO v_menu FROM restaurant_menu_items WHERE id=(v_line->>'menuItemId')::uuid AND organization_id=p_org AND available;
  IF NOT FOUND THEN RAISE EXCEPTION 'unavailable_item'; END IF;
  v_qty:=(v_line->>'quantity')::integer;
  IF v_qty NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF jsonb_typeof(coalesce(v_line->'addons','[]'::jsonb))<>'array' OR jsonb_array_length(coalesce(v_line->'addons','[]'::jsonb))>20 THEN RAISE EXCEPTION 'invalid_addons'; END IF;
  v_addons:=0;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(coalesce(v_line->'addons','[]'::jsonb)) LOOP
   SELECT * INTO v_addon_row FROM restaurant_addons WHERE id=(v_addon#>>'{}')::uuid AND organization_id=p_org AND menu_item_id=v_menu.id AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_addon'; END IF;
   v_addons:=v_addons+v_addon_row.price_cents;
  END LOOP;
  INSERT INTO restaurant_order_items(organization_id,order_id,menu_item_id,name_snapshot,quantity,unit_price_cents,addons_cents,notes)
  VALUES(p_org,p_order,v_menu.id,v_menu.name,v_qty,v_menu.price_cents,v_addons,left(coalesce(v_line->>'notes',''),500)) RETURNING id INTO v_item;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(coalesce(v_line->'addons','[]'::jsonb)) LOOP
   SELECT * INTO v_addon_row FROM restaurant_addons WHERE id=(v_addon#>>'{}')::uuid AND organization_id=p_org AND menu_item_id=v_menu.id AND active;
   INSERT INTO restaurant_order_item_addons(organization_id,order_item_id,addon_id,name_snapshot,price_cents)
   VALUES(p_org,v_item,v_addon_row.id,v_addon_row.name,v_addon_row.price_cents);
  END LOOP;
  v_extra:=v_extra+(v_menu.price_cents+v_addons)*v_qty;
 END LOOP;
 IF v_order.subtotal_cents+v_extra>1000000000 THEN RAISE EXCEPTION 'order_too_large'; END IF;
 UPDATE restaurant_orders o SET subtotal_cents=o.subtotal_cents+v_extra,total_cents=o.total_cents+v_extra,status='recebido',payment_status=CASE WHEN o.payment_status='pago' THEN 'parcial' ELSE o.payment_status END,closed_at=NULL,updated_at=now()
 WHERE o.id=p_order AND o.organization_id=p_org
 RETURNING o.subtotal_cents,o.total_cents INTO subtotal_cents,total_cents;
 order_id:=p_order;RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION restaurant_checkout_once(p_org uuid,p_user text,p_request uuid,p_body jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_existing restaurant_request_keys%ROWTYPE;v_order uuid;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 SELECT * INTO v_existing FROM restaurant_request_keys WHERE organization_id=p_org AND request_id=p_request;
 IF FOUND THEN
  IF v_existing.payload IS DISTINCT FROM p_body THEN RAISE EXCEPTION 'request_payload_mismatch'; END IF;
  RETURN v_existing.order_id;
 END IF;
 PERFORM set_config('meupedido.batch',p_request::text,true);
 IF p_body->>'channel'='mesa' THEN
  PERFORM 1 FROM restaurant_tables WHERE id=(p_body->>'tableId')::uuid AND organization_id=p_org AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_table'; END IF;
  SELECT id INTO v_order FROM restaurant_open_orders WHERE organization_id=p_org AND table_id=(p_body->>'tableId')::uuid ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 END IF;
 IF v_order IS NOT NULL THEN
  INSERT INTO restaurant_order_participants VALUES(p_org,v_order,p_user) ON CONFLICT DO NOTHING;
  PERFORM restaurant_add_order_items(p_org,p_user,v_order,p_body->'items');
 ELSIF p_body->>'channel'='delivery' THEN
  v_order:=restaurant_create_delivery_order(p_org,p_user,(p_body->>'customerId')::uuid,(p_body->>'deliveryAddressId')::uuid,(p_body->>'deliveryFeeCents')::integer,p_body->>'notes',p_body->'items');
 ELSE
  v_order:=restaurant_create_order(p_org,p_user,p_body->>'channel',(p_body->>'tableId')::uuid,(p_body->>'customerId')::uuid,p_body->>'notes',p_body->'items');
 END IF;
 IF coalesce((p_body->>'discountCents')::integer,0)<>0 THEN PERFORM restaurant_set_discount(p_org,p_user,v_order,(p_body->>'discountCents')::integer); END IF;
 INSERT INTO restaurant_order_participants VALUES(p_org,v_order,p_user) ON CONFLICT DO NOTHING;
 INSERT INTO restaurant_request_keys VALUES(p_org,p_request,p_body,v_order);
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'order.created',v_order);
 RETURN v_order;
END $$;

CREATE OR REPLACE FUNCTION restaurant_record_payment(
 p_org uuid,p_user text,p_order uuid,p_method text,p_amount integer
) RETURNS TABLE(order_id uuid,paid_cents bigint,remaining_cents bigint,payment_status text)
LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;v_paid bigint;v_session uuid;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'cash') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_method NOT IN ('dinheiro','pix','debito','credito','outro') OR p_amount<=0 THEN RAISE EXCEPTION 'invalid_payment'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.status='cancelado' THEN RAISE EXCEPTION 'invalid_order'; END IF;
 SELECT COALESCE(SUM(amount_cents),0) INTO v_paid FROM restaurant_payments WHERE organization_id=p_org AND restaurant_payments.order_id=p_order;
 IF v_paid+p_amount>v_order.total_cents THEN RAISE EXCEPTION 'payment_exceeds_balance'; END IF;
 SELECT s.id INTO v_session FROM restaurant_cash_sessions s WHERE s.organization_id=p_org AND s.closed_at IS NULL FOR UPDATE;
 IF p_method='dinheiro' AND v_session IS NULL THEN RAISE EXCEPTION 'cash_session_required'; END IF;
 INSERT INTO restaurant_payments(organization_id,order_id,method,amount_cents,cash_session_id)
 VALUES(p_org,p_order,p_method,p_amount,v_session);
 v_paid:=v_paid+p_amount;
 UPDATE restaurant_orders AS o SET payment_status=CASE WHEN v_paid=o.total_cents THEN 'pago' WHEN v_paid>0 THEN 'parcial' ELSE 'pendente' END,
 closed_at=CASE WHEN v_paid=o.total_cents THEN now() ELSE NULL END,updated_at=now()
 WHERE o.id=p_order AND o.organization_id=p_org;
 RETURN QUERY SELECT p_order,v_paid,v_order.total_cents-v_paid,
 CASE WHEN v_paid=v_order.total_cents THEN 'pago' WHEN v_paid>0 THEN 'parcial' ELSE 'pendente' END;
END $$;

CREATE OR REPLACE FUNCTION restaurant_record_payment_once(p_org uuid,p_user text,p_order uuid,p_method text,p_amount integer,p_request uuid)
RETURNS TABLE(order_id uuid,paid_cents bigint,remaining_cents bigint,payment_status text) LANGUAGE plpgsql AS $$
DECLARE v_old restaurant_payments%ROWTYPE;v_before uuid[];
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'cash') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 PERFORM 1 FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_order'; END IF;
 SELECT * INTO v_old FROM restaurant_payments p WHERE p.organization_id=p_org AND p.request_id=p_request;
 IF FOUND THEN
  IF v_old.order_id<>p_order OR v_old.method<>p_method OR v_old.amount_cents<>p_amount THEN RAISE EXCEPTION 'request_payload_mismatch'; END IF;
  RETURN QUERY SELECT o.id,coalesce(sum(p.amount_cents),0)::bigint,(o.total_cents-coalesce(sum(p.amount_cents),0))::bigint,o.payment_status
   FROM restaurant_orders o LEFT JOIN restaurant_payments p ON p.order_id=o.id AND p.organization_id=o.organization_id
   WHERE o.id=p_order AND o.organization_id=p_org GROUP BY o.id;
  RETURN;
 END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO v_before FROM restaurant_payments WHERE organization_id=p_org AND restaurant_payments.order_id=p_order;
 RETURN QUERY SELECT * FROM restaurant_record_payment(p_org,p_user,p_order,p_method,p_amount);
 UPDATE restaurant_payments p SET request_id=p_request WHERE p.id=(SELECT x.id FROM restaurant_payments x WHERE x.organization_id=p_org AND x.order_id=p_order AND NOT(x.id=ANY(v_before)) LIMIT 1);
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'payment.recorded',p_order);
END $$;

CREATE OR REPLACE FUNCTION restaurant_cash_open(p_org uuid,p_user text,p_opening integer)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'cash') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_opening<0 OR p_opening>1000000000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
 INSERT INTO restaurant_cash_sessions(organization_id,opened_by,opening_cents)
 VALUES(p_org,p_user,p_opening) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION restaurant_cash_move(p_org uuid,p_user text,p_session uuid,p_kind text,p_amount integer,p_notes text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'cash') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_kind NOT IN ('suprimento','sangria') OR p_amount<=0 OR p_amount>1000000000 THEN RAISE EXCEPTION 'invalid_movement'; END IF;
 PERFORM 1 FROM restaurant_cash_sessions WHERE id=p_session AND organization_id=p_org AND closed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'cash_not_open'; END IF;
 INSERT INTO restaurant_cash_movements(organization_id,session_id,kind,amount_cents,notes,created_by)
 VALUES(p_org,p_session,p_kind,p_amount,left(coalesce(p_notes,''),500),p_user) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION restaurant_cash_close(p_org uuid,p_user text,p_session uuid,p_counted integer)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'cash') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_counted<0 OR p_counted>1000000000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
 UPDATE restaurant_cash_sessions SET closed_at=now(),closed_by=p_user,counted_cents=p_counted
 WHERE id=p_session AND organization_id=p_org AND closed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'cash_not_open'; END IF;
 RETURN p_session;
END $$;

CREATE OR REPLACE FUNCTION restaurant_close_order(p_org uuid,p_user text,p_order uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;v_paid bigint;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'cash') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_order'; END IF;
 IF v_order.completed_at IS NOT NULL THEN RETURN p_order; END IF;
 SELECT coalesce(sum(amount_cents),0) INTO v_paid FROM restaurant_payments WHERE organization_id=p_org AND order_id=p_order;
 IF v_paid<v_order.total_cents THEN RAISE EXCEPTION 'unpaid_balance'; END IF;
 IF v_order.status NOT IN ('entregue','cancelado') AND EXISTS(SELECT 1 FROM restaurant_order_items WHERE order_id=p_order AND organization_id=p_org AND status<>'cancelado') THEN RAISE EXCEPTION 'fulfillment_pending'; END IF;
 UPDATE restaurant_orders SET completed_at=now(),updated_at=now(),status=CASE WHEN status='recebido' THEN 'cancelado' ELSE status END WHERE id=p_order;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'order.closed',p_order);
 RETURN p_order;
END $$;

CREATE OR REPLACE FUNCTION restaurant_cancel_order(p_org uuid,p_user text,p_order uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
 IF v_order.status<>'recebido' OR v_order.payment_status<>'pendente'
 OR EXISTS(SELECT 1 FROM restaurant_payments WHERE organization_id=p_org AND order_id=p_order)
 OR EXISTS(SELECT 1 FROM restaurant_order_inventory_consumptions c JOIN restaurant_order_items i
  ON i.id=c.order_item_id AND i.organization_id=c.organization_id WHERE i.organization_id=p_org AND i.order_id=p_order)
 THEN RAISE EXCEPTION 'order_cannot_be_cancelled'; END IF;
 UPDATE restaurant_orders SET status='cancelado',updated_at=now() WHERE id=p_order AND organization_id=p_org;
 UPDATE restaurant_order_items SET status='cancelado' WHERE order_id=p_order AND organization_id=p_org;
 RETURN p_order;
END $$;

CREATE OR REPLACE FUNCTION restaurant_cancel_item(p_org uuid,p_user text,p_item uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_item restaurant_order_items%ROWTYPE;v_order restaurant_orders%ROWTYPE;v_amount integer;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_item FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=v_item.order_id AND organization_id=p_org FOR UPDATE;
 IF v_order.id IS NULL OR v_order.status<>'recebido' OR v_order.payment_status<>'pendente' THEN RAISE EXCEPTION 'order_not_editable'; END IF;
 SELECT * INTO v_item FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org FOR UPDATE;
 IF v_item.order_id IS DISTINCT FROM v_order.id THEN RAISE EXCEPTION 'item_moved_retry'; END IF;
 IF v_item.status='cancelado' THEN RETURN v_order.id; END IF;
 v_amount:=(v_item.unit_price_cents+v_item.addons_cents)*v_item.quantity;
 IF v_order.subtotal_cents-v_amount<v_order.discount_cents THEN RAISE EXCEPTION 'discount_exceeds_total'; END IF;
 UPDATE restaurant_order_items SET status='cancelado' WHERE id=p_item AND organization_id=p_org;
 UPDATE restaurant_orders SET subtotal_cents=subtotal_cents-v_amount,total_cents=total_cents-v_amount,updated_at=now() WHERE id=v_order.id;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'item.canceled',p_item);
 RETURN v_order.id;
END $$;

CREATE OR REPLACE FUNCTION restaurant_set_discount(p_org uuid,p_user text,p_order uuid,p_discount integer)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.status='cancelado' OR v_order.payment_status<>'pendente' OR p_discount IS NULL OR p_discount<0 OR p_discount>v_order.subtotal_cents THEN RAISE EXCEPTION 'invalid_discount'; END IF;
 UPDATE restaurant_orders SET discount_cents=p_discount,total_cents=subtotal_cents-p_discount+delivery_fee_cents,updated_at=now() WHERE id=p_order;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'order.discount',p_order);
 RETURN v_order.subtotal_cents-p_discount+v_order.delivery_fee_cents;
END $$;

CREATE OR REPLACE FUNCTION restaurant_adjust_ingredient(p_org uuid,p_user text,p_ingredient uuid,p_kind text,p_quantity numeric,p_notes text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_balance numeric;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_kind NOT IN ('entrada','ajuste_positivo','ajuste_negativo') OR p_quantity<=0 OR p_quantity>100000000 THEN RAISE EXCEPTION 'invalid_movement'; END IF;
 UPDATE restaurant_ingredients SET quantity=quantity+CASE WHEN p_kind='ajuste_negativo' THEN -p_quantity ELSE p_quantity END
 WHERE id=p_ingredient AND organization_id=p_org AND quantity+CASE WHEN p_kind='ajuste_negativo' THEN -p_quantity ELSE p_quantity END>=0 RETURNING quantity INTO v_balance;
 IF NOT FOUND THEN RAISE EXCEPTION 'ingredient_missing_or_insufficient_stock'; END IF;
 INSERT INTO restaurant_inventory_movements(organization_id,ingredient_id,movement_type,quantity,notes) VALUES(p_org,p_ingredient,p_kind,p_quantity,left(coalesce(p_notes,''),500));
 RETURN v_balance;
END $$;

CREATE OR REPLACE FUNCTION restaurant_set_recipe(
 p_org uuid, p_user text, p_menu_item uuid, p_lines jsonb
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_line jsonb; v_count integer := 0; v_id uuid; v_qty numeric;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM organization_members
   WHERE organization_id = p_org AND user_id = p_user AND role IN ('owner','admin')
 ) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM restaurant_menu_items
   WHERE id = p_menu_item AND organization_id = p_org FOR UPDATE
 ) THEN RAISE EXCEPTION 'invalid_product'; END IF;
 IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) > 100
 THEN RAISE EXCEPTION 'invalid_recipe'; END IF;
 DELETE FROM restaurant_recipes
 WHERE organization_id = p_org AND menu_item_id = p_menu_item;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   v_id := (v_line->>'ingredientId')::uuid;
   v_qty := (v_line->>'quantity')::numeric;
   IF v_qty <= 0 OR v_qty > 100000000 OR NOT EXISTS (
     SELECT 1 FROM restaurant_ingredients WHERE id = v_id AND organization_id = p_org
   ) THEN RAISE EXCEPTION 'invalid_ingredient'; END IF;
   INSERT INTO restaurant_recipes(organization_id,menu_item_id,ingredient_id,quantity)
   VALUES (p_org,p_menu_item,v_id,v_qty);
   v_count := v_count + 1;
 END LOOP;
 RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION restaurant_transfer_order_item(p_org uuid,p_user text,p_item uuid,p_target uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_source uuid;v_target restaurant_orders%ROWTYPE;v_item restaurant_order_items%ROWTYPE;v_amount bigint;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT order_id INTO v_source FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org;
 IF v_source IS NULL OR v_source=p_target THEN RAISE EXCEPTION 'invalid_transfer'; END IF;
 PERFORM 1 FROM restaurant_orders WHERE id IN (v_source,p_target) AND organization_id=p_org ORDER BY id FOR UPDATE;
 SELECT * INTO v_target FROM restaurant_orders WHERE id=p_target AND organization_id=p_org;
 SELECT * INTO v_item FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_item.status='cancelado' OR v_item.order_id<>v_source OR v_target.id IS NULL THEN RAISE EXCEPTION 'invalid_transfer'; END IF;
 IF EXISTS(SELECT 1 FROM restaurant_orders WHERE id IN (v_source,p_target) AND (payment_status<>'pendente' OR status IN ('cancelado','entregue'))) THEN RAISE EXCEPTION 'order_not_editable'; END IF;
 v_amount:=(v_item.unit_price_cents+v_item.addons_cents)*v_item.quantity;
 UPDATE restaurant_order_items SET order_id=p_target WHERE id=p_item AND organization_id=p_org;
 UPDATE restaurant_orders SET subtotal_cents=subtotal_cents-v_amount,total_cents=total_cents-v_amount,updated_at=now() WHERE id=v_source AND organization_id=p_org;
 UPDATE restaurant_orders SET subtotal_cents=subtotal_cents+v_amount,total_cents=total_cents+v_amount,updated_at=now() WHERE id=p_target AND organization_id=p_org;
 RETURN p_target;
END $$;

CREATE OR REPLACE FUNCTION restaurant_update_delivery(
 p_org uuid,p_user text,p_order uuid,p_next text,p_driver text,p_phone text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_channel text;v_status text;v_current text;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT channel,status INTO v_channel,v_status FROM restaurant_orders
 WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_channel<>'delivery' OR v_status='cancelado' THEN RAISE EXCEPTION 'invalid_delivery_order'; END IF;
 INSERT INTO restaurant_delivery_tracking(organization_id,order_id)
 VALUES(p_org,p_order) ON CONFLICT DO NOTHING;
 SELECT status INTO v_current FROM restaurant_delivery_tracking
 WHERE organization_id=p_org AND order_id=p_order FOR UPDATE;
 IF v_current=p_next THEN RETURN p_next; END IF;
 IF NOT ((v_current='aguardando' AND p_next='despachado' AND v_status IN ('pronto','entregue'))
 OR (v_current='despachado' AND p_next IN ('em_rota','falhou'))
 OR (v_current='em_rota' AND p_next IN ('entregue','falhou'))
 OR (v_current='falhou' AND p_next='despachado'))
 THEN RAISE EXCEPTION 'invalid_delivery_transition'; END IF;
 UPDATE restaurant_delivery_tracking SET status=p_next,
 driver_name=left(coalesce(p_driver,driver_name,''),120),
 driver_phone=left(coalesce(p_phone,driver_phone,''),40),
 dispatched_at=CASE WHEN p_next='despachado' THEN now() ELSE dispatched_at END,
 delivered_at=CASE WHEN p_next='entregue' THEN now() ELSE NULL END,
 updated_at=now()
 WHERE organization_id=p_org AND order_id=p_order;
 IF p_next='entregue' AND v_status='pronto' THEN PERFORM restaurant_kitchen_transition(p_org,p_user,p_order,'entregue'); END IF;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'delivery.'||p_next,p_order);
 RETURN p_next;
END $$;

CREATE OR REPLACE FUNCTION restaurant_consume_order_inventory(p_org uuid,p_user text,p_order uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;v_recipe record;v_count integer:=0;v_balance numeric;
BEGIN
 IF NOT (restaurant_has_permission(p_org,p_user,'prepare') OR restaurant_has_permission(p_org,p_user,'serve')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.status='cancelado' THEN RAISE EXCEPTION 'invalid_order'; END IF;
 FOR v_recipe IN
  SELECT oi.id AS item_id,r.ingredient_id,SUM(r.quantity*oi.quantity)::numeric(14,3) AS needed
  FROM restaurant_order_items oi JOIN restaurant_recipes r
    ON r.organization_id=oi.organization_id AND r.menu_item_id=oi.menu_item_id
  WHERE oi.organization_id=p_org AND oi.order_id=p_order AND oi.status IN ('preparando','pronto','entregue')
  GROUP BY oi.id,r.ingredient_id
  ORDER BY r.ingredient_id,oi.id
 LOOP
  IF EXISTS(SELECT 1 FROM restaurant_order_inventory_consumptions c
    WHERE c.organization_id=p_org AND c.order_item_id=v_recipe.item_id AND c.ingredient_id=v_recipe.ingredient_id) THEN CONTINUE; END IF;
  UPDATE restaurant_ingredients SET quantity=quantity-v_recipe.needed
   WHERE id=v_recipe.ingredient_id AND organization_id=p_org AND quantity>=v_recipe.needed
   RETURNING quantity INTO v_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient_stock'; END IF;
  INSERT INTO restaurant_order_inventory_consumptions(organization_id,order_item_id,ingredient_id,quantity)
  VALUES(p_org,v_recipe.item_id,v_recipe.ingredient_id,v_recipe.needed);
  INSERT INTO restaurant_inventory_movements(organization_id,ingredient_id,order_id,movement_type,quantity,notes)
  VALUES(p_org,v_recipe.ingredient_id,p_order,'consumo',v_recipe.needed,'Consumo automático por venda');
  v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END $$;

CREATE FUNCTION restaurant_add_items_once(p_org uuid,p_user text,p_order uuid,p_request uuid,p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE previous restaurant_item_requests%ROWTYPE;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 SELECT * INTO previous FROM restaurant_item_requests WHERE organization_id=p_org AND request_id=p_request;
 IF FOUND THEN
  IF previous.order_id<>p_order OR previous.payload IS DISTINCT FROM p_lines THEN RAISE EXCEPTION 'request_payload_mismatch'; END IF;
  RETURN p_order;
 END IF;
 PERFORM set_config('meupedido.batch',p_request::text,true);
 INSERT INTO restaurant_order_participants VALUES(p_org,p_order,p_user) ON CONFLICT DO NOTHING;
 PERFORM restaurant_add_order_items(p_org,p_user,p_order,p_lines);
 INSERT INTO restaurant_item_requests VALUES(p_org,p_request,p_order,p_lines);
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'order.items_added',p_order);
 RETURN p_order;
END $$;
CREATE FUNCTION restaurant_refresh_order_status(p_org uuid,p_order uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE result text;
BEGIN
 SELECT CASE WHEN bool_or(status='recebido') THEN 'recebido' WHEN bool_or(status='preparando') THEN 'preparando' WHEN bool_or(status='pronto') THEN 'pronto' ELSE 'entregue' END INTO result
 FROM restaurant_order_items WHERE organization_id=p_org AND order_id=p_order AND status<>'cancelado';
 UPDATE restaurant_orders SET status=result,updated_at=now() WHERE id=p_order AND organization_id=p_org AND status<>result;
 RETURN result;
END $$;
CREATE FUNCTION restaurant_item_transition(p_org uuid,p_user text,p_order uuid,p_item uuid,p_next text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE line restaurant_order_items%ROWTYPE; parent restaurant_orders%ROWTYPE; expected text;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,CASE WHEN p_next='entregue' THEN 'deliver' ELSE 'prepare' END) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO parent FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR parent.status='cancelado' THEN RAISE EXCEPTION 'invalid_order'; END IF;
 SELECT * INTO line FROM restaurant_order_items WHERE id=p_item AND order_id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR line.status='cancelado' THEN RAISE EXCEPTION 'invalid_item'; END IF;
 IF line.status=p_next THEN RETURN p_next; END IF; -- retry from another device
 IF parent.completed_at IS NOT NULL THEN RAISE EXCEPTION 'order_closed'; END IF;
 expected:=CASE line.status WHEN 'recebido' THEN 'preparando' WHEN 'preparando' THEN 'pronto' WHEN 'pronto' THEN 'entregue' END;
 IF p_next IS DISTINCT FROM expected THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 UPDATE restaurant_order_items SET status=p_next,updated_at=now() WHERE id=p_item AND organization_id=p_org;
 IF p_next='preparando' OR (NOT line.requires_preparation AND p_next='entregue') THEN PERFORM restaurant_consume_order_inventory(p_org,p_user,p_order); END IF;
 PERFORM restaurant_refresh_order_status(p_org,p_order);
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'item.'||p_next,p_item);
 RETURN p_next;
END $$;
CREATE OR REPLACE FUNCTION restaurant_kitchen_transition(p_org uuid,p_user text,p_order uuid,p_next text)
RETURNS TABLE(id uuid,status text) LANGUAGE plpgsql AS $$
DECLARE line record;expected text; found_any boolean:=false;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,CASE WHEN p_next='entregue' THEN 'deliver' ELSE 'prepare' END) THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM 1 FROM restaurant_orders WHERE restaurant_orders.id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
 expected:=CASE p_next WHEN 'preparando' THEN 'recebido' WHEN 'pronto' THEN 'preparando' WHEN 'entregue' THEN 'pronto' END;
 IF expected IS NULL THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 FOR line IN SELECT i.id FROM restaurant_order_items i WHERE i.organization_id=p_org AND i.order_id=p_order AND i.status=expected ORDER BY i.id LOOP
  found_any:=true; PERFORM restaurant_item_transition(p_org,p_user,p_order,line.id,p_next);
 END LOOP;
 IF NOT found_any AND NOT EXISTS(SELECT 1 FROM restaurant_order_items i WHERE i.organization_id=p_org AND i.order_id=p_order AND i.status=p_next) THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 RETURN QUERY SELECT o.id,o.status FROM restaurant_orders o WHERE o.id=p_order AND o.organization_id=p_org;
END $$;
COMMIT;
