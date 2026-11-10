use crate::{db_error, id, invalid, user};
use async_graphql::{Context, Error, Result, SimpleObject};
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;
#[derive(SimpleObject)]
pub struct Notification {
    pub id: String,
    pub title: String,
    pub body: String,
    pub deep_link: String,
    pub created_at: String,
    pub read: bool,
}
#[derive(SimpleObject)]
pub struct Preferences {
    pub timezone: String,
    pub push_enabled: bool,
    pub quiet_start: i32,
    pub quiet_end: i32,
}
pub async fn preferences(ctx: &Context<'_>) -> Result<Preferences> {
    let uid = user(ctx)?;
    let r =
        sqlx::query("SELECT timezone,push_enabled,quiet_start,quiet_end FROM users WHERE id=$1")
            .bind(uid)
            .fetch_one(ctx.data_unchecked::<PgPool>())
            .await
            .map_err(db_error)?;
    Ok(Preferences {
        timezone: r.get("timezone"),
        push_enabled: r.get("push_enabled"),
        quiet_start: r.get("quiet_start"),
        quiet_end: r.get("quiet_end"),
    })
}
pub async fn update(
    ctx: &Context<'_>,
    timezone: String,
    push_enabled: bool,
    quiet_start: i32,
    quiet_end: i32,
) -> Result<bool> {
    let uid = user(ctx)?;
    timezone.parse::<chrono_tz::Tz>().map_err(|_| invalid())?;
    if !(0..24).contains(&quiet_start) || !(0..24).contains(&quiet_end) {
        return Err(invalid());
    }
    sqlx::query(
        "UPDATE users SET timezone=$1,push_enabled=$2,quiet_start=$3,quiet_end=$4 WHERE id=$5",
    )
    .bind(timezone)
    .bind(push_enabled)
    .bind(quiet_start)
    .bind(quiet_end)
    .bind(uid)
    .execute(ctx.data_unchecked::<PgPool>())
    .await
    .map_err(db_error)?;
    Ok(true)
}
pub async fn register_device(ctx: &Context<'_>, token: String) -> Result<bool> {
    let uid = user(ctx)?;
    if token.len() > 256
        || !(token.starts_with("ExponentPushToken[") || token.starts_with("ExpoPushToken["))
        || !token.ends_with(']')
    {
        return Err(invalid());
    }
    sqlx::query("INSERT INTO device_tokens(token,user_id) VALUES($1,$2) ON CONFLICT(token) DO UPDATE SET user_id=$2").bind(token).bind(uid).execute(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?;
    Ok(true)
}
pub async fn schedule(
    ctx: &Context<'_>,
    purchase_id: Option<String>,
    return_id: Option<String>,
    run_id: Option<String>,
    kind: String,
    due_at: String,
) -> Result<String> {
    let uid = user(ctx)?;
    let p = purchase_id.map(|s| id(&s)).transpose()?;
    let r = return_id.map(|s| id(&s)).transpose()?;
    let run = run_id.map(|s| id(&s)).transpose()?;
    let due = DateTime::parse_from_rfc3339(&due_at)
        .map_err(|_| invalid())?
        .with_timezone(&Utc);
    if due < Utc::now()
        || due > Utc::now() + chrono::Duration::days(730)
        || p.is_some() as u8 + r.is_some() as u8 + run.is_some() as u8 != 1
        || !matches!(
            (kind.as_str(), p.is_some(), r.is_some(), run.is_some()),
            ("decision", true, false, false)
                | ("shipping" | "refund", false, true, false)
                | ("run", false, false, true)
        )
    {
        return Err(invalid());
    }
    let pool = ctx.data_unchecked::<PgPool>();
    let owned=sqlx::query_scalar::<_,bool>("SELECT EXISTS(SELECT 1 FROM purchases WHERE id=$1 AND user_id=$4 AND NOT archived) OR EXISTS(SELECT 1 FROM returns WHERE id=$2 AND user_id=$4 AND state NOT IN ('resolved','cancelled')) OR EXISTS(SELECT 1 FROM runs WHERE id=$3 AND user_id=$4)").bind(p).bind(r).bind(run).bind(uid).fetch_one(pool).await.map_err(db_error)?;
    if !owned {
        return Err(Error::new("NOT_FOUND"));
    }
    let rid = Uuid::new_v4();
    sqlx::query("INSERT INTO reminders(id,user_id,purchase_id,return_id,run_id,kind,due_at,purchase_version) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT version FROM purchases WHERE id=$3))").bind(rid).bind(uid).bind(p).bind(r).bind(run).bind(kind).bind(due).execute(pool).await.map_err(db_error)?;
    Ok(rid.to_string())
}
pub async fn list(ctx: &Context<'_>) -> Result<Vec<Notification>> {
    let uid = user(ctx)?;
    Ok(sqlx::query(
        "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
    )
    .bind(uid)
    .fetch_all(ctx.data_unchecked::<PgPool>())
    .await
    .map_err(db_error)?
    .into_iter()
    .map(|r| Notification {
        id: r.get::<Uuid, _>("id").to_string(),
        title: r.get("title"),
        body: r.get("body"),
        deep_link: r.get("deep_link"),
        created_at: r.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
        read: r.get::<Option<DateTime<Utc>>, _>("read_at").is_some(),
    })
    .collect())
}
pub async fn read(ctx: &Context<'_>, notification_id: String) -> Result<bool> {
    let uid = user(ctx)?;
    let n = sqlx::query("UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2")
        .bind(id(&notification_id)?)
        .bind(uid)
        .execute(ctx.data_unchecked::<PgPool>())
        .await
        .map_err(db_error)?
        .rows_affected();
    if n == 0 {
        return Err(Error::new("NOT_FOUND"));
    }
    Ok(true)
}
