# Scope and Limitations — Achieved? (Implementation Verification)

**Project:** Integrated Web-Based Property and Supply Management System (PGSO-PSMS)
**Scope reference:** Section 1.5 — Scope and Limitations
**Verification basis:** Actual source code in this repository (`src/`, `prisma/schema.prisma`), not the proposal wording
**Verification date:** October 21, 2026

---

## 1. Purpose of this document

This document answers one question for each bullet in Section 1.5:

> **Is this capability actually built in the system, and how does it work?**

Each bullet is marked:

| Mark | Meaning |
| --- | --- |
| **Achieved** | Fully implemented and usable in the current codebase. |
| **Achieved — with a narrower meaning** | Built, but the wording of the scope is broader than what exists. The document states the exact boundary. |
| **Partially achieved** | The core idea exists, but one or more named sub-features are missing. |
| **Not achieved** | No implementation found. |

This is a code-level audit, not a demo walkthrough. Where a claim is only true in a limited form, the gap is named explicitly so the scope statement can be corrected instead of defended.

---

## 2. Summary verdict

| # | Scope claim | Verdict |
| --- | --- | --- |
| 1 | System starts once procured items are delivered and received | **Achieved** |
| 2 | Manages delivery receiving, inspection, inventory recording, asset assignment, repair monitoring, document processing | **Achieved** (RIS is handled as an electronic request, not a generated RIS form) |
| 3 | Operational monitoring: transaction progress, document status (pending/approved/released), workflow steps, delays | **Partially achieved** — progress and workflow exist; document approval status and delay analytics do not |
| 4 | Asset assignment, condition, location, maintenance history, responsible personnel | **Achieved** |
| 5 | Employees view assigned/archived assets, request transfers, request new assets/supplies, monitor status | **Achieved — with a narrower meaning** — assigned assets and requests exist; there is no archived-assets view |
| 6 | QR codes for identification, tracking, inventory checking, monitoring | **Achieved — with a narrower meaning** — QR lookup works; QR does not run a physical stock-count session |
| 7 | Upload/store asset images and RIS, AIR, PAR, ICS documents | **Achieved — with a narrower meaning** — AIR/PAR/ICS are generated and attachable; RIS is not a generated form |
| 8 | Descriptive analytics: inventory status, low stock, delayed transactions, workflow status, repairs, asset conditions, monthly/quarterly issuance | **Achieved — with a narrower meaning** — everything except **delayed-transaction** analytics |
| 9 | Prescriptive analytics: replenish low stock, repair/dispose damaged assets, reassign underutilized assets, suggest quarterly PPMP quantities | **Partially achieved** — low-stock replenishment and PPMP quantity/cost advice exist; repair/dispose and reassignment advice do not |
| 10 | Centralized encoding and updating of existing and new assets | **Achieved** |
| 11 | Existing-asset encoding from PAR/ICS/AIR/Excel with required-field validation, property-number uniqueness, format validation, verification, and a unique QR code | **Achieved — with a narrower meaning** — validation and uniqueness are real; the QR is derived from the unique asset ID, not stored as a separate generated property number |

**Score:** 5 Achieved, 4 Achieved with a narrower meaning, 2 Partially achieved, 0 Not achieved.
Nothing in the list is completely absent, but two bullets overstate what the system does.

---

## 3. Detailed evaluation

### 3.1 The system starts once procured items are delivered and received

**Verdict: Achieved.**

The first transactional object in the system is a **Delivery**. Personnel log a delivery with supplier, PO reference, expected and actual delivery dates, delivery kind, and line items, and record who received it.

Evidence:
- `prisma/schema.prisma` — `Delivery`, `DeliveryItem` models (supplier, PO reference, `received_by`, `date_delivered`, `inspection_status`).
- `src/app/personnel/deliveries/page.tsx`, `log-delivery-modal.tsx`, `actions.ts`.
- Deliveries appear on the personnel dashboard and in the Super Admin transaction oversight page.

There is no purchasing or procurement module before delivery, which matches the stated boundary. The system does not encode the PO process, budget, or bidding — it begins at receipt.

---

### 3.2 Delivery receiving, inspection, inventory recording, asset assignment, repair monitoring, document processing

**Verdict: Achieved.**

The operational chain exists end to end:

