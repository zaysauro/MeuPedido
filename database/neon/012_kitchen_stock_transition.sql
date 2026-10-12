-- MeuPedido: transição de preparo e consumo de estoque na mesma transação.
-- Aplicar após 011_inventory_consumption.sql.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_kitchen_transition(p_org uuid,p_user text,p_order uuid,p_next text)
RETURNS TABLE(id uuid,status text) LANGUAGE plpgsql AS $$
DECLARE v_current text;v_expected text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user) THEN
  RAISE EXCEPTION 'forbidden';
 END IF;
 SELECT o.status INTO v_current FROM restaurant_orders o
 WHERE o.id=p_order AND o.organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
 v_expected:=CASE v_current
  WHEN 'recebido' THEN 'preparando'
  WHEN 'preparando' THEN 'pronto'
  WHEN 'pronto' THEN 'entregue'
  ELSE NULL END;
 IF p_next IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 IF p_next='preparando' THEN
  PERFORM restaurant_consume_order_inventory(p_org,p_user,p_order);
 END IF;
 UPDATE restaurant_orders o SET status=p_next,updated_at=now()
 WHERE o.id=p_order AND o.organization_id=p_org;
 RETURN QUERY SELECT p_order,p_next;
END $$;
COMMIT;
