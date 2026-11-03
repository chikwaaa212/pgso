# System Objectives — Where to See Them and How They Work

This guide maps the **six official system objectives** to the actual screens, menus, roles, and rules in PGSO-PSMS. Use it when you need to answer:

- *Where in the app can I see this objective being delivered?*
- *Which role does this?*
- *How does it work under the hood?*
- *What should I show a reviewer or panelist?*
- *What are the honest limits?*

> **The objectives as stated**
>
> 1. Digitize the receiving of delivered items, inspection, inventory recording, repair monitoring, and document processing of property and supplies.
> 2. Manage inventory and ensure asset accountability by monitoring asset assignment, location, condition, maintenance history, and responsible personnel.
> 3. Track repair and maintenance activities of assets by recording repair history, usability status, and damaged assets.
> 4. Apply descriptive analytics through dashboards and reports that show inventory status, available and low-stock supplies, delayed transactions, workflow status, repair records, asset conditions, and quarterly supply issuance for monitoring and evaluation to be used for decision making.
> 5. Implement prescriptive analytics to recommend replenishment action for low-stock items, replacement or disposal of any damaged assets, re-assignment of items not in use, and suggested quantities of supplies for annual or quarterly PPMP preparations based on inventory and supply issuance history.
> 6. Enhance the asset tracking and monitoring by using the QR code-based asset identification and scanning system.

Basis: source-code review of this repository as of **3 November 2026**. Routes, menu labels, and rules below match the implementation. The objective-by-objective verdict is in [`assessments/OBJECTIVES-ASSESSMENT.md`](assessments/OBJECTIVES-ASSESSMENT.md).

---

## 1. Quick navigation map

| # | Objective (short) | Personnel menu | Super Admin menu | Employee sees |
| --- | --- | --- | --- | --- |
| 1 | Receiving, inspection, inventory, repairs, documents | Operations → **Deliveries**, **Inspections**; Inventory → **Stock**, **Assets**; Records → **Documents**, **Repairs** | Same, under `/super-admin/*` | Own assets and documents only |
| 2 | Inventory and asset accountability | Inventory → **Assets**, **Stock**; Records → **PAR / ICS**, **Documents**, **Issues** | Same, plus **All Records** and **Transactions** | **My Assets** (assigned items, PAR/ICS) |
| 3 | Repair and maintenance tracking | Records → **Repairs**; asset detail → history | Same, under `/super-admin/repairs` | **My Requests** → repair request; **My Assets** |
| 4 | Descriptive analytics | **Dashboard**; Records → **Reports** | **Dashboard**; **Reports** | Personal dashboard only |
| 5 | Prescriptive analytics | Records → **Recommendations**; **PPMP** → Analytics / Planning | Same, plus **PPMP Files** | — |
| 6 | QR identification and scanning | Records → **QR Scanner**; Assets → **Show QR code** | Same, under `/super-admin/scan`; public `/scan` | Completed-request QR; public scanner |

**Portal entry points**

| Role | Sign-in lands on | Menu style |
| --- | --- | --- |
| `employee` | `/employee/dashboard` | Three direct links: Dashboard, My Assets, My Requests |
| `pgso_personnel` | `/personnel/dashboard` | Grouped: Operations, Inventory, Records |
| `super_admin` | `/super-admin/dashboard` | Grouped: Operations, Inventory, Records, Administration |

---

## 2. Roles in one table

| Capability | Super Admin | PGSO Personnel | Employee |
| --- | :---: | :---: | :---: |
| Approve accounts and assign roles | ✅ | — | — |
| Manage master data (titles, codes, departments, units) | ✅ | — | — |
| Log deliveries and record inspections | ✅ | ✅ | — |
| Generate/attach AIR/IAR; stock accepted items | ✅ | ✅ | — |
| Encode/import/edit assets and stock | ✅ | ✅ | — |
| Issue property and generate PAR/ICS | ✅ | ✅ | — |
| Approve/reject employee requests | ✅ | ✅ | — |
| Submit requests | — | ✅ (replenishment) | ✅ (transfer, new assignment, repair) |
| Create and manage repair tickets | ✅ | ✅ | Request only |
| View reports and recommendations | ✅ | ✅ | — |
| Use PPMP analytics/planning | ✅ | ✅ | — |
| Scan QR codes | ✅ | ✅ | Public read-only scanner |
| View all records | ✅ | Own records only | Own records only |

