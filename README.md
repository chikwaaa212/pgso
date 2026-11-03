# PGSO-PSMS

**Provincial Government Services Property & Supply Management System**

An integrated, role-based web platform for tracking government property, supplies, deliveries, inspections, accountability documents, repair tickets, employee requests, and procurement planning data — from the moment goods arrive at the warehouse to the moment an asset is acknowledged by the employee who holds it.

PGSO-PSMS replaces spreadsheet-driven property custodianship with a single auditable system:

- Every delivery, inspection, receipt, and issuance is linked to the record that produced it.
- Stock only increases after an item has **passed (or partially passed) inspection** and is backed by an **AIR/IAR**.
- Accountability is decided automatically: **PAR** for high-value items, **ICS** for low-value items.
- Employees see exactly what they hold; personnel see exactly what they processed; Super Admins see the whole province.
- Uploaded PPMP workbooks can be validated, compared year over year, forecast, and turned into a draft procurement plan.

> **Using the system, not building it?** Read the plain-language
> [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md) — it explains every screen, workflow, and rule
> for employees, personnel, and administrators.

---

## Table of contents

1. [What the system is for](#1-what-the-system-is-for)
2. [Roles and access](#2-roles-and-access)
3. [Feature map by role](#3-feature-map-by-role)
4. [Route map](#4-route-map)
5. [End-to-end workflows](#5-end-to-end-workflows)
6. [Status reference](#6-status-reference)
7. [Business rules](#7-business-rules)
8. [PPMP analytics and planning](#8-ppmp-analytics-and-planning)
9. [Technology stack](#9-technology-stack)
10. [Getting started](#10-getting-started)
11. [Environment variables](#11-environment-variables)
12. [Database and seeding](#12-database-and-seeding)
13. [Scripts](#13-scripts)
14. [Testing](#14-testing)
15. [Project structure](#15-project-structure)
16. [Templates and exports](#16-templates-and-exports)
17. [Performance and reliability](#17-performance-and-reliability)
18. [Security and compliance](#18-security-and-compliance)
19. [Deployment](#19-deployment)
20. [Troubleshooting](#20-troubleshooting)
21. [Glossary](#21-glossary)

---

## 1. What the system is for

PGSO-PSMS is the operating system of a Provincial General Services Office. It covers five connected areas:

| Area | What it solves |
| --- | --- |
| **Receiving** | Log supplier deliveries, record what actually arrived, inspect it, and generate the Acceptance and Inspection Report (AIR/IAR). |
| **Inventory and assets** | Move accepted goods into stock or the asset registry, track quantities and values, and know what is available, in use, under repair, or retired. |
| **Accountability** | Issue property to employees with the correct PAR or ICS document, with signatures, quantities, and totals captured on the record. |
| **Employee services** | Let employees view their assigned property, download their documents, submit transfer/repair/new-assignment requests, and track their status. |
| **Planning and oversight** | Validate PPMP workbooks, analyse trends and anomalies, forecast demand, draft a procurement plan, scan QR codes, and review the audit trail. |

### The core problem it prevents

A common failure in manual property management is that stock is recorded before inspection, or property is issued without a signed accountability document. PGSO-PSMS enforces the chain:

```text
Delivery logged
    ↓
Inspection recorded (passed / partial)
    ↓
AIR / IAR generated or attached
    ↓
Stock or asset created (only now)
    ↓
Issuance prepared (PAR or ICS)
    ↓
Employee acknowledges the property
```

Each step is guarded by server-side rules, not just UI hints. A record that has not been inspected cannot be stocked; an inspection without an AIR/IAR cannot stock; and an issuance cannot exceed or bypass the asset/stock it references.

---

## 2. Roles and access

PGSO-PSMS has three roles. Each role has its own portal, navigation, and data scope.

| Role | Portal | Purpose | Data scope |
| --- | --- | --- | --- |
| `super_admin` | `/super-admin/*` | Full oversight and administration | Every record in the system |
| `pgso_personnel` | `/personnel/*` | Day-to-day property and supply operations | Records they created or own |
| `employee` | `/employee/*` | Self-service for assigned property and requests | Only their own assets, documents, and requests |

### 2.1 Role matrix

| Capability | Super Admin | PGSO Personnel | Employee |
| --- | :---: | :---: | :---: |
| View all deliveries / inspections | ✅ | Own records only | — |
| Log a delivery | ✅ | ✅ | — |
| Record an inspection | ✅ | ✅ | — |
| Generate / attach AIR/IAR | ✅ | ✅ | — |
| View stock and assets | ✅ | ✅ | Own assigned items |
| Add / edit stock | ✅ | ✅ | — |
| Add / import / edit assets | ✅ | ✅ | — |
| Issue property (PAR/ICS) | ✅ | ✅ | — |
| Approve requests | ✅ | ✅ | — |
| Submit requests | — | ✅ (stock replenishment) | ✅ (transfer, new assignment, repair) |
| View PAR / ICS documents | ✅ | ✅ | Own documents |
| Manage repair tickets | ✅ | ✅ | View their own request status |
| View audit logs | ✅ | Own activity | — |
| Manage users and approvals | ✅ | — | — |
| Manage master data | ✅ | — | — |
| Upload / analyse PPMP files | ✅ | ✅ | — |
| Scan QR codes | ✅ | ✅ | Public scanner |

> **Enforcement:** `middleware.ts` checks the authenticated Supabase user, loads the profile role/status (with a 60-second Redis cache), and redirects requests that cross role boundaries. Server actions additionally re-check ownership and role before writing.

### 2.2 Account states

Self-registration creates an account in `pending` state. It cannot be used until a Super Admin approves it.

| Status | Meaning | Can sign in? |
| --- | --- | --- |
| `pending` | Registered, waiting for administrator approval | No — sign-out + “pending” notice |
| `active` | Approved and enabled | Yes |
| `inactive` | Disabled by an administrator | No — sign-out + “inactive” notice |

When an employee is approved for the first time, a blocking **Complete your profile** overlay requires the name parts, employee number, position, and department before the portal can be used. Departments are validated against the administrator-managed master data.

### 2.3 Account menu

Every portal exposes the same account menu in the navbar:

- **Edit name** — updates the display name shown across the system.
- **Change password** — changes the Supabase Auth password without leaving the portal.
- **Department** — personnel can set or update their assigned department from the navbar.

Profile and display-name edits are recorded through audited server actions.

---

## 3. Feature map by role

### 3.1 Employee portal

Employees have three pages, intentionally kept simple.

#### Dashboard — `/employee/dashboard`

- Summary of assigned property and recent activity.
- Quick access to current requests and documents.
- First-login profile completion gate.

#### My Assets — `/employee/assets`

- List of assets and stock currently assigned to the signed-in employee.
- Search and filter.
- View asset details, condition, status, and assignment.
- Open and download the employee's **PAR** or **ICS** accountability document.
- View QR identifiers on property rows and open the QR code for a completed request.

#### My Requests — `/employee/requests`

- Submit a request:
  - **Transfer** — move an assigned item to another personnel/employee.
  - **New assignment** — request additional property.
  - **Repair** — report an assigned item for repair.
- Track request status: `pending` → `approved` → `completed`, or `rejected`.
- View the resolution note and date resolved.
- Show a **QR code for completed requests** so personnel can scan and process the handover.

### 3.2 Personnel portal

The personnel portal is the operational core of the system.

#### Dashboard — `/personnel/dashboard`

- Operational counters: deliveries, pending inspections, stock levels, assets, open requests, repairs, and documents.
- Recent activity and shortcuts into the next task.

#### Deliveries — `/personnel/deliveries`

- Multi-step delivery logging:
  1. Supplier, PO reference, delivery date, expected arrival date.
  2. Delivery kind: **Stocks** (consumables tracked in inventory) or **Assets** (equipment tracked in the asset registry).
  3. Account code / account title / asset type.
  4. Line items with quantity, unit, and unit cost.
- Delivery status: complete, partial, or awaiting arrival.
- Delivery list with filters, search, pagination, and status badges.
- Delivery detail page with items, inspection history, receipts, and linked documents.
- **Inspect delivery** action opens the inspection flow directly from the delivery.
- Only the creator (or a Super Admin) can view or modify a delivery.

#### Inspections — `/personnel/inspections`

- Queue of deliveries awaiting inspection.
- Inspection form records:
  - Inspection date and inspector.
  - Per-item received quantities.
  - Supplier checks and item checks.
  - Remarks.
  - Result: **passed** or **partial**.
- “Passed” is only allowed when the cumulative received quantity equals the PO quantity for **every** item. A short delivery must be recorded as partial.
- Generate the **AIR/IAR** from the inspection, or attach an externally prepared one (including a scanned/signed IAR image).
- Attach up to **5 optional documentary photos** to an inspection. Photos are uploaded immediately to Supabase Storage and stored as `INSPECTION_PHOTO` documents in the Documents hub; Super Admin delivery and inspection views render thumbnails.
- Inspection detail, printable receipt, and IAR sheet routes.
- Re-inspection is supported: updating a partial inspection to passed stocks only the remaining quantity.

#### Stock — `/personnel/inventory`

- Inventory of consumables and semi-expendable items.
- Search, filter, pagination.
- Quantities, unit cost, total cost, category, location, reorder threshold.
- Manual stock creation/editing.
- Stock detail page with movement/history context.
- Stock is normally created automatically by passed/partial inspections with an AIR/IAR; manual entry is for corrections and opening balances.

#### Assets — `/personnel/assets`

- Asset registry with property number, QR code, account code/title, article, description, quantity, unit, dates, costs, location, condition, status, end user, vehicle details, and funding references.
- Add a single asset.
- **Import Excel** using the 34-column asset template.
- Custom columns can be defined and filled per asset.
- Asset detail page for viewing and editing.
- QR code generation and display.
- Assignment state: available, in use, maintenance, retired.
- Only available and unassigned assets can be issued.

#### Documents — `/personnel/documents`

A single document hub with tabs:

| Tab | Contents |
| --- | --- |
| Delivery | Delivery records and receipts |
| Inspection | Inspection reports |
| Stocks | Stock records and stock cards |
| Assets | Asset records |
| Repairs | Repair tickets |
| IAR Reports | Generated and attached AIR/IAR records |
| PAR | Property Acknowledgment Receipts |
| ICS | Inventory Custodian Slips |

- Search, filter, paginate, and mark documents as viewed.
- Download or print the official layout.
- Viewed state is tracked per user per document.

#### PAR / ICS — `/personnel/issuances`

- List of accountability documents with type, document number, date, quantity, unit cost, total amount, and employee.
- Detail view with the full issuance snapshot.
- Download PAR or ICS as `.xlsx`.
- Supports both single-line and consolidated multi-line documents.

#### Issues — `/personnel/issues`

- Ledger of every asset and stock line issued to employees — receiving employee, account, quantity, and document — with costs excluded.
- One row per issued line, server-paged, with search and filters.
- A second tab lists **completed** transfers, assignments, repairs, and stock replenishments.
- QR codes are generated only for the visible page, keeping the ledger fast.

#### Requests — `/personnel/requests`

- Review employee requests.
- Approve or reject with remarks.
- On approval of a **new assignment**, the system can issue the selected asset/stock and generate the PAR/ICS.
- Mark approved requests as **completed** after handover.
- Create **stock replenishment** requests when inventory is low.
- Status transitions are enforced server-side.

#### Repairs — `/personnel/repairs`

- Repair queue with status tabs: Pending, In progress, Completed.
- Repair detail: asset, reported by, repair date, description, technician, cost, status.
- Update status and capture cost/technician.
- Approving a repair request automatically creates a repair ticket.
- Only the creator (or Super Admin) can view/modify a ticket.

#### Logs — `/personnel/logs`

- Personal audit trail of actions performed in the system.
- Filter by module, action, and date.

#### Templates — `/personnel/templates`

- Download the asset import template.
- Download blank AIR, PAR, and ICS forms.
- Download the sample header/data workbook.

#### PPMP — `/personnel/ppmp`

- Upload `.xlsx` PPMP workbooks.
- Inspect and validate uploaded files.
- Run **Analytics** and **Planning**.
- See [section 8](#8-ppmp-analytics-and-planning).

#### Reports — `/personnel/reports`

Descriptive-analytics workspace for the records the signed-in personnel can see:

- **Aging & delays** — pending inspections, pending requests, and open repairs split into `0–3`, `4–7`, `8–14`, and `15+` day buckets. A record is *delayed* once it is older than 7 days; the page shows totals, overdue counts, the oldest open record, and a paged, filterable list.
- **Quarterly issuance** — calendar-quarter (Q1 = Jan–Mar) PAR/ICS summary for a selected year: document counts, PAR/ICS split, quantity, amount, an 8-quarter trend, and top items / by office / by employee breakdowns. Consolidated multi-line documents count once in the summary and per line in the item table.
- **Asset conditions** — normalized current-condition distribution from the shared asset registry, with the serviceable/unserviceable headline, percentages, and an explicit **Unspecified** bucket for blank or unrecognized values. Condition history is not stored, so this is a distribution, not a trend.
- **Download XLSX** produces official ExcelJS workbooks with the report period, applied filters, generation timestamp, and threshold assumptions in the header.

#### QR Scanner — `/personnel/scan`

- Scan an asset/stock/request QR code using the device camera (camera-only; no image upload).
- Resolve the code to the corresponding asset, stock item, or completed request.
- Act on a scanned asset without retyping it: **View history**, **Log repair**, and **Request transfer** open the right page with the asset (and current holder) prefilled. Stock tags offer **Request replenishment** instead of repair.

### 3.3 Super Admin portal

The Super Admin portal mirrors the operational modules for oversight, plus administration.

#### Dashboard — `/super-admin/dashboard`

- Province-wide counters and charts:
  - Deliveries, inspections, stock, assets, issuances.
  - Pending accounts, requests, repairs, and inspections.
  - Trend and distribution charts.
- Descriptive-analytics cards for **delayed & aging transactions**, **quarterly issuance**, and **asset conditions**, each linking to `/super-admin/reports`.

#### Operations modules

The Super Admin has the same pages as personnel — Deliveries, Inspections, Stock, Assets, Documents, PAR/ICS, Issues, Requests, Repairs, Reports, Logs, Templates, PPMP, QR Scanner — but with **unscoped visibility** across all users.

#### Users — `/super-admin/users`

- Review pending self-registrations.
- Approve, activate, deactivate, or change roles.
- View account details and activity.
- Role/status changes invalidate the 60-second middleware cache immediately.

#### Master Data — `/super-admin/master-data`

Manage the reference data used throughout the system:

- **Account catalog** — account code, account title, account name, asset type.
- **Units** — name and abbreviation.
- **Departments** — name and description.
- Import the account catalog from Excel using the 4-column template.
- Existing account codes are updated on re-import.

#### Transactions — `/super-admin/transactions`

- System-wide transaction view combining operational records.
- Useful for reconciliation and audit sampling.

#### All Records — `/super-admin/records`

- Every record type in one place for cross-module lookup.

#### PPMP Files — `/super-admin/ppmp`

- View all uploaded PPMP workbooks across users.
- Run Analytics and Planning on any accessible file.

---

## 4. Route map

### 4.1 Public routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page; signed-in users are redirected to their dashboard |
| `/login` | Email/password, OTP, and Google sign-in |
| `/signup` | Self-registration (creates a `pending` account) |
| `/info/[slug]` | Public help, policy, and informational articles |
| `/scan` | Public QR scanner |
| `/auth/callback` | Supabase OAuth/email callback |
| `/api/health` | Health check endpoint |

### 4.2 Employee routes

| Route | Purpose |
| --- | --- |
| `/employee/dashboard` | Employee overview |
| `/employee/assets` | Assigned property and documents |
| `/employee/requests` | Submit and track requests |

### 4.3 Personnel routes

| Route | Purpose |
| --- | --- |
| `/personnel/dashboard` | Operations dashboard |
| `/personnel/deliveries` | Delivery list |
| `/personnel/deliveries/[id]` | Delivery detail |
| `/personnel/inspections` | Inspection queue |
| `/personnel/inspections/[id]` | Inspection detail |
| `/personnel/inspections/[id]/iar` | IAR sheet |
| `/personnel/inspections/[id]/receipt` | Inspection receipt |
| `/personnel/inspections/[id]/receipts` | Receipts collection |
| `/personnel/inventory` | Stock list |
| `/personnel/assets` | Asset registry |
| `/personnel/assets/[id]` | Asset detail |
| `/personnel/assets/stock/[id]` | Stock detail |
| `/personnel/documents` | Document hub |
| `/personnel/issuances` | PAR / ICS list |
| `/personnel/issuances/[id]` | PAR / ICS detail |
| `/personnel/issues` | Issued-items ledger and completed requests |
| `/personnel/requests` | Request queue |
| `/personnel/repairs` | Repair queue |
| `/personnel/repairs/[id]` | Repair detail |
| `/personnel/logs` | Personal audit trail |
| `/personnel/templates` | Downloadable templates |
| `/personnel/ppmp` | PPMP file vault |
| `/personnel/ppmp/analytics` | PPMP analytics |
| `/personnel/ppmp/planning` | PPMP planning |
| `/personnel/reports` | Aging, quarterly issuance, and asset-condition reports |
| `/personnel/scan` | QR scanner |

### 4.4 Super Admin routes

All personnel routes exist under `/super-admin/*` with the same module names, plus:

| Route | Purpose |
| --- | --- |
| `/super-admin/users` | Account approval and role management |
| `/super-admin/master-data` | Account catalog, units, departments |
| `/super-admin/transactions` | System-wide transactions |
| `/super-admin/records` | All records browser |
| `/super-admin/ppmp/analytics` | PPMP analytics across all accessible files |
| `/super-admin/ppmp/planning` | PPMP planning across all accessible files |
| `/super-admin/reports` | System-wide aging, quarterly issuance, and asset-condition reports |

### 4.5 API routes

| Route | Purpose |
| --- | --- |
| `/api/health` | Liveness/health |
| `/api/public/assets/[id]` | Public, non-sensitive asset/stock tag lookup for the no-login scanner |
| `/api/personnel/assets/template-xlsx` | Asset import template |
| `/api/personnel/inspections/[id]/air-xlsx` | Generated AIR workbook |
| `/api/personnel/issuances/[id]/par-xlsx` | PAR workbook |
| `/api/personnel/issuances/[id]/ics-xlsx` | ICS workbook |
| `/api/employee/issuances/[id]/par-xlsx` | Employee PAR download |
| `/api/employee/issuances/[id]/ics-xlsx` | Employee ICS download |
| `/api/personnel/ppmp/template-xlsx` | PPMP template |
| `/api/personnel/reports/[report]` | Personnel report workbook (`aging`, `quarterly-issuance`, `asset-conditions`) |
| `/api/super-admin/reports/[report]` | System-wide report workbook (same report ids) |
| `/api/super-admin/master-data/catalog-template-xlsx` | Account catalog template |

> API handlers enforce the same session and ownership checks as pages and actions.

---

## 5. End-to-end workflows

### 5.1 Account lifecycle

```text
Visitor signs up
    ↓
Supabase Auth user + Profile (status = pending)
    ↓
Blocked at /login?notice=pending
    ↓
Super Admin reviews in Users
    ↓
Approve → status = active, role assigned
    ↓
First sign-in → Complete Profile overlay
    ↓
Role dashboard
```

**Rules**

- A pending or inactive profile is signed out by middleware even if the browser session is valid.
- Only `active` accounts can authenticate into a portal.
- Only `employee` accounts receive the employee portal; `pgso_personnel` and `super_admin` are administrative roles.
- New assignments target active employees. Requests target active personnel.

### 5.2 Delivery → inspection → AIR/IAR → stock or asset

This is the primary receiving workflow.

#### Step 1 — Log the delivery

1. Open **Deliveries → Log delivery**.
2. Enter supplier, PO reference, delivery date, and expected arrival date.
3. Choose the delivery kind:
   - **Stocks** — consumables tracked in inventory.
   - **Assets** — equipment tracked in the asset registry.
4. Select the account title (from Master Data); the asset type is auto-filled from the chosen title. The account code may be typed manually or generated from the form's history.
5. Add line items: item name, unit, quantity, unit cost.
6. Save. The delivery starts with `inspection_status = pending`.

`delivery_status` is independent: `complete`, `partial`, or `awaiting`. It describes the delivery event, while `inspection_status` describes the inspection outcome.

#### Step 2 — Record the inspection

1. Open **Inspections** or the delivery detail.
2. Select the delivery.
3. Enter the inspection date and inspector.
4. For each item, enter the quantity **received this round**. The system converts it to a cumulative quantity using already-stocked quantities.
5. Add supplier checks, item checks, and remarks.
6. Choose the result:
   - **Passed** — allowed only when every item's cumulative received quantity equals its PO quantity.
   - **Partial** — any shortfall, damage, or incomplete delivery.

A delivery that was previously partial can be inspected again. The cumulative gate still applies, and only the newly received quantity is stocked later.

#### Step 3 — Generate or attach the AIR/IAR

- Generate the AIR/IAR from the inspection detail.
- Or attach a prepared document.
- Stocking requires at least one AIR/IAR record linked to the inspection.

#### Step 4 — Stocking

Stocking happens automatically when the inspection is passed or partial **and** an AIR/IAR exists:

- Each delivery item has a `stocked_qty` high-water mark.
- A partial inspection of 6 of 10 stocks 6.
- A later passed inspection stocks the remaining 4.
- Re-processing the same inspection adds nothing (idempotent).
- Costs are corrected on the inventory record when unit costs become available.

For **Assets**, accepted items flow into the asset registry; for **Stocks**, they flow into inventory.

```text
PO qty 10 → inspect 6 (partial) → stock +6 → inspect remaining 4 (passed) → stock +4 → total 10
```

### 5.3 Employee request → approval → issuance

#### Employee side

1. Open **My Requests → New request**.
2. Choose:
   - **Transfer** — item currently assigned to the employee.
   - **New assignment** — additional item.
   - **Repair** — item currently assigned to the employee.
3. Select the asset/stock and provide a description.
4. Submit. Status is `pending`.

#### Personnel side

1. Open **Requests**.
2. Review the request and the requested item.
3. **Approve** or **Reject** with remarks.
   - Approval of a **new assignment** can immediately issue the selected item and create a PAR/ICS.
   - Approval of a **repair** automatically creates a repair ticket.
4. After the physical handover, mark the request **completed**.
5. A completed request exposes a QR code that can be scanned by personnel to confirm the handover.

#### Status transitions

```text
pending ──approve──▶ approved ──complete──▶ completed
   │
   └──reject──▶ rejected (terminal)
```

No other transitions are allowed. Attempting an invalid transition returns an error.

### 5.4 Direct issuance (walk-in / no request)

Personnel can issue property without an employee request:

1. Open **PAR / ICS → New issuance**.
2. Select an active employee.
3. Select an available asset or stock item.
4. Enter quantity, unit cost, and document details.
5. The system calculates the total and chooses the document type:
   - **PAR** when total amount **> ₱50,000**.
   - **ICS** when total amount **≤ ₱50,000**.
6. Save. The asset/stock assignment and the issuance record are created together.
7. Download the generated `.xlsx` document.

**Consolidated issuance:** one approval can produce a single consolidated PAR/ICS containing multiple lines. The document stores every line in `issuance_data.lines`, so the printed document and the stored record agree.

**Assignment guards**

- Only `available` assets that are not already assigned can be issued.
- Stock quantity must be sufficient.
- The employee must be active.
- An asset already in use cannot be issued again.

### 5.5 Repairs

```text
Employee reports repair (request type = repair)
        or
Personnel files a repair ticket
    ↓
Repair ticket: pending
    ↓
Personnel sets in_progress (technician, diagnosis)
    ↓
Personnel sets completed (cost, resolution)
    ↓
Asset condition/status updated as appropriate
```

- Repair status values: `pending`, `in_progress`, `completed`.
- Costs and technicians are captured on the ticket.
- Only the creator (or Super Admin) can edit a ticket.

### 5.6 Documents

The Documents hub is the filing cabinet. It aggregates records that already exist elsewhere; it does not create a second copy of the data.

| Document | Created by | Where to find it |
| --- | --- | --- |
| Delivery receipt | Logging a delivery | Documents → Delivery; delivery detail |
| Inspection report | Recording an inspection | Documents → Inspection; inspection detail |
| Inspection documentary photos | Attaching up to 5 photos during inspection | Documents → Inspection; Super Admin delivery/inspection views |
| AIR / IAR | Generating or attaching from an inspection | Documents → IAR Reports; inspection → IAR |
| PAR | Issuing an asset/stock above the threshold | Documents → PAR; PAR/ICS list |
| ICS | Issuing an asset/stock at or below the threshold | Documents → ICS; PAR/ICS list |
| Stock card | Stock detail / inventory | Stock detail; Documents → Stocks |
| Asset record | Asset registry | Assets; Documents → Assets |
| Repair ticket | Repair creation | Repairs; Documents → Repairs |

Viewed state is recorded per user, so the hub can distinguish new from already-reviewed documents.

### 5.7 QR codes and scanning

QR codes are generated for:

- Assets — resolve to the asset detail page.
- Stock items — resolve to the stock detail page.
- Completed requests — resolve to the request handover.

The scanner uses the device camera (it is camera-only — there is no image-upload or paste box). Asset QR tags are resolved through the public lookup endpoint, so the identifying card shows even when signed out.

**Scan-to-action.** On the personnel and super-admin scanners a resolved asset offers:

| Scanned item | Actions (staff portals) |
| --- | --- |
| Asset | Open asset details · View history · **Log repair** · **Request transfer** |
| Stock item | Open stock item · **Request replenishment** |

The actions are portal-aware (`src/lib/scan-actions.ts`): super-admin links stay inside `/super-admin/*` because middleware redirects cross-portal paths. Deep links carry `?asset={id}`; the repairs and requests pages resolve the option, open the create dialog with the asset and current holder prefilled, then strip the query string so refresh/back does not re-open it. The public `/scan` route stays read-only — identification only, with a "sign in to act" hint.

The public `/scan` route allows scanning without signing in. It resolves asset and stock tags through the public lookup endpoint, which returns only non-sensitive identification fields — property number, account code, article, description, category, status, condition, location, quantity, unit, and acquisition date. Costs, remarks, supplier details, account numbers, and assignees are never exposed. Protected record details still require an authorized session.

Public tag lookups are cached briefly at the CDN edge (`s-maxage=60`) and can only be fetched by unguessable UUID, so the endpoint cannot be used to enumerate records.

### 5.8 PPMP upload and analysis

See [section 8](#8-ppmp-analytics-and-planning).

---

## 6. Status reference

### 6.1 Profiles

| Value | Meaning |
| --- | --- |
| `pending` | Awaiting Super Admin approval |
| `active` | Enabled |
| `inactive` | Disabled |

### 6.2 Deliveries

| Field | Values | Meaning |
| --- | --- | --- |
| `delivery_status` | `complete` | All expected items arrived |
| | `partial` | Only part of the order arrived |
| | `awaiting` | Not yet arrived / expected |
| `inspection_status` | `pending` | Not yet inspected |
| | `passed` | Fully accepted |
| | `partial` | Partially accepted |
| | `failed` | Legacy state; can be edited to partial/passed |

### 6.3 Inspections

| Value | Meaning |
| --- | --- |
| `passed` | Every item's cumulative received quantity equals its PO quantity |
| `partial` | At least one item is short, damaged, or incomplete |
| `failed` | Legacy value; remains editable so it can be corrected |

### 6.4 Assets

| Value | Meaning |
| --- | --- |
| `available` | In the registry, not assigned |
| `in use` | Assigned to an employee |
| `maintenance` | Under repair |
| `retired` | Disposed / no longer serviceable |

Condition is tracked separately (`good`, `serviceable`, `unserviceable`, etc., depending on the record source).

### 6.5 Requests

| Value | Meaning |
| --- | --- |
| `pending` | Submitted, awaiting review |
| `approved` | Accepted, handover/issuance in progress |
| `rejected` | Denied (terminal) |
| `completed` | Handover finished (terminal) |

### 6.6 Repairs

| Value | Meaning |
| --- | --- |
| `pending` | Reported, not started |
| `in_progress` | Being worked on |
| `completed` | Finished |

### 6.7 Documents

| Value | Meaning |
| --- | --- |
| `pending` | Default state for a created document |
| `approved` | Document approved where the workflow records approval |

### 6.8 PPMP analysis sessions

| Field | Values |
| --- | --- |
| `status` | `running`, `completed`, `failed` |
| `stage` | `queued`, `reading`, `processing`, `calculating`, `failed` |

### 6.9 Accountability document types

| Type | Rule |
| --- | --- |
| `PAR` | Total amount **greater than ₱50,000** |
| `ICS` | Total amount **₱50,000 or less** |

---

## 7. Business rules

These rules are enforced in shared library code and server actions, not just in forms.

### 7.1 Inspection and stocking

- **Passed requires full quantity.** For every item, cumulative received quantity must equal the PO quantity.
- **Partial is the fallback.** Any shortfall forces a partial result.
- **Cumulative accounting.** The inspection form collects this round's quantity; the system adds previously stocked quantities before evaluating and saving.
- **Stock requires AIR/IAR.** A passed or partial inspection with no AIR/IAR record does not stock.
- **High-water mark.** `stocked_qty` prevents double-stocking. Stocking is additive only for the not-yet-stocked remainder.
- **Failure does not stock.** A legacy `failed` inspection does not move stock.
- **Cost repair.** When costs arrive later, existing inventory rows are updated without changing quantities.

### 7.2 Issuance

- **Threshold rule.** `total > 50,000` → PAR; otherwise ICS.
- **Total calculation.** `unit_cost × quantity`, with a snapshot fallback for documents that already have a stated total.
- **One document per approval.** A consolidated issuance produces one PAR/ICS with multiple lines, not one document per line.
- **No double assignment.** An asset must be `available` and unassigned.
- **Stock sufficiency.** Issuing stock decrements the inventory quantity; it cannot go below zero.
- **Active recipient.** The employee must be `active`.
- **Document snapshot.** The issuance stores the values at the moment of issue, so later edits to the asset do not rewrite history.

### 7.3 Requests

- Allowed transitions: `pending → approved | rejected`; `approved → completed`.
- `rejected` and `completed` are terminal.
- Approval of a new assignment can trigger issuance.
- Approval of a repair creates a repair ticket.
- Only an active employee can submit; only active personnel can be assigned as recipients.

### 7.4 Ownership and visibility

- **Super Admin:** unrestricted.
- **Personnel:** a record is visible if they created it (`created_by`, `received_by`, `inspector_id`, or equivalent) or own it through the personnel scope helper.
- **Employee:** only records where `assigned_to = their user id`, or requests/documents tied to them.
- Ownership checks are repeated inside server actions, not delegated to the UI.

### 7.5 PPMP ingestion

- Only `.xlsx` files are accepted (`.xls` must be re-saved).
- Maximum **10 MB** per file.
- Maximum **3 files** per analysis or planning run.
- Maximum **100 analyses per user per hour**.
- Files are deduplicated by **SHA-256** hash per user.
- Workbooks are validated before analysis; invalid headers or unreadable sheets produce actionable errors.
- A workbook may contain up to 100 sheets; larger workbooks must be split.

### 7.6 Idempotency

Write actions use idempotency keys (`IdempotencyKey`) so a double-click or retried request does not create duplicate records. The same mechanism protects stocking, issuance, and document generation.

---

## 8. PPMP analytics and planning

The PPMP module turns procurement workbooks into evidence-backed analysis. It is available to personnel and Super Admins at:

- `/personnel/ppmp`, `/personnel/ppmp/analytics`, `/personnel/ppmp/planning`
- `/super-admin/ppmp`, `/super-admin/ppmp/analytics`, `/super-admin/ppmp/planning`

### 8.1 Uploading files

1. Open **PPMP**.
2. Upload an `.xlsx` workbook (max 10 MB).
3. The system parses sheets, detects fiscal years, counts usable rows, and records the SHA-256 hash.
4. Duplicate uploads are identified by hash so the same workbook is not stored twice for the same user.
5. Uploaded files appear in the vault and can be selected for analysis or planning.

### 8.2 Analytics

Analytics answers: *what happened across the PPMP years, and what looks unusual?*

Select up to three files, validate them, then run the analysis. The report includes:

| Section | What it shows |
| --- | --- |
| **Overview** | Files, years, line items, total budget, offices, categories, budget-only lines, low-confidence lines, and yearly totals |
| **Quarterly calendar** | Procurement starts, deliveries, and lump budgets by quarter |
| **File insights** | Per-file parse quality, sheet coverage, and detected issues |
| **Year-over-year** | Quantity and budget changes between years, with percentage change |
| **Trends** | Per-item series classified as `INCREASING`, `DECREASING`, `STABLE`, `VOLATILE`, or `INSUFFICIENT_DATA` |
| **Anomalies** | Statistical outliers using a configurable z-score threshold |
| **Cost changes** | Budget movement between years, including whether the change is quantity-driven |
| **Forecasts** | Point estimate plus low/high band and confidence level |
| **Recommendations** | Rule-based suggestions with calculation traces and evidence references |
| **Limitations** | Data-quality caveats that should be read before acting on results |

Every finding carries an **evidence reference**: file name, sheet, row, item, quantity, unit, budget, fiscal year, and hash prefix. This makes the analysis auditable rather than a black box.

### 8.3 Planning

Planning answers: *what should next year's PPMP look like?*

1. Select up to three historical PPMP files.
2. Choose the target fiscal year.
3. Enter the agency, budget ceiling, and planning method.
4. Set annual quantity growth and price adjustment percentages.
5. Optionally filter by category.
6. Generate the plan.

Planning methods:

| Method | Behavior |
| --- | --- |
| `average` | Uses the historical average as the base case |
| `trend` | Fits a linear regression over the available years |
| `growth` | Applies a compounded annual growth percentage from the latest year |
| `consumption` | Plans from **actual issuance history** (last three fiscal years, matched on normalized description + unit, on-hand stock deducted) |

The planning page always shows a **consumption check** panel comparing each planned quantity with the issuance-history suggestion (under-planned / over-planned / aligned), and labels lines that have no matching history instead of guessing. Recommendations for replenishment, replacement/disposal, idle reassignment, and PPMP quantities are listed in the **Recommendations** workspace on both portals.

Outputs include:

- A **low / base / high** quantity and total for each item.
- Projected unit cost after price adjustment.
- A **GPPB-style draft table** with the 12-column presentation used in PPMP submissions.
- Quarterly distribution (Q1–Q4).
- Assumptions, evidence, and risk notes for review.
- A downloadable Excel draft.

> Forecasts are decision support, not procurement authority. The `limitations` and low-confidence warnings must be reviewed before the plan is used.

### 8.4 Analysis configuration

The analysis engine uses stored configuration values:

| Setting | Default |
| --- | --- |
| `qty_increase_pct` | 25 |
| `cost_increase_pct` | 30 |
| `anomaly_z` | 2.0 |
| `trend_epsilon_pct` | 5 |
| `forecast_min_history` | 3 |
| `smoothing_alpha` | 0.5 |

These are stored in `ppmp_analytics_config` and referenced by each analysis session so results can be reproduced.

---

## 9. Technology stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16.3.4 (App Router, Server Actions) |
| UI | React 19.2.8, Tailwind CSS 4, Radix UI, Framer Motion, GSAP, Lenis |
| Language | TypeScript 5 |
| Database | PostgreSQL (Supabase) via Prisma 5.22 |
| Auth | Supabase Auth (email/password, OTP, Google OAuth) |
| Storage | Supabase Storage |
| Realtime | Supabase Realtime |
| Cache / rate data | Upstash Redis (REST) |
| Charts | Recharts |
| Spreadsheets | ExcelJS, SheetJS (`xlsx`) |
| QR | `qrcode` (generation), `jsQR` (scanning) |
| Statistics | `simple-statistics`, `javascript-lp-solver` |
| Notifications | Sonner |
| Testing | Node.js built-in test runner with a `server-only` shim |

### Architecture notes

- **App Router** with route groups for auth, employee, personnel, and super-admin portals.
- **Server Actions** for mutations; dedicated route handlers for binary downloads (XLSX).
- **Middleware** performs authentication, status gating, and role-based routing before a page renders.
- **Prisma** is the only database access layer, with raw SQL used selectively for paginated/aggregated reads.
- **Redis** provides a short-lived middleware role cache and supports cache invalidation across the app.
- **Idempotency keys** protect critical writes.
- **Realtime** keeps admin queues fresh without manual refreshes.

---

## 10. Getting started

### Prerequisites

- Node.js 20 LTS or newer (Node 22 recommended)
- npm 10+
- A Supabase project (Postgres + Auth + Storage)
- An Upstash Redis database (optional for local development, required for the middleware role cache)
- Git

### 1. Clone and install

```bash
git clone <repository-url>
cd PGSO-main
npm install
```

`postinstall` runs `prisma generate` automatically.

### 2. Configure environment variables

Create `.env.local` in the project root. See [section 11](#11-environment-variables) for the full list.

Minimum required for the app to boot:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Prepare the database

```bash
npm run db:generate
npm run db:migrate
```

Use `npm run db:push` instead of `db:migrate` if you are prototyping against a disposable database.

### 4. Create the first Super Admin

There is no public “make me an admin” path. Bootstrap the first administrator with the provided script:

1. Add these values to `.env.local`:

   ```env
   SUPER_ADMIN_EMAIL="admin@example.gov.ph"
   SUPER_ADMIN_PASSWORD="<a strong password of 12+ characters>"
   SUPER_ADMIN_NAME="System Administrator"
   ```

2. Run the bootstrap script:

   ```bash
   npx tsx scripts/seed-super-admin.ts
   ```

   The script creates the Supabase Auth user if needed and upserts the matching `profiles` row as `super_admin` / `active`. It refuses to run without a strong password.

3. Sign in. The middleware routes the account to `/super-admin/dashboard`.

**Manual alternative:** create a user in **Supabase → Authentication → Users**, then run:

```sql
update public.profiles
set role = 'super_admin', status = 'active'
where id = '<auth-user-uuid>';
```

Subsequent accounts can be approved from **Super Admin → Users**.

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Verify the installation

- `GET /api/health` returns a healthy response.
- `/login` renders.
- Signing in with the bootstrapped Super Admin lands on `/super-admin/dashboard`.
- The Users page lists at least that account.
- Master Data contains account codes (import the catalog template if empty).

---

## 11. Environment variables

| Variable | Required | Purpose |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | Pooled PostgreSQL connection string used by Prisma at runtime |
| `DIRECT_URL` | ✅ | Direct PostgreSQL connection used for migrations and admin scripts |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key (browser + middleware) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only key for admin user operations and storage |
| `NEXT_PUBLIC_APP_URL` | ✅ | Canonical app URL used in QR codes, redirects, and links |
| `UPSTASH_REDIS_REST_URL` | — | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | — | Upstash Redis token |
| `SUPER_ADMIN_EMAIL` | — | Email used by `scripts/seed-super-admin.ts` |
| `SUPER_ADMIN_PASSWORD` | — | Password for the bootstrap Super Admin (12+ characters) |
| `SUPER_ADMIN_NAME` | — | Display name for the bootstrap Super Admin |
| `PERF_TRACE` | — | Set to `1` to emit `Server-Timing` headers and middleware timing logs |

> **Never commit `.env`, `.env.local`, or service-role keys.** The `.gitignore` excludes local env files; keep it that way.

### Redis behavior

If Upstash is not configured:

- Middleware falls back to a direct `profiles` lookup on every request.
- Caching helpers degrade gracefully.
- The app still works, but warm-request latency is higher.

When Redis is configured, the middleware role cache has a **60-second TTL**. Role/status changes explicitly bust the key, so the TTL is a backstop rather than the primary invalidation path.

---

## 12. Database and seeding

### Schema overview

The Prisma schema defines:

| Model | Purpose |
| --- | --- |
| `Profile` | User identity, role, status, department, employee profile fields |
| `Asset` | Property registry, assignment, condition, vehicle details, custom fields |
| `Delivery` / `DeliveryItem` | Supplier deliveries and their line items with `stocked_qty` |
| `Inspection` | Inspection results, item checks, AIR/IAR data, stocking timestamp |
| `IarRecord` | Generated or attached AIR/IAR records |
| `InventoryItem` | Consumable/semi-expendable stock |
| `AssetCustomField` | User-defined asset columns |
| `Repair` | Repair tickets |
| `Document` | Document registry linked to assets, stock, deliveries, inspections, IARs |
| `Request` / `RequestItem` | Employee/personnel requests and line items |
| `AuditLog` | Action trail |
| `IdempotencyKey` | Duplicate-write protection |
| `DocumentView` | Per-user viewed state |
| `IssuanceRecord` | PAR/ICS accountability documents and snapshots |
| `Unit` / `Department` / `AccountCatalog` | Master data |
| `PpmpFile` | Uploaded PPMP workbooks, hashes, parse metadata |
| `PpmpAnalyticsConfig` | Analysis thresholds |
| `PpmpAnalysisSession` / `PpmpAnalysisResult` | Analysis runs and stored reports |

### Migrations

```bash
npm run db:migrate     # create/apply a development migration
npm run db:push        # push the schema without a migration (prototyping)
npm run db:generate    # regenerate the Prisma client
npm run db:studio      # open Prisma Studio
```

### Seeding

| Command | What it does |
| --- | --- |
| `npm run seed:assets` | Imports assets from `public/Sample Header and sample Data - updated.xlsx` |
| `npm run seed:requests-repairs` | Creates sample requests and repair tickets |
| `npm run seed:demo-20` | Tops every table up to 20 rows for demos (rerunnable) |

> Seed scripts write real rows. Run them against a development or demo database only. `seed:demo-20` expects `.env.local` and uses `tsx --env-file`.

### Resetting a development database

Use Supabase's database reset or drop/recreate the schema, then re-run migrations and seeds. Never reset a production database to “fix” a data issue; correct the record through the app so the audit trail remains intact.

---

## 13. Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Production build |
| `npm start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Node test suite |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Create/apply a Prisma migration |
| `npm run db:push` | Push the schema directly |
| `npm run db:studio` | Open Prisma Studio |
| `npm run seed:assets` | Seed the asset registry from the sample workbook |
| `npm run seed:requests-repairs` | Seed sample requests and repairs |
| `npm run seed:demo-20` | Top every table to 20 demo rows |
| `npm run contract:emit` | Emit the Prisma contract |

---

## 14. Testing

```bash
npm test
```

The suite uses the Node.js built-in test runner with a `server-only` shim:

```text
node --test --import ./src/__tests__/server-only-shim.mjs src/__tests__/*.test.ts
```

Coverage focuses on the rules that are expensive to get wrong:

- PPMP parsing, analytics, and planning.
- Cache invalidation and role/session identity.
- Idempotency behavior.
- Role guards and navigation.
- Pagination and optimistic updates.
- Audit close-out requirements.
- Client logout and cache cleanup.

Run the suite before committing changes to shared rules (`inspection-rules`, `issuance-rules`, `stock`, PPMP analytics, auth guards).

### Recommended pre-merge checks

```bash
npm run lint
npm test
npm run build
```

---

## 15. Project structure

```text
.
├── middleware.ts                  # Auth, status gating, role routing, Redis role cache
├── prisma/
│   └── schema.prisma              # Data model
├── public/                        # Static assets, official form templates
├── scripts/                       # Seeds and maintenance scripts
├── src/
│   ├── app/
│   │   ├── (auth)/                # Login, signup, auth callback
│   │   ├── api/                   # XLSX downloads and health
│   │   ├── employee/              # Employee portal
│   │   ├── info/                  # Public help articles
│   │   ├── personnel/             # Personnel portal
│   │   ├── super-admin/           # Super Admin portal
│   │   ├── scan/                  # Public QR scanner
│   │   └── page.tsx               # Landing page
│   ├── components/
│   │   ├── account/               # Shared account dialogs
│   │   ├── employee/              # Employee chrome/navbar
│   │   ├── layout/                # Brand, header, layout shell
│   │   ├── personnel/             # Personnel dialogs, QR, receipts
│   │   ├── super-admin/           # Admin navbar and browse table
│   │   └── ui/                    # Cards, pagination, charts, toasts
│   ├── hooks/                     # Realtime, cached actions, page size
│   ├── lib/
│   │   ├── auth-guard.ts          # requireSuperAdmin / requireEmployee
│   │   ├── personnel-scope.ts     # Ownership scoping
│   │   ├── inspection-rules.ts    # Passed/partial and cumulative math
│   │   ├── issuance-rules.ts      # PAR/ICS threshold
│   │   ├── stock.ts               # Idempotent stocking
│   │   ├── idempotency.ts         # Duplicate-write protection
│   │   ├── templates.ts           # Template catalog
│   │   └── ppmp/                  # Parser, inspector, analytics, planning
│   └── __tests__/                 # Node test suite
└── package.json
```

### Important shared modules

| Module | Responsibility |
| --- | --- |
| `middleware.ts` | Public routes, sign-in redirects, pending/inactive blocking, role guard, Redis cache |
| `src/lib/auth-guard.ts` | Server-side role assertions |
| `src/lib/personnel-scope.ts` | “Can this personnel user see/write this record?” |
| `src/lib/inspection-rules.ts` | `isPassedAllowed`, `remainingOf`, `toCumulative` |
| `src/lib/issuance-rules.ts` | `ISSUANCE_THRESHOLD`, `resolveDocType`, `issuanceTotal` |
| `src/lib/stock.ts` | Stocking gate and high-water-mark logic |
| `src/lib/reporting.ts` | Aging buckets, calendar quarters, condition normalization (pure helpers) |
| `src/lib/reporting-queries.ts` | Scoped aging / quarterly issuance / asset-condition readers |
| `src/lib/report-excel.ts` | Official report workbooks (ExcelJS) |
| `src/lib/ppmp/analytics/*` | Trends, anomalies, forecasts, planning, GPPB table |

---

## 16. Templates and exports

Download templates from **Templates** (`/personnel/templates` or `/super-admin/templates`).

| Template | Format | Use |
| --- | --- | --- |
| Asset Import Template | XLSX | Bulk-load assets; 34 exact headers; unknown account codes are skipped |
| Account Catalog Import Template | XLSX | Super Admin only; 4 headers; existing codes updated |
| Blank AIR Form (Appendix 62) | XLSX | Manual inspections |
| PAR Form (Appendix 71) | XLS | Reference layout for PAR |
| ICS Form (Appendix 59) | XLS | Reference layout for ICS |
| Sample Header + Data | XLSX | Header and data reference |

### Generated exports

| Export | Route |
| --- | --- |
| AIR/IAR workbook | `/api/personnel/inspections/[id]/air-xlsx` |
| PAR workbook | `/api/personnel/issuances/[id]/par-xlsx` |
| ICS workbook | `/api/personnel/issuances/[id]/ics-xlsx` |
| Employee PAR | `/api/employee/issuances/[id]/par-xlsx` |
| Employee ICS | `/api/employee/issuances/[id]/ics-xlsx` |
| Aging report | `/api/personnel/reports/aging` or `/api/super-admin/reports/aging` |
| Quarterly issuance report | `/api/personnel/reports/quarterly-issuance?year=YYYY` or the super-admin equivalent |
| Asset-condition report | `/api/personnel/reports/asset-conditions` or the super-admin equivalent |
| PPMP draft | Planning results view |

Generated documents mirror the official government layouts and include the stored issuance snapshot, not live asset values. Report workbooks include the report period, applied filters, generation timestamp, and the 7-day delayed threshold in their header block.

---

## 17. Performance and reliability

- **Middleware role cache** — 60-second Redis TTL removes the profile lookup from warm requests; explicit invalidation on role/status changes.
- **Server-side pagination** — lists query in the database with search and filters instead of loading everything.
- **Targeted cache invalidation** — writes invalidate only the affected resource prefixes.
- **Idempotency keys** — protects critical writes from retries and double submits.
- **Optimistic UI** — tables update immediately while the server confirms.
- **Suspense and loading skeletons** — route-level loading states keep navigation responsive.
- **Realtime queues** — admin/personnel badges update without polling.
- **High-water-mark stocking** — makes re-inspection and retries safe by construction.
- **Document view tracking** — unique constraints prevent duplicate view rows.

If you suspect a performance regression, set `PERF_TRACE=1` and inspect the `Server-Timing` header or the middleware log line, which separates auth time from role-lookup time.

---

## 18. Security and compliance

### Authentication

- Supabase Auth handles credentials, OTP, and OAuth.
- Sessions are validated server-side in middleware using `getClaims()` where possible, falling back to `getUser()`.
- Signed-out users are redirected to `/login?next=...`; the `next` value is restricted to same-origin absolute paths to prevent open redirects.

### Authorization

- Role checks happen in middleware **and** in server actions.
- Ownership checks use `personnel-scope` and explicit `created_by` / `assigned_to` comparisons.
- Pending and inactive accounts are signed out regardless of a valid session.
- Service-role keys are server-only.

### Data protection

- Do not put secrets in `NEXT_PUBLIC_*` variables.
- Keep `.env.local` out of version control.
- Use the anon key in the browser and the service-role key only in server code.
- Restrict Supabase storage buckets to authenticated users where possible.

### Auditability

- `AuditLog` records actions with user, module, action, details, and timestamp.
- Every analysis finding carries an evidence reference (file, sheet, row, hash).
- Issuance documents store an immutable snapshot of the issued values.
- `stocked_at` and `stocked_qty` make stocking history reconstructable.
- Document views are tracked per user.

### Government records

Operational and audit records are retained according to government policy. Corrections should be made through the application or by an administrator so that the audit trail remains complete.

---

## 19. Deployment

### Build and run

```bash
npm ci
npm run build
npm start
```

### Platform notes

- Deploy to any Node.js host that supports Next.js 16 (Vercel, a container, or a Node server).
- Configure all environment variables in the hosting platform, not in committed files.
- Run `npm run db:migrate` as a release step against the production database.
- Ensure the Supabase project has the required auth providers enabled and the redirect URL set to `${NEXT_PUBLIC_APP_URL}/auth/callback`.
- Configure Upstash Redis for production; the app works without it but loses the middleware warm-path cache.
- Set `NEXT_PUBLIC_APP_URL` to the public HTTPS URL so QR codes resolve correctly.

### Post-deploy checklist

- [ ] `/api/health` responds.
- [ ] Sign-in works for each role.
- [ ] Pending accounts are blocked with the correct notice.
- [ ] A Super Admin can approve a user.
- [ ] A delivery can be logged and inspected.
- [ ] Stocking requires an AIR/IAR.
- [ ] A PAR is generated above ₱50,000 and an ICS at or below it.
- [ ] Documents download as valid `.xlsx` files.
- [ ] QR codes resolve.
- [ ] PPMP upload, analysis, and planning work.
- [ ] Audit logs record the test actions.

---

## 20. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Redirected to `/login?notice=pending` | Account awaiting approval | Approve it in Super Admin → Users |
| Redirected to `/login?notice=inactive` | Account deactivated | Reactivate it in Super Admin → Users |
| Signed in but bounced to `/` | Role does not match the portal | Use the portal for your role, or ask an admin to correct the role |
| “Passed” is disabled | Received quantities do not equal PO quantities | Record the true quantity as **partial**, or correct the item quantities |
| Inspection will not stock | No AIR/IAR linked, or result is `failed` | Generate/attach the AIR/IAR and set the result to passed/partial |
| Stock increased twice | This should not happen due to `stocked_qty`; check the inspection history | Review `stocked_qty` and `stocked_at`; do not manually add stock to compensate |
| Cannot issue an asset | Asset is not `available` or is already assigned | Choose an available asset or correct the assignment |
| PAR/ICS type looks wrong | Total is on the other side of ₱50,000 | Verify unit cost and quantity; the threshold is strict `>` |
| Request cannot be completed | It is still `pending` or was rejected | Approve it first; rejected requests are terminal |
| PPMP upload rejected | Not `.xlsx`, over 10 MB, corrupt, or too many files | Re-save as `.xlsx`, reduce size, select at most 3 files |
| “Analysis limit reached” | More than 100 analyses in an hour | Wait for the window to pass |
| Duplicate PPMP file not stored | SHA-256 hash already exists for this user | Reuse the existing file; duplicates are intentional |
| Role change not taking effect | 60-second middleware cache | Wait up to 60 seconds or sign out/in; explicit invalidation normally handles it |
| Redis errors in logs | Upstash not configured or unreachable | Set both Upstash variables or ignore (app degrades gracefully) |
| Database connection errors | Wrong `DATABASE_URL`/`DIRECT_URL` or pool exhaustion | Verify Supabase connection strings and pooling mode |
| `prisma generate` errors | Client out of date | Run `npm run db:generate` |
| Excel download is invalid | API route error or missing record | Check the server log and confirm the record still exists |

### Debugging tips

- Set `PERF_TRACE=1` to see timing headers.
- Use Prisma Studio (`npm run db:studio`) to inspect records.
- Check Supabase Auth logs for sign-in/OTP failures.
- Check the browser console for QR camera permission errors.
- For ownership bugs, compare `created_by` / `assigned_to` with the signed-in user ID.

---

## 21. Glossary

| Term | Meaning |
| --- | --- |
| **PGSO** | Provincial General Services Office |
| **PSMS** | Property & Supply Management System |
| **PPMP** | Project Procurement Management Plan |
| **AIR** | Acceptance and Inspection Report |
| **IAR** | Inspection and Acceptance Report |
| **PAR** | Property Acknowledgment Receipt — used above ₱50,000 |
| **ICS** | Inventory Custodian Slip — used at or below ₱50,000 |
| **PO** | Purchase Order |
| **RIS** | Requisition and Issue Slip |
| **GPPB** | Government Procurement Policy Board |
| **Stock** | Consumables and semi-expendable items tracked by quantity |
| **Asset** | Equipment/property tracked individually in the registry |
| **High-water mark** | `stocked_qty`, the maximum quantity already moved to stock for a delivery item |
| **Consolidated issuance** | One PAR/ICS covering multiple line items |
| **Idempotency** | Guarantee that repeating the same write does not duplicate the result |
| **Personnel scope** | The ownership rule that limits personnel to records they created or own |
| **Evidence reference** | The file/sheet/row/hash pointer attached to a PPMP finding |

---

## License

This project is developed for the Provincial Government Services Office. Refer to your organization's policy for distribution and reuse.

## Support

- Check the in-app **Info** pages for user-facing help.
- Review **Logs** for the audit trail of a record.
- Contact the system administrator for account, role, or data-correction requests.
