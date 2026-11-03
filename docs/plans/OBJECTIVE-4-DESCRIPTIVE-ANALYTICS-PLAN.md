# Objective 4 — Descriptive Analytics Implementation Plan

**Objective:** Apply descriptive analytics through dashboards and reports (inventory, low stock, delayed transactions, workflow, repairs, asset conditions, quarterly issuance).

**Current status:** Implemented — Objective 4 is fully met.

> **Delivery summary:** `/personnel/reports` and `/super-admin/reports` expose aging/delays, quarterly issuance, and asset conditions; both dashboards carry the new cards/panels; XLSX exports are available under `/api/{personnel,super-admin}/reports/*`; report caches are invalidated by delivery, inspection, asset, issuance, request, and repair writes; `src/__tests__/reporting.test.ts` covers the pure rules; and `OBJECTIVES-ASSESSMENT.md`/`.pdf` now record Objective 4 as fully met.

**Goal:** Fully meet Objective 4 by closing the three remaining gaps:

1. Delayed / aging transactions
2. Quarterly supply issuance report
3. Asset-condition breakdown

---

## 1. Gap → implementation map

| Requirement | Current state | What we add |
| --- | --- | --- |
| Delayed / aging transactions | Only queue counts ("pending") | Aging buckets + SLA/overdue thresholds + filterable aging list + dashboard card + XLSX export |
| Quarterly supply issuance | Only 6-month monthly trend | Quarterly report with PAR/ICS split, quantity, amount, by item/office/employee + chart + export |
| Asset conditions | Asset **status** charted; condition only filterable | Condition distribution chart + condition table + dashboard card |

Existing features already cover inventory levels, low stock, workflow counts, repairs, and general dashboards. No new database tables are required; all necessary data already exists.

---

## 2. Proposed rules (defaults)

### 2.1 Aging

Buckets align with the assessment's recommended ranges:

- `0–3` days
- `4–7` days
- `8–14` days
- `15+` days

Age source per workflow:

| Workflow | Records considered open | Age reference |
| --- | --- | --- |
| Deliveries | `inspection_status = 'pending'` | `created_at` |
| Requests | `status = 'pending'` | `date_requested` |
| Repairs | `status IN ('pending', 'in_progress')` | `created_at` |

Overdue threshold (final):

- **7 days** for all workflows — inspections, requests, and repairs.
- A record is considered **delayed** once its age exceeds 7 days.
- The UI will label the threshold explicitly so the number is auditable.

Additional metric:

- **Overdue expected arrivals** — `expected_arrival_date < today` and delivery is not complete.

### 2.2 Quarterly issuance

- Calendar quarters (Q1 = Jan–Mar), with a year selector and the last 8 quarters available. Calendar quarters are final; no fiscal-year offset will be applied.
- Issue date: `COALESCE(doc_date, created_at)`.
- Summary per quarter:
  - Total documents
  - PAR count
  - ICS count
  - Total quantity
  - Total amount
- Breakdowns:
  - Top items (from `issuance_data.lines`, falling back to row columns)
  - By office / department
  - By employee
- Multi-line consolidated documents count once in the summary and per line in the item breakdown. This distinction will be labelled in the UI.

### 2.3 Asset conditions

- Normalize `assets.condition` (trim + lowercase for grouping).
- Group null / blank values as **Unspecified**.
- Show:
  - Condition counts
  - Percentages
  - Serviceable vs unserviceable headline
  - Optional condition × status matrix
- Limitation to state in the UI/docs: a condition *trend* is not possible without condition history; distribution is the supported report.

---

## 3. Implementation phases

### Phase 1 — Shared reporting data layer

New files:

- `src/lib/reporting.ts` — pure, testable helpers:
  - `agingBucket(days)`
  - `isOverdue(module, days)`
  - `quarterStart()` / `quarterLabel()`
  - `normalizeCondition()`
- `src/lib/reporting-queries.ts` — server-only scoped queries (scope resolved internally via `getPersonnelScope`):
  - `getAgingReport({ module, bucket, page })`
  - `getQuarterlyIssuanceReport({ year })`
  - `getAssetConditionReport()`

Query design:

- One aggregate SQL query for aging buckets per module.
- One server-paged query for the filterable delayed list.
- One to three grouped queries for quarterly summary, item, office, and employee breakdowns.
- One grouped query for condition distribution.
- Reuse `withScopedCache` (60s TTL) and `parsePage` / `PAGE_SIZE`.

Scope rules:

| Role | Scope |
| --- | --- |
| PGSO Personnel | Own records only — deliveries `received_by`, requests `recipient_id`, repairs `created_by`, issuances `created_by` |
| Super Admin | All records |
| Asset registry / condition breakdown | Shared global pool, consistent with current asset scope |

### Phase 2 — Reports page (both portals)

New shared UI under `src/components/reporting/` and routes:

- `/personnel/reports`
- `/super-admin/reports`

Sections / tabs:

1. **Aging & delays**
   - Module filter
   - Bucket filter
   - Summary tiles (total open, overdue, oldest age)
   - Paged table with links to the underlying record
