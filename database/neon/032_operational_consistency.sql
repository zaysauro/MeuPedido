BEGIN;
-- Coalesce event fan-out within each committed operation. Historical event rows remain intact.
ALTER TABLE restaurant_events ADD COLUMN transaction_id bigint;
CREATE UNIQUE INDEX restaurant_event_operation_unique ON restaurant_events(organization_id,transaction_id,event_type,entity_id) WHERE transaction_id IS NOT NULL;
CREATE OR REPLACE FUNCTION restaurant_emit(p_org uuid,p_type text,p_entity uuid,p_order uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid;
BEGIN
 INSERT INTO restaurant_live_versions VALUES(p_org,1) ON CONFLICT(organization_id) DO UPDATE SET version=restaurant_live_versions.version+1;
 IF p_type='order.items_added' AND EXISTS(SELECT 1 FROM restaurant_events WHERE organization_id=p_org AND entity_id=p_entity AND event_type='order.created' AND transaction_id=txid_current()) THEN RETURN NULL; END IF;
 INSERT INTO restaurant_events(organization_id,event_type,entity_id,transaction_id) VALUES(p_org,p_type,p_entity,txid_current())
 ON CONFLICT(organization_id,transaction_id,event_type,entity_id) WHERE transaction_id IS NOT NULL DO NOTHING RETURNING id INTO result;
 IF result IS NULL OR p_type='table.updated' THEN RETURN result; END IF;
 INSERT INTO restaurant_notifications(event_id,organization_id,user_id)
 SELECT result,p_org,m.user_id FROM organization_members m WHERE m.organization_id=p_org AND m.revoked_at IS NULL AND (
 m.role IN ('owner','admin','manager','cashier') OR
 (m.role='kitchen' AND p_type IN ('order.created','order.items_added','order.cancelled','kitchen.order_received')) OR
 (m.role IN ('waiter','staff') AND p_type NOT LIKE 'cash_register.%' AND (EXISTS(SELECT 1 FROM restaurant_order_participants p WHERE p.organization_id=p_org AND p.order_id=p_order AND p.user_id=m.user_id) OR EXISTS(SELECT 1 FROM restaurant_orders o WHERE o.id=p_order AND o.organization_id=p_org AND o.created_by=m.user_id)))
 );
 RETURN result;
END $$;
CREATE FUNCTION restaurant_open_order_once(p_org uuid,p_user text,p_request uuid,p_body jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE prior restaurant_request_keys%ROWTYPE; result uuid; target uuid;
BEGIN
 IF NOT restaurant_has_permission(p_org,p_user,'serve') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||p_request::text,0));
 SELECT * INTO prior FROM restaurant_request_keys WHERE organization_id=p_org AND request_id=p_request;
 IF FOUND THEN
  IF prior.payload IS DISTINCT FROM p_body THEN RAISE EXCEPTION 'request_payload_mismatch'; END IF;
  RETURN prior.order_id;
 END IF;
 IF p_body->>'channel' NOT IN ('mesa','balcao','retirada') THEN RAISE EXCEPTION 'invalid_channel'; END IF;
 target:=(p_body->>'tableId')::uuid;
 IF p_body->>'channel'='mesa' THEN
  PERFORM 1 FROM restaurant_tables WHERE id=target AND organization_id=p_org AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_table'; END IF;
  SELECT id INTO result FROM restaurant_open_orders WHERE organization_id=p_org AND table_id=target ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 ELSE target:=NULL; END IF;
 IF result IS NULL THEN
  INSERT INTO restaurant_orders(organization_id,channel,table_id,customer_id,created_by,notes) VALUES(p_org,p_body->>'channel',target,(p_body->>'customerId')::uuid,p_user,left(coalesce(p_body->>'notes',''),1000)) RETURNING id INTO result;
  IF target IS NOT NULL THEN PERFORM restaurant_emit(p_org,'table.opened',result,result); END IF;
 END IF;
 INSERT INTO restaurant_order_participants VALUES(p_org,result,p_user) ON CONFLICT DO NOTHING;
 INSERT INTO restaurant_request_keys VALUES(p_org,p_request,p_body,result);
 INSERT INTO restaurant_audit_events(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,'order.opened',result);
 RETURN result;
END $$;
COMMIT;
