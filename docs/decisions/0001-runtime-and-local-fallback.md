# Runtime and local database choices

2026-11-10. Use Expo SDK 58 from the official blank TypeScript template, with its React 19.3 / React Native 0.88 pairing. Node 22.23.4 satisfies the official SDK 58 minimum. Rust 1.99.1 builds async-graphql 7.2.1 and SQLx 0.8.6. Exact transitive versions live in Cargo.lock and package-lock.json.

Docker Hub image pulls returned EOF through Docker Desktop's configured proxy. Preserve unrelated running containers. For local verification only, compiled pgvector 0.8.2 against the already-installed Homebrew PostgreSQL 14.20, then initialised an isolated cluster under ignored .local/postgres on loopback port 55432. This is not the target PostgreSQL 17 Compose setup and not production validation. PostgreSQL14 is not the deployment choice.

No cloud resources purchased, no public publication. Full Xcode is missing. A different-provider design evaluator is not available in this session; external design evaluation cannot be claimed.
