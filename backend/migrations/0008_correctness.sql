CREATE TABLE fee_entries (id uuid PRIMARY KEY,return_id uuid NOT NULL REFERENCES returns ON DELETE CASCADE,amount bigint NOT NULL CHECK(amount>0),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE consumer_failures (consumer text NOT NULL,topic text NOT NULL,partition integer NOT NULL,message_offset bigint NOT NULL,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),dead_lettered_at timestamptz,PRIMARY KEY(consumer,topic,partition,message_offset));
ALTER TABLE push_attempts ADD COLUMN receipt_checked_at timestamptz;
ALTER TABLE push_attempts ADD COLUMN receipt_status text;
