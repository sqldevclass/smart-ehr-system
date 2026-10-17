# Project rules
- Report tabs reuse the shared period bounds and hospital-scoped existing data sources; do not introduce database migrations for report presentation changes.
- Summary category aggregation lives in a pure report helper so merged visitor counts, revenue, and plans can be tested independently.