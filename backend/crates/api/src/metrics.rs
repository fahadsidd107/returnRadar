use prometheus::{Encoder, HistogramOpts, HistogramVec, IntCounterVec, Opts, TextEncoder};
use std::sync::LazyLock;
pub static LATENCY: LazyLock<HistogramVec> = LazyLock::new(|| {
    let m = HistogramVec::new(
        HistogramOpts::new("radar_graphql_duration_seconds", "GraphQL wall time"),
        &["operation"],
    )
    .unwrap();
    prometheus::default_registry()
        .register(Box::new(m.clone()))
        .unwrap();
    m
});
pub static REQUESTS: LazyLock<IntCounterVec> = LazyLock::new(|| {
    let m = IntCounterVec::new(
        Opts::new("radar_graphql_requests_total", "GraphQL requests"),
        &["operation", "outcome"],
    )
    .unwrap();
    prometheus::default_registry()
        .register(Box::new(m.clone()))
        .unwrap();
    m
});
pub async fn render(pool: sqlx::PgPool) -> Result<String, axum::http::StatusCode> {
    use sqlx::Row;
    let r=sqlx::query("SELECT count(*)::bigint backlog,COALESCE(EXTRACT(EPOCH FROM now()-min(created_at)),0)::float8 oldest FROM outbox WHERE published_at IS NULL").fetch_one(&pool).await.map_err(|_|axum::http::StatusCode::SERVICE_UNAVAILABLE)?;
    let mut bytes = Vec::new();
    TextEncoder::new()
        .encode(&prometheus::gather(), &mut bytes)
        .unwrap();
    let mut text = String::from_utf8(bytes).unwrap();
    text += &format!(
        "# TYPE radar_outbox_backlog gauge\nradar_outbox_backlog {}\n# TYPE radar_outbox_oldest_age_seconds gauge\nradar_outbox_oldest_age_seconds {}\n# TYPE radar_database_pool_connections gauge\nradar_database_pool_connections {}\n# TYPE radar_database_pool_idle gauge\nradar_database_pool_idle {}\n",
        r.get::<i64, _>("backlog"),
        r.get::<f64, _>("oldest"),
        pool.size(),
        pool.num_idle()
    );
    Ok(text)
}
