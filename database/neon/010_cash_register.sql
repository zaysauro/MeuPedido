-- MeuPedido: controle de turnos do caixa.
-- Executar após 004. Independente de pagamentos automáticos.
BEGIN;
CREATE TABLE IF NOT EXISTS restaurant_cash_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 opened_by text NOT NULL REFERENCES "user"(id),
 closed_by text REFERENCES "user"(id),
 opening_cents integer NOT NULL CHECK(opening_cents>=0),
 counted_cents integer CHECK(counted_cents>=0),
 notes text,
 opened_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 UNIQUE(id,organization_id),
 CHECK ((closed_at IS NULL AND closed_by IS NULL AND counted_cents IS NULL)
 OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted_cents IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_one_open_cash_per_org
 ON restaurant_cash_sessions(organization_id) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS restaurant_cash_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 session_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('suprimento','sangria')),
 amount_cents integer NOT NULL CHECK(amount_cents>0),
 notes text,
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,organization_id) REFERENCES restaurant_cash_sessions(id,organization_id)
);
CREATE INDEX IF NOT EXISTS restaurant_cash_movements_session_idx ON restaurant_cash_movements(organization_id,session_id,created_at);
CREATE OR REPLACE FUNCTION restaurant_cash_open(p_org uuid,p_user text,p_opening integer)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user)
 THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_opening<0 OR p_opening>1000000000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
 INSERT INTO restaurant_cash_sessions(organization_id,opened_by,opening_cents)
 VALUES(p_org,p_user,p_opening) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION restaurant_cash_move(p_org uuid,p_user text,p_session uuid,p_kind text,p_amount integer,p_notes text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user)
 THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_kind NOT IN ('suprimento','sangria') OR p_amount<=0 OR p_amount>1000000000 THEN RAISE EXCEPTION 'invalid_movement'; END IF;
 PERFORM 1 FROM restaurant_cash_sessions WHERE id=p_session AND organization_id=p_org AND closed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'cash_not_open'; END IF;
 INSERT INTO restaurant_cash_movements(organization_id,session_id,kind,amount_cents,notes,created_by)
 VALUES(p_org,p_session,p_kind,p_amount,left(coalesce(p_notes,''),500),p_user) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION restaurant_cash_close(p_org uuid,p_user text,p_session uuid,p_counted integer)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user)
 THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_counted<0 OR p_counted>1000000000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
 UPDATE restaurant_cash_sessions SET closed_at=now(),closed_by=p_user,counted_cents=p_counted
 WHERE id=p_session AND organization_id=p_org AND closed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'cash_not_open'; END IF;
 RETURN p_session;
END $$;
COMMIT;
