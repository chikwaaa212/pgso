# App-Wide Load Performance Audit — Why Pages Feel Slow and How to Make Them Instant

**Date:** 2026-11-13
**Scope:** Next.js 16 App Router app under `C:\Users\Akiro\OneDrive\Desktop\PGSO\pgso` — request lifecycle, data access, database, and frontend delivery.
**Method:** Static audit of the current source plus the latest production build artifacts in `.next/diagnostics/route-bundle-stats.json`. JS sizes are measured from real build chunks (gzip recomputed at level 9). No production APM trace was available, so server-time figures are code-derived estimates based on the ~350 ms remote-DB RTT noted throughout the codebase.
**Related:** `PERSONNEL-PERFORMANCE-AUDIT.md`, `SUPER-ADMIN-PERFORMANCE-AUDIT.md` (those cover mutation freshness and realtime; this report focuses on **load speed**).

---

## 1. Executive summary

The app is not slow because of one bad query. It is slow because a single page load stacks **five independent delays**:

1. **Every navigation passes through Edge middleware** that performs a Supabase auth check plus an Upstash Redis role read — and falls back to a remote Postgres read on every cache miss.
2. **Most portal pages are client components that render a skeleton, ship 1.2–1.6 MB of JavaScript, hydrate, and only then call a server action** to fetch the first data. Fast internet does not remove this waterfall.
3. **The first-load JS is bloated by several unused or deferrable libraries**: a 1.16 MB app icon, GSAP (never used), Supabase (only needed when the password dialog opens), Recharts (charts below the fold), Framer Motion (marketing footer shown inside portals), and 9 unused Inter font weights.
4. **Pages issue multiple separate server actions and dozens of queries** — some fetch entire tables or run a full recommendations engine just to display a badge.
5. **The database is remote and under-indexed**, with hot list/queue queries doing sequential scans and joins; Prisma is configured with 3 pooled connections and no slow-query telemetry.

**The perceived result:** a cold portal page typically shows a skeleton for **~1.5–3.5 s on desktop broadband** and **~4–7 s on a mid-range phone**, even when the network is fast. Warm client-cache navigation is fast, which hides the problem during demos but not on first load, refresh, or a new tab.

**Biggest wins, in order:**
1. Serve real data in the first HTML for the top pages (server components + `initialData`).
2. Cut first-load JS by ~250 KB gzip (icon, GSAP, Supabase dialog, footer/Framer, Recharts, Inter, jsQR).
3. Remove full-table scans and redundant server actions (requests, recommendations count, reports, documents, assets prefetch, master data N+1).
4. Add the missing composite/partial indexes and fix pooling.
5. Stop awaiting Redis writes/busts on the response path.

---

## 2. Measured baseline

### 2.1 First-load JavaScript (latest production build)

| Route | JS raw | JS gzip |
|---|---:|---:|
| `/super-admin/dashboard` | 1,641 KB | **492 KB** |
| `/personnel/dashboard` | 1,575 KB | **473 KB** |
| `/personnel/reports` | 1,558 KB | 468 KB |
| `/personnel/requests` | 1,352 KB | 412 KB |
| `/personnel/assets` | 1,351 KB | 413 KB |
| `/personnel/inspections` | 1,311 KB | 401 KB |
| `/personnel/documents` | 1,235 KB | 369 KB |
| `/personnel/stocks` | 1,229 KB | 378 KB |
| `/employee/dashboard` | 1,193 KB | 367 KB |
| `/scan` | 999 KB | 322 KB |
| `/login` | 862 KB | 274 KB |

Source: `.next/diagnostics/route-bundle-stats.json`, gzip recomputed from the referenced chunks.

### 2.2 Named chunks found in first-load bundles

| Library | Raw | Gzip | Loaded on |
|---|---:|---:|---|
| Recharts | 379 KB | **110 KB** | dashboard, reports, PPMP analytics, super-admin dashboard |
| `@supabase/supabase-js` | 226 KB | **59 KB** | every route (via static `ChangePasswordDialog` import in all navbars) |
| GSAP + ScrollTrigger | 122 KB | **47 KB** | every route (imported by `LayoutClient`, no live usage found) |
| Framer Motion | 117 KB | **38 KB** | every route (marketing footer rendered on portals too) |
| jsQR | 137 KB | **49 KB** | scan pages, loaded before the user starts the camera |
| Sonner | 47 KB | 13 KB | every route |

### 2.3 Static asset weight

