-- Executar após 008_inventory_recipes.sql.
BEGIN;
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
