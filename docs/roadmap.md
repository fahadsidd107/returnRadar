# Return Radar roadmap

States: planned → implemented → locally verified → device verified → deployed → submitted → approved → publicly released. Partial work never advances the whole milestone.

## M0 — Repository audit and roadmap

- Goal: Repository audit and roadmap.
- Dependencies: None.
- Tasks:
  - [ ] Audit tools, instructions and workspace.
  - [ ] document all milestones.
- Acceptance: Documentation and audit recorded.
- Verification: `git status --short` (commands become available with their implementation; not evidence of passing).
- Status: locally verified.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M1 — Toolchain and local infrastructure

- Goal: Toolchain and local infrastructure.
- Dependencies: M0; independent work may proceed around external blockers.
- Tasks:
  - [ ] Pin dependencies.
  - [ ] generate lockfiles.
  - [ ] configure Compose and common commands.
- Acceptance: Dependencies install and services pass health checks.
- Verification: `make infrastructure` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M2 — Brand and launch

- Goal: Brand and launch.
- Dependencies: M1; independent work may proceed around external blockers.
- Tasks:
  - [ ] Create vectors, fonts, themes, adaptive icons and reduced-motion launch preview.
- Acceptance: Assets render and launch is device checked.
- Verification: `make mobile-check` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M3 — Domain and GraphQL

- Goal: Domain and GraphQL.
- Dependencies: M2; independent work may proceed around external blockers.
- Tasks:
  - [ ] Build domain rules, migrations, schema and deterministic fixtures.
- Acceptance: Migrations apply and domain/API tests pass.
- Verification: `make test` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M4 — Authentication

- Goal: Authentication.
- Dependencies: M3; independent work may proceed around external blockers.
- Tasks:
  - [ ] Implement verification, reset, rotating sessions, ownership and rate limits.
- Acceptance: Cross-user and session lifecycle integration tests pass.
- Verification: `make integration` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: Production email identity and delivery credentials.

## M5 — Mobile shell

- Goal: Mobile shell.
- Dependencies: M4; independent work may proceed around external blockers.
- Tasks:
  - [ ] Build navigation, authentication and startup restoration.
- Acceptance: Native authentication and startup tests pass.
- Verification: `make native-test` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M6 — Purchases and documents

- Goal: Purchases and documents.
- Dependencies: M5; independent work may proceed around external blockers.
- Tasks:
  - [ ] Implement orders/items, CRUD, pagination and private direct uploads.
- Acceptance: Ownership and document-access tests pass.
- Verification: `make integration` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M7 — Returns and refunds

- Goal: Returns and refunds.
- Dependencies: M6; independent work may proceed around external blockers.
- Tasks:
  - [ ] Implement partial returns, transitions, exact money, fees and timeline.
- Acceptance: Invalid transitions and partial-refund tests pass.
- Verification: `make test` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M8 — Return Runs

- Goal: Return Runs.
- Dependencies: M7; independent work may proceed around external blockers.
- Tasks:
  - [ ] Implement parcels, readiness, stops, labels and handover evidence.
- Acceptance: Parcel-label and drop-off native flows pass.
- Verification: `make native-test` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M9 — Reliable events and reminders

- Goal: Reliable events and reminders.
- Dependencies: M8; independent work may proceed around external blockers.
- Tasks:
  - [ ] Implement outbox, Kafka deduplication, persisted retries, scheduler and push.
- Acceptance: Outage, restart, duplicate and stale-reminder tests pass.
- Verification: `make integration` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: APNs/FCM credentials and real devices.

## M10 — Structured vector similarity

- Goal: Structured vector similarity.
- Dependencies: M9; independent work may proceed around external blockers.
- Tasks:
  - [ ] Implement versioned features, pgvector retrieval and baseline evaluation.
- Acceptance: User isolation and deterministic ranking fixtures pass.
- Verification: `make integration` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M11 — Offline and accessibility

- Goal: Offline and accessibility.
- Dependencies: M10; independent work may proceed around external blockers.
- Tasks:
  - [ ] Persist drafts, recover uploads, bound queued mutations and check both themes.
- Acceptance: Offline/conflict, scaling and accessibility checks pass.
- Verification: `make native-test` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M12 — Account web portal

- Goal: Account web portal.
- Dependencies: M11; independent work may proceed around external blockers.
- Tasks:
  - [ ] Build account/export/deletion/support/policy flows.
- Acceptance: Actual browser flows pass.
- Verification: `make web-test` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M13 — Observability and recovery

- Goal: Observability and recovery.
- Dependencies: M12; independent work may proceed around external blockers.
- Tasks:
  - [ ] Instrument API/worker.
  - [ ] add dashboards, alerts and runbooks.
- Acceptance: Failure exercises recorded with real metrics.
- Verification: `make integration` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: None for local implementation; native verification requires a suitable device/emulator..

## M14 — Delivery infrastructure

- Goal: Delivery infrastructure.
- Dependencies: M13; independent work may proceed around external blockers.
- Tasks:
  - [ ] Build CI, images, Helm, Argo CD and Terraform.
- Acceptance: CI and configuration validation pass.
- Verification: `make infra-check` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: Deployment target/cost review.

## M15 — Staging and beta

- Goal: Staging and beta.
- Dependencies: M14; independent work may proceed around external blockers.
- Tasks:
  - [ ] Deploy authorised staging, build beta and verify physical devices.
- Acceptance: Staging and device evidence recorded.
- Verification: `make release-check` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: Cloud credentials, spending/deployment authorisation, Apple/Google/Expo accounts and devices.

## M16 — Submission readiness

- Goal: Submission readiness.
- Dependencies: M15; independent work may proceed around external blockers.
- Tasks:
  - [ ] Prepare real screenshots, disclosures, legal pages and review access.
- Acceptance: Release checklist complete and signed builds tested.
- Verification: `make release-check` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: Legal identity, support contact, approved policies.

## M17 — Store review and public release

- Goal: Store review and public release.
- Dependencies: M16; independent work may proceed around external blockers.
- Tasks:
  - [ ] Submit with explicit authorisation.
  - [ ] handle review.
  - [ ] verify public listings.
- Acceptance: Both store listings verified publicly available.
- Verification: `make release-check` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: Explicit public submission authorisation and store review decisions.

## M18 — Operational handover

- Goal: Operational handover.
- Dependencies: M17; independent work may proceed around external blockers.
- Tasks:
  - [ ] Run post-release smoke tests and record recovery/ownership handover.
- Acceptance: Production smoke checks and handover complete.
- Verification: `make release-check` (commands become available with their implementation; not evidence of passing).
- Status: planned.
- External inputs: Public production endpoints.