| Asset | Size | Issue |
|---|---:|---|
| `src/app/icon.png` | **1,162,437 bytes** | Emitted as `<link rel="icon" sizes="1024x1024">`; browsers download it on first load at 16–32 px |
| `public/province-seal.png` | 1,135 KB | Optimized by `next/image`, but the optimizer must decode a 1.1 MB source on a cold image cache |
| `src/app/favicon.ico` | 83,987 bytes | Oversized for a favicon |
| `src/app/apple-icon.png` | 45,206 bytes | Fine, but can be 180×180 and smaller |
| Inter font, 9 weights | 70 `@font-face` rules | `--font-inter` is declared but never used; Geist is the actual UI font |

---

## 3. What actually happens on a page load today

For a typical personnel list page (dashboard, requests, assets, documents…), the sequence is:

```
1. Browser → Next server
   └─ middleware.ts: getClaims/getUser + Upstash role GET (+ DB on miss)
2. Server renders layout shell + page skeleton
   └─ layout is force-dynamic, so this runs on every navigation
   └─ sidebar/navbar badges stream separately (2 more server loaders)
3. Browser downloads 1.2–1.6 MB JS (350–490 KB gzip) + fonts + 1.16 MB icon
4. Browser parses/evaluates/hydrates the whole tree
   └─ includes Recharts, GSAP, Supabase, Framer Motion, Sonner, etc.
5. useEffect fires → useCachedAction calls a server action (POST)
   └─ middleware auth/role runs again for this POST
   └─ action resolves scope (auth + profile), reads Redis, then queries Postgres
6. Server returns data → skeleton swaps to content
```

Key point: **step 5 only begins after step 4 completes.** On a cold load, the user waits for the entire JS pipeline before the first data query is even sent. That is why a faster connection helps less than expected.

For genuinely server-rendered pages (`employee/dashboard`, `super-admin/dashboard`, detail pages), data starts at step 2, but those pages have their own serial awaits and are still blocked by JS weight for interactivity.

---

## 4. Findings

### A. Architecture — client-fetch-after-hydration (P0)

**Evidence**
- 34 `page.tsx` files are `"use client"`, including all major personnel list pages (`personnel/dashboard/page.tsx:1`, `assets/page.tsx`, `requests/page.tsx`, `documents/page.tsx`, etc.).
- `src/hooks/use-cached-action.ts:87-95` intentionally initializes `loading = true` and `data = undefined`, and the fetch runs only in a post-hydration effect (`:190-198`).
- There is **no `initialData` support anywhere** in `src`.
- Example: `personnel/dashboard/page.tsx:63-80` renders `<DashboardLoading />` until the client action resolves.

**Why it matters**
- The server-rendered HTML contains a skeleton, never data.
- The first data request cannot start until JS is downloaded, parsed, and hydrated.
- On every cold load the browser pays: HTML/RSC + JS transfer + JS parse + hydration + action POST + auth/scope + Redis + DB.
- Fast internet only improves transfer; it does not remove the extra request round trip, parse cost, or hydration cost.

**Fix**
- Convert the high-traffic pages (dashboard, requests, assets, deliveries, inventory, documents, inspections, users) to Server Components that fetch the first window/snapshot and pass it to the client as `initialData`.
- Add `initialData` to `useCachedAction`: seed `data`/`loading` synchronously for the first key, then revalidate silently only when stale.
- Keep the client cache for back/forward navigation; stop making it the only path to data.

**Expected impact:** removes one full HTTP round trip and the skeleton phase from first loads; the HTML itself contains the first screen's data.

---

### B. First-load payload is oversized (P0/P1)

#### B1. The app icon alone is 1.16 MB
**Evidence:** `src/app/icon.png` is 1,162,437 bytes and the build emits it at `sizes="1024x1024"` in `.next/server/app/index.html`.

**Fix:** replace it with a 32×32/48×48 PNG (or multi-size `.ico`); keep the master artwork outside `public/`. Expected saving **~1.1 MB per cold load**.

#### B2. GSAP is imported on every route but never used
**Evidence:** `src/components/layout/LayoutClient.tsx:5` imports `@/lib/gsap-register`; `src/lib/gsap-register.ts` imports `gsap` plus ScrollTrigger/ScrollToPlugin. A search finds no consumer of `gsap-utils` or GSAP animations in `src`.

**Fix:** remove the import and the `gsap`/`@gsap/react` dependencies unless landing animations are restored deliberately; if restored, load them only on landing pages via `next/dynamic`. Expected saving **~47 KB gzip on 100% of routes**, plus parse time.

