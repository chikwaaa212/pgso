-- Custom asset columns (user-defined fields for the assets registry).
-- Definitions live in asset_custom_fields; per-record values live in the
-- custom_fields JSONB bag on assets + inventory (stock rows appear in the
-- same unified table, so both tables carry the bag).
-- Idempotent (IF NOT EXISTS guards): safe to re-run via the apply script.

CREATE TABLE IF NOT EXISTS asset_custom_fields (
  id UUID PRIMARY KEY,
  field_key VARCHAR(60) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL,
  field_type VARCHAR(10) NOT NULL DEFAULT 'text',
  created_by UUID NULL,
  created_at TIMESTAMPTZ NULL DEFAULT now()
);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}';

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}';