**Enforcement:** `middleware.ts` gates the portal and reloads role/status (60-second Redis cache, database fallback). Server actions re-check role and ownership. Ownership rules live in `src/lib/personnel-scope.ts`.

---

## 3. Objective 1 — Digitize receiving, inspection, inventory, repairs, and documents

### Where to see it

| What | Personnel | Super Admin | Employee |
| --- | --- | --- | --- |
| Log a delivery | **Operations → Deliveries** (`/personnel/deliveries`) | `/super-admin/deliveries` | — |
| Record an inspection | **Operations → Inspections** (`/personnel/inspections`) | `/super-admin/inspections` | — |
| See stock | **Inventory → Stock** (`/personnel/inventory`) | `/super-admin/inventory` | — |
| See assets | **Inventory → Assets** (`/personnel/assets`) | `/super-admin/assets` | **My Assets** (`/employee/assets`) |
| See generated documents | **Records → Documents** (`/personnel/documents`) | `/super-admin/documents` | Own documents under My Assets |
| See repairs | **Records → Repairs** (`/personnel/repairs`) | `/super-admin/repairs` | Request status under **My Requests** |

### How it works

```text
Deliveries → Inspections → AIR/IAR → Stocking → Documents / Assets / Repairs
```

1. **Delivery.** Personnel record supplier, PO reference, dates, kind (`stock` or `asset`), account title, and line items. Starting `inspection_status = pending`.
2. **Inspection.** The inspector enters the quantity received *this round*. The system converts it to a cumulative quantity and permits `passed` only when every item's cumulative quantity equals its PO quantity; otherwise the result is `partial`.
3. **AIR/IAR.** Generate the acceptance report from the inspection, or attach a prepared copy. Stocking is blocked without one.
4. **Stocking.** Passed/partial inspections with an AIR/IAR move only the not-yet-stocked remainder into inventory. `stocked_qty` is a high-water mark, so re-processing never double-counts.
5. **Documents.** The Documents hub aggregates the records that already exist — delivery receipt, inspection report, AIR/IAR, PAR, ICS, stock card, asset record, repair ticket. Viewed state is tracked per user.
6. **Repairs.** Tickets are created from an approved repair request or directly by personnel, then move through `pending → in_progress → completed`.

**Shared rules:** `src/lib/inspection-rules.ts` (pass gate and cumulative math), `src/lib/stock.ts` (idempotent stocking), `src/lib/issuance-rules.ts` (document type).

### What to show a reviewer

1. Log a delivery with two line items.
2. Inspect with a short quantity — **Passed** must be refused; choose **Partial**.
3. Show that stock did not move until an AIR/IAR exists.
4. Generate the AIR/IAR and re-run **Stock → Sync from inspections**.
5. Open **Documents** and show the delivery, inspection, AIR/IAR, and stock card in one place.

### Honest limit

"Document processing" means recording, generating, viewing, printing, and exporting. There is no electronic signature or multi-level document approval workflow. The `Document.status` column exists but is not an active lifecycle.

---

## 4. Objective 2 — Manage inventory and ensure asset accountability

### Where to see it

| What | Personnel | Super Admin | Employee |
| --- | --- | --- | --- |
| Asset registry | **Inventory → Assets** (`/personnel/assets`) | `/super-admin/assets` | **My Assets** |
| Asset detail, custody, history | Asset detail (`/personnel/assets/[id]`) | `/super-admin/assets/[id]` | Own asset view |
| Stock levels and values | **Inventory → Stock** (`/personnel/inventory`) | `/super-admin/inventory` | — |
| Issued items and recipients | **Records → Issues** (`/personnel/issues`) | `/super-admin/issues` | — |
| PAR/ICS documents | **Records → PAR / ICS** (`/personnel/issuances`) | `/super-admin/issuances` | Under **My Assets** |
| Accountability documents | **Records → Documents** | `/super-admin/documents` | Own documents |

### How it works

- Every asset record carries property number (QR), account code, article/description, category, status, condition, location, acquisition date, and unit cost.
- **Assignment** happens through issuance (direct or request approval). The asset moves from `available` to `in use`, and the employee becomes the responsible person.
- **Transfer** requests move custody from one employee to another after approval.
- **Per-asset history** combines requests, issuances, and repairs, so one screen answers "who held this, where is it, what happened to it?"
- **Data scope:** employees see only their own assigned items and documents; personnel see records they created or own; Super Admin sees everything.

