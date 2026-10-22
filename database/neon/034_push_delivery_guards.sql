BEGIN;
ALTER TABLE restaurant_push_subscriptions ADD CONSTRAINT restaurant_push_subscriptions_recipient_key UNIQUE(id,organization_id,user_id);
ALTER TABLE restaurant_push_deliveries ADD COLUMN organization_id uuid;
ALTER TABLE restaurant_push_deliveries ADD COLUMN user_id text;
UPDATE restaurant_push_deliveries d SET organization_id=s.organization_id,user_id=s.user_id FROM restaurant_push_subscriptions s WHERE s.id=d.subscription_id;
ALTER TABLE restaurant_push_deliveries ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE restaurant_push_deliveries ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE restaurant_push_deliveries ADD CONSTRAINT restaurant_push_delivery_subscription_recipient_fk FOREIGN KEY(subscription_id,organization_id,user_id) REFERENCES restaurant_push_subscriptions(id,organization_id,user_id) ON DELETE CASCADE;
ALTER TABLE restaurant_push_deliveries ADD CONSTRAINT restaurant_push_delivery_event_org_fk FOREIGN KEY(event_id,organization_id) REFERENCES restaurant_events(id,organization_id) ON DELETE CASCADE;
ALTER TABLE restaurant_push_deliveries ADD CONSTRAINT restaurant_push_delivery_notification_recipient_fk FOREIGN KEY(event_id,user_id) REFERENCES restaurant_notifications(event_id,user_id) ON DELETE CASCADE;
CREATE FUNCTION restaurant_register_push_subscription(p_user text,p_endpoint text,p_hash text,p_p256dh text,p_auth text,p_name text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE org uuid; result uuid;
BEGIN
 org:=authorized_establishment(p_user);
 IF org IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('push:'||p_endpoint,0));
 IF NOT EXISTS(SELECT 1 FROM restaurant_push_subscriptions WHERE endpoint=p_endpoint AND organization_id=org AND user_id=p_user)
 AND (SELECT count(*) FROM restaurant_push_subscriptions WHERE organization_id=org AND user_id=p_user)>=20 THEN RAISE EXCEPTION 'push_device_limit'; END IF;
 -- Explicit consent transfers this browser's subscription. No business records are removed.
 DELETE FROM restaurant_push_subscriptions WHERE endpoint=p_endpoint AND (organization_id<>org OR user_id<>p_user);
 INSERT INTO restaurant_push_subscriptions(organization_id,user_id,endpoint,endpoint_hash,p256dh,auth,device_name)
 VALUES(org,p_user,p_endpoint,p_hash,p_p256dh,p_auth,p_name)
 ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,device_name=excluded.device_name,updated_at=now()
 RETURNING id INTO result;
 INSERT INTO restaurant_notification_preferences(organization_id,user_id,push_enabled) VALUES(org,p_user,true)
 ON CONFLICT(organization_id,user_id) DO UPDATE SET push_enabled=true;
 RETURN result;
END $$;
COMMIT;
