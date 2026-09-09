-- Attach a scanned/signed IAR image to an inspection + storage bucket for scans
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "inspections"
  ADD COLUMN IF NOT EXISTS "iar_image_url" TEXT;

insert into storage.buckets (id, name, public)
values ('iar-attachments', 'iar-attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "IAR scans are publicly viewable" on storage.objects;
create policy "IAR scans are publicly viewable"
  on storage.objects for select to public
  using (bucket_id = 'iar-attachments');

drop policy if exists "Signed-in users can upload IAR scans" on storage.objects;
create policy "Signed-in users can upload IAR scans"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'iar-attachments');

drop policy if exists "Signed-in users can replace IAR scans" on storage.objects;
create policy "Signed-in users can replace IAR scans"
  on storage.objects for update to authenticated
  using (bucket_id = 'iar-attachments')
  with check (bucket_id = 'iar-attachments');

drop policy if exists "Signed-in users can delete IAR scans" on storage.objects;
create policy "Signed-in users can delete IAR scans"
  on storage.objects for delete to authenticated
  using (bucket_id = 'iar-attachments');