| Stage | Where it lives | What actually happens |
| --- | --- | --- |
| Receiving | `src/app/personnel/deliveries/` | Log delivery, supplier, PO, items, quantities, unit costs |
| Inspection | `src/app/personnel/inspections/`, `src/lib/inspection-rules.ts` | Passed / partial / failed results, per-item actual quantities, remarks, documentary photos |
| Inventory recording | `src/lib/stock.ts` | Passed or partial inspections stock received quantities into `inventory`, with a high-water mark (`stocked_qty`) so re-inspection cannot double-count |
| Asset assignment | `src/app/personnel/issuances/`, `src/lib/issuance-rules.ts` | PAR vs ICS is chosen automatically at the ₱50,000 threshold; assignment writes `assigned_to` / `end_user` |
| Repair monitoring | `src/app/personnel/repairs/` | Tickets with reporter, date, description, technician, cost, and pending / in-progress / completed status |
| Document processing | `src/app/personnel/documents/`, `src/app/api/personnel/...` | Delivery receipt, inspection receipt/AIR, IAR, PAR, ICS are viewable and exportable to Excel |

Evidence:
- `src/lib/issuance-rules.ts` lines 15–24: `ISSUANCE_THRESHOLD = 50_000`, `> ₱50,000 → PAR`, otherwise `ICS`.
- `src/lib/stock.ts` lines 21–165: transactional stocking with idempotent remainder handling.
- `src/app/api/personnel/inspections/[id]/air-xlsx/route.ts` and `par-xlsx` / `ics-xlsx` routes: server-generated Excel exports.

**Boundary to state honestly:** RIS is *not* generated as a standalone form. A supply requisition is represented by the electronic **Request** workflow (`request_type: stock_replenishment`), and the accountability forms actually produced by the system are **AIR/IAR, PAR, and ICS**. If the scope requires a printable RIS, it is not implemented as a document type.

---

### 3.3 Operational monitoring: transaction progress, document status, workflow steps, delays

**Verdict: Partially achieved.**

What exists:
- **Transaction progress:** deliveries → inspections → stock/asset → issuance → repair, each with its own status.
- **Workflow steps:** requests move through an enforced state machine: `pending → approved → completed`, with `rejected` as a terminal branch. Invalid transitions are refused server-side.
- **Operational counters:** pending inspections, pending requests, open repairs, low/out-of-stock counts on the personnel dashboard; status distributions on the Super Admin dashboard.

Evidence:
- `src/app/personnel/requests/request-types.ts` lines 7–13: `pending`, `approved`, `rejected`, `completed`.
- `src/app/personnel/requests/actions.ts` lines ~1005–1090: `ALLOWED_TRANSITIONS` and server-side refusal of illegal moves.
- `src/app/personnel/dashboard/page.tsx` lines ~180–223: pending inspection/request/repair/stock cards.
- `src/app/super-admin/dashboard/analytics.ts`: request, repair, asset, stock, issuance, and document distributions.

What does **not** exist:
- **Document status workflow (pending / approved / released).** The `Document` model has a `status` column defaulting to `pending`, but there is no UI or server action that moves a document through approved/released, and the document hub counts do not group by document status. Status tracking is real for **requests**, **deliveries/inspections**, and **repairs** — not for documents.
- **Delay monitoring.** There is no aging metric, SLA timer, overdue flag, or "delayed transactions" report. The dashboard shows *how many* items are pending, not *how long* they have been pending. Searches for delay/overdue/aging logic return no business implementation.

**Recommended correction:** Say the system tracks **workflow status and pending work queues**, and claim document status/delay analytics only if they are added.

---

### 3.4 Asset accountability: assignment, condition, location, maintenance history, responsible personnel

**Verdict: Achieved.**

The `Asset` model stores `assigned_to`, `end_user`, `condition`, `location`, and `status`, and the asset detail page composes an accountability history from issuances, repair tickets, and requests.

Evidence:
- `prisma/schema.prisma` — `Asset` fields `condition`, `location`, `assigned_to`, `end_user`, `status`, `date_acquired`, `date_received`, `unit_cost`, `total_cost`.
- `src/app/personnel/assets/[id]/asset-history.tsx`: history section combining issuance documents (PAR/ICS), repairs, and requests.
- `src/app/personnel/assets/[id]/AssetDetailEditor.tsx`: editable condition, location, status; status options `available`, `in use`, `maintenance`, `retired`.
- `src/lib/audit.ts` usage in asset create/update: before/after audit entries with actor and timestamp.

