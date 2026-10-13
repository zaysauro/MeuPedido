-- MeuPedido: endereços de entrega por cliente e estabelecimento.
-- Executar depois de 004_restaurant_operations.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS restaurant_customer_addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL,
 label text NOT NULL DEFAULT 'Principal',
 street text NOT NULL CHECK(length(trim(street)) BETWEEN 1 AND 180),
 number text NOT NULL CHECK(length(trim(number)) BETWEEN 1 AND 30),
 complement text,
 neighborhood text NOT NULL CHECK(length(trim(neighborhood)) BETWEEN 1 AND 120),
 city text NOT NULL CHECK(length(trim(city)) BETWEEN 1 AND 120),
 state text NOT NULL CHECK(length(state)=2),
 postal_code text NOT NULL CHECK(length(postal_code) BETWEEN 8 AND 9),
 reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),
 FOREIGN KEY(customer_id,organization_id) REFERENCES restaurant_customers(id,organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS restaurant_addresses_customer_idx
 ON restaurant_customer_addresses(organization_id,customer_id);
ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS delivery_address_id uuid;
ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS delivery_fee_cents integer NOT NULL DEFAULT 0 CHECK(delivery_fee_cents>=0);
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='restaurant_order_delivery_address_fk' AND conrelid='restaurant_orders'::regclass) THEN
 ALTER TABLE restaurant_orders ADD CONSTRAINT restaurant_order_delivery_address_fk
 FOREIGN KEY(delivery_address_id,organization_id) REFERENCES restaurant_customer_addresses(id,organization_id);
 END IF;
END $guard$;
COMMIT;
