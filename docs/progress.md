# Progress checkpoint

## 2026-11-10 — initial audit

Current: M1 toolchain and infrastructure. Empty directory; no Git repository or applicable AGENTS.md found in ancestors. Initialised Git without committing. No existing changes to preserve.

Environment: macOS ARM64; Rust 1.99.1; Cargo 1.99.1; Docker Engine 28.3.2 running with 7.65 GiB allocated. Node 18 active, Node 22.23.4 and 24.22.2 available. Full Xcode unavailable: xcodebuild reports CommandLineTools selected. Terraform and Helm absent.

Verification: git status before initialisation reported no repository; docker info succeeded; xcodebuild -version failed as above. No device, deployment or release verification.

Next: pin dependencies; start isolated Compose project; implement domain and API with tests.

## 2026-11-11 — continuation checkpoint

Current: finish M3–M12 local integration checks and M14 reusable infrastructure validation. M0 complete; all other milestones remain partial unless their full acceptance is recorded. Earlier checkpoint is historical, not the current implementation state.

Implemented since initial audit:

- Expo58/React19.3/RN0.88 mobile app with Router, Paper themes, Manrope/OFL, SVG mark, icon/adaptive/splash assets and app-rendered layered launch transition.
- Authentication register/verify/reset/sign-in, Argon2, short access sessions, rotating hashed refresh sessions, revocation and deletion. Native SecureStore credentials; browser memory only.
- PostgreSQL migrations1–7, GraphQL domain actions, ownership, optimistic purchase versions, transactional activity/outbox, exact currency minor-unit strings, multiple order items, partial returns, fees/refund transactions, return lifecycle.
- Return Run assignment, manually ordered locations, per-parcel readiness/labels and evidence-note handover; real pgvector exact user/currency-scoped retrieval.
- Private S3-compatible upload coordination, size/type validation and immutable final object keys; deletion queue. MinIO source built locally under ignored .local/tools, not installed globally.
- Mobile SQLite drafts/cache (labelled), document pickers/upload controls, notification settings/history/reminder controls, error/empty states. Native behavior not device verified.
- Actual web account/export/deletion portal with draft policy/support disclosures.
- Rust outbox/consumer/mail/scheduler/push/object-cleanup code; worker startup verification still underway.
- Helm/Argo CD/Docker/Terraform/Prometheus initial configurations. No deployment or publication.

Actual checks:

- Rust workspace tests passed before latest worker UUID correction:6 domain and1 quiet-hours test. A standalone worker run then exposed missing uuid v4 feature hidden by workspace feature unification; fixing and rerunning now.
- `python3 tests/integration/test_api.py`:9 tests passed in19.502s against Compose PostgreSQL17 + pgvector and real local MinIO. Covers auth/rotation, isolation, private document upload/download and bad signature bytes, partial item allocation/fees, money validation, runs/evidence, vector retrieval and timezone input.
- `npx tsc --noEmit` and `npx expo export --platform web --max-workers 2` passed in mobile implementation checks; later edits require final rerun. Latest Expo lint reported6 errors/21 warnings, being fixed; no lint-pass claim yet.
- `helm lint infra/helm/return-radar`:1 chart,0 failures (icon recommendation only).
- Terraform1.17.1 installed from official archive with SHA256 checked; AWS6.16.0 provider init succeeded. Validation running; no plan/apply.
- Browser auth render checked at390x844 light/reduced motion and1280 dark, screenshots docs/screenshots explicitly browser previews; no native verification.
- Compose PostgreSQL, Mailpit and Kafka healthy. Initial image pulls failed EOF; host-network `crane pull` + `docker load` worked. Kafka volume permissions fixed with scoped init service.

Environment/services: API localhost4000; PostgreSQL55432; Kafka59092; Mailpit UI58025/SMTP51025; MinIO API59000/console59001; portal4173. Isolated host PG14 fallback stopped; Compose17 active. Unrelated pre-existing containers preserved.

External blockers: full Xcode/Android emulator unavailable; no physical device/push credentials/Expo project, cloud credentials/spending approval, legal operator/support identity or store accounts/submission authorisation. Frontend skill's different-provider evaluator is unavailable; external design evaluation not claimed. Mobile subagent stopped on a usage limit; root continues available work.

Exact next actions: fix worker build; run outbox/consumer/mail/scheduler/object cleanup live checks; finish mobile lint/typecheck/codegen/export; Playwright portal tests; validate Terraform; update README and milestone statuses to reflect verified scope. Then close remaining native/offline/reliability/observability gaps before staging readiness.