This bullet is fully supported by the schema and UI.

---

### 3.5 Employee self-service: assigned/archived assets, transfer requests, new asset/supply requests, status monitoring

**Verdict: Achieved — with a narrower meaning.**

What exists:
- **Assigned assets:** `getMyAssets` returns assets and stock lots currently assigned to the signed-in employee.
- **Request types:** `transfer`, `new_assignment`, `repair`, `stock_replenishment`.
- **Status monitoring:** the employee sees their own requests plus transfers addressed to them, with live status.
- **Ownership guard:** an employee can only transfer or report repair for an item currently assigned to them.

Evidence:
- `src/app/employee/assets/page.tsx` lines 45–120 and 160–210.
- `src/app/employee/requests/request-form.tsx` lines 20, 69–139.
- `src/app/employee/actions.ts` lines 1006–1045: server-side enforcement that transfer/repair targets are held by the requester.
- `src/app/personnel/requests/actions.ts` lines ~1044–1213: approval path and automatic repair-ticket creation on approved repair requests.

What does **not** exist:
- **Archived-assets view.** Employees cannot browse previously held, retired, or returned assets. There is a `retired` status in the asset administration side, but no employee-facing archive. The claim "view assigned and archived assets" should be reduced to "view currently assigned assets."

---

### 3.6 QR codes for identification, tracking, inventory checking, monitoring

**Verdict: Achieved — with a narrower meaning.**

What exists:
- Every asset and stock lot has a QR tag that encodes its **detail-page URL**, generated server-side as an SVG data URL.
- A scanner page supports camera scanning, image upload, and pasted code. It is available both publicly (`/scan`) and to signed-in personnel (`/personnel/scan`).
- Request completion and issuance also produce QR payloads for verification.
- Asset and stock detail pages expose the QR image.

Evidence:
- `src/lib/qrcode.ts`: `assetPageUrl`, `stockPageUrl`, `generateAssetQrDataUrl`, `generateStockQrDataUrl`; the comment at lines 15–20 explains the URL-based design (short, never stale, unlike embedding data).
- `src/app/personnel/assets/actions.ts` lines 335, 378, 923–924: QR data URLs attached to asset/stock detail rows.
- `src/components/QrScanner.tsx`; `src/app/scan/page.tsx`; `src/app/personnel/scan/page.tsx`; `src/app/personnel/requests/actions.ts` line 1355.

**Boundary:** "Inventory checking" here means **scan-to-lookup** (open the record, verify identity and assignment). There is no stock-count/stocktake session, no scan-to-count reconciliation, and no offline scan queue. State it as identification and lookup, not as a physical inventory-counting tool.

---

### 3.7 Upload/store asset images and RIS, AIR, PAR, ICS documents

**Verdict: Achieved — with a narrower meaning.**

What exists:
- **Asset images and inspection photos:** uploaded to a Supabase Storage bucket and stored as public URLs; inspection documentary photos are shown with admin thumbnails.
- **AIR/IAR:** generated from inspection data and exportable to Excel; attachments are supported.
- **PAR and ICS:** generated from issuance records, with downloadable Excel versions.
- **Attachments:** issuance and IAR attachment components upload scans to the shared `scan` bucket.

Evidence:
- `src/components/personnel/IarAttach.tsx`, `IssuanceAttach.tsx`: `supabase.storage.from(BUCKET).upload(...)`.
- `src/app/personnel/inspections/[id]/inspection-form.tsx` lines ~481–509: photo upload and public URL retrieval.
- `src/app/api/personnel/inspections/[id]/air-xlsx/route.ts`, `src/app/api/personnel/issuances/[id]/par-xlsx/route.ts`, `ics-xlsx/route.ts`.
- `prisma/schema.prisma` — `Inspection.iar_image_url`, `IssuanceRecord.image_url`, `IarRecord.iar_image_url`.

**Boundary:** RIS is not a generated or stored document type. The physical RIS process is represented by requests and issuance records; there is no RIS template, RIS number series, or RIS export. The `Document` table exists but is barely populated in current flows (used mainly for inspection photos), so "document storage" is implemented through record-level attachment URLs rather than a general document-management vault.

---

### 3.8 Descriptive analytics: inventory, low stock, delayed transactions, workflow, repairs, conditions, monthly/quarterly issuance

**Verdict: Achieved — with a narrower meaning.**

