BEGIN;
-- Configurable manager grants must apply to recipes as well as the HTTP API.
CREATE OR REPLACE FUNCTION restaurant_set_recipe(
 p_org uuid, p_user text, p_menu_item uuid, p_lines jsonb
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_line jsonb; v_count integer := 0; v_id uuid; v_qty numeric;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
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
-- Lock the parent before re-reading the line; a kitchen transition can have
-- completed while the first lookup was waiting. Repeated cancellation is a no-op.
CREATE OR REPLACE FUNCTION restaurant_cancel_item(p_org uuid,p_user text,p_item uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_item restaurant_order_items%ROWTYPE;v_order restaurant_orders%ROWTYPE;v_amount integer;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_item FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_item'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=v_item.order_id AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_order'; END IF;
 SELECT * INTO v_item FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org FOR UPDATE;
 IF v_item.order_id IS DISTINCT FROM v_order.id THEN RAISE EXCEPTION 'item_moved_retry'; END IF;
 IF v_item.status='cancelado' THEN RETURN v_order.id; END IF;
 IF v_item.status<>'recebido' OR EXISTS(SELECT 1 FROM restaurant_order_inventory_consumptions WHERE organization_id=p_org AND order_item_id=p_item)
 THEN RAISE EXCEPTION 'cannot_cancel_prepared_item'; END IF;
 IF v_order.completed_at IS NOT NULL OR v_order.status<>'recebido' OR v_order.payment_status<>'pendente' THEN RAISE EXCEPTION 'order_not_editable'; END IF;
 v_amount:=(v_item.unit_price_cents+v_item.addons_cents)*v_item.quantity;
 IF v_order.subtotal_cents-v_amount<v_order.discount_cents THEN RAISE EXCEPTION 'discount_exceeds_total'; END IF;
 UPDATE restaurant_order_items SET status='cancelado',updated_at=now() WHERE id=p_item AND organization_id=p_org;
 UPDATE restaurant_orders SET subtotal_cents=subtotal_cents-v_amount,total_cents=total_cents-v_amount,updated_at=now() WHERE id=v_order.id;
 IF EXISTS(SELECT 1 FROM restaurant_order_items WHERE order_id=v_order.id AND organization_id=p_org AND status<>'cancelado')
 THEN PERFORM restaurant_refresh_order_status(p_org,v_order.id); END IF;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'item.canceled',p_item);
 RETURN v_order.id;
END $$;
COMMIT;
