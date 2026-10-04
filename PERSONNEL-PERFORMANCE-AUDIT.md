# Personnel Role Performance Audit — Slow Actions + Non-Realtime UI

**Date:** 2026-10-04
**Scope:** `src/app/personnel/**` and `src/app/employee/**` — action latency and list freshness, same criteria as the Super Admin audit
**Companion:** `SUPER-ADMIN-PERFORMANCE-AUDIT.md` (§7 Solution applies 1:1 unless noted otherwise)
**Repo:** `chikwaaa212/pgso`, branch `main`

---

## 1. Executive Summary

The Personnel role suffers from **the same two diseases as Super Admin, plus one worse symptom and one bright spot**:

1. **Mutations block the UI on long server round-trips with no optimistic update.** Same `saving` spinner → `await action` → full `reload()` pattern on every write page.
2. **Lists go stale without refresh (same double-TTL stacking).** `useCachedAction` (30–60s, 10-min ceiling) over server Redis TTL (30–60s) on every list page.
3. **Worse: zero realtime anywhere.** Super Admin at least has 3 (broken) subscriptions; Personnel and Employee have **none** — verified by search. Two staff viewing the same queue diverge until TTL or manual refresh.
4. **Bright spot: personnel assets already has a paginated reader** (`assets/actions.ts:790-833`) with server-side filters and concurrent queries — the pattern the audit recommends — but Super Admin browse still uses the legacy heavy path.
5. **Mirror-image write-path tradeoff:** personnel busts cache fire-and-forget (faster response, stale-read race) while admin awaits the bust (slower response, correct read). Each side picked one half of the correct solution.

| Issue | Super Admin | Personnel | Employee |
|---|---|---|---|
| Mutations feel slow (no optimistic UI) | Yes | Yes | N/A (read-only + request form) |
| Stale lists without refresh (double TTL) | Yes | Yes | Yes |
| Realtime subscriptions | 3 wired, all broken (wrong table names) | 0 wired | 0 wired |
| Heavy list queries | Yes (`take:500` + per-row QR) | Yes, except assets has a paginated reader | Light |
| Cache bust blocks write response | Yes (awaited SCAN/DEL) | Mostly no (fire-and-forget → stale-read race) | N/A |

---

## 2. Finding P1 — No realtime on any personnel or employee page [CRITICAL]

Search for `useAdminRealtime` under `src/app/personnel/**`: **no matches**. Under `src/app/employee/**`: **no matches** (only `useCachedAction` in `employee/assets/page.tsx:11,51` and `employee/requests/page.tsx:11,37`).

Affected personnel pages (all TTL-only): dashboard (`dashboard/page.tsx:72`), deliveries (`deliveries/delivery-table.tsx:82`), inspections, requests (`requests/page.tsx:116`), assets, inventory (`inventory/page.tsx:112,128,133` — three hooks), issuances (`issuances/page.tsx:58`), repairs, documents (`documents/page.tsx:160,175,217` — three hooks), issues (`issues/page.tsx:51,65,71` — three hooks), logs (`logs/logs-table.tsx:56,70`).

Consequence: a delivery logged by Personnel A is invisible to Personnel B (and to Super Admin) until caches expire. There is no live convergence anywhere outside the 3 broken admin subscriptions.

---

## 3. Finding P2 — Same double-TTL staleness [HIGH]

Identical layering as admin: client `useCachedAction` (`staleTime` 30–60s, `maxAge` 10 min, `sessionStorage` persistence) over server `withScopedCache` / `withCache` (30–60s Redis TTL). Fresh client cache skips the network entirely (`use-cached-action.ts:91-93`). Net effect: up to ~2 minutes of staleness by design on every personnel list, same as admin.

---

## 4. Finding P3 — Same pessimistic mutations [HIGH]

Personnel writes use the same blocking pattern. Representative: `personnel/requests/page.tsx:177-195` — after every file/approve/reject/complete/issue action, `reload()` busts **nine** client cache keys (dashboard, deliveries, inspections, inventory, assets, documents, issues, issuances, logs) and refetches. The user waits through the full server chain **plus** the refetch of heavy list queries before the UI settles. No page patches its rows optimistically first.

---

## 5. Finding P4 — Fire-and-forget bust: fast response, stale-read race [MEDIUM]

Personnel action modules wrap Next.js `revalidatePath` so every revalidation also busts Redis **without awaiting** (fire-and-forget):

```ts
// personnel/deliveries/actions.ts:8-13 (same helper in repairs, inventory, requests modules)
function revalidatePath(path: string) {
  nextRevalidatePath(path)
  void import('@/lib/personnel-cache')
    .then((m) => m.bustPersonnelScopes(['deliveries', 'inspections', 'dashboard', 'documents']))
    .catch(() => {})
}
```

Effect: personnel actions respond faster than admin's (which `await`s the SCAN/DEL), but the client's immediate `refresh()` can land **before the bust completes** and re-cache the pre-write payload for another full TTL — the stale-read race from audit §4 B5. The codebase proves the team hit this: `personnel/requests/actions.ts:857-862` deliberately `await`s `bustPersonnelScopes` before reporting success, with a comment explaining why. The correct end state is neither: respond fast AND order correctly via `after()` (audit §7 Fix 3).

