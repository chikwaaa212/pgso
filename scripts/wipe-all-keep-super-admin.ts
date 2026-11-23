/**
 * Full data reset: delete every row in every table and every Supabase Storage
 * object, keeping ONLY super_admin accounts (profile rows + Supabase auth
 * users, including their email/password credentials).
 *
 * Run: npx tsx scripts/wipe-all-keep-super-admin.ts
 */
import { createClient } from '@supabase/supabase-js'
import { Prisma, PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const prisma = new PrismaClient()
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Recursively empty a storage bucket (handles folder prefixes). */
async function emptyBucket(bucket: string): Promise<number> {
  const removeBatch = async (paths: string[]) => {
    let removed = 0
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk)
      if (error) throw new Error(`remove ${bucket}: ${error.message}`)
      removed += chunk.length
    }
    return removed
  }

  const walk = async (prefix: string): Promise<number> => {
    let total = 0
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    const files: string[] = []
    const folders: string[] = []
    for (const entry of data ?? []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      // Folder placeholders come back with a null id.
      if (!entry.id) folders.push(full)
      else files.push(full)
    }
    if (files.length) total += await removeBatch(files)
    for (const folder of folders) total += await walk(folder)
    return total
  }

  return walk('')
}

async function main() {
  // ── 1. Resolve super_admin accounts to keep ────────────────────────
  const keep = await prisma.profile.findMany({
    where: { role: 'super_admin' },
    select: { id: true, full_name: true, role: true, status: true },
  })
  if (keep.length === 0) {
    throw new Error('No super_admin profile found — aborting to avoid deleting every account.')
  }
  const keepIds = new Set(keep.map((p) => p.id))
  console.log(`keeping ${keep.length} super_admin account(s):`)
  for (const p of keep) console.log(`  - ${p.full_name ?? '(no name)'} (${p.id}, ${p.status})`)

  // ── 2. Empty every Supabase Storage bucket ─────────────────────────
  const { data: buckets, error: bucketErr } = await supabaseAdmin.storage.listBuckets()
  if (bucketErr) throw new Error(`listBuckets failed: ${bucketErr.message}`)
  console.log(`\nstorage buckets: ${(buckets ?? []).map((b) => b.name).join(', ') || '(none)'}`)
  let filesRemoved = 0
  for (const bucket of buckets ?? []) {
    const removed = await emptyBucket(bucket.name)
    filesRemoved += removed
    console.log(`  ${bucket.name}: removed ${removed} object(s)`)
  }

  // ── 3. Wipe all tables except profiles (FK-safe, retry loop) ───────
  const models = Prisma.dmmf.datamodel.models
    .map((m) => m.name)
    .filter((name) => name !== 'Profile')
  let pending = models.map((name) => ({
    name,
    delegate: lowerFirst(name),
    clear: () => (prisma as unknown as Record<string, { deleteMany: () => Promise<{ count: number }> }>)[lowerFirst(name)].deleteMany(),
  }))

  const deleted: Record<string, number> = {}
  let progress = true
  while (pending.length && progress) {
    progress = false
    const failed: typeof pending = []
    for (const model of pending) {
      try {
        const { count } = await model.clear()
        deleted[model.name] = count
        progress = true
      } catch {
        // Likely an FK dependency still holding a reference; retry next pass.
        failed.push(model)
      }
    }
    pending = failed
  }
  if (pending.length) {
    console.error('\nCould not clear these tables (FK cycle?):', pending.map((p) => p.name).join(', '))
    throw new Error('Wipe incomplete — aborting before touching accounts.')
  }
  console.log('\ntables wiped (row counts):')
  for (const [name, count] of Object.entries(deleted)) console.log(`  ${name}: ${count}`)

  // ── 4. Delete every other profile ──────────────────────────────────
  const delProfiles = await prisma.profile.deleteMany({ where: { id: { notIn: [...keepIds] } } })
  console.log(`\nprofiles deleted: ${delProfiles.count} (kept ${keep.length})`)

  // ── 5. Delete every other Supabase auth user ───────────────────────
  let authDeleted = 0
  let authKept = 0
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const users = data.users
    for (const u of users) {
      if (keepIds.has(u.id)) {
        authKept += 1
        continue
      }
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id)
      if (delErr) console.error(`  delete auth user ${u.email} failed: ${delErr.message}`)
      else authDeleted += 1
    }
    if (users.length < 200) break
  }
  console.log(`auth users deleted: ${authDeleted} (kept ${authKept})`)

  // ── 6. Verify ──────────────────────────────────────────────────────
  const remainingProfiles = await prisma.profile.findMany({ select: { id: true, full_name: true, role: true } })
  const nonAdmin = remainingProfiles.filter((p) => !keepIds.has(p.id))
  const leftovers: string[] = []
  for (const modelName of models) {
    const count = await (prisma as unknown as Record<string, { count: () => Promise<number> }>)[lowerFirst(modelName)].count()
    if (count > 0) leftovers.push(`${modelName}: ${count}`)
  }
  if (nonAdmin.length || leftovers.length) {
    throw new Error(`Verification failed. Extra profiles: ${nonAdmin.length}. Non-empty tables: ${leftovers.join(', ') || 'none'}`)
  }

  console.log(`\nstorage objects removed: ${filesRemoved}`)
  console.log('DONE — only super_admin account(s) remain; everything else is empty.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('WIPE FAILED:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
