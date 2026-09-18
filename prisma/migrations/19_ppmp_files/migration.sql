-- Personnel PPMP file vault: uploaded workbooks stay as-is in storage,
-- one DB row per file (own-data via created_by).
-- Replaces the row-extraction approach: ppmp_items never held real data
-- (imports were blocked on header mismatches), so it is dropped.
-- Applied via scripts/apply-migration-19-ppmp-files.ts through the pooler;
-- blank lines delimit statements for that runner (none inside statements).

CREATE TABLE IF NOT EXISTS "ppmp_files" (
    "id" UUID NOT NULL,
    "filename" VARCHAR NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" VARCHAR,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "ppmp_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ppmp_files_created_by_idx" ON "ppmp_files"("created_by");

DROP TABLE IF EXISTS "ppmp_items";

insert into storage.buckets (id, name, public) values ('ppmp-files', 'ppmp-files', false) on conflict (id) do update set public = false;

drop policy if exists "Signed-in users can view PPMP files" on storage.objects;

create policy "Signed-in users can view PPMP files" on storage.objects for select to authenticated using (bucket_id = 'ppmp-files');

drop policy if exists "Signed-in users can upload PPMP files" on storage.objects;

create policy "Signed-in users can upload PPMP files" on storage.objects for insert to authenticated with check (bucket_id = 'ppmp-files');

drop policy if exists "Signed-in users can replace PPMP files" on storage.objects;

create policy "Signed-in users can replace PPMP files" on storage.objects for update to authenticated using (bucket_id = 'ppmp-files') with check (bucket_id = 'ppmp-files');

drop policy if exists "Signed-in users can delete PPMP files" on storage.objects;

create policy "Signed-in users can delete PPMP files" on storage.objects for delete to authenticated using (bucket_id = 'ppmp-files');
