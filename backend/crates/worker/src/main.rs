mod objects;
mod reminders;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use rdkafka::{
    ClientConfig, Message as KafkaMessage,
    consumer::{CommitMode, Consumer, StreamConsumer},
    producer::{FutureProducer, FutureRecord},
};
use sqlx::{PgPool, Row};
use std::time::Duration;
use uuid::Uuid;

async fn mail(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tx = pool.begin().await?;
    let row=sqlx::query("SELECT * FROM mail_queue WHERE sent_at IS NULL AND attempts<8 AND next_attempt_at<=now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1").fetch_optional(&mut *tx).await?;
    if let Some(r) = row {
        let id: Uuid = r.get("id");
        let msg = Message::builder()
            .from(
                std::env::var("MAIL_FROM")
                    .unwrap_or("Return Radar <noreply@localhost>".into())
                    .parse()?,
            )
            .to(r.get::<String, _>("recipient").parse()?)
            .subject(r.get::<String, _>("subject"))
            .body(r.get::<String, _>("body"))?;
        let host = std::env::var("SMTP_HOST").unwrap_or("localhost".into());
        let port = std::env::var("SMTP_PORT")
            .unwrap_or("51025".into())
            .parse()?;
        let mut builder = if host == "localhost" || host == "mailpit" {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&host)
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&host)?
        };
        builder = builder.port(port).timeout(Some(Duration::from_secs(10)));
        if let (Ok(u), Ok(p)) = (std::env::var("SMTP_USER"), std::env::var("SMTP_PASSWORD")) {
            builder = builder.credentials(
                lettre::transport::smtp::authentication::Credentials::new(u, p),
            );
        }
        match builder.build().send(msg).await {
            Ok(_) => {
                sqlx::query("UPDATE mail_queue SET sent_at=now(),body='' WHERE id=$1")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            }
            Err(_) => {
                sqlx::query("UPDATE mail_queue SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(3600,power(2,attempts+1)::integer)) WHERE id=$1").bind(id).execute(&mut *tx).await?;
                tracing::warn!("mail delivery failed; retry persisted");
            }
        }
    }
    tx.commit().await?;
    Ok(())
}
async fn publish(
    pool: &PgPool,
    producer: &FutureProducer,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tx = pool.begin().await?;
    let row=sqlx::query("SELECT * FROM outbox WHERE published_at IS NULL AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1").fetch_optional(&mut *tx).await?;
    if let Some(r) = row {
        let id: Uuid = r.get("id");
        let aggregate: Uuid = r.get("aggregate_id");
        let attempts: i32 = r.get("attempts");
        let kind: String = r.get("kind");
        let envelope=serde_json::json!({"id":id,"aggregateId":aggregate,"kind":kind,"schemaVersion":r.get::<i32,_>("schema_version"),"occurredAt":r.get::<chrono::DateTime<chrono::Utc>,_>("created_at"),"payload":r.get::<serde_json::Value,_>("payload"),"traceCorrelation":id}).to_string();
        let key = aggregate.to_string();
        let topic = if attempts >= 8 {
            "radar.domain.dlq.v1"
        } else {
            "radar.domain.v1"
        };
        match producer
            .send(
                FutureRecord::to(topic).key(&key).payload(&envelope),
                Duration::from_secs(5),
            )
            .await
        {
            Ok(_) => {
                sqlx::query("UPDATE outbox SET published_at=now() WHERE id=$1")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            }
            Err(_) => {
                sqlx::query("UPDATE outbox SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(3600,power(2,LEAST(attempts+1,12))::integer)) WHERE id=$1").bind(id).execute(&mut *tx).await?;
                tracing::warn!("outbox publish failed; retry persisted");
            }
        }
    }
    tx.commit().await?;
    Ok(())
}
async fn handle_event(
    pool: &PgPool,
    payload: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if payload.len() > 65536 {
        return Err("event too large".into());
    }
    let e: serde_json::Value = serde_json::from_slice(payload)?;
    if e["schemaVersion"].as_i64() != Some(1) {
        return Err("unsupported schema".into());
    }
    let eid: Uuid = e["id"].as_str().ok_or("missing id")?.parse()?;
    let aggregate: Uuid = e["aggregateId"]
        .as_str()
        .ok_or("missing aggregate")?
        .parse()?;
    let kind = e["kind"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 80)
        .ok_or("missing kind")?;
    let at: chrono::DateTime<chrono::Utc> = e["occurredAt"]
        .as_str()
        .ok_or("missing timestamp")?
        .parse()?;
    let mut tx = pool.begin().await?;
    let n=sqlx::query("INSERT INTO consumed_events(consumer,event_id) VALUES('activity-v1',$1) ON CONFLICT DO NOTHING").bind(eid).execute(&mut *tx).await?.rows_affected();
    if n == 1 {
        sqlx::query("INSERT INTO event_activity(event_id,kind,aggregate_id,occurred_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(eid).bind(kind).bind(aggregate).bind(at).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}
async fn consume(
    pool: PgPool,
    brokers: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &brokers)
        .set("group.id", "radar-activity-v1")
        .set("enable.auto.commit", "false")
        .set("enable.auto.offset.store", "false")
        .set("auto.offset.reset", "earliest")
        .set("broker.address.family", "v4")
        .create()?;
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", &brokers)
        .set("message.timeout.ms", "5000")
        .set("broker.address.family", "v4")
        .create()?;
    consumer.subscribe(&["radar.domain.v1"])?;
    loop {
        let msg = match consumer.recv().await {
            Ok(m) => m,
            Err(_) => {
                tracing::warn!("Kafka unavailable; consumer reconnecting");
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };
        loop {
            let retry=sqlx::query("SELECT attempts,next_attempt_at,dead_lettered_at FROM consumer_failures WHERE consumer='activity-v1' AND topic=$1 AND partition=$2 AND message_offset=$3").bind(msg.topic()).bind(msg.partition()).bind(msg.offset()).fetch_optional(&pool).await;
            let (attempts, dead) = match retry {
                Ok(Some(r)) => {
                    let due: chrono::DateTime<chrono::Utc> = r.get("next_attempt_at");
                    if due > chrono::Utc::now() {
                        tokio::time::sleep(Duration::from_millis(
                            (due - chrono::Utc::now())
                                .num_milliseconds()
                                .clamp(1, 30000) as u64,
                        ))
                        .await;
                        continue;
                    }
                    (
                        r.get::<i32, _>("attempts"),
                        r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("dead_lettered_at")
                            .is_some(),
                    )
                }
                Ok(None) => (0, false),
                Err(_) => {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };
            let payload = msg.payload().unwrap_or_default();
            let handled = if dead {
                true
            } else if attempts >= 8 {
                let original = if payload.len() <= 65536 {
                    Some(String::from_utf8_lossy(payload).to_string())
                } else {
                    None
                };
                let value=serde_json::json!({"schemaVersion":1,"sourceTopic":msg.topic(),"partition":msg.partition(),"offset":msg.offset(),"original":original,"byteLength":payload.len()}).to_string();
                if producer
                    .send(
                        FutureRecord::to("radar.consumer.dlq.v1")
                            .key(msg.topic())
                            .payload(&value),
                        Duration::from_secs(5),
                    )
                    .await
                    .is_ok()
                {
                    sqlx::query("UPDATE consumer_failures SET dead_lettered_at=now() WHERE consumer='activity-v1' AND topic=$1 AND partition=$2 AND message_offset=$3").bind(msg.topic()).bind(msg.partition()).bind(msg.offset()).execute(&pool).await.is_ok()
                } else {
                    false
                }
            } else {
                handle_event(&pool, payload).await.is_ok()
            };
            if handled {
                if consumer.commit_message(&msg, CommitMode::Sync).is_ok() {
                    break;
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
            let _=sqlx::query("INSERT INTO consumer_failures(consumer,topic,partition,message_offset,attempts,next_attempt_at) VALUES('activity-v1',$1,$2,$3,1,now()+interval '2 seconds') ON CONFLICT(consumer,topic,partition,message_offset) DO UPDATE SET attempts=consumer_failures.attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(300,power(2,LEAST(consumer_failures.attempts+1,9))::integer))").bind(msg.topic()).bind(msg.partition()).bind(msg.offset()).execute(&pool).await;
            tracing::warn!("consumer handling failed; retry position persisted");
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt().init();
    let pool = PgPool::connect(&std::env::var("DATABASE_URL")?).await?;
    let mode = std::env::args().nth(1).unwrap_or("mail".into());
    if !["mail", "outbox", "consume", "scheduler", "push", "objects"].contains(&mode.as_str()) {
        return Err("unknown worker mode".into());
    }
    let once = std::env::args().any(|a| a == "--once");
    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or("127.0.0.1:59092".into());
    if mode == "consume" {
        return consume(pool, brokers).await;
    }
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("message.timeout.ms", "5000")
        .set("broker.address.family", "v4")
        .set("enable.idempotence", "true")
        .create()?;
    loop {
        let result = if mode == "objects" {
            objects::cleanup(&pool).await
        } else if mode == "scheduler" {
            reminders::schedule(&pool).await
        } else if mode == "push" {
            reminders::push(&pool).await
        } else if mode == "outbox" {
            publish(&pool, &producer).await
        } else {
            mail(&pool).await
        };
        if result.is_err() {
            tracing::error!("worker iteration failed; durable work will retry");
            if once {
                return Err("worker iteration failed".into());
            }
        }
        if once {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