#### B3. Supabase JavaScript ships everywhere for a rarely opened dialog
**Evidence:** `src/components/account/ChangePasswordDialog.tsx:17` imports the Supabase browser client; all three navbars statically import that dialog (`PersonnelNavbar.tsx:25`, `EmployeeNavbar.tsx:24`, `SuperAdminNavbar.tsx:42`). The 226 KB/59 KB gzip Supabase chunk appears in every route's first load, including `/` and `/login`.

**Fix:** `next/dynamic` the dialog with `ssr: false`, mounted only when the account menu opens. Expected saving **~59 KB gzip on every first load**.

#### B4. Marketing footer + Framer Motion run inside the portals
**Evidence:** `LayoutClient.tsx:50` renders `<Footer />` on every path except receipt pages, including `/personnel`, `/super-admin`, and `/employee`. `footer.tsx` is a client component using `framer-motion`.

**Fix:** render the marketing footer only on public/landing/info routes; use a static server footer inside portals (or omit it). Expected saving **~38 KB gzip** and a large hydration tree on every authenticated page.

#### B5. Charts load before their data exists
**Evidence:** Recharts is statically imported by `personnel/dashboard/overview-chart.tsx`, `ReportsWorkspace.tsx:4-13`, `ppmp/analytics/results-view.tsx`, and `super-admin/dashboard/analytics-charts.tsx`. The 379 KB/110 KB gzip chunk downloads while the user is still looking at a skeleton.

**Fix:** wrap chart modules in `next/dynamic` with a fixed-size skeleton and render them only once data exists (or when scrolled into view). Expected saving **~110 KB gzip** on the heaviest pages.

#### B6. Unused Inter font family, 9 weights
**Evidence:** `src/app/layout.tsx:16-20` loads Inter 200–900. `globals.css:7` defines `--font-inter` but no rule uses it (`--font-sans` is Geist at `globals.css:5,66,74`).

**Fix:** remove the Inter import/variable. Keep Geist for UI; load Geist Mono only on receipt/AIR routes (or set `preload: false`). Expected saving **~47 KB preloaded font** and ~60 unused `@font-face` rules.

#### B7. jsQR loads before scanning starts
**Evidence:** `src/components/QrScanner.tsx:6` statically imports `jsqr`; decoding only starts after the user taps start (`:251,261+`).

**Fix:** dynamic `await import("jsqr")` inside the start handler. Expected saving **~49 KB gzip on scan routes**.

#### B8. Oversized logo source
**Evidence:** `public/province-seal.png` is 1,135 KB but is displayed at 36–52 px via `next/image`. `priority` makes it a preload competing with JS/fonts.

**Fix:** keep a 96×96 and 192×192 optimized copy in `public/`; keep a high-res master outside the served folder. Consider dropping `priority` from the seal.

---

### C. Server round trips and caching (P0/P1)

#### C1. Middleware runs on every request, including APIs and RSC navigations
**Evidence:** `middleware.ts:293-297` matcher excludes only `_next/static`, `_next/image`, `favicon.ico`, and image extensions. So `/api/*` and every `<Link>` RSC fetch pass through it.
- `getClaims()` first (`:169-177`); falls back to `supabase.auth.getUser()` (`:181-189`) — a network call for projects with symmetric JWT secrets or failed claims.
- Then an Upstash REST GET `pgso:middleware-role:<userId>` (`:70-97`) with a **600 ms** abort timeout (`:61`); on miss/timeout, a Supabase `profiles` SELECT (`:209-219`).
- Role TTL is 60 s (`:60`), so at least one request per user per minute hits the DB.

**Why it matters:** every navigation, every prefetch, and every page's server-action POST pays middleware first. If Redis is slow, the request can wait up to 600 ms *and then* hit the DB.

**Fix**
- Exclude `/api/health` and public asset API from the matcher; protected route handlers already enforce auth.
- Short-circuit role lookup for public paths even when signed in.
- Reduce the Redis timeout to ~150–250 ms so a degraded Upstash cannot add half a second.
- Consider a short-lived signed role cookie to avoid the per-request Redis hop; keep Redis for revocation.
- Migrate `middleware.ts` to the Next 16 `proxy.ts` convention when convenient (Node runtime gives more options).

#### C2. Portal layouts force dynamic rendering
**Evidence:** `personnel/layout.tsx:10`, `employee/layout.tsx:12`, `super-admin/layout.tsx:8` all export `dynamic = "force-dynamic"`.

**Why it matters:** every navigation re-renders the layout server-side and re-runs its data loaders; Next's Full Route Cache and static prefetch benefits are disabled for the whole subtree.

**Fix:** remove the blanket `force-dynamic`; keep dynamic rendering only where auth cookies require it (which Next handles automatically when cookies are read). Cache the static shell and stream only user-specific islands.