2. **Quarterly issuance**
   - Year selector
   - PAR/ICS stacked chart
   - Summary table
   - Top items / by office / by employee tables
3. **Asset conditions**
   - Donut chart
   - Condition table
   - Serviceable share

Exports:

- Official **XLSX** workbooks for each report, generated server-side with ExcelJS and downloaded through route handlers — the same pattern as the existing PAR/ICS exports.
- Planned API routes (implemented as one dynamic route per portal):
  - `/api/personnel/reports/aging`
  - `/api/personnel/reports/quarterly-issuance`
  - `/api/personnel/reports/asset-conditions`
  - `/api/super-admin/reports/aging`
  - `/api/super-admin/reports/quarterly-issuance`
  - `/api/super-admin/reports/asset-conditions`
- Exports must enforce the same session, role, and personnel-scope checks as the report pages.
- Include report period, generation timestamp, applied filters, and threshold assumptions in each workbook header.
- Print / Save-as-PDF styling for the report pages remains available as a convenience.

Navigation:

- Add a **Reports** link to the Personnel and Super Admin navbars.

### Phase 3 — Dashboard integration

#### Super Admin

Extend `src/app/super-admin/dashboard/analytics.ts` with:

- `agingByModule`
- `quarterlyIssuance`
- `assetConditions`

Add three cards in `analytics-charts.tsx`:

- "Delayed & aging transactions"
- "Quarterly issuance"
- "Asset conditions"

Each card links to `/super-admin/reports`.

#### Personnel

- Add a compact **Aging** panel showing delayed counts and oldest items.
- Add an **Asset conditions** summary card.
- Add a "View reports" link; quarterly detail lives on `/personnel/reports`.

### Phase 4 — Cache invalidation and indexes

Cache invalidation:

- Report readers share the `personnel:reports:*` namespace (keys are per-user/per-role via `withScopedCache`) and the client keys `pgso:v2:*:reports-*`. They are busted by delivery, inspection, asset, issuance, request, and repair writes in both `cache-invalidation.ts` and the `bustPersonnelScopes` / `bustSuperAdminScopes` maps.

Optional index migration (`34_reporting_indexes`):

- `deliveries (inspection_status, created_at)`
- `repairs (status, created_at)`
- `assets (condition)`
- `requests (status, date_requested)` — already exists

### Phase 5 — Tests, docs, assessment

- Add `src/__tests__/reporting.test.ts`:
  - Aging bucket boundaries
  - Quarter label/start helpers
  - Condition normalization
- Update `README.md`:
  - New Reports section
  - Route map
  - Feature map
- Update `AGENTS.md`:
  - Add reporting module to "Where to look"
  - Document report caching/invalidation conventions
- Update `OBJECTIVES-ASSESSMENT.md`:
  - Change Objective 4 to **Fully met**
  - Replace the gap notes with evidence
- Regenerate `OBJECTIVES-ASSESSMENT.pdf` from the updated Markdown and commit it.

---

## 4. Acceptance criteria

- [x] Aging buckets reconcile with pending queues: bucket totals equal pending delivery/request/repair counts.
- [x] Overdue counts respect the stated thresholds and timezone.
- [x] Quarterly totals reconcile with `issuance_records` count and `SUM(total_amount)` for the period.
- [x] Item/office/employee breakdowns correctly cover consolidated multi-line issuances.
- [x] Condition counts sum to total assets; unknown values appear as Unspecified.
- [x] Personnel accounts see only their own aging/issuance data; Super Admin sees all.
- [x] XLSX exports open correctly in Excel, match the on-screen report, and include period/filter/threshold metadata.
- [x] Report pages and XLSX routes both enforce role and personnel-scope checks.
- [x] Print layout is readable.
- [x] Reports update after relevant mutations (cache invalidation works).
- [x] `npx tsc --noEmit`, `npm test`, and `npm run build` pass; the new reporting files add no lint errors (the repo still carries pre-existing lint errors elsewhere).

---

## 5. Final decisions

| Decision | Choice |
| --- | --- |
| Overdue threshold | **7 days uniformly** for inspections, requests, and repairs |
| Quarter basis | **Calendar quarters** (Q1 = Jan–Mar), no fiscal-year offset |
| Export format | **Official XLSX workbooks** using the existing PAR/ICS ExcelJS + route-handler pattern; print remains a convenience |
| Assessment artifact | **Yes** — update `OBJECTIVES-ASSESSMENT.md` to "Fully met" and regenerate `OBJECTIVES-ASSESSMENT.pdf` after implementation |

> PDF regeneration is required, not optional. If no PDF toolchain is present in the repo, export the updated Markdown through the same method used to produce the existing PDF and commit the refreshed file.

---

## 6. Definition of done

Objective 4 can be marked **Fully met** when:

- The Super Admin and Personnel portals both expose delayed/aging analytics, quarterly issuance reporting, and asset-condition analytics.
- The new `/reports` pages provide filterable, exportable detail beyond the dashboard summaries.
- The metrics are scoped correctly, cached correctly, and reconciled against source records.
- The assessment document and project documentation reflect the new capability.
