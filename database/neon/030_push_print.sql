BEGIN;
-- Device subscriptions contain delivery credentials: server access only.
-- Rebinding an endpoint requires an explicit authenticated subscription action.
CREATE TABLE restaurant_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 user_id text NOT NULL,
 endpoint text NOT NULL UNIQUE CHECK(length(endpoint) BETWEEN 20 AND 2048),
 endpoint_hash text NOT NULL CHECK(length(endpoint_hash)=64),
 p256dh text NOT NULL,
 auth text NOT NULL,
 device_name text NOT NULL DEFAULT 'Este dispositivo' CHECK(length(device_name)<=80),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,user_id) REFERENCES organization_members(organization_id,user_id) ON DELETE CASCADE
);
CREATE INDEX restaurant_push_subscriptions_user_idx ON restaurant_push_subscriptions(organization_id,user_id);
CREATE TABLE restaurant_push_deliveries (
 event_id uuid NOT NULL REFERENCES restaurant_events(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES restaurant_push_subscriptions(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 last_status integer,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,subscription_id)
);
CREATE INDEX restaurant_push_deliveries_pending_idx ON restaurant_push_deliveries(next_attempt_at) WHERE state='pending';
COMMIT;
