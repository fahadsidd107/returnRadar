# Similar Past Returns — structured vector search v1

Eight engineered numeric dimensions, stored as vector(8):

- Price: min(ln(1 + integer minor-unit price) / 16, 1) × 0.5.
- Category: four one-hot dimensions (clothing, electronics, home, other), weight 1.
- Method: three one-hot dimensions (drop-off, collection, other), weight 0.75.

No learned embeddings or AI. No arbitrary ordinal category distance. Unknown values must explicitly use other; price is required. No unit-length normalisation; L2 distance preserves explicit weights. Retrieval filters to same user, same currency, resolved history; exact pgvector `<->`, stable tie-break by ID, five results. Currency precision is irrelevant across queries because unlike currencies never compete. Price is a broad log magnitude, not an exchange-rate comparison.

Inputs are available at return initiation. Features are snapshotted when starting a return. v1 source purchase amount is immutable after return creation; changing the feature definition requires a new schema version and transactional backfill before switching all readers. Feature-schema version column/backfill tooling remains pending. Historic timing is not currently displayed or predicted. Empty retrieval must say insufficient completed history.

Current tests exercise exact zero-distance matching and cross-user denial. A filter-based baseline comparison and larger ranking fixtures remain pending, so M10 is partial. No approximate index or performance claim.
