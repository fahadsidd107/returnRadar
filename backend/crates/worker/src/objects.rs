use sqlx::{PgPool, Row};
pub async fn cleanup(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let endpoint = std::env::var("S3_ENDPOINT")?;
    let access = std::env::var("S3_ACCESS_KEY")?;
    let secret = std::env::var("S3_SECRET_KEY")?;
    let bucket = std::env::var("S3_BUCKET").unwrap_or("radar-private".into());
    let client = aws_sdk_s3::Client::from_conf(
        aws_sdk_s3::Config::builder()
            .behavior_version_latest()
            .region(aws_sdk_s3::config::Region::new(
                std::env::var("S3_REGION").unwrap_or("us-east-1".into()),
            ))
            .endpoint_url(endpoint)
            .force_path_style(true)
            .credentials_provider(aws_credential_types::Credentials::new(
                access,
                secret,
                None,
                None,
                "environment",
            ))
            .build(),
    );
    sqlx::query(
        "DELETE FROM documents WHERE status='pending' AND created_at<now()-interval '1 day'",
    )
    .execute(pool)
    .await?;
    let mut tx = pool.begin().await?;
    if let Some(r)=sqlx::query("SELECT object_key FROM object_deletions WHERE next_attempt_at<=now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1").fetch_optional(&mut *tx).await?{let key:String=r.get("object_key");if client.delete_object().bucket(bucket).key(&key).send().await.is_ok(){sqlx::query("DELETE FROM object_deletions WHERE object_key=$1").bind(key).execute(&mut *tx).await?;}else{sqlx::query("UPDATE object_deletions SET attempts=attempts+1,next_attempt_at=now()+interval '1 minute' WHERE object_key=$1").bind(key).execute(&mut *tx).await?;}}
    tx.commit().await?;
    Ok(())
}