---

## 6. Finding P5 — Heavy list queries persist, but assets has the fix [MEDIUM]

Still full-table: `personnel/requests/actions.ts:436,448` (`take:500`), `personnel/repairs/actions.ts:347` (`take:500`), and the legacy `getAllUnifiedAssets` path (`asset take:500` + `inventoryItem take:500`, merged ~1000 rows with per-row QR generation — `assets/actions.ts:114-206,350-356`) which Super Admin browse still calls.

Bright spot: `assets/actions.ts:790-833` (`personnel:unified-assets-page`, 60s cache) already implements the recommended shape — server-side `page/q/status/source/condition/unit/category` filters, concurrent asset+stock queries via named promises + `Promise.all`, and lean `select`s (no QR in the list query). Remaining weakness: the `take:2000` cap is still a large payload; page sizes of 25–50 with a `{ rows, total }` return would finish the job (audit §7 Fix 4).

---

## 7. Finding P6 — Cross-role gap, mirrored [MEDIUM]

Personnel writes bust only `personnel:*` scopes (`personnel-cache.ts` `bustPersonnelScopes`); admin writes bust only `super-admin:*`. Realtime — the mechanism that could paper over this gap — is dead on both sides. Lone exception: `personnel/requests/actions.ts:966` revalidates `/super-admin/requests` on one path, proving cross-role invalidation is possible but unsystematic.

---

## 8. Solution Carry-Over (what to apply from §7, plus personnel-specifics)

The Super Admin §7 playbook applies unchanged; only the wiring list and one reuse item differ:

1. **Fix 0 + Fix 1 (realtime): add the hook to personnel pages** with the verified **plural** table names — `deliveries` (+`inspections`), `inspections` (+`deliveries`), `requests`, `assets` (+`inventory`), `inventory`, `issuances` (`issuance_records`), `repairs`, `documents`, `issues` (`requests`, `repairs` — no dedicated model), `logs` (`audit_logs`), dashboard islands (`profiles`). Include the same 15s poll fallback and 700ms coalescing, and expose `refresh` as `onEvent` on every page (audit the personnel pages for the `deliveries`-style omission of `refresh`).
2. **Fix 2 (optimistic): replicate the overlay-map pattern** on personnel writes — log-delivery form (`log-delivery-mock-form.tsx:289` already busts client keys; add the pre-write row patch), request dialogs, inspection sign-off, issuance completion, inventory threshold cells.
3. **Fix 3 (write path): convert fire-and-forget busts AND awaited busts to `after()`** — one consistent shape: critical write awaited, audit + bust deferred. This resolves the personnel stale-read race and the admin latency in one move.
4. **Reuse, don't rebuild: point Super Admin browse at the paginated `unified-assets-page` reader** instead of legacy `getAllUnifiedAssets`, then tighten `take:2000` → real `{ rows, total }` pagination for both roles.
5. **Fix 5 (indexes): same DDL** benefits both roles since they share tables; add `Inspection.delivery_id` index after confirming the field name.

Verify per role: two personnel browsers converging without refresh; mutation response after ~3 DB round-trips; publication check listing all 14 tables; no `take:500+` without pagination on either role's hot paths.

---

## 9. Appendix — Evidence Index

- Zero realtime in personnel/employee: search `useAdminRealtime` under `src/app/personnel/**` and `src/app/employee/**` (no matches); employee `useCachedAction` at `employee/assets/page.tsx:11,51`, `employee/requests/page.tsx:11,37`
- Personnel cached lists: `personnel/dashboard/page.tsx:72`, `deliveries/delivery-table.tsx:82`, `inventory/page.tsx:112,128,133,149`, `requests/page.tsx:116,183`, `documents/page.tsx:160,175,217,270`, `issues/page.tsx:51,65,71`, `logs/logs-table.tsx:56,70`, `issuances/page.tsx:58`, `deliveries/log-delivery-mock-form.tsx:289`
- Pessimistic reload (9-key bust): `personnel/requests/page.tsx:177-195`
- Fire-and-forget bust helper: `personnel/deliveries/actions.ts:8-13`, `personnel/repairs/actions.ts:8-11`, `personnel/inventory/actions.ts:8-11`, `personnel/requests/actions.ts:8-11`; awaited exception: `personnel/requests/actions.ts:857-862`; cross-role exception: `personnel/requests/actions.ts:966`
- Heavy queries: `personnel/requests/actions.ts:436,448`, `personnel/repairs/actions.ts:347`, `personnel/assets/actions.ts:114-206,350-356`
- Paginated assets reader: `personnel/assets/actions.ts:790-833`
- Personnel write paths with extra scope busts: `personnel/deliveries/actions.ts:237-238,365-377`, `personnel/repairs/actions.ts:490-493,599-600,679-680`, `personnel/inventory/actions.ts:313,346,415-416`, `personnel/issuances/actions.ts:927-933,1471-1477,1524-1547`, `personnel/requests/actions.ts:1199-1200`

*Audit of `main` following `SUPER-ADMIN-PERFORMANCE-AUDIT.md` Rev 2 criteria; no app code changed.*
