BEGIN;
ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '' CHECK(length(phone)<=40);
ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '' CHECK(length(address)<=500);
ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS receipt_footer text NOT NULL DEFAULT 'Obrigado pela preferência!' CHECK(length(receipt_footer)<=160);
-- Unique claims serialize concurrent ownership creation without deleting legacy memberships.
CREATE TABLE organization_owner_claims (
 user_id text PRIMARY KEY REFERENCES "user"(id),
 organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO organization_owner_claims(user_id,organization_id)
 SELECT user_id,(array_agg(organization_id))[1] FROM organization_members WHERE role='owner' GROUP BY user_id HAVING count(*)=1;
CREATE VIEW organization_ownership_conflicts AS
 SELECT user_id,array_agg(organization_id ORDER BY created_at,organization_id) AS organization_ids,count(*) AS establishments
 FROM organization_members WHERE role='owner' GROUP BY user_id HAVING count(*)>1;
CREATE FUNCTION enforce_single_establishment_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE claimed uuid;
BEGIN
 IF NEW.role<>'owner' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.role='owner' AND OLD.user_id=NEW.user_id AND OLD.organization_id=NEW.organization_id THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM organization_members WHERE user_id=NEW.user_id AND role='owner' AND organization_id<>NEW.organization_id) THEN RAISE EXCEPTION 'owner_establishment_limit' USING ERRCODE='23505'; END IF;
 INSERT INTO organization_owner_claims(user_id,organization_id) VALUES(NEW.user_id,NEW.organization_id)
 ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING organization_id INTO claimed;
 IF claimed<>NEW.organization_id THEN RAISE EXCEPTION 'owner_establishment_limit' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER single_establishment_owner BEFORE INSERT OR UPDATE OF role,user_id,organization_id ON organization_members FOR EACH ROW EXECUTE FUNCTION enforce_single_establishment_owner();
-- No arbitrary choice for legacy multiple memberships or conflicting ownership.
CREATE FUNCTION authorized_establishment(p_user text) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT m.organization_id FROM organization_members m
 JOIN organization_owner_claims c ON c.organization_id=m.organization_id
 JOIN organization_members owner ON owner.organization_id=c.organization_id AND owner.user_id=c.user_id AND owner.role='owner'
 WHERE m.user_id=p_user
 AND (SELECT count(*) FROM organization_members WHERE user_id=p_user)=1
 AND NOT EXISTS(SELECT 1 FROM organization_ownership_conflicts conflict WHERE conflict.user_id=c.user_id)
$$;
CREATE FUNCTION onboard_establishment(p_user text,p_name text,p_slug text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid;
BEGIN
 PERFORM 1 FROM "user" WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_user'; END IF;
 IF EXISTS(SELECT 1 FROM organization_members WHERE user_id=p_user) OR EXISTS(SELECT 1 FROM organization_owner_claims WHERE user_id=p_user) THEN RAISE EXCEPTION 'owner_establishment_limit' USING ERRCODE='23505'; END IF;
 INSERT INTO organizations(name,slug) VALUES(p_name,p_slug) RETURNING id INTO result;
 INSERT INTO organization_members(organization_id,user_id,role) VALUES(result,p_user,'owner');
 INSERT INTO organization_settings(organization_id) VALUES(result);
 RETURN result;
END $$;
-- One provider subscription identifier can authorize only its original establishment.
-- Existing ambiguous identifiers are preserved but are not valid billing authorizations.
CREATE TABLE organization_subscription_claims (
 provider_subscription_id text PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id)
);
INSERT INTO organization_subscription_claims
 SELECT provider_subscription_id,(array_agg(organization_id))[1] FROM organization_subscriptions
 WHERE provider_subscription_id IS NOT NULL GROUP BY provider_subscription_id HAVING count(*)=1;
CREATE FUNCTION enforce_single_establishment_subscription() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE claimed uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_owner_claims c WHERE c.organization_id=NEW.organization_id AND authorized_establishment(c.user_id)=NEW.organization_id) THEN RAISE EXCEPTION 'establishment_regularization_required'; END IF;
 IF TG_OP='UPDATE' AND OLD.organization_id<>NEW.organization_id THEN RAISE EXCEPTION 'subscription_establishment_immutable'; END IF;
 IF NEW.provider_subscription_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM organization_subscriptions WHERE provider_subscription_id=NEW.provider_subscription_id AND organization_id<>NEW.organization_id) THEN RAISE EXCEPTION 'subscription_establishment_limit' USING ERRCODE='23505'; END IF;
  INSERT INTO organization_subscription_claims VALUES(NEW.provider_subscription_id,NEW.organization_id)
  ON CONFLICT(provider_subscription_id) DO UPDATE SET provider_subscription_id=EXCLUDED.provider_subscription_id RETURNING organization_id INTO claimed;
  IF claimed<>NEW.organization_id THEN RAISE EXCEPTION 'subscription_establishment_limit' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER single_establishment_subscription BEFORE INSERT OR UPDATE ON organization_subscriptions FOR EACH ROW EXECUTE FUNCTION enforce_single_establishment_subscription();
COMMIT;
