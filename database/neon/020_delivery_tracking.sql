-- MeuPedido: acompanhamento da entrega sem alterar estados da cozinha.
-- Aplicar depois de 019.
BEGIN;
CREATE TABLE IF NOT EXISTS restaurant_delivery_tracking (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 order_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'aguardando' CHECK(status IN ('aguardando','despachado','em_rota','entregue','falhou')),
 driver_name text,
 driver_phone text,
 dispatched_at timestamptz,
 delivered_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,order_id),
 FOREIGN KEY(order_id,organization_id) REFERENCES restaurant_orders(id,organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS restaurant_delivery_status_idx ON restaurant_delivery_tracking(organization_id,status);
COMMIT;