What exists:
- **Inventory status and low stock:** reorder thresholds drive `out`, `critical`, `low`, `ok`, and `no threshold` classifications, plus counts and a stock-health gauge.
- **Workflow status:** request, repair, asset, and document distributions.
- **Repairs:** status mix, technician assignment, and throughput insights.
- **Asset conditions/status:** available, in use, maintenance, retired distribution.
- **Issuance volume:** the last six months of PAR/ICS issuances, plus issuance mix by type.
- **Quarterly view:** the PPMP analytics pipeline computes a quarterly calendar and per-quarter figures.

Evidence:
- `src/app/personnel/dashboard/actions.ts` lines 92–137: SQL counts for low/out-of-stock.
- `src/app/super-admin/dashboard/analytics.ts` lines 97–277: grouped queries, monthly issuance buckets, insight text.
- `src/app/super-admin/dashboard/analytics-charts.tsx` line 359: stock health gauge.
- `src/app/personnel/ppmp/analytics/quarterly.ts` and `results-view.tsx`.

**Gap:** **Delayed transactions** are not computed anywhere. There is no elapsed-time, SLA, or aging analysis. The scope sentence should drop "delayed transactions" or the system should add an aging report.

---

### 3.9 Prescriptive analytics: replenish, repair/dispose, reassign, quarterly PPMP quantities

**Verdict: Partially achieved.**

What exists:
1. **Low-stock replenishment advice.** For each stock line, the system derives a level and gives an explicit recommendation:
   - out of stock → "Replenish now"
   - critically low → "Restock soon"
   - low → "Plan reorder"
   - no threshold → "Set threshold"
   - healthy → "No action"
2. **PPMP decision rules.** A deterministic rule engine evaluates historical quantities, averages, cost jumps, anomalies, and forecasts, and emits advisory recommendations with a calculation trace and evidence references:
   - `QTY_MULTI_YR`, `QTY_ABOVE_AVG` — quantity justification
   - `STOCK_COVER` — current stock versus average annual use before approving more
   - `COST_JUMP` — cost basis review
   - `ANOMALY_REVIEW`, `FORECAST_CONFIRM` — anomaly and low-confidence forecast review
3. **Quarterly planning.** The PPMP planning view ranks items by planned total for budget attention and supports quarterly schedules.

Evidence:
- `src/app/super-admin/inventory/page.tsx` lines 51–95: `recommendationFor` with the five outcomes above.
- `src/app/super-admin/inventory/actions.ts` lines 12–71: Super Admin sets the reorder threshold that drives the advice.
- `src/lib/ppmp/analytics/rules.ts` lines 12–92: the full deterministic recommendation engine.
- `src/lib/ppmp/analytics/index.ts` lines 24–124: pipeline wiring, including the inventory snapshot passed into `buildRecommendations`.
- `src/app/personnel/ppmp/planning/planning-view.tsx` lines 70–177: "Most recommended for budget planning" ranking.

What does **not** exist:
- **Repair-or-dispose recommendations for damaged assets.** Repairs are tracked, and the dashboard's free-text insight can mention disposal for retired assets, but there is no rule that evaluates repair history/cost against asset value to recommend repair vs. disposal.
- **Reassignment of underutilized assets.** No utilization computation (idle days, assignment duration, usage frequency) and therefore no reassignment recommendation.
- Recommendations are **advisory only** — this is deliberate and should be presented as a strength: the system never approves, rejects, or accuses automatically.

**Recommended correction:** Claim prescriptive support for **stock replenishment and PPMP quantity/cost planning**, and list repair/disposal and underutilization as future work.

---

### 3.10 Centralized encoding and updating of existing and newly acquired assets

**Verdict: Achieved.**

Personnel can create assets manually or import them from Excel, and edit them afterwards. The asset, stock, catalog, unit, and department data are centralized in PostgreSQL through Prisma.

Evidence:
- `src/app/personnel/assets/actions.ts`:
  - `createAsset` (manual encoding) — lines ~1422–1560
  - `updateAsset` — lines ~387–454
  - `importAssetsFromExcel` — lines ~1575–2030
- `prisma/schema.prisma` — `Asset`, `InventoryItem`, `AccountCatalog`, `Unit`, `Department`.
- Master data enforcement: account codes and units are validated against the catalog (`findCatalogEntry`, `resolveUnitName`); unknown values are rejected with an actionable message.

