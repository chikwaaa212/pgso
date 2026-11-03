# Agent Guide

PGSO-PSMS (Provincial Government Services Property & Supply Management System) is a role-based Next.js app for government property and supply operations: deliveries, inspections, AIR/IAR, stock, assets, PAR/ICS issuance, employee requests, repairs, QR scanning, and PPMP analytics/planning.

This file is the working guide for coding agents. For user-facing behavior and full feature documentation, read `README.md`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Start the production server |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm test` | Node test runner over `src/__tests__/*.test.ts` |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:push` | Push schema without a migration (prototyping only) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run seed:assets` | Seed assets from the sample workbook |
| `npm run seed:requests-repairs` | Seed sample requests and repairs |
| `npm run seed:demo-20` | Top every table to 20 demo rows |
| `npm run contract:emit` | Emit the Prisma contract |
| `npx tsx scripts/seed-super-admin.ts` | Bootstrap the first Super Admin (needs `SUPER_ADMIN_*` env vars) |

Pre-merge check:

```bash
npm run lint
npm test
npm run build
```

## Architecture

- **Framework:** Next.js 16 App Router + React 19 + TypeScript (strict). Read `node_modules/next/dist/docs/` before assuming APIs from older Next.js versions.
- **Route groups / portals:**
  - `src/app/(auth)` — login, signup, OAuth callback.
  - `src/app/employee` — `/employee/*`, role `employee`.
  - `src/app/personnel` — `/personnel/*`, role `pgso_personnel`.
  - `src/app/super-admin` — `/super-admin/*`, role `super_admin`.
  - `src/app/scan`, `src/app/info`, `src/app/page.tsx` — public.
  - `src/app/api` — health, public asset tags, and XLSX downloads.
- **Mutations:** Server Actions (`actions.ts`) colocated with pages. Binary downloads use route handlers.
- **Auth/routing gate:** `middleware.ts` authenticates the Supabase session, loads role/status (60s Redis cache, DB fallback), blocks pending/inactive accounts, and enforces portal boundaries.
- **Database:** Prisma is the single access layer. Raw SQL is used only for selective paginated/aggregated reads.
- **Supporting services:** Supabase (Auth, Storage, Realtime), Upstash Redis (REST cache), ExcelJS/SheetJS for workbooks, `qrcode`/`jsQR` for tags.
- **Path alias:** `@/*` → `src/*`.

## Roles and access

| Role | Portal | Scope |
| --- | --- | --- |
| `super_admin` | `/super-admin/*` | Everything, plus users and master data |
| `pgso_personnel` | `/personnel/*` | Records they created/own, plus shared global pools (asset registry, inventory quantities, request pick-lists, master data) |
| `employee` | `/employee/*` | Only their own assets, documents, and requests |

- Only `active` accounts may act. `pending`/`inactive` accounts are signed out by middleware.
- Enforce role checks in **both** middleware and the server action.
- Enforce ownership with `personnel-scope.ts` or explicit `created_by` / `received_by` / `inspector_id` / `assigned_to` comparisons.
- Super Admin reuses personnel readers; scope helpers return `isSuperAdmin` so owner filters are skipped rather than duplicated.

## Domain invariants — do not break

1. **Inspection → AIR/IAR → stock**
   - `passed` is allowed only when every item's cumulative received quantity equals its PO quantity (`inspection-rules.ts`).
   - Any shortfall is `partial`; re-inspection is additive.
   - Stocking requires a passed/partial inspection **and** an AIR/IAR record.
   - `stocked_qty` is a high-water mark: re-processing the same inspection must not double-stock (`stock.ts`).
   - Costs may be repaired later without changing quantities.

2. **Issuance threshold**
   - `total > 50_000` → PAR; otherwise ICS (`issuance-rules.ts`).
   - Only available, unassigned assets can be issued; stock must be sufficient.
   - Store an immutable snapshot of the issued values.
   - One consolidated approval produces one PAR/ICS with multiple `issuance_data.lines`.

3. **Requests**
   - Allowed transitions: `pending → approved | rejected`; `approved → completed`.
   - `rejected` and `completed` are terminal.
   - Approving a new assignment may issue the item; approving a repair creates a ticket.

4. **Idempotency**
   - Critical writes (stocking, issuance, document generation) use `IdempotencyKey` via `idempotency.ts`; double submits must be safe.

5. **Public data exposure**
   - `/api/public/assets/[id]` may return identification fields only. Never expose costs, remarks, suppliers, account numbers, or assignees. See `src/lib/asset-tag.ts`.

## Data, caching, and performance

- **Pagination:** server-side only. Use helpers in `paged.ts` and `PAGE_SIZE = 15` from `constants.ts`.
- **Search debounce:** `SEARCH_DEBOUNCE_MS = 300`.
- **Client TTLs:** `CACHE_TTL` in `constants.ts` (lists 30s, counts 60s, lookups 300s, ceiling 10m).
- **Query keys:** build with `query-keys.ts`. Per-user queues must include role/userId; shared pools deliberately omit it.
- **Invalidation:** every mutation must bust only the affected prefixes via `cache-invalidation.ts` (client map mirrors server namespaces). Never clear the whole cache. Report readers (`personnel:reports:*`, client keys `pgso:v2:*:reports-*`) are busted by delivery, inspection, asset, issuance, request, and repair writes.
- **Reports:** report data is scoped and cached in `reporting-queries.ts` (60s). Add new report readers there — never query the DB directly from the Reports UI — and keep the XLSX builders in `report-excel.ts` reading the same query results as the page.
- **Auth reads:** use memoized helpers in `personnel-scope.ts` (`getSessionIdentity`, `getCurrentUserId`, `getCachedProfileRow`) instead of repeated `auth.getUser()` calls.
- **Role cache:** 60s. After role/status writes, call `bustRoleCache` and delete the Redis key `pgso:middleware-role:<userId>`.
- **XLSX responses:** use `etag.ts` (`etagForText` / `notModified`) where applicable.
- **Tracing:** set `PERF_TRACE=1` to emit `Server-Timing` and `[perf ...]` logs.

## Conventions

- Keep code consistent with the surrounding file. Many pages use CSS modules (`*.module.css`) rather than utility classes.
- Server-only modules start with `import 'server-only'`.
- Validate inputs and authorization inside the action; never rely on the UI.
- Return `{ error: "..." }` for handled action failures; do not leak database internals (see `idempotency.ts` connection-error handling).
- Write an `AuditLog` entry (`audit.ts`) for state-changing operations.
- Documents and issuance records are append-only snapshots; do not mutate historical values.
- Use the shared formatting helpers (`format.ts`, `labels.ts`) rather than ad-hoc currency/date formatting.
- Do not commit `.env`, `.env.local`, `.next`, logs, or service-role keys.

## Where to look

| Concern | File(s) |
| --- | --- |
| Route gating, public paths, role cache | `middleware.ts` |
| Server-side role assertions | `src/lib/auth-guard.ts` |
| Ownership scope + memoized identity/profile | `src/lib/personnel-scope.ts` |
| Inspection pass/partial and cumulative math | `src/lib/inspection-rules.ts` |
| PAR/ICS threshold and totals | `src/lib/issuance-rules.ts` |
| Idempotent stocking | `src/lib/stock.ts` |
| Duplicate-write protection | `src/lib/idempotency.ts` |
| Cache invalidation map | `src/lib/cache-invalidation.ts` |
| Query keys / TTL defaults | `src/lib/query-keys.ts`, `src/lib/constants.ts` |
| Pagination / query parsing | `src/lib/paged.ts` |
| ETag / 304 responses | `src/lib/etag.ts` |
| Audit trail | `src/lib/audit.ts` |
| XLSX generation | `src/lib/{air,par,ics,asset,account-catalog}-excel.ts` |
| Reports: aging, quarterly issuance, asset conditions | `src/lib/reporting.ts`, `src/lib/reporting-queries.ts`, `src/lib/reporting-actions.ts`, `src/lib/report-{excel,xlsx}.ts`, `src/components/reporting/**` |
| Recommendations: replenishment, replacement/disposal, idle, consumption | `src/lib/prescriptive/{types,config,replacement,idle,replenishment}.ts`, `src/lib/prescriptive-queries.ts`, `src/lib/prescriptive-actions.ts`, `src/components/recommendations/**`, `src/lib/ppmp/analytics/consumption.ts` |
| QR scanning: tag recognition, scan actions, prefill dialogs | `src/lib/asset-tag.ts`, `src/lib/scan-actions.ts`, `src/lib/scan-actions-server.ts`, `src/components/QrScanner.tsx`, `src/hooks/use-scan-prefill.ts`, `src/components/personnel/{RepairCreateDialog,ScanTransferDialog}.tsx`, `src/app/api/public/assets/[id]/route.ts` |
| PPMP parsing, analytics, planning | `src/lib/ppmp/**` |
| Data model | `prisma/schema.prisma`, `prisma/migrations/**` |
| Tests | `src/__tests__/**` |

## Environment

Required to boot: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`.

Optional: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (without them the app still works, with slower middleware), `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`, `PERF_TRACE`.

Full list and setup instructions are in `README.md` sections 10–12.

## Testing expectations

Run `npm test` before changing shared rules: `inspection-rules`, `issuance-rules`, `stock`, PPMP analytics/planning, auth guards, cache invalidation, idempotency, and pagination. Add or update tests when behavior changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
