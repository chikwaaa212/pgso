-- P4 analytics rules: versioned thresholds for the deterministic PPMP
-- decision-support engine. Sessions snapshot the active version so past
-- results stay reproducible after tuning. Applied via
-- scripts/apply-migration-27-ppmp-analytics-config.ts through the pooler;
-- blank lines delimit statements for that runner (none inside statements).

CREATE TABLE IF NOT EXISTS "ppmp_analytics_config" (
    "version" INTEGER NOT NULL,
    "qty_increase_pct" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "cost_increase_pct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "anomaly_z" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "trend_epsilon_pct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "forecast_min_history" INTEGER NOT NULL DEFAULT 3,
    "smoothing_alpha" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "ppmp_analytics_config_pkey" PRIMARY KEY ("version")
);

INSERT INTO "ppmp_analytics_config" ("version")
VALUES (1)
ON CONFLICT ("version") DO NOTHING;