**Key files:** `prisma/schema.prisma` (`Asset`, `InventoryItem`, `IssuanceRecord`), `src/lib/personnel-scope.ts`, `src/app/personnel/assets/actions.ts`, `src/app/personnel/issuances/actions.ts`.

### What to show a reviewer

1. Open an asset detail page: show status, condition, location, holder, and history.
2. Open **PAR / ICS** and show the consolidated document with line items and the stored snapshot.
3. Sign in as the employee and show that **My Assets** contains only their own items and PAR/ICS.

### Honest limit

Custody is tracked at the item/employee level. There is no separate "location history" table — location is a field on the asset plus the issuance snapshot.

---

## 5. Objective 3 — Track repair and maintenance activities

### Where to see it

| What | Personnel | Super Admin | Employee |
| --- | --- | --- | --- |
| Repair queue | **Records → Repairs** (`/personnel/repairs`) | `/super-admin/repairs` | — |
| Repair detail | `/personnel/repairs/[id]` | `/super-admin/repairs/[id]` | — |
| File a repair request | — | — | **My Requests** → Repair |
| Repair history on an asset | Asset detail → history | Same | Own asset history |

### How it works

```text
Employee repair request ──approved──▶ repair ticket (pending)
Personnel-created ticket ───────────▶ repair ticket (pending)
pending ──start──▶ in_progress  (technician + diagnosis required)
in_progress ──complete──▶ completed  (cost + resolution required)
completed ──reopen──▶ in_progress
```

- The ticket records the asset, issue, technician, diagnosis, cost, resolution, and receipt.
- Only the creator (or Super Admin) can edit a ticket.
- Asset status/condition is updated as appropriate; an asset under repair can be set to `maintenance`.
- Repair records feed the asset history and the analytics layer.

**Key files:** `src/app/personnel/repairs/page.tsx`, `src/app/personnel/repairs/actions.ts`, `src/app/personnel/repairs/[id]/page.tsx`.

### What to show a reviewer

1. Submit a repair request as an employee.
2. Approve it as personnel — a ticket appears.
3. Start the ticket (technician + diagnosis), then complete it (cost + resolution).
4. Reopen it and show the history trail.
5. Open the asset detail and point to the repair history.

### Honest limit

"Usability" is represented by the asset `status` plus a free-text `condition`, not a dedicated controlled usability field. This is the documented caveat in the objectives assessment.

---

## 6. Objective 4 — Apply descriptive analytics

### Where to see it

| What | Personnel | Super Admin |
| --- | --- | --- |
| Dashboard KPIs | **Dashboard** (`/personnel/dashboard`) | **Dashboard** (`/super-admin/dashboard`) |
| Aging and delayed transactions | **Records → Reports → Aging & delays** (`/personnel/reports`) | `/super-admin/reports` |
| Quarterly issuance | **Reports → Quarterly issuance** | Same |
| Asset conditions | **Reports → Asset conditions** | Same |
| Inventory and low stock | **Dashboard**, **Stock** | **Dashboard**, **Stock** |
| Workflow and repair status | **Dashboard** panels | **Dashboard** charts |
| Exports | Report tabs → XLSX download | Same |

### How it works

The Reports workspace has three tabs:

| Tab | What it shows |
| --- | --- |
| **Aging & delays** | Open inspections, requests, and repairs past the 7-day threshold, grouped by workflow and age bucket (0–3, 4–7, 8–14, 15+ days). |
| **Quarterly issuance** | PAR/ICS documents per calendar quarter, last 8 quarters, top items issued, and issuance by employee. |
| **Asset conditions** | Serviceable vs unserviceable vs unspecified, with a distribution chart and condition table. |

- Dashboards also surface stock health, inspection outcomes, request/repair/asset status distributions, monthly issuance trend, documents by type, and delayed transactions.
- Data is scoped by role, cached for 60 seconds, and the XLSX builders read the same query results as the page — so screen and export cannot disagree.
- Personnel dashboard includes **Aging & delays** and **Asset conditions** panels; Super Admin dashboard adds the full analytics chart grid.

**Key files:** `src/lib/reporting-queries.ts`, `src/lib/reporting.ts`, `src/lib/report-excel.ts`, `src/components/reporting/ReportsWorkspace.tsx`, `src/app/super-admin/dashboard/analytics.ts`.

### What to show a reviewer

