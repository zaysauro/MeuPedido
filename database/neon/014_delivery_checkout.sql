-- MeuPedido: checkout delivery atomico com endereco validado no estabelecimento.
-- Aplicar depois da migracao 013.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_create_delivery_order(
 p_org uuid,p_user text,p_customer uuid,p_address uuid,p_fee integer,p_notes text,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order uuid;
BEGIN
 IF p_customer IS NULL OR p_address IS NULL THEN RAISE EXCEPTION 'delivery_customer_address_required'; END IF;
 IF p_fee IS NULL OR p_fee<0 OR p_fee>1000000 THEN RAISE EXCEPTION 'invalid_delivery_fee'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM restaurant_customer_addresses a
  WHERE a.id=p_address AND a.customer_id=p_customer AND a.organization_id=p_org
 ) THEN RAISE EXCEPTION 'invalid_delivery_address'; END IF;
 v_order:=restaurant_create_order(p_org,p_user,'delivery',NULL,p_customer,p_notes,p_lines);
 UPDATE restaurant_orders o
 SET delivery_address_id=p_address,delivery_fee_cents=p_fee,
 total_cents=o.total_cents+p_fee,updated_at=now()
 WHERE o.id=v_order AND o.organization_id=p_org AND o.total_cents+p_fee<=1000000000;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_too_large'; END IF;
 RETURN v_order;
END $$;
COMMIT;
