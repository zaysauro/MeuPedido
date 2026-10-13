BEGIN;
ALTER TABLE restaurant_payments ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_payment_request_idx ON restaurant_payments(organization_id,request_id) WHERE request_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS restaurant_request_keys (
 organization_id uuid NOT NULL REFERENCES organizations(id),request_id uuid NOT NULL,
 payload jsonb NOT NULL,order_id uuid NOT NULL,PRIMARY KEY(organization_id,request_id),
 FOREIGN KEY(order_id,organization_id) REFERENCES restaurant_orders(id,organization_id)
);
CREATE TABLE IF NOT EXISTS restaurant_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_id text NOT NULL,action text NOT NULL,entity_id uuid,created_at timestamptz NOT NULL DEFAULT now()
);
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
 INSERT INTO restaurant_request_keys VALUES(p_org,p_request,p_body,v_order);
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'order.created',v_order);
 RETURN v_order;
END $$;
CREATE OR REPLACE FUNCTION restaurant_record_payment_once(p_org uuid,p_user text,p_order uuid,p_method text,p_amount integer,p_request uuid)
RETURNS TABLE(order_id uuid,paid_cents bigint,remaining_cents bigint,payment_status text) LANGUAGE plpgsql AS $$
DECLARE v_old restaurant_payments%ROWTYPE;v_before uuid[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
CREATE OR REPLACE FUNCTION restaurant_cancel_item(p_org uuid,p_user text,p_item uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_item restaurant_order_items%ROWTYPE;v_order restaurant_orders%ROWTYPE;v_amount integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user AND role IN ('owner','admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_item FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=v_item.order_id AND organization_id=p_org FOR UPDATE;
 IF v_order.id IS NULL OR v_order.status<>'recebido' OR v_order.payment_status<>'pendente' THEN RAISE EXCEPTION 'order_not_editable'; END IF;
 SELECT * INTO v_item FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org FOR UPDATE;
 IF v_item.status='cancelado' THEN RETURN v_order.id; END IF;
 v_amount:=(v_item.unit_price_cents+v_item.addons_cents)*v_item.quantity;
 IF v_order.subtotal_cents-v_amount<v_order.discount_cents THEN RAISE EXCEPTION 'discount_exceeds_total'; END IF;
 UPDATE restaurant_order_items SET status='cancelado' WHERE id=p_item AND organization_id=p_org;
 UPDATE restaurant_orders SET subtotal_cents=subtotal_cents-v_amount,total_cents=total_cents-v_amount,updated_at=now() WHERE id=v_order.id;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'item.canceled',p_item);
 RETURN v_order.id;
END $$;
ALTER TABLE restaurant_customers ADD COLUMN IF NOT EXISTS email text;
CREATE TABLE IF NOT EXISTS organization_subscriptions (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),
 status text NOT NULL CHECK(status IN ('trial','active','past_due','canceled')),
 trial_ends_at timestamptz,provider_subscription_id text,
 provider_confirmed_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'active' OR (provider_subscription_id IS NOT NULL AND provider_confirmed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS billing_webhook_events (
 provider text NOT NULL,event_id text NOT NULL,environment text NOT NULL CHECK(environment IN ('sandbox','production')),
 received_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,PRIMARY KEY(provider,event_id,environment)
);
CREATE TABLE IF NOT EXISTS restaurant_rate_limits (
 user_id text PRIMARY KEY REFERENCES "user"(id),window_start timestamptz NOT NULL DEFAULT now(),request_count integer NOT NULL DEFAULT 1
);
COMMIT;
