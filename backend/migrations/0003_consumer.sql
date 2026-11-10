CREATE TABLE consumed_events (consumer text NOT NULL, event_id uuid NOT NULL, processed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(consumer,event_id));
CREATE TABLE event_activity (event_id uuid PRIMARY KEY, kind text NOT NULL, aggregate_id uuid NOT NULL, occurred_at timestamptz NOT NULL);
