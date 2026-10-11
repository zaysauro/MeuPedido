-- MeuPedido: baixa de ingredientes uma única vez por item vendido.
-- Executar após 009_recipes.sql e 004_restaurant_operations.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS restaurant_order_inventory_consumptions (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 order_item_id uuid NOT NULL,
 ingredient_id uuid NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 consumed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,order_item_id,ingredient_id),
 FOREIGN KEY(order_item_id,organization_id) REFERENCES restaurant_order_items(id,organization_id),
 FOREIGN KEY(ingredient_id,organization_id) REFERENCES restaurant_ingredients(id,organization_id)
);
CREATE OR REPLACE FUNCTION restaurant_consume_order_inventory(p_org uuid,p_user text,p_order uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;v_recipe record;v_count integer:=0;v_balance numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.status='cancelado' THEN RAISE EXCEPTION 'invalid_order'; END IF;
 FOR v_recipe IN
  SELECT oi.id AS item_id,r.ingredient_id,SUM(r.quantity*oi.quantity)::numeric(14,3) AS needed
  FROM restaurant_order_items oi JOIN restaurant_recipes r
    ON r.organization_id=oi.organization_id AND r.menu_item_id=oi.menu_item_id
  WHERE oi.organization_id=p_org AND oi.order_id=p_order AND oi.status<>'cancelado'
  GROUP BY oi.id,r.ingredient_id
  ORDER BY r.ingredient_id,oi.id
 LOOP
  IF EXISTS(SELECT 1 FROM restaurant_order_inventory_consumptions c
    WHERE c.organization_id=p_org AND c.order_item_id=v_recipe.item_id AND c.ingredient_id=v_recipe.ingredient_id) THEN CONTINUE; END IF;
  UPDATE restaurant_ingredients SET quantity=quantity-v_recipe.needed
   WHERE id=v_recipe.ingredient_id AND organization_id=p_org AND quantity>=v_recipe.needed
   RETURNING quantity INTO v_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient_stock'; END IF;
  INSERT INTO restaurant_order_inventory_consumptions(organization_id,order_item_id,ingredient_id,quantity)
  VALUES(p_org,v_recipe.item_id,v_recipe.ingredient_id,v_recipe.needed);
  INSERT INTO restaurant_inventory_movements(organization_id,ingredient_id,order_id,movement_type,quantity,notes)
  VALUES(p_org,v_recipe.ingredient_id,p_order,'consumo',v_recipe.needed,'Consumo automático por venda');
  v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END $$;
COMMIT;
