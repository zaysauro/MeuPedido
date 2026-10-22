BEGIN;
-- Claim a browser print attempt once; other devices must explicitly request a reprint.
CREATE OR REPLACE FUNCTION restaurant_print_record(p_org uuid,p_user text,p_job uuid,p_request uuid,p_action text,p_details text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE job restaurant_print_jobs%ROWTYPE;previous restaurant_print_attempts%ROWTYPE;result uuid;
BEGIN
 IF NOT (restaurant_has_permission(p_org,p_user,'prepare') OR restaurant_has_permission(p_org,p_user,'serve')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_request IS NULL OR p_action NOT IN ('dialog_opened','confirmed','failed') OR length(coalesce(p_details,''))>500 THEN RAISE EXCEPTION 'invalid_print_attempt'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 SELECT * INTO previous FROM restaurant_print_attempts WHERE organization_id=p_org AND request_id=p_request;
 IF FOUND THEN IF previous.job_id<>p_job OR previous.action<>p_action OR previous.details<>coalesce(p_details,'') THEN RAISE EXCEPTION 'request_payload_mismatch'; END IF; RETURN previous.id; END IF;
 SELECT * INTO job FROM restaurant_print_jobs WHERE id=p_job AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'print_job_missing'; END IF;
 IF p_action='confirmed' AND job.status<>'dialog_opened' THEN RAISE EXCEPTION 'print_dialog_required'; END IF;
 IF p_action='dialog_opened' AND job.status IN ('confirmed','dialog_opened') THEN RAISE EXCEPTION 'use_reprint'; END IF;
 INSERT INTO restaurant_print_attempts(organization_id,job_id,request_id,action,details,actor_id)
 VALUES(p_org,p_job,p_request,p_action,coalesce(p_details,''),p_user) RETURNING id INTO result;
 UPDATE restaurant_print_jobs SET status=p_action,updated_at=now() WHERE id=p_job AND organization_id=p_org;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'print.'||p_action,p_job);
 RETURN result;
END $$;

CREATE FUNCTION restaurant_print_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO restaurant_live_versions(organization_id,version) VALUES(NEW.organization_id,1)
 ON CONFLICT(organization_id) DO UPDATE SET version=restaurant_live_versions.version+1;
 RETURN NEW;
END $$;
CREATE TRIGGER restaurant_print_version_change AFTER INSERT OR UPDATE OF status ON restaurant_print_jobs FOR EACH ROW EXECUTE FUNCTION restaurant_print_version();
COMMIT;
