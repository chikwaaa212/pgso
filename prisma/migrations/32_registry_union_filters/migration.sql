-- Registry UNION windowing (Step 4): expression indexes for the
-- case-insensitive exact filters the union pushes into each branch
-- (lower(status/condition/unit/category)), plus plain btree indexes for the
-- DISTINCT filter-option queries. IF NOT EXISTS keeps `migrate deploy`
-- idempotent. ILIKE text search stays a scan over the exact-filtered set
-- (no pg_trgm dependency); LIKE wildcards are escaped server-side.

CREATE INDEX IF NOT EXISTS "assets_condition_idx" ON "assets"("condition");
CREATE INDEX IF NOT EXISTS "assets_unit_idx" ON "assets"("unit");
CREATE INDEX IF NOT EXISTS "assets_lower_status_idx" ON "assets"(lower("status"));
CREATE INDEX IF NOT EXISTS "assets_lower_condition_idx" ON "assets"(lower("condition"));
CREATE INDEX IF NOT EXISTS "assets_lower_unit_idx" ON "assets"(lower("unit"));
CREATE INDEX IF NOT EXISTS "assets_lower_category_idx" ON "assets"(lower("category"));
CREATE INDEX IF NOT EXISTS "inventory_lower_category_idx" ON "inventory"(lower("category"));
CREATE INDEX IF NOT EXISTS "inventory_unit_idx" ON "inventory"("unit");