#### C3. Cache writes and busts sit on the response path
**Evidence:** `personnel-cache.ts:151-164` awaits Redis reads up to 2.5 s before falling back; `cacheSet` is awaited (`:166-187`) and `withCache` awaits it (`:213`). Write actions await `writeAuditLog` and `bustPersonnelScopes`/`bustSuperAdminScopes` (e.g. `super-admin/users/actions.ts:322-352`).
- `bustInFlight` returns the existing in-flight promise and ignores the new prefix list (`personnel-cache.ts:292`) — a correctness risk as well as a latency source.

**Fix**
- Use Next's `after()` (or `void` with error handling) for cache population, audit writes, and cache busts; keep only the critical write awaited.
- Do not await `cacheSet`; the response can be sent while Redis is updated.
- Fix `bustInFlight` to merge pending prefixes.

#### C4. Redundant dashboard stats
**Evidence:** `personnel/sidebar-loader.tsx:69` and `:92` both call `getDashboardStats`; `personnel/dashboard/actions.ts:489` reaches it again through `getOperationsStats`. React `cache()` dedupes within one render only — the layout loaders and the page action are separate HTTP requests. The 60 s Redis TTL hides it only on warm caches.

**Fix:** fetch badge counts once and pass them into both the sidebar/navbar and the snapshot, or derive the cards from the same snapshot.

#### C5. Employee layout blocks on serial auth → profile → departments
**Evidence:** `employee/layout.tsx:42` (`getSessionIdentity`) → `:66` (`prisma.profile.findUnique`) → `:117` (`getActiveDepartments`). No Suspense boundary wraps this; `children` wait for all three. Unlike personnel, the profile read bypasses `getCachedProfileRow`.

**Fix:** route the read through the shared 60 s profile cache and move departments into a streamed boundary. Expected saving **~350 ms per employee navigation** on a cold profile cache.

---

### D. Over-fetching and redundant server work (P0/P1)

#### D1. Requests page scans the entire asset and inventory tables to label 15 rows
**Evidence:** `personnel/requests/actions.ts:71-103` (`getAssetLabelMap`) runs `prisma.asset.findMany` and `prisma.inventoryItem.findMany` with **no `where` and no `take`**, then builds an in-memory map. Called at `:221` and `:1287`.
**Fix:** collect the page's asset/stock IDs and query `where: { id: { in: ids } }`; better, join labels into the page SQL. Expected: removes two full-table transfers per requests render.

#### D2. A dashboard badge runs the whole recommendations engine
**Evidence:** `prescriptive-queries.ts:554-558` — `getRecommendationCount()` calls `getPrescriptiveOverview()` and takes `.counts.total`. That overview loads `take: 10_000` issuance rows (`:142`), `take: 3000` assets (`:286`), `take: 1000` inventory (`:310`), 300 requests, repairs, documents, and profiles. It runs for both personnel and super-admin dashboards.
**Fix:** add a count-only query/aggregation (or persist recommendation counts on a summary table). Expected: the dashboard stops loading thousands of rows just for one number.

#### D3. Reports fires three server actions on mount
**Evidence:** `ReportsWorkspace.tsx:443`, `:463`, `:476` each use `useCachedAction` and fire regardless of the active tab (default `aging`, `:433`). Each request passes middleware/auth/scope and runs its own heavy raw SQL (aging 2 CTEs, quarterly 6 queries, conditions 1).
**Fix:** gate each hook on its tab (`enabled` option) and/or provide one `getReportsSnapshot` action that returns all three from one scope resolution. Expected: Reports first load drops from 3 POSTs + ~9 DB queries to 1 POST + the active report.

#### D4. Assets deliberately fetches the next page on every visit
**Evidence:** `personnel/assets/page.tsx:149-179` — 400 ms after render it calls `getUnifiedAssetsPage({ page: page + 1, ... })` if the next page exists.
**Why it matters:** every visit performs a second UNION ALL + `COUNT(*) OVER()` query, potentially including QR payloads; search/filter changes can retrigger it.
**Fix:** prefetch only when the browser is idle and the current page has painted, or prefetch just the first page on hover of pagination. Do not prefetch during initial load.

#### D5. Documents fans out to 8 counts plus the tab query
**Evidence:** `personnel/documents/actions.ts:249-285` runs 8 counts in parallel, including bare `COUNT(*)` on large tables; the page also calls `getDocumentsTabPage` (`page.tsx:191`), counts (`:212`), and viewed keys (`:254`).
**Fix:** consolidate into one snapshot action and replace exact counts on large tables with filtered counts backed by indexes, or cache counts longer (60–300 s) and update them lazily.