1. Open **Reports → Aging & delays** and filter by workflow and age bucket.
2. Switch to **Quarterly issuance** and change the year.
3. Switch to **Asset conditions** and show the donut plus table.
4. Download the XLSX and show that it matches the screen.
5. Open the dashboard and point to the same metrics at a glance.

### Honest limit

Document approval status (pending/approved/released) is not an active workflow, so "document status analytics" is not claimed. Aging covers inspections, requests, and repairs.

---

## 7. Objective 5 — Implement prescriptive analytics

### Where to see it

| What | Personnel | Super Admin |
| --- | --- | --- |
| Recommendations workspace | **Records → Recommendations** (`/personnel/recommendations`) | `/super-admin/recommendations` |
| PPMP files | **Records → PPMP** (`/personnel/ppmp`) | **Records → PPMP Files** (`/super-admin/ppmp`) |
| PPMP analytics | `/personnel/ppmp/analytics` | `/super-admin/ppmp/analytics` |
| PPMP planning | `/personnel/ppmp/planning` | `/super-admin/ppmp/planning` |

### How it works

The **Recommendations** workspace has four advisory groups:

| Recommendation | Trigger | What it suggests |
| --- | --- | --- |
| **Replenishment** | Stock at or below its reorder threshold | Suggested order quantity based on stock levels and consumption. |
| **Replacement / disposal** | Damaged, unserviceable, or repair-heavy assets | Replace or dispose, with the evidence shown. |
| **Idle / reassignment** | Available assets older than 180 days (age-based prompt), or duplicate custody | Review and reassign to someone who needs it. |
| **Consumption** | Issuance history | Which items are moving fastest. |

**PPMP Analytics** compares uploaded workbooks year over year, flags anomalies, and forecasts demand. **PPMP Planning** turns the same evidence into a draft procurement plan with suggested quantities and a planned-vs-suggested variance panel, within a budget ceiling.

All recommendations are **deterministic and advisory**. They do not auto-create purchase orders, auto-dispose assets, or auto-approve anything. A human decides.

**Key files:** `src/lib/prescriptive/*`, `src/lib/prescriptive-queries.ts`, `src/lib/prescriptive-actions.ts`, `src/components/recommendations/**`, `src/lib/ppmp/**`.

### What to show a reviewer

1. Open **Recommendations** and show the KPI cards for replenishment, replacement/disposal, and idle/reassignment.
2. Open a low-stock item and show the suggested reorder quantity.
3. Open an idle asset and show the 180-day evidence.
4. Open **PPMP → Analytics**, then **Planning**, and show the suggested quantities and variance against the plan.

### Honest limit

This is rule-based prescriptive decision support, not a predictive ML platform. Suggestions require human action. The idle prompt is based on asset age (`date_acquired`, falling back to record creation date), because the schema has no "became available on" timestamp — it is a review prompt, not a measured idle period.

---

## 8. Objective 6 — QR code-based asset identification and scanning

### Where to see it

| What | Personnel | Super Admin | Employee / public |
| --- | --- | --- | --- |
| Show an asset/stock QR | **Inventory → Assets → Show QR code** (`/personnel/assets`) | `/super-admin/assets` | — |
| In-app scanner | **Records → QR Scanner** (`/personnel/scan`) | `/super-admin/scan` | Public `/scan` (read-only) |
| Scan-to-action | Asset: details, history, log repair, request transfer. Stock: details, request replenishment. | Same, with `/super-admin/*` links | Identification only |
| Handover QR | Scan a completed request's code | Same | **My Requests** / **My Assets** → request QR |

### How it works

- Asset QR tags resolve to the asset detail page; stock tags resolve to the stock detail page; completed requests expose a handover QR.
- The scanner is **camera-only** — there is no image-upload or paste fallback.
- The public `/scan` route works without signing in. It resolves tags through the public lookup endpoint, which returns identification fields only: property number, account code, article, description, category, status, condition, location, quantity, unit, and acquisition date. Costs, remarks, supplier details, account numbers, and assignees are never exposed.
- Public lookups are cached briefly at the CDN edge and can only be fetched by unguessable UUID, so the endpoint cannot be used to enumerate records.
- Staff scan-to-action deep links carry `?asset={id}`; the repairs and requests pages prefill the asset and current holder, then strip the query string so refresh/back does not re-open the dialog.

**Key files:** `src/lib/asset-tag.ts`, `src/lib/scan-actions.ts`, `src/lib/scan-actions-server.ts`, `src/components/QrScanner.tsx`, `src/app/api/public/assets/[id]/route.ts`.

