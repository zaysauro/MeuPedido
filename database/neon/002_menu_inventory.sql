-- MeuPedido: primeira estrutura operacional isolada por estabelecimento.
-- Executar depois de 000_better_auth.sql e 001_organizations.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS restaurant_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS restaurant_categories_org_idx ON restaurant_categories(organization_id);
CREATE TABLE IF NOT EXISTS restaurant_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id uuid,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  description text,
  price_cents integer NOT NULL CHECK(price_cents >= 0),
  image_url text,
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, organization_id),
  FOREIGN KEY(category_id,organization_id) REFERENCES restaurant_categories(id,organization_id)
);
CREATE INDEX IF NOT EXISTS restaurant_menu_org_idx ON restaurant_menu_items(organization_id,category_id);
CREATE TABLE IF NOT EXISTS restaurant_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  unit text NOT NULL CHECK(unit IN ('g','kg','ml','l','un')),
  quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  minimum_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(minimum_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id)
);
CREATE INDEX IF NOT EXISTS restaurant_ingredients_org_idx ON restaurant_ingredients(organization_id);
CREATE TABLE IF NOT EXISTS restaurant_recipes (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK(quantity > 0),
  PRIMARY KEY(organization_id,menu_item_id,ingredient_id),
  FOREIGN KEY(menu_item_id,organization_id) REFERENCES restaurant_menu_items(id,organization_id) ON DELETE CASCADE,
  FOREIGN KEY(ingredient_id,organization_id) REFERENCES restaurant_ingredients(id,organization_id)
);
COMMIT;
