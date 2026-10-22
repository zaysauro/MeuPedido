BEGIN;
-- Personal accounts join an existing establishment through an owner-issued,
-- expiring invitation. Only a SHA-256 digest is stored; the bearer token is not.
CREATE TABLE restaurant_staff_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 email text NOT NULL CHECK (email=lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
 role text NOT NULL CHECK (role IN ('manager','cashier','waiter','kitchen')),
 permissions text[] NOT NULL DEFAULT '{}' CHECK (permissions <@ ARRAY['reports','manage']::text[]),
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 invited_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 revoked_at timestamptz,
 accepted_at timestamptz,
 accepted_by text REFERENCES "user"(id),
 CHECK ((accepted_at IS NULL)=(accepted_by IS NULL)),
 CHECK (role='manager' OR cardinality(permissions)=0)
);
CREATE INDEX restaurant_staff_invitation_org_idx
 ON restaurant_staff_invitations(organization_id,created_at DESC);
CREATE TABLE restaurant_staff_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_id text NOT NULL REFERENCES "user"(id),
 user_id text REFERENCES "user"(id),
 invitation_id uuid REFERENCES restaurant_staff_invitations(id),
 action text NOT NULL,
 before_state jsonb,
 after_state jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX restaurant_staff_audit_org_idx ON restaurant_staff_audit(organization_id,created_at DESC);

CREATE FUNCTION restaurant_invite_staff(
 p_org uuid,p_actor text,p_email text,p_role text,p_permissions text[],p_token_hash text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_actor AND role='owner' AND revoked_at IS NULL)
 OR authorized_establishment(p_actor) IS DISTINCT FROM p_org THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_role NOT IN ('manager','cashier','waiter','kitchen') OR p_permissions IS NULL
 OR NOT(p_permissions <@ ARRAY['reports','manage']::text[])
 OR (p_role<>'manager' AND cardinality(p_permissions)>0)
 OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 OR p_email IS NULL OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'invalid_invitation'; END IF;
 -- Serializes concurrent invitations to the same address without revealing an
 -- account's existence to the inviter.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||lower(trim(p_email)),29));
 UPDATE restaurant_staff_invitations SET revoked_at=now()
 WHERE organization_id=p_org AND email=lower(trim(p_email)) AND accepted_at IS NULL AND revoked_at IS NULL;
 INSERT INTO restaurant_staff_invitations(organization_id,email,role,permissions,token_hash,invited_by)
 VALUES(p_org,lower(trim(p_email)),p_role,p_permissions,p_token_hash,p_actor) RETURNING id INTO result;
 INSERT INTO restaurant_staff_audit(organization_id,actor_id,invitation_id,action,after_state)
 VALUES(p_org,p_actor,result,'staff.invited',jsonb_build_object('email',lower(trim(p_email)),'role',p_role,'permissions',p_permissions));
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id)
 VALUES(p_org,p_actor,'staff.invited',result);
 RETURN result;
END $$;

CREATE FUNCTION restaurant_accept_staff_invitation(p_user text,p_token_hash text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE invite restaurant_staff_invitations%ROWTYPE; account_email text; audit_id uuid;
BEGIN
 -- Shares the same user lock as onboarding, so joining and creating a company
 -- cannot both succeed concurrently.
 SELECT lower(email) INTO account_email FROM "user" WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_user'; END IF;
 SELECT * INTO invite FROM restaurant_staff_invitations WHERE token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND OR invite.email<>account_email THEN RAISE EXCEPTION 'invalid_invitation'; END IF;
 IF invite.accepted_by=p_user AND invite.revoked_at IS NULL THEN
  IF authorized_establishment(p_user)=invite.organization_id THEN RETURN invite.organization_id; END IF;
  RAISE EXCEPTION 'membership_inactive';
 END IF;
 IF invite.revoked_at IS NOT NULL OR invite.expires_at<=now() OR invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invitation_expired'; END IF;
 IF authorized_establishment(invite.invited_by) IS DISTINCT FROM invite.organization_id
 OR NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=invite.organization_id AND user_id=invite.invited_by AND role='owner' AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'invalid_invitation'; END IF;
 IF EXISTS(SELECT 1 FROM organization_owner_claims WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM organization_members WHERE user_id=p_user AND organization_id<>invite.organization_id)
 THEN RAISE EXCEPTION 'account_already_assigned'; END IF;
 IF EXISTS(SELECT 1 FROM organization_members WHERE user_id=p_user) THEN RAISE EXCEPTION 'already_member'; END IF;
 INSERT INTO organization_members(organization_id,user_id,role)
 VALUES(invite.organization_id,p_user,invite.role);
 INSERT INTO restaurant_member_permissions(organization_id,user_id,permission)
 SELECT invite.organization_id,p_user,permission FROM (SELECT DISTINCT unnest(invite.permissions) AS permission) p;
 UPDATE restaurant_staff_invitations SET accepted_at=now(),accepted_by=p_user WHERE id=invite.id;
 INSERT INTO restaurant_staff_audit(organization_id,actor_id,user_id,invitation_id,action,after_state)
 VALUES(invite.organization_id,p_user,p_user,invite.id,'staff.joined',jsonb_build_object('role',invite.role,'permissions',invite.permissions))
 RETURNING id INTO audit_id;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id)
 VALUES(invite.organization_id,p_user,'staff.joined',audit_id);
 RETURN invite.organization_id;