### What to show a reviewer

1. Open **Assets**, show a QR code.
2. Open **QR Scanner** and scan the tag.
3. Show the action row: details, history, log repair, request transfer.
4. Open `/scan` in a signed-out browser and show the sanitized identification card.
5. Complete an employee request and show the handover QR.

### Honest limit

The scanner is camera-only. The public route is read-only by design — actions require an authorized session.

---

## 9. How the objectives connect

```text
Objective 1  Receiving → inspection → AIR/IAR → stock
      │
      ├──▶ Objective 2  Assignment, custody, condition, history
      │
      ├──▶ Objective 3  Repair tickets and maintenance history
      │
      ├──▶ Objective 4  Dashboards + reports (descriptive)
      │
      ├──▶ Objective 5  Recommendations + PPMP (prescriptive)
      │
      └──▶ Objective 6  QR tags and scan-to-action
```

The chain is the spine. Objectives 2–6 consume the records created by Objective 1; none of them creates a second copy of the data. The detailed workflow is in [`OBJECTIVE-FOCUS-WORKFLOW.md`](OBJECTIVE-FOCUS-WORKFLOW.md).

---

## 10. Ten-minute demo script

| Minute | Do this | Objective shown |
| --- | --- | --- |
| 0:00 | Sign in as Super Admin. Show the dashboard KPIs and charts. | 4 |
| 1:30 | **Deliveries → Log delivery** with two line items. | 1 |
| 3:00 | **Inspections → Inspect**: enter a short quantity, show **Passed** refused, choose **Partial**. | 1 |
| 4:00 | Generate the AIR/IAR; open **Stock** and show the received quantity. | 1 |
| 5:00 | Open **Assets**, show a QR code, then **QR Scanner** and the action row. | 6 |
| 6:30 | **PAR / ICS → New issuance**; show the threshold choosing ICS vs PAR. | 2 |
| 7:30 | **Reports → Aging & delays**, **Quarterly issuance**, **Asset conditions**. | 4 |
| 8:30 | **Recommendations** → low stock, idle asset, replacement. | 5 |
| 9:15 | **PPMP → Analytics → Planning** → suggested quantities and variance. | 5 |
| 9:45 | Sign in as an employee; show **My Assets** scoping and a completed-request QR. | 2, 6 |

---

## 11. Where the evidence lives

| Topic | Document or file |
| --- | --- |
| Objective-by-objective verdict | `docs/assessments/OBJECTIVES-ASSESSMENT.md` |
| Scope and honest limits | `docs/assessments/SCOPE-AND-LIMITATIONS-VERIFICATION.md` |
| Full end-to-end workflows | `README.md` §5 |
| Rules reference | `README.md` §7 |
| Plain-language user guide | `docs/USER-GUIDE.md` |
| Focused receiving-to-issuance workflow | `docs/OBJECTIVE-FOCUS-WORKFLOW.md` |
| Route gating and role cache | `middleware.ts` |
| Ownership scope | `src/lib/personnel-scope.ts` |
| Inspection and stocking rules | `src/lib/inspection-rules.ts`, `src/lib/stock.ts` |
| Issuance threshold | `src/lib/issuance-rules.ts` |
| Reports | `src/lib/reporting-queries.ts`, `src/lib/report-excel.ts` |
| Recommendations | `src/lib/prescriptive-queries.ts`, `src/lib/prescriptive/*` |
| PPMP | `src/lib/ppmp/**` |
| QR scanning | `src/lib/asset-tag.ts`, `src/lib/scan-actions.ts` |
| Data model | `prisma/schema.prisma` |

---

## 12. Known limits to state honestly

| Area | Limit |
| --- | --- |
| Document lifecycle | Status field exists, but there is no electronic signature or multi-level approval workflow. |
| RIS | A supply requisition is represented by the electronic Request workflow (`stock_replenishment`); there is no standalone printable RIS form. |
| Usability status | Represented by asset `status` + free-text `condition`, not a dedicated controlled field. |
| Predictive analytics | Objective 5 is rule-based prescriptive advice, not machine-learning prediction. |
| Recommendations | Advisory only — no automatic ordering, disposal, or reassignment. |
| QR scanner | Camera-only; the public route is read-only. |
| Location history | Location is a field plus issuance snapshot, not a separate time-series table. |
| Aging | Covers inspections, requests, and repairs only. |
