-- MeuPedido: permitir cancelamento seguro antes do preparo.
-- Aplicar depois de 016.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_cancel_order(p_org uuid,p_user text,p_order uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user AND role IN ('owner','admin'))
 THEN RAISE EXCEPTION 'forbidden'; END IF;
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
COMMIT;
