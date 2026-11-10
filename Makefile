.PHONY: test fmt api infrastructure infrastructure-down mobile mobile-check
infrastructure:
	docker compose -f infra/compose/compose.yaml up -d --wait
infrastructure-down:
	docker compose -f infra/compose/compose.yaml down
api:
	./scripts/dev-api.sh
fmt:
	cargo fmt --manifest-path backend/Cargo.toml --all
test:
	cargo test --manifest-path backend/Cargo.toml --workspace
mobile:
	cd apps/mobile && npm start
mobile-check:
	cd apps/mobile && npx tsc --noEmit
local-postgres:
	./scripts/local-postgres.sh start
integration:
	python3 tests/integration/test_api.py
worker-mail:
	DATABASE_URL=$${DATABASE_URL:-postgres://radar:local-development-only@localhost:55432/radar} cargo run --manifest-path backend/Cargo.toml -p radar-worker -- mail
worker-outbox:
	DATABASE_URL=$${DATABASE_URL:-postgres://radar:local-development-only@localhost:55432/radar} cargo run --manifest-path backend/Cargo.toml -p radar-worker -- outbox
worker-consume:
	DATABASE_URL=$${DATABASE_URL:-postgres://radar:local-development-only@localhost:55432/radar} cargo run --manifest-path backend/Cargo.toml -p radar-worker -- consume
schema:
	DATABASE_URL=$${DATABASE_URL:-postgres://radar:local-development-only@localhost:55432/radar} cargo run --quiet --manifest-path backend/Cargo.toml -p radar-api -- --schema > packages/graphql/schema.graphql
codegen: schema
	cd apps/mobile && npx graphql-codegen --config ../../packages/graphql/codegen.ts
web:
	python3 -m http.server 4173 --bind 127.0.0.1 --directory apps/web
web-test:
	npx playwright test
load-test:
	k6 run tests/load/graphql.js
infra-check:
	docker compose -f infra/compose/compose.yaml config -q
	helm lint infra/helm/return-radar
	.local/tools/terraform -chdir=infra/terraform fmt -check
	.local/tools/terraform -chdir=infra/terraform validate
native-test:
	maestro test tests/maestro
release-check:
	@echo 'Follow docs/release.md. Device builds, legal inputs and authorised store submission are still required.'
