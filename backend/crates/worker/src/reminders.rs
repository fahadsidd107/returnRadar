use chrono::{Timelike, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;
type E = Box<dyn std::error::Error + Send + Sync>;
fn quiet(hour: u32, start: i32, end: i32) -> bool {
    let h = hour as i32;
    if start == end {
        false
    } else if start < end {
        h >= start && h < end
    } else {
        h >= start || h < end
    }
}
pub async fn schedule(pool: &PgPool) -> Result<(), E> {
    let mut tx = pool.begin().await?;
    let row=sqlx::query("SELECT m.*,u.timezone,u.quiet_start,u.quiet_end FROM reminders m JOIN users u ON u.id=m.user_id WHERE m.state='scheduled' AND m.due_at<=now() ORDER BY m.due_at FOR UPDATE OF m SKIP LOCKED LIMIT 1").fetch_optional(&mut *tx).await?;
    if let Some(r) = row {
        let mid: Uuid = r.get("id");
        let uid: Uuid = r.get("user_id");
        let p: Option<Uuid> = r.get("purchase_id");
        let ret: Option<Uuid> = r.get("return_id");
        let run: Option<Uuid> = r.get("run_id");
        let kind: String = r.get("kind");
        let version: Option<i32> = r.get("purchase_version");
        let valid=sqlx::query_scalar::<_,bool>("SELECT EXISTS(SELECT 1 FROM purchases WHERE id=$1 AND user_id=$4 AND NOT archived AND version=$5 AND NOT EXISTS(SELECT 1 FROM returns WHERE purchase_id=$1 AND state!='cancelled')) OR EXISTS(SELECT 1 FROM returns WHERE id=$2 AND user_id=$4 AND state NOT IN ('resolved','cancelled') AND ($6!='shipping' OR state IN ('requested','packed'))) OR EXISTS(SELECT 1 FROM runs WHERE id=$3 AND user_id=$4 AND (NOT EXISTS(SELECT 1 FROM run_assignments WHERE run_id=$3) OR EXISTS(SELECT 1 FROM run_assignments WHERE run_id=$3 AND handed_over_at IS NULL)))").bind(p).bind(ret).bind(run).bind(uid).bind(version).bind(&kind).fetch_one(&mut *tx).await?;
        if !valid {
            sqlx::query("UPDATE reminders SET state='cancelled' WHERE id=$1")
                .bind(mid)
                .execute(&mut *tx)
                .await?;
        } else {
            let timezone = r.get::<String, _>("timezone").parse::<chrono_tz::Tz>()?;
            let local = Utc::now().with_timezone(&timezone);
            if quiet(local.hour(), r.get("quiet_start"), r.get("quiet_end")) {
                sqlx::query("UPDATE reminders SET due_at=now()+interval '15 minutes' WHERE id=$1")
                    .bind(mid)
                    .execute(&mut *tx)
                    .await?;
            } else {
                let nid = Uuid::new_v4();
                let aggregate = p.or(ret).or(run).ok_or("missing aggregate")?;
                let path = if p.is_some() {
                    "purchase"
                } else if ret.is_some() {
                    "return"
                } else {
                    "run"
                };
                let link = format!("returnradar://{path}/{aggregate}");
                let title = match kind.as_str() {
                    "decision" => "Time to decide: keep or return?",
                    "shipping" => "Your parcel needs attention",
                    "run" => "Your Return Run is coming up",
                    _ => "Check your refund progress",
                };
                sqlx::query("INSERT INTO notifications(id,user_id,reminder_id,title,body,deep_link) VALUES($1,$2,$3,$4,'Open Return Radar to review the next action.',$5) ON CONFLICT(reminder_id) DO NOTHING").bind(nid).bind(uid).bind(mid).bind(title).bind(link).execute(&mut *tx).await?;
                sqlx::query("INSERT INTO push_attempts(notification_id,token) SELECT $1,d.token FROM device_tokens d JOIN users u ON u.id=d.user_id WHERE d.user_id=$2 AND u.push_enabled ON CONFLICT DO NOTHING").bind(nid).bind(uid).execute(&mut *tx).await?;
                sqlx::query("UPDATE reminders SET state='queued' WHERE id=$1")
                    .bind(mid)
                    .execute(&mut *tx)
                    .await?;
                sqlx::query("INSERT INTO outbox(id,aggregate_id,kind,payload) VALUES($1,$2,'ReminderDue',$3)").bind(nid).bind(aggregate).bind(serde_json::json!({"reminderId":mid,"schemaVersion":1})).execute(&mut *tx).await?;
            }
        }
    }
    tx.commit().await?;
    Ok(())
}
pub async fn push(pool: &PgPool) -> Result<(), E> {
    let mut tx = pool.begin().await?;
    let row=sqlx::query("SELECT a.*,n.title,n.body,n.deep_link,u.push_enabled,u.timezone,u.quiet_start,u.quiet_end,m.return_id,m.purchase_id,m.purchase_version FROM push_attempts a JOIN notifications n ON n.id=a.notification_id JOIN reminders m ON m.id=n.reminder_id JOIN users u ON u.id=n.user_id WHERE a.status='pending' AND a.next_attempt_at<=now() AND a.attempts<8 ORDER BY a.next_attempt_at FOR UPDATE OF a SKIP LOCKED LIMIT 1").fetch_optional(&mut *tx).await?;
    if let Some(r) = row {
        let nid: Uuid = r.get("notification_id");
        let token: String = r.get("token");
        let active=sqlx::query_scalar::<_,bool>("SELECT NOT EXISTS(SELECT 1 FROM returns WHERE id=$1 AND state IN ('cancelled','resolved')) AND NOT EXISTS(SELECT 1 FROM purchases WHERE id=$2 AND (archived OR version!=$3))").bind(r.get::<Option<Uuid>,_>("return_id")).bind(r.get::<Option<Uuid>,_>("purchase_id")).bind(r.get::<Option<i32>,_>("purchase_version")).fetch_one(&mut *tx).await?;
        let tz = r.get::<String, _>("timezone").parse::<chrono_tz::Tz>()?;
        if !r.get::<bool, _>("push_enabled") || !active {
            sqlx::query(
                "UPDATE push_attempts SET status='failed' WHERE notification_id=$1 AND token=$2",
            )
            .bind(nid)
            .bind(token)
            .execute(&mut *tx)
            .await?;
        } else if quiet(
            Utc::now().with_timezone(&tz).hour(),
            r.get("quiet_start"),
            r.get("quiet_end"),
        ) {
            sqlx::query("UPDATE push_attempts SET next_attempt_at=now()+interval '15 minutes' WHERE notification_id=$1 AND token=$2").bind(nid).bind(token).execute(&mut *tx).await?;
        } else {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()?;
            let mut req=client.post("https://exp.host/--/api/v2/push/send").json(&serde_json::json!({"to":token,"title":r.get::<String,_>("title"),"body":r.get::<String,_>("body"),"data":{"url":r.get::<String,_>("deep_link")}}));
            if let Ok(access) = std::env::var("EXPO_ACCESS_TOKEN") {
                req = req.bearer_auth(access);
            }
            let response = req.send().await;
            let mut accepted = None;
            let mut invalid = false;
            if let Ok(response) = response {
                if response.status().is_success() {
                    if let Ok(body) = response.json::<serde_json::Value>().await {
                        if body["data"]["status"] == "ok" {
                            accepted = body["data"]["id"].as_str().map(str::to_owned);
                        }
                        invalid = body["data"]["details"]["error"] == "DeviceNotRegistered";
                    }
                }
            }
            if invalid {
                sqlx::query("DELETE FROM device_tokens WHERE token=$1")
                    .bind(token)
                    .execute(&mut *tx)
                    .await?;
            } else if let Some(ticket) = accepted {
                sqlx::query("UPDATE push_attempts SET status='accepted',provider_ticket=$3,attempts=attempts+1 WHERE notification_id=$1 AND token=$2").bind(nid).bind(token).bind(ticket).execute(&mut *tx).await?;
            } else {
                sqlx::query("UPDATE push_attempts SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(3600,power(2,attempts+1)::integer)),status=CASE WHEN attempts>=7 THEN 'failed' ELSE 'pending' END WHERE notification_id=$1 AND token=$2").bind(nid).bind(token).execute(&mut *tx).await?;
            }
        }
    }
    tx.commit().await?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn overnight_quiet_hours() {
        assert!(quiet(23, 22, 8));
        assert!(quiet(7, 22, 8));
        assert!(!quiet(8, 22, 8));
        assert!(!quiet(21, 22, 8));
        assert!(!quiet(12, 0, 0));
    }
}
