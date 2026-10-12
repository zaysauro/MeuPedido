-- MeuPedido: bloqueia transferencia de itens de pedidos em preparo.
-- Executar apos 018.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_guard_order_item_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
 SELECT status INTO v_status FROM restaurant_orders
 WHERE id=NEW.order_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF v_status IS DISTINCT FROM 'recebido' THEN RAISE EXCEPTION 'target_order_not_editable'; END IF;
 IF TG_OP='UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN
  SELECT status INTO v_status FROM restaurant_orders
  WHERE id=OLD.order_id AND organization_id=OLD.organization_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'recebido' THEN RAISE EXCEPTION 'source_order_not_editable'; END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
