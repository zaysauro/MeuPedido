-- MeuPedido: operações de restaurante. Executar após 002_menu_inventory.sql.
-- Não executar 003_order_integrity.sql (rascunho legado).
BEGIN;
CREATE TABLE IF NOT EXISTS restaurant_tables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 60), active boolean NOT NULL DEFAULT true,
 UNIQUE(id,organization_id), UNIQUE(organization_id,label)
);
CREATE TABLE IF NOT EXISTS restaurant_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160), phone text, notes text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,organization_id)
);
CREATE TABLE IF NOT EXISTS restaurant_addons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 menu_item_id uuid NOT NULL, name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 price_cents integer NOT NULL DEFAULT 0 CHECK(price_cents >= 0), active boolean NOT NULL DEFAULT true,
 UNIQUE(id,organization_id), FOREIGN KEY(menu_item_id,organization_id) REFERENCES restaurant_menu_items(id,organization_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS restaurant_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 table_id uuid, customer_id uuid, order_number bigint GENERATED ALWAYS AS IDENTITY,
 channel text NOT NULL CHECK(channel IN ('balcao','mesa','retirada','delivery')),
 status text NOT NULL DEFAULT 'recebido' CHECK(status IN ('recebido','preparando','pronto','entregue','cancelado')),
 payment_status text NOT NULL DEFAULT 'pendente' CHECK(payment_status IN ('pendente','parcial','pago')),
 notes text, discount_cents integer NOT NULL DEFAULT 0 CHECK(discount_cents>=0),
 subtotal_cents integer NOT NULL DEFAULT 0 CHECK(subtotal_cents>=0),
 total_cents integer NOT NULL DEFAULT 0 CHECK(total_cents>=0),
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz, UNIQUE(id,organization_id),
 FOREIGN KEY(table_id,organization_id) REFERENCES restaurant_tables(id,organization_id),
 FOREIGN KEY(customer_id,organization_id) REFERENCES restaurant_customers(id,organization_id)
);
CREATE INDEX IF NOT EXISTS restaurant_orders_org_status_idx ON restaurant_orders(organization_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS restaurant_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 order_id uuid NOT NULL, menu_item_id uuid NOT NULL,
 name_snapshot text NOT NULL, quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999),
 unit_price_cents integer NOT NULL CHECK(unit_price_cents>=0), addons_cents integer NOT NULL DEFAULT 0 CHECK(addons_cents>=0),
 notes text, status text NOT NULL DEFAULT 'recebido' CHECK(status IN ('recebido','preparando','pronto','entregue','cancelado')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,organization_id),
 FOREIGN KEY(order_id,organization_id) REFERENCES restaurant_orders(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(menu_item_id,organization_id) REFERENCES restaurant_menu_items(id,organization_id)
);
CREATE TABLE IF NOT EXISTS restaurant_order_item_addons (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 order_item_id uuid NOT NULL, addon_id uuid NOT NULL,
 name_snapshot text NOT NULL, price_cents integer NOT NULL CHECK(price_cents>=0),
 PRIMARY KEY(organization_id,order_item_id,addon_id),
 FOREIGN KEY(order_item_id,organization_id) REFERENCES restaurant_order_items(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(addon_id,organization_id) REFERENCES restaurant_addons(id,organization_id)
);
CREATE TABLE IF NOT EXISTS restaurant_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 order_id uuid NOT NULL, method text NOT NULL CHECK(method IN ('dinheiro','pix','debito','credito','outro')),
 amount_cents integer NOT NULL CHECK(amount_cents>0), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(order_id,organization_id) REFERENCES restaurant_orders(id,organization_id)
);
CREATE TABLE IF NOT EXISTS restaurant_inventory_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 ingredient_id uuid NOT NULL, order_id uuid, movement_type text NOT NULL CHECK(movement_type IN ('entrada','ajuste_positivo','ajuste_negativo','consumo','estorno')),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0), notes text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(ingredient_id,organization_id) REFERENCES restaurant_ingredients(id,organization_id),
 FOREIGN KEY(order_id,organization_id) REFERENCES restaurant_orders(id,organization_id)
);
CREATE INDEX IF NOT EXISTS restaurant_movements_org_idx ON restaurant_inventory_movements(organization_id,ingredient_id,created_at DESC);
COMMIT;
