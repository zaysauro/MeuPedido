BEGIN;
CREATE OR REPLACE FUNCTION restaurant_cancel_item(p_org uuid,p_user text,p_item uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_item restaurant_order_items%ROWTYPE;v_order restaurant_orders%ROWTYPE;v_amount integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user AND role IN ('owner','admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
COMMIT;
