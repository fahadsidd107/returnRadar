mod documents;
mod metrics;
mod notifications;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use async_graphql::{Context, EmptySubscription, Error, InputObject, Object, Schema, SimpleObject};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::{DateTime, NaiveDate, Utc};
use radar_domain::{ReturnState, currency_precision, record_refund, similarity_features};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use uuid::Uuid;

type ApiSchema = Schema<Query, Mutation, EmptySubscription>;
#[derive(Clone)]
struct Identity(Option<Uuid>);
fn user(ctx: &Context<'_>) -> async_graphql::Result<Uuid> {
    ctx.data_unchecked::<Identity>()
        .0
        .ok_or_else(|| Error::new("UNAUTHENTICATED"))
}
fn id(s: &str) -> async_graphql::Result<Uuid> {
    Uuid::parse_str(s).map_err(|_| Error::new("INVALID_ID"))
}
fn invalid() -> Error {
    Error::new("INVALID_INPUT")
}
fn db_error(e: sqlx::Error) -> Error {
    tracing::error!(error_code=?e.as_database_error().and_then(|e|e.code()), "database operation failed");
    Error::new("OPERATION_FAILED")
}
fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
#[derive(SimpleObject)]
struct Purchase {
    id: String,
    merchant: String,
    item: String,
    amount_minor: String,
    currency: String,
    deadline: String,
    notes: String,
    version: i32,
}
fn purchase(r: sqlx::postgres::PgRow) -> Purchase {
    Purchase {
        id: r.get::<Uuid, _>("id").to_string(),
        merchant: r.get("merchant"),
        item: r.get("item"),
        amount_minor: r.get::<i64, _>("amount").to_string(),
        currency: r.get("currency"),
        deadline: r.get::<NaiveDate, _>("deadline").to_string(),
        notes: r.get("notes"),
        version: r.get("version"),
    }
}
#[derive(SimpleObject)]
struct Return {
    id: String,
    purchase_id: String,
    item: String,
    merchant: String,
    currency: String,
    state: String,
    expected_minor: String,
    received_minor: String,
    remaining_minor: String,
    label: String,
    carrier: String,
}
#[derive(SimpleObject)]
struct Run {
    id: String,
    name: String,
    planned_at: String,
}
#[derive(SimpleObject)]
struct Auth {
    token: String,
    refresh_token: String,
    expires_at: String,
}
#[derive(SimpleObject)]
struct Similar {
    return_id: String,
    item: String,
    distance: f64,
    explanation: String,
}
#[derive(SimpleObject)]
struct RunParcel {
    return_id: String,
    item: String,
    label: String,
    carrier: String,
    state: String,
    stop_name: String,
    position: i32,
    handed_over_at: Option<String>,
    evidence_note: String,
}
#[derive(SimpleObject)]
struct Activity {
    kind: String,
    occurred_at: String,
}
#[derive(InputObject)]
struct OrderItemInput {
    name: String,
    unit_amount_minor: String,
    quantity: i32,
}
#[derive(InputObject)]
struct ReturnItemInput {
    item_id: String,
    quantity: i32,
}
#[derive(SimpleObject)]
struct OrderItem {
    id: String,
    name: String,
    unit_amount_minor: String,
    quantity: i32,
    returned_quantity: i32,
}
struct Query;
#[Object]
impl Query {
    async fn notifications(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<notifications::Notification>> {
        notifications::list(ctx).await
    }
    async fn notification_preferences(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<notifications::Preferences> {
        notifications::preferences(ctx).await
    }
    async fn documents(
        &self,
        ctx: &Context<'_>,
        purchase_id: Option<String>,
        return_id: Option<String>,
    ) -> async_graphql::Result<Vec<documents::Document>> {
        documents::list(ctx, purchase_id, return_id).await
    }
    async fn document_download_url(
        &self,
        ctx: &Context<'_>,
        document_id: String,
    ) -> async_graphql::Result<String> {
        documents::download(ctx, document_id).await
    }
    async fn purchase_items(
        &self,
        ctx: &Context<'_>,
        purchase_id: String,
    ) -> async_graphql::Result<Vec<OrderItem>> {
        let uid = user(ctx)?;
        Ok(sqlx::query("SELECT i.*,COALESCE((SELECT sum(ri.quantity)::integer FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.item_id=i.id AND r.state!='cancelled'),0) returned FROM purchase_items i JOIN purchases p ON p.id=i.purchase_id WHERE i.purchase_id=$1 AND p.user_id=$2 ORDER BY i.name,i.id").bind(id(&purchase_id)?).bind(uid).fetch_all(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?.into_iter().map(|r|OrderItem{id:r.get::<Uuid,_>("id").to_string(),name:r.get("name"),unit_amount_minor:r.get::<i64,_>("unit_amount").to_string(),quantity:r.get("quantity"),returned_quantity:r.get("returned")}).collect())
    }
    async fn timeline(
        &self,
        ctx: &Context<'_>,
        aggregate_id: String,
    ) -> async_graphql::Result<Vec<Activity>> {
        let uid = user(ctx)?;
        Ok(sqlx::query("SELECT kind,created_at FROM activity WHERE user_id=$1 AND aggregate_id=$2 ORDER BY created_at,id LIMIT 200").bind(uid).bind(id(&aggregate_id)?).fetch_all(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?.into_iter().map(|r|Activity{kind:r.get("kind"),occurred_at:r.get::<DateTime<Utc>,_>("created_at").to_rfc3339()}).collect())
    }
    async fn run_parcels(
        &self,
        ctx: &Context<'_>,
        run_id: String,
    ) -> async_graphql::Result<Vec<RunParcel>> {
        let uid = user(ctx)?;
        Ok(sqlx::query("SELECT a.*,p.item,r.label,r.carrier,r.state FROM run_assignments a JOIN runs run ON run.id=a.run_id JOIN returns r ON r.id=a.return_id JOIN purchases p ON p.id=r.purchase_id WHERE a.run_id=$1 AND run.user_id=$2 AND r.user_id=$2 ORDER BY a.position,a.return_id").bind(id(&run_id)?).bind(uid).fetch_all(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?.into_iter().map(|r|RunParcel{return_id:r.get::<Uuid,_>("return_id").to_string(),item:r.get("item"),label:r.get("label"),carrier:r.get("carrier"),state:r.get("state"),stop_name:r.get("stop_name"),position:r.get("position"),handed_over_at:r.get::<Option<DateTime<Utc>>,_>("handed_over_at").map(|d|d.to_rfc3339()),evidence_note:r.get("evidence_note")}).collect())
    }
    async fn export_data(&self, ctx: &Context<'_>) -> async_graphql::Result<String> {
        let uid = user(ctx)?;
        let r=sqlx::query_scalar::<_,serde_json::Value>("SELECT jsonb_build_object('schemaVersion',1,'exportedAt',now(),'purchases',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'user_id') FROM purchases p WHERE user_id=$1),'[]'::jsonb),'returns',COALESCE((SELECT jsonb_agg(to_jsonb(r)-'user_id'-'features') FROM returns r WHERE user_id=$1),'[]'::jsonb),'refunds',COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM refunds f JOIN returns r ON r.id=f.return_id WHERE r.user_id=$1),'[]'::jsonb),'runs',COALESCE((SELECT jsonb_agg(to_jsonb(run)-'user_id') FROM runs run WHERE user_id=$1),'[]'::jsonb),'assignments',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM run_assignments a JOIN runs r ON r.id=a.run_id WHERE r.user_id=$1),'[]'::jsonb),'activity',COALESCE((SELECT jsonb_agg(to_jsonb(a)-'user_id') FROM activity a WHERE user_id=$1),'[]'::jsonb))").bind(uid).fetch_one(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?;
        Ok(r.to_string())
    }
    async fn purchases(
        &self,
        ctx: &Context<'_>,
        offset: Option<i32>,
        search: Option<String>,
    ) -> async_graphql::Result<Vec<Purchase>> {
        let uid = user(ctx)?;
        let rows=sqlx::query("SELECT * FROM purchases WHERE user_id=$1 AND NOT archived AND (merchant ILIKE $2 OR item ILIKE $2) ORDER BY created_at DESC,id LIMIT 50 OFFSET $3").bind(uid).bind(format!("%{}%",search.unwrap_or_default())).bind(offset.unwrap_or(0).clamp(0,100000)).fetch_all(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?;
        Ok(rows.into_iter().map(purchase).collect())
    }
    async fn returns(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Return>> {
        let uid = user(ctx)?;
        let rows=sqlx::query("SELECT r.*,p.item,p.merchant,p.currency,COALESCE((SELECT sum(amount)::bigint FROM refunds WHERE return_id=r.id),0) received FROM returns r JOIN purchases p ON p.id=r.purchase_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 100").bind(uid).fetch_all(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?;
        Ok(rows
            .into_iter()
            .map(|r| {
                let expected: i64 = r.get("expected");
                let received: i64 = r.get("received");
                let fees: i64 = r.get("fees");
                Return {
                    id: r.get::<Uuid, _>("id").to_string(),
                    purchase_id: r.get::<Uuid, _>("purchase_id").to_string(),
                    item: r.get("item"),
                    merchant: r.get("merchant"),
                    currency: r.get("currency"),
                    state: r.get("state"),
                    expected_minor: expected.to_string(),
                    received_minor: received.to_string(),
                    remaining_minor: (expected - received - fees).to_string(),
                    label: r.get("label"),
                    carrier: r.get("carrier"),
                }
            })
            .collect())
    }
    async fn runs(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Run>> {
        let uid = user(ctx)?;
        Ok(
            sqlx::query("SELECT * FROM runs WHERE user_id=$1 ORDER BY planned_at LIMIT 100")
                .bind(uid)
                .fetch_all(ctx.data_unchecked::<PgPool>())
                .await
                .map_err(db_error)?
                .into_iter()
                .map(|r| Run {
                    id: r.get::<Uuid, _>("id").to_string(),
                    name: r.get("name"),
                    planned_at: r.get::<DateTime<Utc>, _>("planned_at").to_rfc3339(),
                })
                .collect(),
        )
    }
    async fn similar_past_returns(
        &self,
        ctx: &Context<'_>,
        purchase_id: String,
        category: i32,
        method: i32,
    ) -> async_graphql::Result<Vec<Similar>> {
        let uid = user(ctx)?;
        if !(0..4).contains(&category) || !(0..3).contains(&method) {
            return Err(invalid());
        }
        let pool = ctx.data_unchecked::<PgPool>();
        let p = sqlx::query("SELECT amount,currency FROM purchases WHERE id=$1 AND user_id=$2")
            .bind(id(&purchase_id)?)
            .bind(uid)
            .fetch_optional(pool)
            .await
            .map_err(db_error)?
            .ok_or_else(|| Error::new("NOT_FOUND"))?;
        let v = serde_json::to_string(&similarity_features(
            p.get("amount"),
            category as usize,
            method as usize,
        ))
        .unwrap();
        Ok(sqlx::query("SELECT r.id,p.item,(r.features <-> $1::vector)::float8 distance FROM returns r JOIN purchases p ON p.id=r.purchase_id WHERE r.user_id=$2 AND p.currency=$3 AND r.state='resolved' AND r.features IS NOT NULL ORDER BY r.features <-> $1::vector,r.id LIMIT 5").bind(v).bind(uid).bind(p.get::<String,_>("currency")).fetch_all(pool).await.map_err(db_error)?.into_iter().map(|r|Similar{return_id:r.get::<Uuid,_>("id").to_string(),item:r.get("item"),distance:r.get("distance"),explanation:"Same currency; structured price, category and return-method distance. Historical examples, not predictions.".into()}).collect())
    }
}
async fn event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    uid: Uuid,
    aggregate: Uuid,
    kind: &str,
) -> async_graphql::Result<()> {
    sqlx::query("INSERT INTO activity(id,user_id,aggregate_id,kind) VALUES($1,$2,$3,$4)")
        .bind(Uuid::new_v4())
        .bind(uid)
        .bind(aggregate)
        .bind(kind)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO outbox(id,aggregate_id,kind,payload) VALUES($1,$2,$3,$4)")
        .bind(Uuid::new_v4())
        .bind(aggregate)
        .bind(kind)
        .bind(serde_json::json!({"aggregateId":aggregate,"schemaVersion":1}))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
struct Mutation;
#[Object]
impl Mutation {
    async fn update_notification_preferences(
        &self,
        ctx: &Context<'_>,
        timezone: String,
        push_enabled: bool,
        quiet_start: i32,
        quiet_end: i32,
    ) -> async_graphql::Result<bool> {
        notifications::update(ctx, timezone, push_enabled, quiet_start, quiet_end).await
    }
    async fn register_device_token(
        &self,
        ctx: &Context<'_>,
        token: String,
    ) -> async_graphql::Result<bool> {
        notifications::register_device(ctx, token).await
    }
    async fn schedule_reminder(
        &self,
        ctx: &Context<'_>,
        purchase_id: Option<String>,
        return_id: Option<String>,
        run_id: Option<String>,
        kind: String,
        due_at: String,
    ) -> async_graphql::Result<String> {
        notifications::schedule(ctx, purchase_id, return_id, run_id, kind, due_at).await
    }
    async fn mark_notification_read(
        &self,
        ctx: &Context<'_>,
        notification_id: String,
    ) -> async_graphql::Result<bool> {
        notifications::read(ctx, notification_id).await
    }
    async fn begin_document_upload(
        &self,
        ctx: &Context<'_>,
        purchase_id: Option<String>,
        return_id: Option<String>,
        purpose: String,
        content_type: String,
        byte_length: String,
    ) -> async_graphql::Result<documents::Upload> {
        documents::begin(
            ctx,
            purchase_id,
            return_id,
            purpose,
            content_type,
            byte_length,
        )
        .await
    }
    async fn finish_document_upload(
        &self,
        ctx: &Context<'_>,
        document_id: String,
    ) -> async_graphql::Result<bool> {
        documents::finish(ctx, document_id).await
    }
    async fn delete_document(
        &self,
        ctx: &Context<'_>,
        document_id: String,
    ) -> async_graphql::Result<bool> {
        documents::delete(ctx, document_id).await
    }
    async fn create_order(
        &self,
        ctx: &Context<'_>,
        merchant: String,
        currency: String,
        deadline: String,
        notes: Option<String>,
        items: Vec<OrderItemInput>,
    ) -> async_graphql::Result<String> {
        let uid = user(ctx)?;
        currency_precision(&currency).map_err(|_| invalid())?;
        let date = deadline.parse::<NaiveDate>().map_err(|_| invalid())?;
        let notes = notes.unwrap_or_default();
        if merchant.trim().is_empty()
            || merchant.len() > 160
            || notes.len() > 10000
            || items.is_empty()
            || items.len() > 100
        {
            return Err(invalid());
        }
        let mut total = 0i64;
        let mut parsed = vec![];
        for item in &items {
            let amount = item
                .unit_amount_minor
                .parse::<i64>()
                .map_err(|_| invalid())?;
            if item.name.trim().is_empty()
                || item.name.len() > 300
                || amount <= 0
                || item.quantity <= 0
                || item.quantity > 1000
            {
                return Err(invalid());
            }
            total = total
                .checked_add(
                    amount
                        .checked_mul(item.quantity as i64)
                        .ok_or_else(invalid)?,
                )
                .ok_or_else(invalid)?;
            parsed.push(amount);
        }
        if total > 9007199254740991 {
            return Err(invalid());
        }
        let pid = Uuid::new_v4();
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let summary = if items.len() == 1 {
            items[0].name.clone()
        } else {
            format!("{} + {} more", items[0].name, items.len() - 1)
        };
        sqlx::query("INSERT INTO purchases(id,user_id,merchant,item,amount,currency,deadline,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(pid).bind(uid).bind(merchant.trim()).bind(summary).bind(total).bind(currency).bind(date).bind(notes).execute(&mut *tx).await.map_err(db_error)?;
        for (item, amount) in items.iter().zip(parsed) {
            sqlx::query("INSERT INTO purchase_items(id,purchase_id,name,unit_amount,quantity) VALUES($1,$2,$3,$4,$5)").bind(Uuid::new_v4()).bind(pid).bind(item.name.trim()).bind(amount).bind(item.quantity).execute(&mut *tx).await.map_err(db_error)?;
        }
        event(&mut tx, uid, pid, "PurchaseCreated").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(pid.to_string())
    }
    async fn start_partial_return(
        &self,
        ctx: &Context<'_>,
        purchase_id: String,
        items: Vec<ReturnItemInput>,
        category: i32,
        method: i32,
    ) -> async_graphql::Result<String> {
        let uid = user(ctx)?;
        if items.is_empty()
            || items.len() > 100
            || !(0..4).contains(&category)
            || !(0..3).contains(&method)
        {
            return Err(invalid());
        }
        let pid = id(&purchase_id)?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        if sqlx::query(
            "SELECT id FROM purchases WHERE id=$1 AND user_id=$2 AND NOT archived FOR UPDATE",
        )
        .bind(pid)
        .bind(uid)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?
        .is_none()
        {
            return Err(Error::new("NOT_FOUND"));
        }
        let mut total = 0i64;
        let mut selected = std::collections::HashSet::new();
        for item in &items {
            let iid = id(&item.item_id)?;
            if item.quantity <= 0 || !selected.insert(iid) {
                return Err(invalid());
            }
            let r=sqlx::query("SELECT i.quantity,i.unit_amount,COALESCE((SELECT sum(ri.quantity)::integer FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.item_id=i.id AND r.state!='cancelled'),0) returned FROM purchase_items i WHERE id=$1 AND purchase_id=$2").bind(iid).bind(pid).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(||Error::new("ITEM_NOT_FOUND"))?;
            if item.quantity > r.get::<i32, _>("quantity") - r.get::<i32, _>("returned") {
                return Err(Error::new("QUANTITY_ALREADY_RETURNED"));
            }
            total = total
                .checked_add(
                    r.get::<i64, _>("unit_amount")
                        .checked_mul(item.quantity as i64)
                        .ok_or_else(invalid)?,
                )
                .ok_or_else(invalid)?;
        }
        let rid = Uuid::new_v4();
        let v = serde_json::to_string(&similarity_features(
            total,
            category as usize,
            method as usize,
        ))
        .unwrap();
        sqlx::query("INSERT INTO returns(id,user_id,purchase_id,expected,category,method,features) VALUES($1,$2,$3,$4,$5,$6,$7::vector)").bind(rid).bind(uid).bind(pid).bind(total).bind(category).bind(method).bind(v).execute(&mut *tx).await.map_err(db_error)?;
        for item in items {
            sqlx::query("INSERT INTO return_items(return_id,item_id,quantity) VALUES($1,$2,$3)")
                .bind(rid)
                .bind(id(&item.item_id)?)
                .bind(item.quantity)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        event(&mut tx, uid, rid, "ReturnStarted").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(rid.to_string())
    }
    async fn record_fee(
        &self,
        ctx: &Context<'_>,
        return_id: String,
        amount_minor: String,
    ) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        let rid = id(&return_id)?;
        let amount = amount_minor.parse::<i64>().map_err(|_| invalid())?;
        if amount <= 0 {
            return Err(invalid());
        }
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let r=sqlx::query("SELECT expected,fees,state,COALESCE((SELECT sum(amount)::bigint FROM refunds WHERE return_id=returns.id),0) received FROM returns WHERE id=$1 AND user_id=$2 FOR UPDATE").bind(rid).bind(uid).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(||Error::new("NOT_FOUND"))?;
        if ["cancelled", "resolved"].contains(&r.get::<String, _>("state").as_str()) {
            return Err(Error::new("INVALID_TRANSITION"));
        }
        radar_domain::record_refund(r.get("expected"), r.get("received"), r.get("fees"), amount)
            .map_err(|_| invalid())?;
        sqlx::query("UPDATE returns SET fees=fees+$1 WHERE id=$2")
            .bind(amount)
            .bind(rid)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        event(&mut tx, uid, rid, "FeeRecorded").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn update_purchase(
        &self,
        ctx: &Context<'_>,
        purchase_id: String,
        version: i32,
        merchant: String,
        item: String,
        deadline: String,
        notes: String,
    ) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        if merchant.trim().is_empty()
            || merchant.len() > 160
            || item.trim().is_empty()
            || item.len() > 300
            || notes.len() > 10000
        {
            return Err(invalid());
        }
        let date = deadline.parse::<NaiveDate>().map_err(|_| invalid())?;
        let pid = id(&purchase_id)?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let n=sqlx::query("UPDATE purchases SET merchant=$1,item=$2,deadline=$3,notes=$4,version=version+1 WHERE id=$5 AND user_id=$6 AND version=$7").bind(merchant).bind(item).bind(date).bind(notes).bind(pid).bind(uid).bind(version).execute(&mut *tx).await.map_err(db_error)?.rows_affected();
        if n != 1 {
            return Err(Error::new("CONFLICT_OR_NOT_FOUND"));
        }
        event(&mut tx, uid, pid, "ReturnDeadlineChanged").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn delete_purchase(
        &self,
        ctx: &Context<'_>,
        purchase_id: String,
        version: i32,
    ) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        let pid = id(&purchase_id)?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let n=sqlx::query("DELETE FROM purchases WHERE id=$1 AND user_id=$2 AND version=$3 AND NOT EXISTS(SELECT 1 FROM returns WHERE purchase_id=$1)").bind(pid).bind(uid).bind(version).execute(&mut *tx).await.map_err(db_error)?.rows_affected();
        if n != 1 {
            return Err(Error::new("CONFLICT_OR_NOT_FOUND"));
        }
        event(&mut tx, uid, pid, "PurchaseDeleted").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn assign_parcel_to_run(
        &self,
        ctx: &Context<'_>,
        run_id: String,
        return_id: String,
        stop_name: String,
        position: i32,
    ) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        if stop_name.trim().is_empty() || stop_name.len() > 300 || position < 0 || position > 100 {
            return Err(invalid());
        }
        let run = id(&run_id)?;
        let rid = id(&return_id)?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let found = sqlx::query("SELECT id FROM runs WHERE id=$1 AND user_id=$2 FOR UPDATE")
            .bind(run)
            .bind(uid)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
        if found.is_none() {
            return Err(Error::new("NOT_FOUND"));
        }
        let found=sqlx::query("SELECT id FROM returns WHERE id=$1 AND user_id=$2 AND state IN ('requested','packed') FOR UPDATE").bind(rid).bind(uid).fetch_optional(&mut *tx).await.map_err(db_error)?;
        if found.is_none() {
            return Err(Error::new("NOT_FOUND_OR_INACTIVE"));
        }
        sqlx::query("INSERT INTO run_assignments(run_id,return_id,stop_name,position) VALUES($1,$2,$3,$4) ON CONFLICT(return_id) DO UPDATE SET run_id=$1,stop_name=$3,position=$4 WHERE run_assignments.handed_over_at IS NULL").bind(run).bind(rid).bind(stop_name).bind(position).execute(&mut *tx).await.map_err(db_error)?;
        event(&mut tx, uid, run, "ParcelAssigned").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn complete_run_stop(
        &self,
        ctx: &Context<'_>,
        run_id: String,
        return_id: String,
        evidence_note: String,
    ) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        if evidence_note.trim().is_empty() || evidence_note.len() > 2000 {
            return Err(invalid());
        }
        let run = id(&run_id)?;
        let rid = id(&return_id)?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let r=sqlx::query("SELECT r.state,r.label,r.carrier FROM run_assignments a JOIN runs run ON run.id=a.run_id JOIN returns r ON r.id=a.return_id WHERE a.run_id=$1 AND a.return_id=$2 AND run.user_id=$3 AND r.user_id=$3 AND a.handed_over_at IS NULL FOR UPDATE OF r,a").bind(run).bind(rid).bind(uid).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(||Error::new("NOT_FOUND_OR_ALREADY_HANDED_OVER"))?;
        if r.get::<String, _>("state") != "packed"
            || r.get::<String, _>("label").is_empty()
            || r.get::<String, _>("carrier").is_empty()
        {
            return Err(Error::new("PARCEL_NOT_READY"));
        }
        sqlx::query("UPDATE returns SET state='dropped_off',dropped_off_at=now() WHERE id=$1")
            .bind(rid)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("UPDATE run_assignments SET handed_over_at=now(),evidence_note=$3 WHERE run_id=$1 AND return_id=$2").bind(run).bind(rid).bind(evidence_note).execute(&mut *tx).await.map_err(db_error)?;
        event(&mut tx, uid, rid, "ParcelDroppedOff").await?;
        event(&mut tx, uid, run, "RunParcelHandedOver").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn register(
        &self,
        ctx: &Context<'_>,
        email: String,
        password: String,
    ) -> async_graphql::Result<bool> {
        let email = email.trim().to_lowercase();
        rate(ctx, &email).await?;
        if email.len() > 254 || !email.contains('@') || password.len() < 12 || password.len() > 128
        {
            return Err(invalid());
        }
        let encoded = Argon2::default()
            .hash_password(
                password.as_bytes(),
                &SaltString::generate(&mut rand_core::OsRng),
            )
            .map_err(|_| invalid())?
            .to_string();
        let pool = ctx.data_unchecked::<PgPool>();
        let mut tx = pool.begin().await.map_err(db_error)?;
        let uid = Uuid::new_v4();
        let created=sqlx::query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING").bind(uid).bind(&email).bind(encoded).execute(&mut *tx).await.map_err(db_error)?.rows_affected();
        if created == 1 {
            queue_token(&mut tx, uid, &email, "verify").await?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn sign_in(
        &self,
        ctx: &Context<'_>,
        email: String,
        password: String,
    ) -> async_graphql::Result<Auth> {
        rate(ctx, &email.trim().to_lowercase()).await?;
        if password.len() > 128 || email.len() > 254 {
            return Err(invalid());
        }
        let pool = ctx.data_unchecked::<PgPool>();
        let r = sqlx::query("SELECT id,password_hash,verified_at FROM users WHERE email=$1")
            .bind(email.trim().to_lowercase())
            .fetch_optional(pool)
            .await
            .map_err(db_error)?;
        // Always run Argon2, including unknown accounts, to avoid the obvious timing oracle.
        let dummy = Argon2::default()
            .hash_password(
                b"invalid-password",
                &SaltString::generate(&mut rand_core::OsRng),
            )
            .map_err(|_| invalid())?
            .to_string();
        let encoded = r
            .as_ref()
            .map(|r| r.get::<String, _>("password_hash"))
            .unwrap_or(dummy);
        let valid = Argon2::default()
            .verify_password(
                password.as_bytes(),
                &PasswordHash::new(&encoded).map_err(|_| invalid())?,
            )
            .is_ok();
        if !valid || r.is_none() {
            return Err(Error::new("INVALID_CREDENTIALS"));
        }
        if r.as_ref()
            .unwrap()
            .get::<Option<DateTime<Utc>>, _>("verified_at")
            .is_none()
        {
            return Err(Error::new("EMAIL_VERIFICATION_REQUIRED"));
        }
        let token = secret();
        let refresh_token = secret();
        let expires = Utc::now() + chrono::Duration::minutes(15);
        sqlx::query(
            "INSERT INTO sessions(token_hash,user_id,expires_at,refresh_hash) VALUES($1,$2,$3,$4)",
        )
        .bind(hash(&token))
        .bind(r.unwrap().get::<Uuid, _>("id"))
        .bind(expires)
        .bind(hash(&refresh_token))
        .execute(pool)
        .await
        .map_err(db_error)?;
        Ok(Auth {
            token,
            refresh_token,
            expires_at: expires.to_rfc3339(),
        })
    }
    async fn verify_email(&self, ctx: &Context<'_>, token: String) -> async_graphql::Result<bool> {
        let pool = ctx.data_unchecked::<PgPool>();
        let mut tx = pool.begin().await.map_err(db_error)?;
        let uid=sqlx::query_scalar::<_,Uuid>("DELETE FROM account_tokens WHERE token_hash=$1 AND purpose='verify' AND expires_at>now() RETURNING user_id").bind(hash(&token)).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(||Error::new("INVALID_OR_EXPIRED_TOKEN"))?;
        sqlx::query("UPDATE users SET verified_at=now() WHERE id=$1")
            .bind(uid)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn request_password_reset(
        &self,
        ctx: &Context<'_>,
        email: String,
    ) -> async_graphql::Result<bool> {
        let email = email.trim().to_lowercase();
        rate(ctx, &email).await?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        if let Some(uid) = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE email=$1")
            .bind(&email)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
        {
            queue_token(&mut tx, uid, &email, "reset").await?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn reset_password(
        &self,
        ctx: &Context<'_>,
        token: String,
        password: String,
    ) -> async_graphql::Result<bool> {
        if password.len() < 12 || password.len() > 128 {
            return Err(invalid());
        }
        let encoded = Argon2::default()
            .hash_password(
                password.as_bytes(),
                &SaltString::generate(&mut rand_core::OsRng),
            )
            .map_err(|_| invalid())?
            .to_string();
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let uid=sqlx::query_scalar::<_,Uuid>("DELETE FROM account_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>now() RETURNING user_id").bind(hash(&token)).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(||Error::new("INVALID_OR_EXPIRED_TOKEN"))?;
        sqlx::query("UPDATE users SET password_hash=$1 WHERE id=$2")
            .bind(encoded)
            .bind(uid)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("DELETE FROM sessions WHERE user_id=$1")
            .bind(uid)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("DELETE FROM account_tokens WHERE user_id=$1 AND purpose='reset'")
            .bind(uid)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn refresh_session(
        &self,
        ctx: &Context<'_>,
        refresh_token: String,
    ) -> async_graphql::Result<Auth> {
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let uid=sqlx::query_scalar::<_,Uuid>("DELETE FROM sessions WHERE refresh_hash=$1 AND refresh_expires_at>now() RETURNING user_id").bind(hash(&refresh_token)).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(||Error::new("INVALID_SESSION"))?;
        let token = secret();
        let refresh_token = secret();
        let expires = Utc::now() + chrono::Duration::minutes(15);
        sqlx::query(
            "INSERT INTO sessions(token_hash,user_id,expires_at,refresh_hash) VALUES($1,$2,$3,$4)",
        )
        .bind(hash(&token))
        .bind(uid)
        .bind(expires)
        .bind(hash(&refresh_token))
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(Auth {
            token,
            refresh_token,
            expires_at: expires.to_rfc3339(),
        })
    }
    async fn logout(&self, ctx: &Context<'_>) -> async_graphql::Result<bool> {
        user(ctx)?;
        let token = ctx.data_unchecked::<SessionHash>();
        sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
            .bind(&token.0)
            .execute(ctx.data_unchecked::<PgPool>())
            .await
            .map_err(db_error)?;
        Ok(true)
    }
    async fn delete_account(&self, ctx: &Context<'_>) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        sqlx::query("DELETE FROM event_activity WHERE aggregate_id IN (SELECT aggregate_id FROM activity WHERE user_id=$1)").bind(uid).execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("DELETE FROM outbox WHERE aggregate_id IN (SELECT aggregate_id FROM activity WHERE user_id=$1)").bind(uid).execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("DELETE FROM users WHERE id=$1")
            .bind(uid)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn create_purchase(
        &self,
        ctx: &Context<'_>,
        merchant: String,
        item: String,
        amount_minor: String,
        currency: String,
        deadline: String,
        notes: Option<String>,
    ) -> async_graphql::Result<String> {
        let uid = user(ctx)?;
        currency_precision(&currency).map_err(|_| invalid())?;
        let amount = amount_minor.parse::<i64>().map_err(|_| invalid())?;
        let date = deadline.parse::<NaiveDate>().map_err(|_| invalid())?;
        if merchant.trim().is_empty()
            || merchant.len() > 160
            || item.trim().is_empty()
            || item.len() > 300
            || amount <= 0
            || amount > 9007199254740991
        {
            return Err(invalid());
        }
        let notes = notes.unwrap_or_default();
        if notes.len() > 10000 {
            return Err(invalid());
        }
        let pid = Uuid::new_v4();
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        sqlx::query("INSERT INTO purchases(id,user_id,merchant,item,amount,currency,deadline,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(pid).bind(uid).bind(merchant.trim()).bind(item.trim()).bind(amount).bind(currency).bind(date).bind(notes).execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("INSERT INTO purchase_items(id,purchase_id,name,unit_amount,quantity) SELECT id,id,item,amount,1 FROM purchases WHERE id=$1").bind(pid).execute(&mut *tx).await.map_err(db_error)?;
        event(&mut tx, uid, pid, "PurchaseCreated").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(pid.to_string())
    }
    async fn archive_purchase(
        &self,
        ctx: &Context<'_>,
        purchase_id: String,
        version: i32,
    ) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        let n=sqlx::query("UPDATE purchases SET archived=true,version=version+1 WHERE id=$1 AND user_id=$2 AND version=$3 AND NOT EXISTS(SELECT 1 FROM returns WHERE purchase_id=$1 AND state NOT IN ('resolved','cancelled'))").bind(id(&purchase_id)?).bind(uid).bind(version).execute(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?.rows_affected();
        if n == 0 {
            return Err(Error::new("CONFLICT_OR_NOT_FOUND"));
        }
        Ok(true)
    }
    async fn start_return(
        &self,
        ctx: &Context<'_>,
        purchase_id: String,
        category: i32,
        method: i32,
    ) -> async_graphql::Result<String> {
        let uid = user(ctx)?;
        let rows=sqlx::query("SELECT i.id,i.quantity-COALESCE((SELECT sum(ri.quantity)::integer FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.item_id=i.id AND r.state!='cancelled'),0) remaining FROM purchase_items i JOIN purchases p ON p.id=i.purchase_id WHERE i.purchase_id=$1 AND p.user_id=$2").bind(id(&purchase_id)?).bind(uid).fetch_all(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?;
        let items = rows
            .into_iter()
            .filter_map(|r| {
                let quantity: i32 = r.get("remaining");
                if quantity > 0 {
                    Some(ReturnItemInput {
                        item_id: r.get::<Uuid, _>("id").to_string(),
                        quantity,
                    })
                } else {
                    None
                }
            })
            .collect();
        self.start_partial_return(ctx, purchase_id, items, category, method)
            .await
    }
    async fn advance_return(
        &self,
        ctx: &Context<'_>,
        return_id: String,
        next_state: String,
        label: Option<String>,
        carrier: Option<String>,
    ) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        let rid = id(&return_id)?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let r=sqlx::query("SELECT state,label,carrier,expected,fees,COALESCE((SELECT sum(amount)::bigint FROM refunds WHERE return_id=returns.id),0) received FROM returns WHERE id=$1 AND user_id=$2 FOR UPDATE").bind(rid).bind(uid).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(||Error::new("NOT_FOUND"))?;
        let state: ReturnState =
            serde_json::from_value(serde_json::json!(r.get::<String, _>("state")))
                .map_err(|_| invalid())?;
        let next: ReturnState =
            serde_json::from_value(serde_json::json!(&next_state)).map_err(|_| invalid())?;
        state.advance(next).map_err(|e| Error::new(e.to_string()))?;
        let label = label.unwrap_or(r.get("label"));
        let carrier = carrier.unwrap_or(r.get("carrier"));
        if label.len() > 2000 || carrier.len() > 160 {
            return Err(invalid());
        }
        if next == ReturnState::Packed && (label.trim().is_empty() || carrier.trim().is_empty()) {
            return Err(Error::new("LABEL_AND_CARRIER_REQUIRED"));
        }
        if next == ReturnState::Resolved
            && radar_domain::refund_balance(r.get("expected"), r.get("received"), r.get("fees"))
                .map_err(|_| invalid())?
                != 0
        {
            return Err(Error::new("REFUND_OUTSTANDING"));
        }
        sqlx::query("UPDATE returns SET state=$1,label=$2,carrier=$3,dropped_off_at=CASE WHEN $1='dropped_off' THEN now() ELSE dropped_off_at END,delivered_at=CASE WHEN $1='delivered' THEN now() ELSE delivered_at END,resolved_at=CASE WHEN $1='resolved' THEN now() ELSE resolved_at END WHERE id=$4")
            .bind(next_state)
            .bind(label)
            .bind(carrier)
            .bind(rid)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        event(
            &mut tx,
            uid,
            rid,
            if next == ReturnState::DroppedOff {
                "ParcelDroppedOff"
            } else {
                "ReturnStateChanged"
            },
        )
        .await?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn record_refund(
        &self,
        ctx: &Context<'_>,
        return_id: String,
        amount_minor: String,
    ) -> async_graphql::Result<bool> {
        let uid = user(ctx)?;
        let rid = id(&return_id)?;
        let amount = amount_minor.parse::<i64>().map_err(|_| invalid())?;
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        let r=sqlx::query("SELECT expected,fees,state,COALESCE((SELECT sum(amount)::bigint FROM refunds WHERE return_id=returns.id),0) received FROM returns WHERE id=$1 AND user_id=$2 FOR UPDATE").bind(rid).bind(uid).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or_else(||Error::new("NOT_FOUND"))?;
        if ["cancelled", "resolved"].contains(&r.get::<String, _>("state").as_str()) {
            return Err(Error::new("INVALID_TRANSITION"));
        }
        record_refund(r.get("expected"), r.get("received"), r.get("fees"), amount)
            .map_err(|e| Error::new(e.to_string()))?;
        sqlx::query("INSERT INTO refunds(id,return_id,amount) VALUES($1,$2,$3)")
            .bind(Uuid::new_v4())
            .bind(rid)
            .bind(amount)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        event(&mut tx, uid, rid, "RefundRecorded").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(true)
    }
    async fn create_return_run(
        &self,
        ctx: &Context<'_>,
        name: String,
        planned_at: String,
    ) -> async_graphql::Result<String> {
        let uid = user(ctx)?;
        if name.trim().is_empty() || name.len() > 160 {
            return Err(invalid());
        }
        let at = DateTime::parse_from_rfc3339(&planned_at)
            .map_err(|_| invalid())?
            .with_timezone(&Utc);
        let rid = Uuid::new_v4();
        let mut tx = ctx
            .data_unchecked::<PgPool>()
            .begin()
            .await
            .map_err(db_error)?;
        sqlx::query("INSERT INTO runs(id,user_id,name,planned_at) VALUES($1,$2,$3,$4)")
            .bind(rid)
            .bind(uid)
            .bind(name)
            .bind(at)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        event(&mut tx, uid, rid, "ReturnRunScheduled").await?;
        tx.commit().await.map_err(db_error)?;
        Ok(rid.to_string())
    }
}
fn secret() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}
async fn rate(ctx: &Context<'_>, email: &str) -> async_graphql::Result<()> {
    let n=sqlx::query_scalar::<_,i32>("INSERT INTO rate_limits(bucket,attempts,window_at) VALUES($1,1,now()) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN rate_limits.window_at<now()-interval '15 minutes' THEN 1 ELSE rate_limits.attempts+1 END,window_at=CASE WHEN rate_limits.window_at<now()-interval '15 minutes' THEN now() ELSE rate_limits.window_at END RETURNING attempts").bind(hash(email)).fetch_one(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?;
    if n > 15 {
        return Err(Error::new("RATE_LIMITED"));
    }
    Ok(())
}
async fn queue_token(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    uid: Uuid,
    email: &str,
    purpose: &str,
) -> async_graphql::Result<()> {
    let token = secret();
    sqlx::query("DELETE FROM account_tokens WHERE user_id=$1 AND purpose=$2")
        .bind(uid)
        .bind(purpose)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')").bind(hash(&token)).bind(uid).bind(purpose).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("INSERT INTO mail_queue(id,user_id,recipient,subject,body) VALUES($1,$2,$3,$4,$5)").bind(Uuid::new_v4()).bind(uid).bind(email).bind(format!("Return Radar: {purpose}")).bind(format!("Your single-use {purpose} token is: {token}\nExpires in 30 minutes. Enter it in Return Radar. Ignore this message if you did not request it.")).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
struct SessionHash(String);
async fn graphql(
    State((schema, pool)): State<(ApiSchema, PgPool)>,
    headers: HeaderMap,
    req: GraphQLRequest,
) -> GraphQLResponse {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .unwrap_or("");
    let hashed = hash(token);
    let uid = sqlx::query_scalar::<_, Uuid>(
        "SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()",
    )
    .bind(&hashed)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);
    let request = req.into_inner();
    let operation = if request.query.trim_start().starts_with("mutation") {
        "mutation"
    } else {
        "query"
    };
    let timer = metrics::LATENCY
        .with_label_values(&[operation])
        .start_timer();
    let result = schema
        .execute(request.data(Identity(uid)).data(SessionHash(hashed)))
        .await;
    timer.observe_duration();
    metrics::REQUESTS
        .with_label_values(&[
            operation,
            if result.errors.is_empty() {
                "ok"
            } else {
                "error"
            },
        ])
        .inc();
    result.into()
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter("radar_api=info")
        .init();
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;
    sqlx::migrate!("../../migrations").run(&pool).await?;
    let schema = Schema::build(Query, Mutation, EmptySubscription)
        .data(pool.clone())
        .limit_depth(8)
        .limit_complexity(100)
        .finish();
    if std::env::args().any(|a| a == "--init-storage") {
        let c = documents::client().map_err(|e| format!("{:?}", e))?;
        let b = std::env::var("S3_BUCKET").unwrap_or("radar-private".into());
        if c.head_bucket().bucket(&b).send().await.is_err() {
            c.create_bucket().bucket(&b).send().await?;
        }
        return Ok(());
    }
    if std::env::args().any(|a| a == "--schema") {
        print!("{}", schema.sdl());
        return Ok(());
    }
    let metrics_pool = pool.clone();
    let api_pool = pool.clone();
    let app = Router::new()
        .route("/graphql", post(graphql))
        .route(
            "/metrics",
            get(move || metrics::render(metrics_pool.clone())),
        )
        .route("/health/live", get(|| async { "ok" }))
        .route(
            "/health/ready",
            get(move || {
                let p = pool.clone();
                async move {
                    if sqlx::query("SELECT 1").execute(&p).await.is_ok() {
                        StatusCode::OK
                    } else {
                        StatusCode::SERVICE_UNAVAILABLE
                    }
                }
            }),
        )
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(
                    std::env::var("CORS_ORIGINS")
                        .unwrap_or("http://localhost:8081,http://localhost:4173".into())
                        .split(',')
                        .filter_map(|s| s.trim().parse::<axum::http::HeaderValue>().ok())
                        .collect::<Vec<_>>(),
                )
                .allow_methods([axum::http::Method::POST, axum::http::Method::GET])
                .allow_headers([
                    axum::http::header::AUTHORIZATION,
                    axum::http::header::CONTENT_TYPE,
                ]),
        )
        .with_state((schema, api_pool));
    let bind = std::env::var("API_BIND").unwrap_or("127.0.0.1:4000".into());
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!(%bind,"API listening");
    axum::serve(listener, app).await?;
    Ok(())
}