#### D6. Inventory fans out to ~11 queries
**Evidence:** `inventory/actions.ts:71-105` (6 stats counts), `:112-129` (2 DISTINCT), `:140-192` (page count + rows + catalog). Three separate client actions.
**Fix:** one inventory snapshot action; combine stats into a single SQL statement with `COUNT(*) FILTER`; add the low-stock index (D12).

#### D7. Master data has N+1 query bursts
**Evidence:** `super-admin/master-data/actions.ts:111-139` runs 3 counts per unit via `Promise.all`; `:141-173` runs 2 counts **sequentially per catalog row**. With hundreds of catalog entries this is hundreds of serial round trips.
**Fix:** replace per-row counts with grouped aggregates (`SELECT lower(unit), COUNT(*) ... GROUP BY 1`) and build maps in JS. Expected: hundreds of queries → 3–5.

#### D8. Legacy large-limit readers remain callable
**Evidence:** `getInspectionsList` (`inspections/actions.ts:268`), `getInventoryItems` (`inventory/actions.ts:136`, pageSize 500), requests/repairs legacy paths. They are not on the audited pages today but invite accidental use.
**Fix:** remove or guard them behind `server-only` internal callers; standardize on paged readers.

#### D9. Super Admin dashboard awaits expensive work serially
**Evidence:** `super-admin/dashboard/page.tsx:55-60` — `getSuperAdminSession()` → `getSuperAdminOverview()` → `getRecommendationCount()` before any stat card paints. Only the charts are Suspense-wrapped (`:102-109`).
**Fix:** `Promise.all` the overview and recommendation count (D2 makes the latter cheap), and stream the recent-activity panel.

#### D10. Offsets and ILIKE searches
**Evidence:** OFFSET pagination in most lists; `ILIKE '%term%'` over many columns (`assets/actions.ts:738`, requests/repairs/deliveries/logs).
**Fix:** keyset pagination for deep pages and trigram indexes for the most-used search fields (see §5).

#### D11. DB reports recompute from base tables on every request
**Evidence:** `reporting-queries.ts` aging (`:182-203`), quarterly (`:539-658`), conditions (`:760-766`). Quarterly runs 6 scans; the issuance filters use `EXTRACT(YEAR FROM COALESCE(doc_date, created_at ...))`, which is not sargable.
**Fix:** generate an `issued_on` column + index and rewrite to date ranges; consider a materialized view refreshed on write for historical reports.

#### D12. Missing indexes on hot columns
Confirmed in `prisma/schema.prisma`:
- No `(viewer_id)` index on `document_views`, yet it is filtered by every dashboard/document badge.
- No composite `(created_by, created_at)` / `(employee_id, created_at)` / `(status, created_at)` on repairs, requests, issuances, audit logs.
- No `(delivery_id, created_at)` on inspections, `(inspection_status, created_at)` on deliveries.
- No index on `inventory.reorder_threshold`; low/critical/out stats scan.
- `idempotency_keys` cleanup filters `(status, updated_at)` with no index.
- Migration-only indexes (`profiles.profile_completed`, `departments.status`, asset condition/unit, expression indexes) are missing from `schema.prisma` — drift risk.

**Also a correctness bug:** `document_views` still has `@@unique([doc_type, doc_id])` in `schema.prisma:350` and the old DB constraint from migration 12, while the per-viewer unique exists at `:351`. The second viewer of a document can hit the old constraint and fail the insert, whose `ON CONFLICT` target only covers the per-viewer key (`documents/actions.ts:59-62`).

---

### E. Database connection configuration (P1)

**Evidence**
- `DATABASE_URL` uses Supabase pooler `:6543` with `pgbouncer=true` — correct — but `connection_limit=3` and `pool_timeout=30`.
- `DIRECT_URL` also sets `connection_limit=3`.
- `src/lib/prisma.ts:5-35` has no `transactionOptions`, so interactive transactions use the 5 s default. `src/lib/stock.ts:85-167` loops per item inside one transaction (~20–30 round trips for a 10-item delivery), which can exceed 5 s at 350 ms RTT.
- No slow-query logging (`log: ['error', 'warn']` only).
- `.env.local.bak-direct` exists with a direct `:5432` host and no connection limit — a deployment footgun.

**Why it matters:** serverless scale-out × 3 connections per instance can exhaust the pooler; queued requests then appear as random multi-second stalls. A 30 s pool timeout means requests hang instead of failing fast.

