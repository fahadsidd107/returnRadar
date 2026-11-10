FROM rust:1.99.0-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends cmake pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY backend/ ./backend/
RUN cargo build --manifest-path backend/Cargo.toml --release --locked --workspace
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --no-create-home radar
COPY --from=build /build/backend/target/release/radar-api /usr/local/bin/radar-api
COPY --from=build /build/backend/target/release/radar-worker /usr/local/bin/radar-worker
USER 10001:10001
EXPOSE 4000
CMD ["radar-api"]
