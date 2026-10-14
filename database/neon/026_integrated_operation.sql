BEGIN;
ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE OR REPLACE VIEW restaurant_open_orders AS
 SELECT * FROM restaurant_orders WHERE status<>'cancelado' AND completed_at IS NULL
 AND NOT(status='entregue' AND payment_status='pago');
CREATE OR REPLACE FUNCTION restaurant_close_order(p_org uuid,p_user text,p_order uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;v_paid bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
CREATE OR REPLACE FUNCTION restaurant_guard_fulfillment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.completed_at IS NOT NULL AND (NEW.status,NEW.total_cents,NEW.table_id,NEW.payment_status) IS DISTINCT FROM (OLD.status,OLD.total_cents,OLD.table_id,OLD.payment_status) THEN RAISE EXCEPTION 'order_closed'; END IF;
 IF NEW.channel='delivery' AND NEW.status='entregue' AND OLD.status<>'entregue' AND NOT EXISTS(SELECT 1 FROM restaurant_delivery_tracking WHERE order_id=NEW.id AND organization_id=NEW.organization_id AND status='entregue') THEN RAISE EXCEPTION 'delivery_pending'; END IF;
 IF NEW.status='entregue' AND NEW.payment_status='pago' THEN NEW.completed_at=coalesce(NEW.completed_at,now()); END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER restaurant_fulfillment_guard BEFORE UPDATE ON restaurant_orders FOR EACH ROW EXECUTE FUNCTION restaurant_guard_fulfillment();
CREATE OR REPLACE FUNCTION restaurant_checkout_once(p_org uuid,p_user text,p_request uuid,p_body jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_existing restaurant_request_keys%ROWTYPE;v_order uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 SELECT * INTO v_existing FROM restaurant_request_keys WHERE organization_id=p_org AND request_id=p_request;
 IF FOUND THEN
  IF v_existing.payload IS DISTINCT FROM p_body THEN RAISE EXCEPTION 'request_payload_mismatch'; END IF;
  RETURN v_existing.order_id;
 END IF;
 IF p_body->>'channel'='delivery' THEN
  v_order:=restaurant_create_delivery_order(p_org,p_user,(p_body->>'customerId')::uuid,(p_body->>'deliveryAddressId')::uuid,(p_body->>'deliveryFeeCents')::integer,p_body->>'notes',p_body->'items');
 ELSE
  v_order:=restaurant_create_order(p_org,p_user,p_body->>'channel',(p_body->>'tableId')::uuid,(p_body->>'customerId')::uuid,p_body->>'notes',p_body->'items');
 END IF;
 IF coalesce((p_body->>'discountCents')::integer,0)<>0 THEN PERFORM restaurant_set_discount(p_org,p_user,v_order,(p_body->>'discountCents')::integer); END IF;
 INSERT INTO restaurant_request_keys VALUES(p_org,p_request,p_body,v_order);
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'order.created',v_order);
 RETURN v_order;
END $$;
CREATE OR REPLACE FUNCTION restaurant_update_delivery(
 p_org uuid,p_user text,p_order uuid,p_next text,p_driver text,p_phone text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_channel text;v_status text;v_current text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user)
 THEN RAISE EXCEPTION 'forbidden'; END IF;
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
COMMIT;