**Fix**
- Runtime `connection_limit=1` (raise only if measured), `pool_timeout=10`, `connection_timeout=10`, keep `pgbouncer=true`.
- Add `transactionOptions: { maxWait: 5_000, timeout: 15_000–20_000 }`.
- Refactor `stock.ts` to preload candidates and batch writes instead of per-item queries inside the transaction.
- Add slow-query telemetry via `pg_stat_statements` or Prisma query events behind `PERF_TRACE=1`.
- Remove/rename `.env.local.bak-direct`.

---

### F. Perceived-speed details (P2)

- **Two skeleton phases:** Next's route `loading.tsx` then the page's own `loading` state. Keep skeletons dimensionally identical to content to avoid layout shift.
- **Missing route fallbacks:** no root `super-admin/loading.tsx` or `employee/loading.tsx`; reports/PPMP/templates have only the inherited generic personnel skeleton (or none).
- **`DbDownNotifier` probes the server on every personnel page mount** (`PersonnelChrome.tsx:43`, `DbDownNotifier.tsx:84-93`), adding a competing action request. Delay the first probe 2–5 s or idle.
- **Full `router.refresh()` after many mutations** re-renders the whole force-dynamic route. Prefer targeted `bustClientCache` + `mutate`.
- **Toast context value is recreated every render** (`toaster.tsx:35-49`), re-rendering consumers; memoize it.
- **`nav-prefetch.ts` covers only 6 routes**, so most sidebar links still pay the full cold path.
- **Unused dependencies:** `gsap`, `@gsap/react`, `lenis`, `xlsx` (no runtime imports found). Removing them reduces install size and accidental bundle inclusion.

---

## 5. Priority plan

### Phase 0 — Quick wins (≈1 day, low risk)

| # | Change | Expected effect |
|---|---|---|
| 1 | Replace `src/app/icon.png` with 32/48 px; resize favicon | −1.1 MB first load |
| 2 | Remove `import "@/lib/gsap-register"` from `LayoutClient` (and unused deps) | −47 KB gzip all routes |
| 3 | Dynamically import `ChangePasswordDialog` when the account menu opens | −59 KB gzip all routes |
| 4 | Render the marketing `Footer` only on public routes; drop Framer from portals | −38 KB gzip + less hydration |
| 5 | Remove Inter from `layout.tsx`/`globals.css` | −47 KB font, fewer CSS rules |
| 6 | Gate report hooks by active tab | 3 actions → 1 on Reports |
| 7 | Remove the assets next-page prefetch during initial load | −1 heavy query per Assets visit |
| 8 | Run `document_views` fix: drop old unique, add `viewer_id` index, align schema | correctness + faster badges |
| 9 | Set `connection_limit=1`, `pool_timeout=10` | fewer pool stalls |

### Phase 1 — Server-first first paint (≈3–5 days)

1. Add `initialData` support to `useCachedAction` (seed first key, skip skeleton).
2. Convert the top 6 pages to server components that fetch the first window and pass `initialData`:
   dashboard, requests, assets, inventory, documents, inspections.
3. Combine per-page actions into one snapshot action (counts + page + options).
4. Replace `getRecommendationCount` with a count-only query.
5. Wrap employee layout profile/departments in Suspense + use the shared profile cache.
6. `Promise.all` the super-admin dashboard calls.

**Expected:** first screen data appears in the initial HTML; skeleton phase disappears on cold loads; page actions drop from 2–3 to 1.

### Phase 2 — Data layer (≈1–2 weeks)

1. Apply the index migration (see §6).
2. Replace full-table scans (`getAssetLabelMap`) with scoped `id IN` queries.
3. Consolidate document counts; use `COUNT(*) FILTER` for inventory stats.
4. Fix master-data N+1 with grouped aggregates.
5. Make cache sets/busts and audit writes deferred (`after()`).
6. Rewrite report year filters to date ranges; add `issued_on` generated column/index.
7. Fix `bustInFlight` prefix merging.
8. Add keyset pagination for assets, logs, issuances, deliveries.

### Phase 3 — Long-term scale (as data grows)

- Materialized view / summary tables for aging, quarterly issuance, and dashboards.
- Trigram indexes for the most-used search columns.
- Proper realtime or SSE for queue updates instead of TTL polling.
- Performance budgets enforced in CI (bundle size, query count, Server-Timing thresholds).

---

## 6. Recommended index migration (highest impact)

Apply with `CREATE INDEX CONCURRENTLY` in production. Prisma migrations run in a transaction, so run these manually or via a dedicated SQL step.

