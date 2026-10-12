-- MeuPedido: reforcos de integridade.
-- Executar apos 017.
BEGIN;
ALTER TABLE restaurant_payments ADD CONSTRAINT restaurant_payments_cash_session_fk
 FOREIGN KEY(cash_session_id,organization_id) REFERENCES restaurant_cash_sessions(id,organization_id);
CREATE OR REPLACE FUNCTION restaurant_guard_order_item_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
 SELECT status INTO v_status FROM restaurant_orders
 WHERE id=NEW.order_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF v_status IS DISTINCT FROM 'recebido' THEN RAISE EXCEPTION 'order_not_editable_after_preparation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER restaurant_order_item_change_guard
 BEFORE INSERT OR UPDATE OF order_id ON restaurant_order_items
 FOR EACH ROW EXECUTE FUNCTION restaurant_guard_order_item_changes();
COMMIT;
