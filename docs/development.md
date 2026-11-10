# Development

Use Make as the single task runner. Node 22.23.4 is available in ~/.nvm/versions/node/v22.23.4/bin. Rust 1.99.1 is installed. See README for currently executable commands. Never place server secrets in EXPO_PUBLIC variables. Host uses localhost; Android emulator uses 10.0.2.2; physical devices require a reachable LAN host and appropriate development network configuration. iOS builds require full Xcode.

Official compatibility sources checked: https://docs.expo.dev/versions/latest/ and https://expo.dev/changelog/sdk-58 ; https://docs.rs/async-graphql/latest/ ; https://docs.rs/sqlx/latest/sqlx/ . Registry versions and generated lockfiles are authoritative for installed packages.
