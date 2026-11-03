# Objective 5 — Prescriptive Analytics Implementation Plan

**Objective:** Implement prescriptive analytics — replenishment, replacement/disposal, reassignment of unused items, and PPMP quantity suggestions.

**Current status:** Fully met (feature work complete; `npm test` and `npm run build` pass, `npm run lint` still reports pre-existing errors in unrelated files — see §7).

**What already exists:**

- Rule-based replenishment: `inventory.reorder_threshold`, low/critical/out-of-stock levels, per-row advice on the inventory page, and `stock_replenishment` requests.
- PPMP forecasting: low/base/high quantity projections, statistical/trend/average methods, and budget-ceiling optimization (LP + greedy fallback).
- Decision-support flags from PPMP workbook history (`QTY_MULTI_YR`, `QTY_ABOVE_AVG`, `STOCK_COVER`, `COST_JUMP`, `ANOMALY_REVIEW`, `FORECAST_CONFIRM`).

**What is missing (the gaps this plan closes):**

1. Replacement and disposal recommendations for assets.
2. Idle/unused asset detection with reassignment suggestions.
3. Issuance-history-driven quantity suggestions for PPMP planning.

---

## 1. Gap → implementation map

| Requirement | Current state | What we add |
| --- | --- | --- |
| Replacement / disposal | Asset status and condition are charted only | Evidence-based replacement and disposal-review recommendations with repair cost/count and condition context |
| Reassignment of unused items | Transfer requests exist, but nothing identifies idle items | Idle available assets (>180 days) + duplicate custody, with pending-request match suggestions |
| PPMP quantity suggestions | Projections use uploaded PPMP workbook history only | A `consumption` method driven by actual issuance records, plus a planned-vs-suggested comparison panel |

No new database tables or migrations are required. All inputs already exist in `assets`, `repairs`, `issuance_records`, `inventory`, and `requests`.

---

## 2. Confirmed decisions

| Decision | Choice |
| --- | --- |
| Placement | **Dedicated recommendations page** in both portals: `/personnel/recommendations` and `/super-admin/recommendations` |
| Actionability | **Advisory + deep links only** — no automatic asset status, disposal, or request changes |
| Idle definition | Available/unassigned assets older than **180 days** + **duplicate custody** |
| Issuance matching | **Last 3 fiscal years**, exact normalized `description|unit` key; unmatched counts shown |
| Replacement age rule | Age shown as context only — no assumed category useful-life triggers |
| Replacement thresholds | **≥3 repairs in 12 months**, **repair spend ≥50% of recorded cost**, or unserviceable with no open repair — stored in one constants file for tuning |
| Replenishment | Included as an advisory section **with suggested order quantities**: average monthly issuance × 60-day lead time + safety − on-hand |
| Dashboard | Add a recommendation-count card on both dashboards linking to the new page |
| Export | No XLSX export for the recommendations page in this scope |
| Schema | No changes; recommendations recomputed from existing data |

---

## 3. Proposed rules

### 3.1 Replacement / disposal

Inputs per asset: `condition`, `status`, `date_acquired`, `unit_cost` / `total_cost`, `quantity`, `assigned_to`, repair history (date, cost, status).

| Rule ID | Trigger | Suggested action | Priority |
| --- | --- | --- | --- |
| `DISPOSE_UNSERVICEABLE` | Condition classifies as unserviceable and no open repair | Disposal review | High |
| `REPAIR_OR_REPLACE` | Condition unserviceable with an open repair | Compare repair quote vs replacement cost | High |
| `REPLACE_REPAIR_HEAVY` | ≥ 3 repairs in 12 months **or** repair spend ≥ 50% of recorded asset cost | Replacement review | Medium |
| `RETIRED_DOCUMENTATION` | `status = 'retired'`, no disposal-related document on file | Verify disposal paperwork | Low |

Evidence always includes property number, condition, age, repair count, repair spend, and recorded cost. Replacement recommendations must never invent a useful life.

### 3.2 Idle / reassignment

| Rule ID | Trigger | Suggested action | Priority |
| --- | --- | --- | --- |
| `IDLE_AVAILABLE` | `status = 'available'`, `assigned_to IS NULL`, and the **recorded acquisition date** (`date_acquired`, else `created_at`) is more than 180 days before now | Assign to a matching pending request, otherwise redeploy | Medium |
| `IDLE_MATCHED_DEMAND` | Same as above and a pending `new_assignment` request matches by normalized description / account code | Transfer to the requesting employee or office | High |
| `DUPLICATE_CUSTODY` | One custodian holds more than one asset with the same normalized account code/title | Transfer the excess unit | Medium |

