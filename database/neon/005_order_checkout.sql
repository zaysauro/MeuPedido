-- MeuPedido: criação atômica de pedido e itens, com preços definidos pelo banco.
-- Executar após 004_restaurant_operations.sql.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_create_order(
 p_org uuid,p_user text,p_channel text,p_table uuid,p_customer uuid,p_notes text,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order uuid; v_line jsonb; v_menu restaurant_menu_items%ROWTYPE;
v_qty integer; v_item uuid; v_addons integer; v_addon jsonb; v_addon_row restaurant_addons%ROWTYPE; v_subtotal bigint:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user)
 THEN RAISE EXCEPTION 'forbidden'; END IF;
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
 RETURN v_order;
END $$;
COMMIT;
