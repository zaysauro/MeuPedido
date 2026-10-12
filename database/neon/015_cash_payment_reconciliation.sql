-- MeuPedido: vincula pagamentos ao turno de caixa.
-- Executar apos 014.
BEGIN;
ALTER TABLE restaurant_payments ADD COLUMN IF NOT EXISTS cash_session_id uuid;
CREATE INDEX IF NOT EXISTS restaurant_payments_cash_session_idx ON restaurant_payments(organization_id,cash_session_id,method);
COMMIT;