Deliberately excluded: “assigned but no activity”. The system has no real usage telemetry, so that trigger would produce false positives.

> **Age vs. idle time:** `assets` has no “became available” timestamp, so the 180-day test is an age proxy. Recommendation text and evidence must say the asset is available/unassigned **and** report the age since acquisition (or record creation) — never claim it has been unassigned for that many days.

### 3.3 Issuance-history-driven PPMP quantities

- Source: `issuance_records.issuance_data.lines[]` (fallback to row columns for legacy single-line records).
- Window: last **3 fiscal years**.
- Key: the parser’s exact normalized `description|unit` key (`normalizeHeader(description)|unitKey`).
- Per item:
  - Total issued quantity per year.
  - Average annual issuance.
  - Suggested **low / base / high** = min / mean / max annual issuance.
  - Subtract matching on-hand inventory for stocked items.
  - Confidence `LOW` with fewer than 2 usable years.
- Comparison with the planning draft:
  - Planned vs suggested quantity.
  - Variance and percent.
  - “Under-planned” / “Over-planned” / “Aligned” status.
- Unmatched issuance lines and PPMP items are counted and surfaced, not guessed.

---

## 4. Architecture

### 4.1 Pure modules (client-safe, unit-tested)

- `src/lib/prescriptive/types.ts` — `Recommendation`, `Priority`, `Evidence`, grouped result types.
- `src/lib/prescriptive/config.ts` — tunable thresholds (idle days, repair count, repair-cost ratio, lead time, safety stock).
- `src/lib/prescriptive/replacement.ts` — replacement/disposal rules.
- `src/lib/prescriptive/idle.ts` — idle detection, duplicate custody, demand matching.
- `src/lib/ppmp/analytics/consumption.ts` — issuance aggregation, suggestion math, planned comparison.

### 4.2 Scoped server readers

- `src/lib/prescriptive-queries.ts`
  - `getReplenishmentAdvice(scope)`
  - `getReplacementDisposalAdvice(scope)`
  - `getIdleReassignmentAdvice(scope)`
  - `getPpmpConsumptionCheck(scope, targetYear?)`
- Follow the existing reports pattern: `getPersonnelScope()` + `withScopedCache` (60s TTL).
- Scope rules:

| Data | Personnel | Super Admin |
| --- | --- | --- |
| Assets / inventory | Shared global pools (existing convention) | All |
| Repairs | Own (`created_by`) | All |
| Issuances | Own (`created_by`) | All |
| Requests | Recipient queue / existing request scope | All |

### 4.3 Server actions

- `src/lib/prescriptive-actions.ts`
  - `fetchPrescriptiveRecommendations()` guarded by `requirePersonnelScope()`.
  - `fetchPpmpConsumption()` for the planning page.

### 4.4 Pages and navigation

New routes:

- `src/app/personnel/recommendations/page.tsx`
- `src/app/super-admin/recommendations/page.tsx`

Shared UI:

- `src/components/recommendations/RecommendationsWorkspace.tsx`
- `src/components/recommendations/recommendations.module.css`
- `loading.tsx` skeletons for both routes

Navigation:

- Add **Recommendations** links next to **Reports** in `PersonnelNavbar.tsx` and `SuperAdminNavbar.tsx`.
- Add a recommendation-count card to both dashboards linking to the new page.
- Middleware already role-gates `/personnel/*` and `/super-admin/*`; no `middleware.ts` change is needed.

Page sections:

1. **KPI row** — total recommendations, replacements due, disposal candidates, idle assets, PPMP variance items.
2. **Replenishment** — out-of-stock, critical, and below-threshold inventory with on-hand, threshold, and a suggested order quantity (average monthly issuance × 60-day lead time + safety − on-hand). Links to the inventory page.
3. **Replacement & disposal** — grouped recommendations with evidence and asset links.
4. **Idle & reassignment** — idle assets, suggested target, and request links.
5. **PPMP quantity check** — items where issuance history disagrees with the draft, linking to PPMP planning.

Every row includes priority, a plain-language reason, evidence, and a deep link to the relevant record.

### 4.5 PPMP planning integration

- Add `"consumption"` to `PlanningMethod` and to the planning form’s method options.
- Pass the consumption map into `buildForecastsFromItems` / `buildPlanningForecasts`.
- When the method is `consumption`:
  - Use the consumption suggestion as the base.
  - Fall back to the workbook method with an explicit note when no history matches.
  - Preserve existing low/base/high and cost/price adjustments.
