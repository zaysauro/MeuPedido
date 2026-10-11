-- MeuPedido: edição segura de comandas e divisão de pagamentos.
-- Executar após 004, 005 e 006.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_add_order_items(p_org uuid,p_user text,p_order uuid,p_lines jsonb)
RETURNS TABLE(order_id uuid, subtotal_cents integer, total_cents integer)
LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE; v_line jsonb; v_menu restaurant_menu_items%ROWTYPE;
v_qty integer; v_item uuid; v_addons integer; v_addon jsonb; v_addon_row restaurant_addons%ROWTYPE; v_extra bigint:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.payment_status<>'pendente' OR v_order.status IN ('cancelado','entregue') THEN RAISE EXCEPTION 'order_not_editable'; END IF;
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
 UPDATE restaurant_orders o SET subtotal_cents=o.subtotal_cents+v_extra,total_cents=o.total_cents+v_extra,updated_at=now()
 WHERE o.id=p_order AND o.organization_id=p_org
 RETURNING o.subtotal_cents,o.total_cents INTO subtotal_cents,total_cents;
 order_id:=p_order;RETURN NEXT;
END $$;
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
 IF NOT FOUND OR v_item.order_id<>v_source OR v_target.id IS NULL THEN RAISE EXCEPTION 'invalid_transfer'; END IF;
 IF EXISTS(SELECT 1 FROM restaurant_orders WHERE id IN (v_source,p_target) AND (payment_status<>'pendente' OR status IN ('cancelado','entregue'))) THEN RAISE EXCEPTION 'order_not_editable'; END IF;
 v_amount:=(v_item.unit_price_cents+v_item.addons_cents)*v_item.quantity;
 UPDATE restaurant_order_items SET order_id=p_target WHERE id=p_item AND organization_id=p_org;
 UPDATE restaurant_orders SET subtotal_cents=subtotal_cents-v_amount,total_cents=total_cents-v_amount,updated_at=now() WHERE id=v_source AND organization_id=p_org;
 UPDATE restaurant_orders SET subtotal_cents=subtotal_cents+v_amount,total_cents=total_cents+v_amount,updated_at=now() WHERE id=p_target AND organization_id=p_org;
 RETURN p_target;
END $$;
COMMIT;