---

### 3.11 Existing-asset encoding from PAR/ICS/AIR and Excel, with validation, uniqueness, verification, and a unique QR

**Verdict: Achieved — with a narrower meaning.**

The described mechanism is real, with these specifics:

| Claimed behavior | Implementation |
| --- | --- |
| Authorized PGSO personnel encode from reference records | Personnel-only server actions guarded by `requirePersonnelScope` |
| Manual encoding of asset details | `createAsset` |
| Required-field validation | ACCOUNT CODE and ARTICLE are required; quantities, cylinders, and costs must be non-negative and numeric; dates parsed |
| Property-number uniqueness | Duplicate `property_number`/`account_code` and duplicate `qr_code` are rejected; Excel import reports duplicates within the file and against the database |
| Data-format validation | Numeric, integer, decimal, and date validation; catalog/unit must exist in Master Data |
| Record verification | Server-side validation messages name the failing row and the corrective action |
| Committed to the centralized database | Prisma `asset.create` / bulk create |
| Assigned a unique QR code | A QR tag is generated from the asset's unique UUID, encoding `/personnel/assets/{id}`; the `qr_code` field can also hold an encoded property number |

Evidence:
- `src/app/personnel/assets/actions.ts` lines 1441–1507 (required fields, numeric checks, duplicate checks), 1509–1548 (create), 1919–1970 (Excel duplicate handling).
- `src/lib/qrcode.ts` lines 21–35 (QR derived from the unique asset ID).
- `prisma/schema.prisma` — `Asset.property_number @unique`, `Asset.qr_code @unique`.

**Boundary:** The QR code is **derived** from the asset's unique ID rather than being a separately generated and persisted serial. If the scope means "each asset gets a unique scannable tag," that is true. If it means "the system generates and stores a distinct QR serial for every record at commit time," that is not exactly how it works — the `qr_code` column is optional and the displayed tag is computed from the record ID.

Also note: the Excel importer maps columns by fixed template headers and deliberately rejects renamed headers; it does not read the PAR/ICS/AIR PDFs or scans themselves. Those documents are human references, not machine-parsed inputs. The scope sentence saying personnel "access the uploaded PAR, ICS, AIR, and Excel records as reference" is accurate; automatic extraction from PAR/ICS/AIR is not implemented.

---

## 4. What the system genuinely does well (defensible claims)

1. **End-to-end chain of custody:** delivery → inspection → stocking → issuance → assignment → repair, with audit logs and an enforced status machine.
2. **Rules, not guesses:** PAR/ICS selection, exemption checks, request transitions, duplicate checks, and recommendation thresholds are deterministic and testable.
3. **Server-side authorization and scoping:** personnel actions are role-guarded; employees only see their own and incoming-transfer records; Super Admin is read-only for operations.
4. **Document generation:** AIR/IAR, PAR, ICS, and delivery/repair receipts are produced from live data and exportable.
5. **Analytics with explanations:** PPMP recommendations carry a rule ID, calculation trace, and evidence references, which is stronger than a bare score.
6. **Performance and data integrity:** idempotency keys, cache invalidation, server-side paging, and transactional stocking.

---

## 5. Gaps to disclose in the Limitations section

These are the honest limitations implied by the code:

1. **No procurement module.** The system starts at delivery, as stated. Purchasing, bidding, and budget approval happen outside it.
2. **No document approval lifecycle.** Document status (pending/approved/released) is not an active workflow; only requests, inspections, and repairs have enforced statuses.
3. **No delay or SLA analytics.** Pending counts exist; elapsed-time/aging does not.
4. **No archived-assets view for employees.** Only currently assigned assets are shown.
5. **No RIS generation.** Requisitions are electronic requests; RIS is not a generated form.
6. **No repair-vs-disposal or underutilization recommendations.** Prescriptive analytics covers replenishment and PPMP planning only.
7. **QR is lookup, not stocktaking.** No physical count sessions or offline scanning.
8. **No automatic extraction from PAR/ICS/AIR scans.** Encoding remains manual or Excel-template based.
9. **Recommendations are advisory.** They support, but never replace, personnel decisions.
10. **Connectivity dependency.** The system is a hosted web application backed by PostgreSQL and Supabase Storage; offline operation is not supported.
11. **Data-quality dependency.** PPMP analytics degrade when quantity fields are budget-only, low-confidence, or missing a fiscal year; the system surfaces these as explicit limitations in the report rather than silently guessing.