- Add a **Consumption check** panel: item, unit, 3-year issued quantity, average/year, on-hand, suggested, planned, variance, confidence.
- Extend `buildPlanningBasis` with the years used, unmatched count, and on-hand adjustment.
- Keep the official GPPB table and Excel export columns unchanged; consumption is advisory only.

---

## 5. Cache, performance, and invalidation

- Recommendations use a new `personnel:recommendations` server namespace and client keys built through `buildQueryKey({ module: portal, resource: 'recommendations' })`.
- Extend the existing `asset`, `repair`, `issuance`, `request`, and `inventory` entries in `src/lib/cache-invalidation.ts` so recommendations refresh when their inputs change.
- Mirror the prefixes in `bustPersonnelScopes` / `bustSuperAdminScopes`.
- Query design:
  - One asset query with selected fields.
  - One grouped repair aggregate per asset for the last 24 months.
  - One grouped issuance-activity query.
  - One pending `new_assignment` request/items query.
  - Cap each recommendation group to a readable top-N and return total counts.

---

## 6. Implementation phases

### Phase 1 — Pure logic + tests

- Create the three rule modules.
- Add unit tests:
  - `src/__tests__/prescriptive-replacement.test.ts`
  - `src/__tests__/prescriptive-idle.test.ts`
  - `src/__tests__/ppmp-consumption.test.ts`

### Phase 2 — Scoped readers and actions

- Implement `prescriptive-queries.ts` and `prescriptive-actions.ts`.
- Verify scope behavior for personnel vs super admin.
- Add cache-prefix coverage.

### Phase 3 — Recommendations pages

- Build the shared workspace and CSS module.
- Add both routes, loading skeletons, and navbar links.
- Wire badges/counts and deep links.

### Phase 4 — PPMP consumption method

- Extend planning types and method handling.
- Add the consumption panel and basis text.
- Add planning tests for fallback and variance.

### Phase 5 — Replenishment suggested order quantities

- Suggested order quantity = average monthly issuance × lead time (default **60 days**) + safety stock − on-hand.
- Show it in the Replenishment section on the Recommendations page. The inventory page keeps its existing threshold advice unchanged in this scope.
- Keep the existing threshold/request workflow unchanged; the suggestion only prefills the advisory.

### Phase 6 — Dashboard integration

- Add a recommendation-count card to the personnel and super-admin dashboards, linking to `/personnel/recommendations` and `/super-admin/recommendations`.
- Reuse the existing dashboard analytics/query caching; no new export route.

### Phase 7 — Verification and documentation

- `npm run lint`
- `npm test`
- `npm run build`
- Update `README.md`, `AGENTS.md`, and `OBJECTIVES-ASSESSMENT.md` once implemented.

---

## 7. Acceptance criteria

- [x] Both portals expose a Recommendations page with correctly scoped results.
- [x] Replacement/disposal rules fire only on evidence present in the data.
- [x] Idle detection uses the 180-day available-asset rule and duplicate custody, with no unsupported “usage” assumptions.
- [x] Matching pending requests appear as reassignment suggestions.
- [x] PPMP planning supports a consumption method and shows planned-vs-suggested variance with evidence.
- [x] Unmatched items and low-confidence suggestions are explicitly labelled.
- [x] Replenishment rows show a suggested order quantity derived from issuance history and on-hand stock.
- [x] Both dashboards show a recommendation-count card linking to the new page.
- [x] No schema changes and no automatic status/disposal/request mutations.
- [x] Recommendations refresh after asset, inventory, repair, issuance, and request writes.
- [x] `npm test` and `npm run build` pass. `npm run lint` still fails on pre-existing errors in files unrelated to Objective 5 (`scripts/*`, `test-queries.js`, `db-audit.tmp.cjs`, `issues/page.tsx`, `DbDownNotifier.tsx`, `IssuanceDialog.tsx`, `use-cached-action.ts`); no Objective 5 file reports a lint error.

---

## 8. Definition of done

Objective 5 can be marked **Fully met** when:

- Replacement/disposal, idle-asset reassignment, and issuance-history-driven PPMP quantity suggestions are implemented in both portals.
- Each recommendation is auditable: it states the rule, the numbers, and the linked record.
- PPMP planning can explain and compare consumption-based quantities against the uploaded-workbook projections.
- Replenishment advice includes suggested order quantities and remains consistent with the existing threshold/request workflow.
- Both dashboards expose a recommendation-count card linking to the new page.
- Documentation and the objectives assessment reflect the new capability.