```sql
-- Correctness + hot filter
ALTER TABLE "document_views"
  DROP CONSTRAINT IF EXISTS "document_views_doc_type_doc_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "document_views_viewer_key"
  ON "document_views" ("doc_type", "doc_id", "viewer_id");
CREATE INDEX IF NOT EXISTS "document_views_viewer_id_idx"
  ON "document_views" ("viewer_id");

-- Ownership + recency lists
CREATE INDEX IF NOT EXISTS "requests_employee_date_requested_idx"
  ON "requests" ("employee_id", "date_requested" DESC);
CREATE INDEX IF NOT EXISTS "requests_recipient_status_date_idx"
  ON "requests" ("recipient_id", "status", "date_requested" DESC);
CREATE INDEX IF NOT EXISTS "repairs_created_by_created_at_idx"
  ON "repairs" ("created_by", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "repairs_created_by_status_created_idx"
  ON "repairs" ("created_by", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "repairs_status_created_at_idx"
  ON "repairs" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "issuance_records_employee_created_idx"
  ON "issuance_records" ("employee_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "issuance_records_created_by_created_idx"
  ON "issuance_records" ("created_by", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_user_created_at_idx"
  ON "audit_logs" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "assets_assigned_to_created_at_idx"
  ON "assets" ("assigned_to", "created_at" DESC);

-- Queue / report filters (partial indexes are small and fast)
CREATE INDEX IF NOT EXISTS "deliveries_pending_created_idx"
  ON "deliveries" ("created_at" DESC)
  WHERE "inspection_status" = 'pending';
CREATE INDEX IF NOT EXISTS "requests_pending_date_idx"
  ON "requests" ("date_requested" DESC)
  WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "repairs_open_created_idx"
  ON "repairs" ("created_at" DESC)
  WHERE "status" IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS "inspections_delivery_created_idx"
  ON "inspections" ("delivery_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "inventory_low_stock_idx"
  ON "inventory" ("quantity")
  WHERE "reorder_threshold" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idempotency_keys_status_updated_idx"
  ON "idempotency_keys" ("status", "updated_at");

-- Issued-date reports
ALTER TABLE "issuance_records"
  ADD COLUMN IF NOT EXISTS "issued_on" DATE
  GENERATED ALWAYS AS (
    COALESCE("doc_date", ("created_at" AT TIME ZONE 'Asia/Manila')::date)
  ) STORED;
CREATE INDEX IF NOT EXISTS "issuance_records_issued_on_idx"
  ON "issuance_records" ("issued_on");
```

Also add the migration-only indexes to `schema.prisma` (`profiles.profile_completed`, `departments.status`, assets condition/unit, inventory unit/lower(category)) or they risk being dropped by a future diff.

---

## 7. Target: what "instant" should look like

An instant page in this app should follow this shape:

1. **Server renders the first screen with real data** (no data-fetch-after-hydration).
2. **Client JS is under ~200 KB gzip** for list/dashboard routes.
3. **One server action per user interaction**, not 2–3 on mount.
4. **One or two DB round trips per page read**, backed by indexes; no full-table scans.
5. **Cache reads never block** the response for more than ~200 ms; cache writes/busts happen after the response.
6. **Sub-1s perceived load** on broadband, **under 2.5 s** on a mid-range phone for cold loads.

Suggested budgets to enforce in CI:

| Metric | Budget |
|---|---|
| First-load JS (gzip) per portal route | ≤ 220 KB |
| API/action server time (p95, warm cache) | ≤ 300 ms |
| DB queries per page read | ≤ 4 |
| Cold page TTFB + first data | ≤ 1.2 s |
| Largest Contentful Paint (mobile) | ≤ 2.5 s |

---

## 8. How to verify the improvements

1. Enable `PERF_TRACE=1` and read `Server-Timing` headers / `[perf]` logs for middleware, auth, Redis, and Prisma timing.
2. Add temporary `performance.now()` marks in the page action and log `{ scope, cache, db, total }`.
3. Use browser DevTools Performance panel to separate: network transfer, JS parse/eval, hydration, action POST, render.
4. Use `pg_stat_statements` (Supabase) to confirm the top queries and whether indexes are used (`EXPLAIN ANALYZE`).
5. Re-measure the route bundle stats after each Phase 0 item; track the gzip totals in this table.
6. Test on a throttled profile (Fast 3G / mid-tier CPU) — that is where the architecture gap is visible.

---

## 9. Evidence index

**Client fetch / skeleton**
- `src/hooks/use-cached-action.ts:87-95,190-198`
- `src/app/personnel/dashboard/page.tsx:1,63-80`
- `src/app/personnel/assets/page.tsx:149-179`
- `src/components/reporting/ReportsWorkspace.tsx:433,443-487`

