-- Per-user receipt views: a personnel view must not clear the unread
-- state an admin sees, and vice versa. Previously document_views had one
-- global row per document; now each view is keyed by viewer too.
-- Idempotent (IF NOT EXISTS guards): safe to re-run via the apply script.
-- NOTE: pre-existing global rows (viewer_id NULL) are ignored by the
-- per-user readers — unread badges reset once, honestly, instead of
-- carrying over another role's views.

ALTER TABLE document_views ADD COLUMN IF NOT EXISTS viewer_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS document_views_viewer_key
  ON document_views (doc_type, doc_id, viewer_id);
