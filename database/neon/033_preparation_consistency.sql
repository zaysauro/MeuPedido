BEGIN;
-- Fixes verified by multi-device regression cases; previous migrations stay immutable.
CREATE OR REPLACE FUNCTION restaurant_create_order(
 p_org uuid,p_user text,p_channel text,p_table uuid,p_customer uuid,p_notes text,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order uuid; v_line jsonb; v_menu restaurant_menu_items%ROWTYPE;
v_qty integer; v_item uuid; v_addons integer; v_addon jsonb; v_addon_row restaurant_addons%ROWTYPE; v_subtotal bigint:=0;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_channel NOT IN ('balcao','mesa','retirada','delivery') THEN RAISE EXCEPTION 'invalid_channel'; END IF;
 IF p_channel='mesa' AND p_table IS NULL THEN RAISE EXCEPTION 'table_required'; END IF;
 IF p_table IS NOT NULL AND NOT EXISTS(SELECT 1 FROM restaurant_tables WHERE id=p_table AND organization_id=p_org AND active)
 THEN RAISE EXCEPTION 'invalid_table'; END IF;
 IF p_customer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM restaurant_customers WHERE id=p_customer AND organization_id=p_org)
 THEN RAISE EXCEPTION 'invalid_customer'; END IF;
 IF jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_items'; END IF;
 INSERT INTO restaurant_orders(organization_id,channel,table_id,customer_id,created_by,notes)
 VALUES(p_org,p_channel,p_table,p_customer,p_user,left(coalesce(p_notes,''),1000)) RETURNING id INTO v_order;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
 LOOP
  IF jsonb_typeof(v_line)<>'object' THEN RAISE EXCEPTION 'invalid_item'; END IF;
  SELECT * INTO v_menu FROM restaurant_menu_items WHERE id=(v_line->>'menuItemId')::uuid AND organization_id=p_org AND available;
  IF NOT FOUND THEN RAISE EXCEPTION 'unavailable_item'; END IF;
  v_qty:=(v_line->>'quantity')::integer;
  IF v_qty NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF jsonb_typeof(coalesce(v_line->'addons','[]'::jsonb))<>'array' OR jsonb_array_length(coalesce(v_line->'addons','[]'::jsonb))>20
  THEN RAISE EXCEPTION 'invalid_addons'; END IF;
  v_addons:=0;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(coalesce(v_line->'addons','[]'::jsonb))
  LOOP
   SELECT * INTO v_addon_row FROM restaurant_addons WHERE id=(v_addon#>>'{}')::uuid AND organization_id=p_org AND menu_item_id=v_menu.id AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_addon'; END IF;
   v_addons:=v_addons+v_addon_row.price_cents;
  END LOOP;
  INSERT INTO restaurant_order_items(organization_id,order_id,menu_item_id,name_snapshot,quantity,unit_price_cents,addons_cents,notes)
  VALUES(p_org,v_order,v_menu.id,v_menu.name,v_qty,v_menu.price_cents,v_addons,left(coalesce(v_line->>'notes',''),500))
  RETURNING id INTO v_item;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(coalesce(v_line->'addons','[]'::jsonb))
  LOOP
   SELECT * INTO v_addon_row FROM restaurant_addons WHERE id=(v_addon#>>'{}')::uuid AND organization_id=p_org AND menu_item_id=v_menu.id AND active;
   INSERT INTO restaurant_order_item_addons(organization_id,order_item_id,addon_id,name_snapshot,price_cents)
   VALUES(p_org,v_item,v_addon_row.id,v_addon_row.name,v_addon_row.price_cents);
  END LOOP;
  v_subtotal:=v_subtotal+(v_menu.price_cents+v_addons)*v_qty;
  IF v_subtotal>1000000000 THEN RAISE EXCEPTION 'order_too_large'; END IF;
 END LOOP;
 UPDATE restaurant_orders SET subtotal_cents=v_subtotal,total_cents=v_subtotal WHERE id=v_order;
 PERFORM restaurant_refresh_order_status(p_org,v_order);
 RETURN v_order;
END $$;
CREATE OR REPLACE FUNCTION restaurant_add_order_items(p_org uuid,p_user text,p_order uuid,p_lines jsonb)
RETURNS TABLE(order_id uuid, subtotal_cents integer, total_cents integer)
LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE; v_line jsonb; v_menu restaurant_menu_items%ROWTYPE;
v_qty integer; v_item uuid; v_addons integer; v_addon jsonb; v_addon_row restaurant_addons%ROWTYPE; v_extra bigint:=0;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.completed_at IS NOT NULL OR v_order.status='cancelado' THEN RAISE EXCEPTION 'order_not_editable'; END IF;
 IF jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_items'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT * INTO v_menu FROM restaurant_menu_items WHERE id=(v_line->>'menuItemId')::uuid AND organization_id=p_org AND available;
  IF NOT FOUND THEN RAISE EXCEPTION 'unavailable_item'; END IF;
  v_qty:=(v_line->>'quantity')::integer;
  IF v_qty NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF jsonb_typeof(coalesce(v_line->'addons','[]'::jsonb))<>'array' OR jsonb_array_length(coalesce(v_line->'addons','[]'::jsonb))>20 THEN RAISE EXCEPTION 'invalid_addons'; END IF;
  v_addons:=0;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(coalesce(v_line->'addons','[]'::jsonb)) LOOP
   SELECT * INTO v_addon_row FROM restaurant_addons WHERE id=(v_addon#>>'{}')::uuid AND organization_id=p_org AND menu_item_id=v_menu.id AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_addon'; END IF;
   v_addons:=v_addons+v_addon_row.price_cents;
  END LOOP;
  INSERT INTO restaurant_order_items(organization_id,order_id,menu_item_id,name_snapshot,quantity,unit_price_cents,addons_cents,notes)
  VALUES(p_org,p_order,v_menu.id,v_menu.name,v_qty,v_menu.price_cents,v_addons,left(coalesce(v_line->>'notes',''),500)) RETURNING id INTO v_item;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(coalesce(v_line->'addons','[]'::jsonb)) LOOP
   SELECT * INTO v_addon_row FROM restaurant_addons WHERE id=(v_addon#>>'{}')::uuid AND organization_id=p_org AND menu_item_id=v_menu.id AND active;
   INSERT INTO restaurant_order_item_addons(organization_id,order_item_id,addon_id,name_snapshot,price_cents)
   VALUES(p_org,v_item,v_addon_row.id,v_addon_row.name,v_addon_row.price_cents);
  END LOOP;
  v_extra:=v_extra+(v_menu.price_cents+v_addons)*v_qty;
 END LOOP;
 IF v_order.subtotal_cents+v_extra>1000000000 THEN RAISE EXCEPTION 'order_too_large'; END IF;
 UPDATE restaurant_orders o SET subtotal_cents=o.subtotal_cents+v_extra,total_cents=o.total_cents+v_extra,status='recebido',payment_status=CASE WHEN o.payment_status='pago' THEN 'parcial' ELSE o.payment_status END,closed_at=NULL,updated_at=now()
 WHERE o.id=p_order AND o.organization_id=p_org
 RETURNING o.subtotal_cents,o.total_cents INTO subtotal_cents,total_cents;
 PERFORM restaurant_refresh_order_status(p_org,p_order);
 order_id:=p_order;RETURN NEXT;
END $$;
CREATE OR REPLACE FUNCTION restaurant_cancel_item(p_org uuid,p_user text,p_item uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_item restaurant_order_items%ROWTYPE;v_order restaurant_orders%ROWTYPE;v_amount integer;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_item FROM restaurant_order_items WHERE id=p_item AND organization_id=p_org;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=v_item.order_id AND organization_id=p_org FOR UPDATE;
 IF v_item.status<>'recebido' OR EXISTS(SELECT 1 FROM restaurant_order_inventory_consumptions WHERE organization_id=p_org AND order_item_id=p_item) THEN RAISE EXCEPTION 'cannot_cancel_prepared_item'; END IF;
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
CREATE OR REPLACE FUNCTION restaurant_set_recipe(
 p_org uuid, p_user text, p_menu_item uuid, p_lines jsonb
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_line jsonb; v_count integer := 0; v_id uuid; v_qty numeric;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM organization_members
   WHERE organization_id = p_org AND user_id = p_user AND role IN ('owner','admin')
 ) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
COMMIT;
