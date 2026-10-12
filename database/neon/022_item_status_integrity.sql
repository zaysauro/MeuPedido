-- MeuPedido: impede mudanca de status de item em pedido cancelado ou preparado.
-- Executar apos 021.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_guard_item_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_order_status text;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 SELECT status INTO v_order_status FROM restaurant_orders
 WHERE id=NEW.order_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF v_order_status NOT IN ('recebido','preparando','pronto','entregue') THEN
  RAISE EXCEPTION 'order_not_editable';
 END IF;
 IF NEW.status='cancelado' AND v_order_status<>'recebido' THEN
  RAISE EXCEPTION 'cannot_cancel_prepared_item';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restaurant_item_status_guard ON restaurant_order_items;
CREATE TRIGGER restaurant_item_status_guard
 BEFORE UPDATE OF status ON restaurant_order_items
 FOR EACH ROW EXECUTE FUNCTION restaurant_guard_item_status_change();
COMMIT;
