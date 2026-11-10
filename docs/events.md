# Event processing

Implemented: domain changes, activity and outbox insert in one PostgreSQL transaction; producer claims committed outbox rows with SKIP LOCKED; sends versioned envelopes with aggregate partition keys. Kafka broker acknowledgements precede published_at update. Crashes between those steps can duplicate an event. Consumer writes dedup and event_activity in one DB transaction, then commits Kafka offsets synchronously. This is at-least-once processing with durable internal deduplication, not exactly-once external delivery.

Outbox retries persist attempts and exponential delay capped at one hour. After eight failures the event is sent to radar.domain.dlq.v1; it remains pending if the DLQ itself cannot be published. Mail uses a separate private DB queue; message bodies contain expiring tokens and are cleared on accepted SMTP delivery. Eight failed mail attempts require operator intervention. SMTP acceptance is not inbox delivery.

Ordering: related aggregate keys share Kafka partitions, but concurrent outbox publishers can reorder committed events. Current consumer materialises independent audit facts; do not use it for order-sensitive state transitions. SQL authoritative records remain the source of truth.

Current consumer poison-message handling stops the process without committing, preserving the event but blocking that partition. Persisted per-consumer retry scheduling, poison-message dead lettering, reminder scheduling and push delivery remain unfinished. The worker is not production ready.

Replay: stop the affected consumer; inspect the DLQ privately; fix the root cause; republish the original envelope retaining its event ID. Dedup suppresses previously processed IDs. Never delete dedup records just to force replay. Account deletion removes live authoritative data and queued aggregate events; Kafka retention/backups may retain opaque aggregate IDs until retention expiry. No purchase contents or email addresses appear in domain event envelopes.
