use crate::{db_error, id, invalid, user};
use async_graphql::{Context, Error, Result, SimpleObject};
use aws_sdk_s3::{
    Client,
    config::{Credentials, Region},
    presigning::PresigningConfig,
    primitives::ByteStream,
};
use sqlx::{PgPool, Row};
use std::time::Duration;
use uuid::Uuid;
#[derive(SimpleObject)]
pub struct Document {
    pub id: String,
    pub purpose: String,
    pub content_type: String,
    pub status: String,
    pub byte_length: String,
}
#[derive(SimpleObject)]
pub struct Upload {
    pub document_id: String,
    pub url: String,
    pub content_type: String,
    pub byte_length: String,
}
pub fn client() -> Result<Client> {
    let endpoint =
        std::env::var("S3_ENDPOINT").map_err(|_| Error::new("STORAGE_NOT_CONFIGURED"))?;
    let access =
        std::env::var("S3_ACCESS_KEY").map_err(|_| Error::new("STORAGE_NOT_CONFIGURED"))?;
    let secret =
        std::env::var("S3_SECRET_KEY").map_err(|_| Error::new("STORAGE_NOT_CONFIGURED"))?;
    Ok(Client::from_conf(
        aws_sdk_s3::Config::builder()
            .behavior_version_latest()
            .region(Region::new(
                std::env::var("S3_REGION").unwrap_or("us-east-1".into()),
            ))
            .endpoint_url(endpoint)
            .force_path_style(true)
            .credentials_provider(Credentials::new(access, secret, None, None, "environment"))
            .build(),
    ))
}
fn bucket() -> String {
    std::env::var("S3_BUCKET").unwrap_or("radar-private".into())
}
fn storage_error<E>(_: E) -> Error {
    Error::new("STORAGE_OPERATION_FAILED")
}
pub async fn list(
    ctx: &Context<'_>,
    purchase_id: Option<String>,
    return_id: Option<String>,
) -> Result<Vec<Document>> {
    let uid = user(ctx)?;
    Ok(sqlx::query("SELECT * FROM documents WHERE user_id=$1 AND (purchase_id=$2 OR return_id=$3) ORDER BY created_at LIMIT 100").bind(uid).bind(purchase_id.map(|s|id(&s)).transpose()?).bind(return_id.map(|s|id(&s)).transpose()?).fetch_all(ctx.data_unchecked::<PgPool>()).await.map_err(db_error)?.into_iter().map(|r|Document{id:r.get::<Uuid,_>("id").to_string(),purpose:r.get("purpose"),content_type:r.get("content_type"),status:r.get("status"),byte_length:r.get::<i64,_>("byte_length").to_string()}).collect())
}
pub async fn begin(
    ctx: &Context<'_>,
    purchase_id: Option<String>,
    return_id: Option<String>,
    purpose: String,
    content_type: String,
    byte_length: String,
) -> Result<Upload> {
    let uid = user(ctx)?;
    let size = byte_length.parse::<i64>().map_err(|_| invalid())?;
    if size <= 0
        || size > 8388608
        || !["receipt", "label", "evidence"].contains(&purpose.as_str())
        || !["application/pdf", "image/jpeg", "image/png"].contains(&content_type.as_str())
        || purchase_id.is_some() == return_id.is_some()
    {
        return Err(invalid());
    }
    let p = purchase_id.map(|s| id(&s)).transpose()?;
    let r = return_id.map(|s| id(&s)).transpose()?;
    let pool = ctx.data_unchecked::<PgPool>();
    let owned=sqlx::query_scalar::<_,bool>("SELECT EXISTS(SELECT 1 FROM purchases WHERE id=$1 AND user_id=$3) OR EXISTS(SELECT 1 FROM returns WHERE id=$2 AND user_id=$3)").bind(p).bind(r).bind(uid).fetch_one(pool).await.map_err(db_error)?;
    if !owned {
        return Err(Error::new("NOT_FOUND"));
    }
    let count = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM documents WHERE user_id=$1")
        .bind(uid)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    if count >= 1000 {
        return Err(Error::new("DOCUMENT_LIMIT"));
    }
    let did = Uuid::new_v4();
    let url = client()?
        .put_object()
        .bucket(bucket())
        .key(format!("staging/{did}"))
        .content_length(size)
        .content_type(&content_type)
        .presigned(PresigningConfig::expires_in(Duration::from_secs(300)).map_err(storage_error)?)
        .await
        .map_err(storage_error)?
        .uri()
        .to_string();
    sqlx::query("INSERT INTO documents(id,user_id,purchase_id,return_id,purpose,content_type,byte_length) VALUES($1,$2,$3,$4,$5,$6,$7)").bind(did).bind(uid).bind(p).bind(r).bind(purpose).bind(&content_type).bind(size).execute(pool).await.map_err(db_error)?;
    Ok(Upload {
        document_id: did.to_string(),
        url,
        content_type,
        byte_length,
    })
}
pub async fn finish(ctx: &Context<'_>, document_id: String) -> Result<bool> {
    let uid = user(ctx)?;
    let did = id(&document_id)?;
    let mut tx = ctx
        .data_unchecked::<PgPool>()
        .begin()
        .await
        .map_err(db_error)?;
    let r = sqlx::query("SELECT * FROM documents WHERE id=$1 AND user_id=$2 FOR UPDATE")
        .bind(did)
        .bind(uid)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?
        .ok_or_else(|| Error::new("NOT_FOUND"))?;
    if r.get::<String, _>("status") == "ready" {
        return Ok(true);
    }
    let c = client()?;
    let object = c
        .get_object()
        .bucket(bucket())
        .key(format!("staging/{did}"))
        .send()
        .await
        .map_err(storage_error)?;
    let expected: i64 = r.get("byte_length");
    if object.content_length() != Some(expected) {
        return Err(Error::new("UPLOAD_SIZE_MISMATCH"));
    }
    let bytes = object
        .body
        .collect()
        .await
        .map_err(storage_error)?
        .into_bytes();
    let mime: String = r.get("content_type");
    let valid = match mime.as_str() {
        "application/pdf" => bytes.starts_with(b"%PDF-"),
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[255, 216, 255]),
        _ => false,
    };
    if !valid || bytes.len() as i64 != expected {
        return Err(Error::new("UPLOAD_TYPE_MISMATCH"));
    }
    c.put_object()
        .bucket(bucket())
        .key(format!("documents/{did}"))
        .content_type(mime)
        .content_disposition("attachment")
        .body(ByteStream::from(bytes))
        .send()
        .await
        .map_err(storage_error)?;
    sqlx::query("UPDATE documents SET status='ready' WHERE id=$1")
        .bind(did)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO object_deletions(object_key) VALUES($1) ON CONFLICT DO NOTHING")
        .bind(format!("staging/{did}"))
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(true)
}
pub async fn download(ctx: &Context<'_>, document_id: String) -> Result<String> {
    let uid = user(ctx)?;
    let did = id(&document_id)?;
    if !sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM documents WHERE id=$1 AND user_id=$2 AND status='ready')",
    )
    .bind(did)
    .bind(uid)
    .fetch_one(ctx.data_unchecked::<PgPool>())
    .await
    .map_err(db_error)?
    {
        return Err(Error::new("NOT_FOUND"));
    }
    Ok(client()?
        .get_object()
        .bucket(bucket())
        .key(format!("documents/{did}"))
        .response_content_disposition("attachment")
        .presigned(PresigningConfig::expires_in(Duration::from_secs(60)).map_err(storage_error)?)
        .await
        .map_err(storage_error)?
        .uri()
        .to_string())
}
pub async fn delete(ctx: &Context<'_>, document_id: String) -> Result<bool> {
    let uid = user(ctx)?;
    let n = sqlx::query("DELETE FROM documents WHERE id=$1 AND user_id=$2")
        .bind(id(&document_id)?)
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
