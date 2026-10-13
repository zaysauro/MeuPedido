BEGIN;
CREATE OR REPLACE FUNCTION restaurant_transfer_order_item(p_org uuid,p_user text,p_item uuid,p_target uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_source uuid;v_target restaurant_orders%ROWTYPE;v_item restaurant_order_items%ROWTYPE;v_amount bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user) THEN RAISE EXCEPTION 'forbidden'; END IF;
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

CREATE OR REPLACE FUNCTION restaurant_set_discount(p_org uuid,p_user text,p_order uuid,p_discount integer)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user AND role IN ('owner','admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.status='cancelado' OR v_order.payment_status<>'pendente' OR p_discount IS NULL OR p_discount<0 OR p_discount>v_order.subtotal_cents THEN RAISE EXCEPTION 'invalid_discount'; END IF;
 UPDATE restaurant_orders SET discount_cents=p_discount,total_cents=subtotal_cents-p_discount+delivery_fee_cents,updated_at=now() WHERE id=p_order;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'order.discount',p_order);
 RETURN v_order.subtotal_cents-p_discount+v_order.delivery_fee_cents;
END $$;
COMMIT;