END $$;

CREATE FUNCTION restaurant_update_staff(
 p_org uuid,p_actor text,p_user text,p_role text,p_permissions text[],p_active boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE previous organization_members%ROWTYPE; previous_permissions text[]; audit_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_actor AND role='owner' AND revoked_at IS NULL)
 OR authorized_establishment(p_actor) IS DISTINCT FROM p_org THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_role NOT IN ('manager','cashier','waiter','kitchen') OR p_permissions IS NULL OR p_active IS NULL
 OR NOT(p_permissions <@ ARRAY['reports','manage']::text[])
 OR (p_role<>'manager' AND cardinality(p_permissions)>0) THEN RAISE EXCEPTION 'invalid_staff_role'; END IF;
 PERFORM 1 FROM "user" WHERE id=p_user FOR UPDATE;
 SELECT * INTO previous FROM organization_members WHERE organization_id=p_org AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR previous.role='owner' OR p_actor=p_user THEN RAISE EXCEPTION 'protected_member'; END IF;
 IF p_active AND EXISTS(SELECT 1 FROM organization_members WHERE user_id=p_user AND organization_id<>p_org)
 THEN RAISE EXCEPTION 'account_already_assigned'; END IF;
 SELECT COALESCE(array_agg(permission),'{}') INTO previous_permissions FROM restaurant_member_permissions
 WHERE organization_id=p_org AND user_id=p_user;
 UPDATE organization_members SET role=p_role,revoked_at=CASE WHEN p_active THEN NULL ELSE COALESCE(revoked_at,now()) END
 WHERE organization_id=p_org AND user_id=p_user;
 DELETE FROM restaurant_member_permissions WHERE organization_id=p_org AND user_id=p_user;
 INSERT INTO restaurant_member_permissions(organization_id,user_id,permission)
 SELECT p_org,p_user,permission FROM (SELECT DISTINCT unnest(p_permissions) AS permission) p;
 -- A revoked device must authenticate again; historical users and orders stay.
 IF NOT p_active THEN DELETE FROM "session" WHERE "userId"=p_user; END IF;
 INSERT INTO restaurant_staff_audit(organization_id,actor_id,user_id,action,before_state,after_state)
 VALUES(p_org,p_actor,p_user,'staff.updated',
 jsonb_build_object('role',previous.role,'active',previous.revoked_at IS NULL,'permissions',previous_permissions),
 jsonb_build_object('role',p_role,'active',p_active,'permissions',p_permissions)) RETURNING id INTO audit_id;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id)
 VALUES(p_org,p_actor,'staff.updated',audit_id);
END $$;

CREATE FUNCTION restaurant_revoke_invitation(p_org uuid,p_actor text,p_invite uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_actor AND role='owner' AND revoked_at IS NULL)
 OR authorized_establishment(p_actor) IS DISTINCT FROM p_org THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE restaurant_staff_invitations SET revoked_at=COALESCE(revoked_at,now())
 WHERE id=p_invite AND organization_id=p_org AND accepted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_invitation'; END IF;
 INSERT INTO restaurant_staff_audit(organization_id,actor_id,invitation_id,action)
 VALUES(p_org,p_actor,p_invite,'staff.invitation_revoked');
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id)
 VALUES(p_org,p_actor,'staff.invitation_revoked',p_invite);
END $$;
COMMIT;
