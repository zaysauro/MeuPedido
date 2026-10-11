BEGIN;
ALTER TABLE restaurant_ingredients ADD COLUMN IF NOT EXISTS cost_per_unit_cents numeric(14,4) NOT NULL DEFAULT 0 CHECK(cost_per_unit_cents>=0);
CREATE OR REPLACE FUNCTION restaurant_adjust_ingredient(p_org uuid,p_user text,p_ingredient uuid,p_kind text,p_quantity numeric,p_notes text)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_balance numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user AND role IN ('owner','admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_kind NOT IN ('entrada','ajuste_positivo','ajuste_negativo') OR p_quantity<=0 OR p_quantity>100000000 THEN RAISE EXCEPTION 'invalid_movement'; END IF;
 UPDATE restaurant_ingredients SET quantity=quantity+CASE WHEN p_kind='ajuste_negativo' THEN -p_quantity ELSE p_quantity END
 WHERE id=p_ingredient AND organization_id=p_org AND quantity+CASE WHEN p_kind='ajuste_negativo' THEN -p_quantity ELSE p_quantity END>=0 RETURNING quantity INTO v_balance;
 IF NOT FOUND THEN RAISE EXCEPTION 'ingredient_missing_or_insufficient_stock'; END IF;
 INSERT INTO restaurant_inventory_movements(organization_id,ingredient_id,movement_type,quantity,notes) VALUES(p_org,p_ingredient,p_kind,p_quantity,left(coalesce(p_notes,''),500));
 RETURN v_balance;
END $$;
COMMIT;