**Payload**
- `src/app/icon.png`, `src/app/favicon.ico`, `public/province-seal.png`
- `src/app/layout.tsx:16-20`, `src/app/globals.css:5-7`
- `src/components/layout/LayoutClient.tsx:5,50`
- `src/lib/gsap-register.ts`, `src/lib/gsap-utils.ts`
- `src/components/account/ChangePasswordDialog.tsx:17`
- `src/components/personnel/PersonnelNavbar.tsx:25`
- `src/components/QrScanner.tsx:6`
- `.next/diagnostics/route-bundle-stats.json`

**Server path**
- `middleware.ts:60-119,169-219,293-297`
- `src/app/personnel/layout.tsx:10`, `src/app/employee/layout.tsx:12,42,66,117`, `src/app/super-admin/layout.tsx:8`
- `src/lib/personnel-cache.ts:151-187,195-221,292`
- `src/app/personnel/sidebar-loader.tsx:69,92`
- `src/lib/prisma.ts:5-35,47`

**Query hotspots**
- `src/app/personnel/requests/actions.ts:71-103,221,1287`
- `src/lib/prescriptive-queries.ts:142,286,310,554-558`
- `src/app/personnel/documents/actions.ts:249-285`
- `src/app/personnel/stocks/actions.ts:71-129,140-192`
- `src/app/super-admin/master-data/actions.ts:111-173`
- `src/app/super-admin/dashboard/page.tsx:55-60`
- `src/lib/reporting-queries.ts:182-203,539-658`
- `prisma/schema.prisma:345-352`
- `.env.local` pooling parameters (values redacted here)

---

## 10. Phase 0 implementation results (2026-11-13)

Applied items 1–8 plus the pooling documentation from item 9:

| Change | File(s) |
|---|---|
| Icon/favicon/apple-icon/seal resized and recompressed | `src/app/{icon.png,favicon.ico,apple-icon.png}`, `public/province-seal.png` |
| Removed unused GSAP registration | `src/components/layout/LayoutClient.tsx`, `src/lib/gsap-register.ts` (now unreferenced) |
| Lazy `ChangePasswordDialog` (Supabase out of first load) | `src/components/{personnel,employee,super-admin}/*Navbar.tsx` |
| Footer public-only + code-split (Framer out of portals) | `src/components/layout/LayoutClient.tsx` |
| Removed unused Inter family/weights | `src/app/layout.tsx`, `src/app/globals.css` |
| `enabled` option on `useCachedAction`; Reports gates hooks by tab | `src/hooks/use-cached-action.ts`, `src/components/reporting/ReportsWorkspace.tsx` |
| Assets page+1 prefetch moved to `requestIdleCallback` | `src/app/personnel/assets/page.tsx` |
| `document_views` legacy unique dropped, viewer index added, schema aligned | `prisma/migrations/35_load_performance_indexes/`, `prisma/schema.prisma` |
| Pooling guidance documented (runtime `connection_limit=1` on serverless, `3` for a single local server) | `README.md` |
| Updated prefetch source-shape test | `src/__tests__/prefetch.test.ts` |

Measured first-load JS after the change (same build diagnostics, gzip level 9):

| Route | Before | After | Δ gzip |
|---|---:|---:|---:|
| `/super-admin/dashboard` | 492 KB | **380 KB** | −112 KB |
| `/personnel/dashboard` | 473 KB | **361 KB** | −112 KB |
| `/personnel/reports` | 468 KB | **356 KB** | −112 KB |
| `/personnel/assets` | 413 KB | **301 KB** | −112 KB |
| `/personnel/requests` | 412 KB | **300 KB** | −112 KB |
| `/personnel/inspections` | 401 KB | **347 KB** | −54 KB |
| `/personnel/stocks` | 378 KB | **266 KB** | −112 KB |
| `/personnel/documents` | 369 KB | **257 KB** | −112 KB |
| `/employee/dashboard` | 367 KB | **255 KB** | −112 KB |
| `/scan` | 322 KB | **269 KB** | −53 KB |
| `/login` | 274 KB | **222 KB** | −52 KB |

Static assets: `icon.png` 1,162,437 → 4,013 bytes; `favicon.ico` 83,987 → 3,151; `apple-icon.png` 45,206 → 16,198; `province-seal.png` 1,135 KB → 110 KB. GSAP and Supabase chunks no longer appear in any route's first-load set; Recharts remains on chart routes (Phase 1/2 item).

Verification: `npx tsc --noEmit`, targeted ESLint, `npm test` (389/389), and `npm run build` all pass. The index migration has not been applied to a database yet — run `npm run db:migrate` (or deploy it) before measuring query gains.