---

## 6. Suggested revised wording for Section 1.5

If the goal is for the scope statement to match the built system exactly, use this version:

> The project focuses on the development and implementation of an integrated web-based Property and Supply Management System (PGSO-PSMS) for the Provincial General Services Office (PGSO).
>
> The system starts once procured items are delivered to and received by authorized PGSO personnel. It manages delivery receiving, inspection, inventory recording, asset assignment, repair monitoring, and the generation and storage of accountability documents such as AIR/IAR, PAR, and ICS, together with uploaded asset images and scanned attachments.
>
> The system supports operational monitoring through enforced workflow statuses for requests, inspections, and repairs, pending-work queues, and role-scoped dashboards. It tracks asset assignment, condition, location, maintenance history, and responsible personnel to strengthen accountability.
>
> End users can view their currently assigned assets, request asset transfers, request new assets or supplies, report repairs, and monitor request status. QR codes provide identification, lookup, and verification of assets and stock lots.
>
> The system applies descriptive analytics through dashboards and reports on inventory status, low-stock supplies, workflow status, repair records, asset conditions, and monthly and quarterly issuance. It applies prescriptive analytics through threshold-based replenishment recommendations for low-stock supplies and through deterministic, advisory PPMP rules that review historical quantities, costs, anomalies, forecasts, and current stock before quarterly plan preparation.
>
> The system supports centralized encoding and updating of existing and newly acquired assets. Encoding begins with authorized personnel referencing uploaded PAR, ICS, AIR, and Excel records; asset details are then encoded manually or through the Excel template, with required-field validation, property-number uniqueness checks, format validation, and verification before the record is committed to the centralized database and a unique QR tag is generated from the asset's record identifier.

This version keeps every strength and removes the three claims that the code does not support: document approval status, delay monitoring, and automatic repair/disposal/reassignment advice.

---

## 7. Evidence index

| Area | Primary files |
| --- | --- |
| Data model | `prisma/schema.prisma` |
| Deliveries | `src/app/personnel/deliveries/*` |
| Inspections / AIR | `src/app/personnel/inspections/*`, `src/lib/inspection-rules.ts`, `src/lib/air-excel.ts` |
| Stocking | `src/lib/stock.ts` |
| Inventory / thresholds | `src/app/personnel/inventory/*`, `src/app/super-admin/inventory/*` |
| Assets / encoding / import | `src/app/personnel/assets/*`, `src/app/personnel/assets/actions.ts` |
| Issuance / PAR / ICS | `src/app/personnel/issuances/*`, `src/lib/issuance-rules.ts`, `src/lib/par-excel.ts`, `src/lib/ics-excel.ts` |
| Requests / workflow | `src/app/personnel/requests/*`, `src/app/employee/requests/*` |
| Employee self-service | `src/app/employee/assets/*`, `src/app/employee/actions.ts` |
| Repairs | `src/app/personnel/repairs/*` |
| Documents hub | `src/app/personnel/documents/*`, `src/app/super-admin/documents/*` |
| QR | `src/lib/qrcode.ts`, `src/components/QrScanner.tsx`, `src/app/scan/*`, `src/app/personnel/scan/*` |
| Descriptive analytics | `src/app/personnel/dashboard/*`, `src/app/super-admin/dashboard/*` |
| Prescriptive / PPMP | `src/lib/ppmp/analytics/*`, `src/app/personnel/ppmp/analytics/*`, `src/app/personnel/ppmp/planning/*` |
| Authorization / audit | `src/lib/personnel-scope.ts`, `src/lib/auth-guard.ts`, `src/lib/audit.ts` |
| Tests | `src/__tests__/*` (including `ppmp-analytics.test.ts`, `optimistic-mutations.test.ts`, `api-guards.test.ts`) |

---

## 8. Bottom line

The scope is **substantially achieved**. Ten of the eleven bullets are implemented in a defensible form, and the two weakest bullets — operational delay/document-status monitoring and the repair/dispose/reassign half of prescriptive analytics — are partial rather than missing entirely.

For a panel or thesis defense, the strongest position is to present the verified capabilities precisely, disclose the four real gaps (document approval status, delay analytics, archived-assets view, repair/disposal/reassignment advice), and explain that recommendations are intentionally advisory. That is more credible than claiming features the code does not contain.
