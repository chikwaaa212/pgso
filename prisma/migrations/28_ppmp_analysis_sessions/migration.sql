-- P5 analysis sessions: one row per run (audit trail of what was asked
-- against which exact file bytes), one result row per session. Applied via
-- scripts/apply-migration-28-ppmp-analysis-sessions.ts through the pooler;
-- blank lines delimit statements for that runner (none inside statements).

CREATE TABLE IF NOT EXISTS "ppmp_analysis_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "preset" VARCHAR(40),
    "filters" JSONB,
    "file_ids" JSONB NOT NULL,
    "file_hashes" JSONB NOT NULL,
    "parser_version" VARCHAR(20) NOT NULL DEFAULT 'v1',
    "config_version" INTEGER,
    "stage" VARCHAR(40) NOT NULL DEFAULT 'queued',
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "error_code" VARCHAR(60),
    "created_at" TIMESTAMPTZ DEFAULT now(),
    "completed_at" TIMESTAMPTZ,
    CONSTRAINT "ppmp_analysis_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ppmp_analysis_sessions_user_idx" ON "ppmp_analysis_sessions"("user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "ppmp_analysis_results" (
    "session_id" UUID NOT NULL,
    "overview" JSONB NOT NULL,
    "yoy" JSONB NOT NULL,
    "trends" JSONB NOT NULL,
    "anomalies" JSONB NOT NULL,
    "costs" JSONB NOT NULL,
    "forecasts" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "ppmp_analysis_results_pkey" PRIMARY KEY ("session_id"),
    CONSTRAINT "ppmp_analysis_results_session_fkey" FOREIGN KEY ("session_id") REFERENCES "ppmp_analysis_sessions"("id") ON DELETE CASCADE
);
