BEGIN;
CREATE TABLE restaurant_print_settings (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),
 mode text NOT NULL DEFAULT 'digital' CHECK(mode IN ('digital','print','hybrid')),
 printer_name text NOT NULL DEFAULT '' CHECK(length(printer_name)<=120),
 paper_width integer NOT NULL DEFAULT 80 CHECK(paper_width IN (58,80)),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE restaurant_print_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 order_id uuid NOT NULL,batch_id uuid NOT NULL,request_id uuid,
 reprint_of uuid,snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dialog_opened','confirmed','failed')),
 created_by text REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id),UNIQUE(organization_id,request_id),
 FOREIGN KEY(order_id,organization_id) REFERENCES restaurant_orders(id,organization_id),
 FOREIGN KEY(reprint_of,organization_id) REFERENCES restaurant_print_jobs(id,organization_id)
);
CREATE UNIQUE INDEX restaurant_print_initial_batch ON restaurant_print_jobs(organization_id,order_id,batch_id) WHERE reprint_of IS NULL;
CREATE INDEX restaurant_print_recent ON restaurant_print_jobs(organization_id,created_at DESC);
CREATE TABLE restaurant_print_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,job_id uuid NOT NULL,request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('dialog_opened','confirmed','failed')),details text NOT NULL DEFAULT '' CHECK(length(details)<=500),
 actor_id text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,request_id),FOREIGN KEY(job_id,organization_id) REFERENCES restaurant_print_jobs(id,organization_id)
);

CREATE FUNCTION restaurant_print_snapshot(p_org uuid,p_order uuid,p_batch uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('order_number',o.order_number,'channel',o.channel,'table_label',t.label,'created_at',now(),
  'establishment_name',org.name,'notes',o.notes,'new_items',EXISTS(SELECT 1 FROM restaurant_order_items other WHERE other.order_id=o.id AND other.organization_id=p_org AND other.batch_id<>p_batch),
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name_snapshot,'quantity',i.quantity,'notes',i.notes,
    'addons',(SELECT coalesce(jsonb_agg(a.name_snapshot ORDER BY a.name_snapshot),'[]'::jsonb) FROM restaurant_order_item_addons a WHERE a.order_item_id=i.id AND a.organization_id=p_org)) ORDER BY i.created_at,i.id),'[]'::jsonb)
    FROM restaurant_order_items i WHERE i.organization_id=p_org AND i.order_id=p_order AND i.batch_id=p_batch AND i.requires_preparation AND i.status<>'cancelado'))
 FROM restaurant_orders o JOIN organizations org ON org.id=o.organization_id LEFT JOIN restaurant_tables t ON t.id=o.table_id AND t.organization_id=o.organization_id
 WHERE o.id=p_order AND o.organization_id=p_org
$$;
CREATE FUNCTION restaurant_enqueue_print_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payload jsonb;
BEGIN
 IF NOT NEW.requires_preparation OR NOT EXISTS(SELECT 1 FROM restaurant_print_settings WHERE organization_id=NEW.organization_id AND mode IN ('print','hybrid')) THEN RETURN NEW; END IF;
 payload:=restaurant_print_snapshot(NEW.organization_id,NEW.order_id,NEW.batch_id);
 IF jsonb_array_length(payload->'items')=0 THEN RETURN NEW; END IF;
 INSERT INTO restaurant_print_jobs(organization_id,order_id,batch_id,snapshot)
 VALUES(NEW.organization_id,NEW.order_id,NEW.batch_id,payload)
 ON CONFLICT(organization_id,order_id,batch_id) WHERE reprint_of IS NULL DO NOTHING;
 RETURN NEW;
END $$;
-- Deferred until the transaction has inserted all batch items and their addon snapshots.
CREATE CONSTRAINT TRIGGER restaurant_print_batch AFTER INSERT ON restaurant_order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION restaurant_enqueue_print_batch();

CREATE FUNCTION restaurant_print_manual(p_org uuid,p_user text,p_order uuid,p_batch uuid,p_request uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE previous restaurant_print_jobs%ROWTYPE;payload jsonb;result uuid;
BEGIN
 IF NOT (restaurant_has_permission(p_org,p_user,'prepare') OR restaurant_has_permission(p_org,p_user,'serve')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 SELECT * INTO previous FROM restaurant_print_jobs WHERE organization_id=p_org AND request_id=p_request;
 IF FOUND THEN IF previous.order_id<>p_order OR previous.batch_id<>p_batch THEN RAISE EXCEPTION 'request_payload_mismatch'; END IF; RETURN previous.id; END IF;
 payload:=restaurant_print_snapshot(p_org,p_order,p_batch);
 IF payload IS NULL OR jsonb_array_length(payload->'items')=0 THEN RAISE EXCEPTION 'print_batch_missing'; END IF;
 INSERT INTO restaurant_print_jobs(organization_id,order_id,batch_id,request_id,snapshot,created_by)
 VALUES(p_org,p_order,p_batch,p_request,payload,p_user)
 ON CONFLICT(organization_id,order_id,batch_id) WHERE reprint_of IS NULL DO UPDATE SET batch_id=EXCLUDED.batch_id RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION restaurant_print_reissue(p_org uuid,p_user text,p_job uuid,p_request uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE source restaurant_print_jobs%ROWTYPE;previous restaurant_print_jobs%ROWTYPE;result uuid;
BEGIN
 IF NOT (restaurant_has_permission(p_org,p_user,'prepare') OR restaurant_has_permission(p_org,p_user,'serve')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 SELECT * INTO previous FROM restaurant_print_jobs WHERE organization_id=p_org AND request_id=p_request;
 IF FOUND THEN IF previous.reprint_of IS DISTINCT FROM p_job THEN RAISE EXCEPTION 'request_payload_mismatch'; END IF; RETURN previous.id; END IF;
 SELECT * INTO source FROM restaurant_print_jobs WHERE id=p_job AND organization_id=p_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'print_job_missing'; END IF;
 INSERT INTO restaurant_print_jobs(organization_id,order_id,batch_id,request_id,reprint_of,snapshot,created_by)
 VALUES(p_org,source.order_id,source.batch_id,p_request,p_job,source.snapshot,p_user) RETURNING id INTO result;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'print.reissued',result);
 RETURN result;
END $$;
CREATE FUNCTION restaurant_print_record(p_org uuid,p_user text,p_job uuid,p_request uuid,p_action text,p_details text) RETURNS uuid LANGUAGE plpgsql AS $$
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
 IF p_action='dialog_opened' AND job.status='confirmed' THEN RAISE EXCEPTION 'use_reprint'; END IF;
 INSERT INTO restaurant_print_attempts(organization_id,job_id,request_id,action,details,actor_id)
 VALUES(p_org,p_job,p_request,p_action,coalesce(p_details,''),p_user) RETURNING id INTO result;
 UPDATE restaurant_print_jobs SET status=p_action,updated_at=now() WHERE id=p_job AND organization_id=p_org;
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'print.'||p_action,p_job);
 RETURN result;
END $$;
COMMIT;
