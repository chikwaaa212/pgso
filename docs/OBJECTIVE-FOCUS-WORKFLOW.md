# Objective-Focused Workflow

**The featured workflow of PGSO-PSMS: from a supplier delivery to a signed accountability document — and the oversight that follows.**

This document explains one workflow in detail, end to end, and shows how every stage answers a project objective. It is written for reviewers, demo presenters, and new team members who need to understand *why* the system is shaped this way, not just which button to press.

- **Audience:** project reviewers, panelists, developers, and trainers.
- **Scope:** the receiving → inspection → AIR/IAR → stocking → issuance chain, plus the repair, QR, and analytics stages that hang off it.
- **Basis:** source-code review of this repository as of **3 November 2026**. UI labels and rules below are taken from the code, not assumed.

> For the non-technical walkthrough, see [`USER-GUIDE.md`](USER-GUIDE.md) §8. For the full feature reference, see the root [`README.md`](../README.md) §5 and §7.

---

## 1. Why this workflow is the focus

Most property-management systems fail at one of two seams:

1. **Stock is recorded before inspection**, so the inventory believes in goods that have not arrived or were rejected.
2. **Property is issued without a signed accountability document**, so nobody can prove who holds what.

PGSO-PSMS is built around a single guarded chain that closes both gaps. Every other module — repairs, QR scanning, reports, recommendations, PPMP planning — reads from or feeds into this chain. That is what makes it the *objective-focused* workflow: the objectives are not six independent features bolted together; they are six views of one operating loop.

```text
Delivery logged
    ↓
Inspection recorded (passed / partial)
    ↓
AIR / IAR generated or attached
    ↓
Stock or asset created — only now
    ↓
Issuance prepared (PAR or ICS)
    ↓
Employee acknowledges the property
    ↓
Repairs, QR handover, reports, recommendations
```

Each arrow is a **server-side rule**, not a UI hint. The next stage refuses to start if the previous one is incomplete.

---

## 2. The cast

| Role | Portal | Role in this workflow |
| --- | --- | --- |
| **Employee** | `/employee/*` | Requests a new assignment, transfer, or repair; receives the item; views and downloads their own PAR/ICS; scans a handover QR. |
| **PGSO Personnel** | `/personnel/*` | Logs deliveries, records inspections, generates AIR/IAR, stocks items, prepares PAR/ICS, approves requests, manages repairs. Sees records they created or own. |
| **Super Admin** | `/super-admin/*` | Does everything personnel can do, plus user approval, master data, templates, and province-wide oversight. Sees every record. |

**Access gate:** `middleware.ts` authenticates the Supabase session, loads role/status (60-second Redis cache with a database fallback), signs out `pending` or `inactive` accounts, and blocks cross-portal navigation. Server actions re-check the role and ownership before writing.

**Account lifecycle prerequisite:** self-registration creates a `pending` profile. A Super Admin must approve it and assign a role before the account can enter the workflow. The first sign-in completes the profile overlay, then the role dashboard opens.

---

## 3. The flow at a glance

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 1. DELIVERY                                                          │
│    Personnel logs supplier, PO reference, date, kind, line items.    │
│    delivery_kind = stock | asset    inspection_status = pending      │
└───────────────────────────────┬──────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 2. INSPECTION                                                        │
│    Enter quantity received THIS ROUND per item.                      │
│    System converts to cumulative = already stocked + this round.     │
│    Result: passed  ⟺ every item cumulative = PO quantity             │
│            partial ⟺ any shortfall / damage / incomplete             │
└───────────────────────────────┬──────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 3. AIR / IAR                                                         │
│    Generate from the inspection, or attach a prepared copy.          │
│    No AIR/IAR = no stocking.                                         │
└───────────────────────────────┬──────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 4. STOCKING  (passed or partial + AIR/IAR)                           │
│    Only the not-yet-stocked remainder moves:                         │
│    addable = actual − stocked_qty      watermark = max(stocked, actual)│
│    Re-processing the same inspection adds ZERO.                      │
└───────────────────────────────┬──────────────────────────────────────┘
                                ↓
              ┌─────────────────┴─────────────────┐
              ↓                                   ↓
┌───────────────────────────┐       ┌──────────────────────────────────┐
│ 5a. DIRECT ISSUANCE       │       │ 5b. EMPLOYEE REQUEST             │
│ Personnel issues an       │       │ Employee submits transfer /      │
│ available asset or stock  │       │ new assignment / repair.         │
│ to an active employee.    │       │ Personnel approves or rejects.   │
└─────────────┬─────────────┘       └──────────────┬───────────────────┘
              └─────────────────┬─────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 6. ACCOUNTABILITY DOCUMENT                                           │
│    total = unit_cost × quantity                                      │
│    total > ₱50,000  → PAR                                            │
│    total ≤ ₱50,000  → ICS                                            │
│    One consolidated approval = one document with multiple lines.     │
└───────────────────────────────┬──────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 7. HANDOVER AND AFTERCARE                                            │
│    Request completed → QR handover code.                             │
│    Repair ticket: pending → in_progress → completed (reopenable).    │
│    Asset condition/status updated as appropriate.                    │
└───────────────────────────────┬──────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 8. OVERSIGHT                                                         │
│    Documents hub · Reports (aging, quarterly issuance, conditions)   │
│    Recommendations · PPMP analytics/planning · Audit logs            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Stage-by-stage explanation

### Stage 0 — Account readiness

**Goal:** ensure only approved people can move property.

1. The user signs up through Supabase Auth.
2. A `Profile` row is created with `status = pending`.
3. The pending user is signed out at `/login?notice=pending`.
4. A Super Admin reviews the account under **Users**, approves it (`status = active`), and assigns `employee`, `pgso_personnel`, or `super_admin`.
5. On first sign-in, the user completes the required profile fields.
6. Middleware routes the user to the portal that matches their role.

**What can go wrong:** an inactive or pending account is always signed out, even if the browser still holds a session. Role changes invalidate the 60-second role cache.

---

### Stage 1 — Log the delivery

**Who:** personnel or Super Admin.
**Where:** **Deliveries → Log delivery** (`/personnel/deliveries`).
**Writes:** `Delivery` + one or more `DeliveryItem` rows.

Captured fields:

| Field | Purpose |
| --- | --- |
| Supplier | Who delivered the goods. |
| PO reference | Ties the delivery to the purchase order. |
| Delivery date / expected arrival | When it arrived vs when it was due. |
| Delivery kind | `stock` (consumables) or `asset` (equipment). |
| Account title | Chosen from Master Data; the asset type is derived from it. |
| Account code | Typed or generated from the form's history. |
| Line items | Item name, unit, quantity, unit cost. |

**Initial state:** `inspection_status = pending`. `delivery_status` independently records whether the delivery event was `complete`, `partial`, or `awaiting`.

**Important distinction:** `delivery_status` describes the shipment. `inspection_status` describes the acceptance decision. A shipment can arrive "complete" and still fail inspection.

**Why the account title is constrained:** titles and asset types come from Super Admin Master Data. This keeps reporting, PPMP categories, and accountability documents consistent instead of accumulating free-text spellings.

---

### Stage 2 — Record the inspection

**Who:** personnel or Super Admin.
**Where:** **Inspections** (`/personnel/inspections`) or the delivery detail.
**Writes:** `Inspection` with `result`, `item_checks`, `supplier_checks`, photos, and remarks.

The inspector enters the quantity **received this round**, not the cumulative total. The system performs the cumulative math:

```text
cumulative = already-stocked quantity (stocked_qty) + this round's quantity
```

The pass gate is strict:

```text
passed  ⟺  for every item: cumulative received = PO quantity
partial ⟺  any item is short, damaged, or incomplete
```

This is implemented in `src/lib/inspection-rules.ts`:

| Function | What it does |
| --- | --- |
| `isPassedAllowed(checks, items)` | Returns true only when every item's effective quantity exactly equals its PO quantity. Empty item lists cannot pass. |
| `remainingOf(item)` | Outstanding balance: `max(0, PO quantity − stocked_qty)`. |
| `toCumulative(checks, items)` | Adds the already-counted base to this round's count and clamps invalid values to zero. |

**Partial is not a failure.** It is the honest result when part of an order has arrived. The same delivery can be inspected again when the remainder shows up. The cumulative gate still applies on the second inspection.

**Legacy `failed`:** older records may carry `failed`. It does not stock, but it remains editable so it can be corrected to `partial` or `passed`.

**Photos:** up to five inspection photos can be attached and appear in the Documents hub.

---

### Stage 3 — Generate or attach the AIR/IAR

**Who:** personnel or Super Admin.
**Where:** inspection detail → **IAR** (`/personnel/inspections/[id]/iar`).

The inspector can:

- generate the Acceptance and Inspection Report from the inspection data, or
- attach a prepared AIR/IAR document.

**Hard rule:** stocking requires at least one `IarRecord` linked to the inspection. A passed or partial inspection without an AIR/IAR stays unstocked until one exists. This is why the **Stock → Sync from inspections** action can safely be run later — it only picks up inspections that already have an AIR/IAR.

**Why this gate exists:** the AIR/IAR is the legal acceptance evidence. Stocking without it would create inventory that no signed document supports.

---

### Stage 4 — Stocking

**Who:** automatic, triggered when an inspection is saved/processed; personnel can re-run it with **Sync from inspections**.
**Where:** `stockInspectionItems()` in `src/lib/stock.ts`.
**Writes:** `InventoryItem` quantities, `DeliveryItem.stocked_qty`, `Inspection.stocked_at`.

Eligibility:

```text
result ∈ { passed, partial }  AND  at least one linked AIR/IAR
```

The high-water mark is the heart of the safety model:

```text
addable   = max(0, actual − stocked_qty)
watermark = max(stocked_qty, actual)
```

Consequences:

| Situation | Result |
| --- | --- |
| PO 10, inspect 6 → partial | Stock +6; watermark = 6. |
| Later inspect remaining 4 → passed | Stock +4; watermark = 10. |
| Re-process the same inspection | Add 0; watermark unchanged. |
| Inspect 6, then re-open and still count 6 | Add 0. |
| Legacy `failed` inspection | Does not stock. |

**Cost repair:** if unit costs arrive after the goods were stocked, the inventory row's `unit_cost` is backfilled or refreshed without changing quantities. This matters because issuance evaluation uses cost to choose PAR vs ICS.

**Stock vs asset:** stocking writes an `InventoryItem` row tagged with the delivery kind. `stock` rows are consumable quantities; `asset` rows represent equipment on hand and are the bridge to the individually tracked records in the asset registry, where assets are created or imported. The asset registry carries property number, category, condition, location, and custody; the inventory row carries quantity and value.

**Idempotency:** stocking is safe to retry. The watermark makes the operation monotonic, and the write path uses idempotency protection so a double submit cannot duplicate records.

**Sync safety:** `syncUnstockedInspections()` scans only passed/partial inspections that already have an AIR/IAR, limits each batch to 50 records, and runs them with bounded concurrency (5 at a time).

---

### Stage 5a — Direct issuance

**Who:** personnel or Super Admin.
**Where:** **PAR / ICS → New issuance** (`/personnel/issuances`).
**Writes:** `IssuanceRecord` + asset/stock assignment.

Steps:

1. Select an active employee.
2. Select an available asset or a stock item.
3. Enter quantity, unit cost, and document details.
4. The system computes the total and chooses the document type.
5. Save. The assignment and the issuance record are created together.
6. Download the generated `.xlsx`.

Guards enforced server-side:

- The asset must be `available` and unassigned.
- Stock quantity must be sufficient; it cannot go below zero.
- The recipient must be `active`.
- An asset already in use cannot be issued again.

---

### Stage 5b — Employee request → approval → issuance

**Employee side** (`/employee/requests`):

1. **New request.**
2. Choose **Transfer** (item already held), **New assignment** (additional item), or **Repair** (item already held).
3. Select the item, add a description, submit. Status: `pending`.

**Personnel side** (`/personnel/requests`):

1. Review the request and item.
2. **Approve** or **Reject** with remarks.
   - Approving a **new assignment** can issue the item immediately and create the PAR/ICS.
   - Approving a **transfer** moves custody to the target employee.
   - Approving a **repair** creates a repair ticket.
3. After the physical handover, mark the request **completed**.
4. A completed request exposes a QR code that personnel can scan to confirm the handover.

**Allowed transitions only:**

```text
pending ──approve──▶ approved ──complete──▶ completed
   │
   └──reject──▶ rejected   (terminal)
```

`rejected` and `completed` are final. Any other transition returns an error. Personnel can also submit **stock replenishment** requests; employees cannot.

**Why the request path and direct path converge:** both call the same issuance rules. Whether a person walks in or files a request, the same threshold, availability, and snapshot rules apply. There is no "back door" that skips accountability.

---

### Stage 6 — Accountability document (PAR or ICS)

**Rule (in `src/lib/issuance-rules.ts`):**

```text
total > ₱50,000  → PAR
total ≤ ₱50,000  → ICS
```

- `issuanceTotal(unitCost, quantity, fallbackTotal)` computes `unit_cost × quantity`, with a stored-total fallback for records that already state a total.
- **One consolidated approval produces one document.** Multiple lines live in `issuance_data.lines`, so the printed document and the stored record agree.
- **Immutable snapshot.** The issuance stores the values at the moment of issue. Later edits to the asset or cost do not rewrite history.
- The document is downloadable as `.xlsx` through the PAR/ICS Excel builders.

**Why the threshold matters:** the PAR and ICS are different accountability instruments. Choosing the correct one is a compliance decision, so it is calculated by the system rather than left to the user.

---

### Stage 7 — Handover, repairs, and QR

**Request handover:** completing a request reveals a QR code. Scanning it lets authorized personnel confirm the handover. The public `/scan` route stays read-only and shows identification only.

**Repairs:**

```text
Employee repair request approved  →  ticket created (pending)
Personnel files a ticket directly →  pending
pending → in_progress  (technician + diagnosis required)
in_progress → completed (cost + resolution required)
completed → reopened when the fix does not hold
```

Only the creator (or Super Admin) can edit a ticket. Asset status/condition is updated as appropriate (for example, `maintenance` while under repair).

**QR on assets and stock:** tags resolve to the asset or stock detail page. On staff portals the scan-to-action row can open details, view history, log a repair, request a transfer, or request stock replenishment with the asset and holder prefilled. The public tag endpoint returns identification fields only — never costs, remarks, suppliers, account numbers, or assignees.

---

### Stage 8 — Oversight and decision support

The records created by the chain are not dead data. They feed:

| Feature | What it answers |
| --- | --- |
| **Documents hub** | Every receipt, inspection, AIR/IAR, PAR, ICS, stock card, asset record, and repair ticket in one place. Viewed state is per user. |
| **Reports → Aging & delays** | Which inspections, requests, and repairs have been open past the 7-day threshold. |
| **Reports → Quarterly issuance** | How many PAR/ICS documents were issued this quarter, to which offices and employees. |
| **Reports → Asset conditions** | How much of the fleet is serviceable vs unserviceable. |
| **Recommendations** | Low-stock replenishment, replacement/disposal, idle assets (180+ days), duplicate custody, consumption signals. |
| **PPMP analytics / planning** | Year-over-year comparison, anomalies, forecasts, and a draft procurement plan within a budget ceiling. |
| **Audit logs** | Who changed what, when — the paper trail behind every state change. |

Report readers live in `src/lib/reporting-queries.ts`; the XLSX builders read the same results as the page, so the screen and the export cannot disagree.

---

## 5. Rules reference

| # | Rule | Where enforced |
| --- | --- | --- |
| 1 | `passed` requires every item's cumulative received quantity to equal its PO quantity. | `inspection-rules.ts` |
| 2 | Any shortfall forces `partial`; re-inspection is additive. | `inspection-rules.ts`, inspection actions |
| 3 | Stocking requires a `passed` or `partial` inspection **and** an AIR/IAR. | `stock.ts` |
| 4 | `stocked_qty` is a high-water mark; re-processing never double-stocks. | `stock.ts` |
| 5 | A legacy `failed` inspection does not move stock. | `stock.ts` |
| 6 | Late costs update inventory values without changing quantities. | `stock.ts` |
| 7 | `total > ₱50,000` → PAR; otherwise ICS. | `issuance-rules.ts` |
| 8 | Only available, unassigned assets can be issued; stock must be sufficient; recipient must be active. | issuance actions |
| 9 | One consolidated approval = one PAR/ICS with multiple lines. | `issuance_data.lines` |
| 10 | Issued values are an immutable snapshot. | `IssuanceRecord` |
| 11 | Requests may only move `pending → approved` or `pending → rejected`, then `approved → completed`. | request actions |
| 12 | Approving a new assignment may issue; approving a repair creates a ticket. | request actions |
| 13 | Critical writes are idempotent. | `idempotency.ts` |
| 14 | Personnel see only records they created/own; employees see only their own; Super Admin sees all. | `personnel-scope.ts`, actions |
| 15 | Public asset lookups expose identification fields only. | `asset-tag.ts`, public route |

---

## 6. Worked example — ten laptops

This is the same story told in the user guide, annotated with the rules.

| Step | Action | System state |
| --- | --- | --- |
| 1 | Supplier delivers 10 laptops at ₱45,000 each. Personnel logs a delivery: kind **asset**, line `Laptop, unit, 10, ₱45,000`. | `inspection_status = pending` |
| 2 | Only 6 arrived. Inspector enters **6 received this round**, attaches photos, chooses **Partial**. | `passed` is refused (6 ≠ 10) |
| 3 | Inspector generates the AIR/IAR. | AIR/IAR linked |
| 4 | Stocking runs. | Stock +6; `stocked_qty = 6`; 4 still outstanding |
| 5 | The remaining 4 arrive. Inspector enters **4** on a second inspection. | cumulative = 6 + 4 = 10 = PO |
| 6 | Inspector chooses **Passed**, generates the AIR/IAR. | `passed` allowed |
| 7 | Stocking runs. | Stock +4; total = 10; no double-count |
| 8 | Employee requests a **new assignment** and selects a laptop. | Request `pending` |
| 9 | Personnel approve. | Laptop assigned; issuance created |
| 10 | Total = ₱45,000 ≤ ₱50,000. | Document type = **ICS** (₱60,000 would be PAR) |
| 11 | Handover done; personnel mark **completed**. | Request `completed`; QR handover code appears |
| 12 | Laptop breaks; employee files a **repair** request. | Request `pending` |
| 13 | Personnel approve. | Repair ticket `pending` |
| 14 | Technician starts work. | `in_progress` with technician and diagnosis |
| 15 | Work finished; personnel complete with cost and resolution. | `completed`; asset condition updated |

**What the example proves:** partial receipts are handled honestly, the second inspection cannot over-stock, the threshold picks the right document, and the repair trail attaches to the same asset.

---

## 7. "Why did the system stop me?"

| Symptom | Cause | Correct action |
| --- | --- | --- |
| Cannot mark inspection **Passed** | At least one item's cumulative quantity is below its PO quantity. | Record the shortfall as **Partial** and inspect again when the rest arrives. |
| Stock did not update after inspection | The inspection has no linked AIR/IAR, or it is a legacy `failed` record. | Generate/attach the AIR/IAR, then use **Stock → Sync from inspections**. |
| Inspecting the same delivery twice changed nothing | `stocked_qty` is a high-water mark. | Expected behavior — only the unstocked remainder moves. |
| Document is PAR instead of ICS | `unit_cost × quantity` is greater than ₱50,000. | Verify the cost and quantity; the threshold is intentional. |
| Cannot issue an asset | It is not `available`, already assigned, the recipient is inactive, or stock is insufficient. | Pick an available item or restock; the Send button shows the specific reason. |
| Cannot complete a request | Only an `approved` request can be completed. | Approve first; `rejected` and `completed` are terminal. |
| Cannot see another person's record | Personnel are scoped to records they created/own; employees see only their own. | Ask the owner or a Super Admin; this is enforced on the server. |
| Signed out despite a valid session | The profile is `pending` or `inactive`. | Super Admin must approve/reactivate the account. |

---

## 8. How the workflow answers the objectives

| Objective | Stages that satisfy it | Concrete evidence |
| --- | --- | --- |
| **1. Digitize receiving, inspection, inventory, repair monitoring, and document processing** | 1–4, 7 | Delivery → inspection → AIR/IAR → automatic stocking; repair tickets; printable/exportable documents. |
| **2. Manage inventory and asset accountability** | 4–6 | Assignment, location, condition, custody, per-asset history; issuance snapshots; employee sees only their own property. |
| **3. Track repair and maintenance activities** | 7 | Ticket lifecycle, technician, diagnosis, cost, resolution, reopen, condition updates. |
| **4. Apply descriptive analytics** | 8 | Aging/delays (7-day threshold), quarterly issuance, asset conditions, workflow counts, low-stock views, XLSX exports. |
| **5. Apply prescriptive analytics** | 8 | Replenishment quantities, replacement/disposal, idle-asset reassignment, PPMP quantity suggestions and variance. |
| **6. Enhance asset tracking with QR** | 7 | Tags on assets/stock/completed requests; scan-to-action prefills repairs, transfers, replenishment; public read-only identification. |

**One-line thesis for a presentation:** *the system enforces one chain — delivery, inspection, AIR/IAR, stock, issuance — and then turns that chain into accountability, maintenance, analytics, and planning.*

---

## 9. Where this lives in the code

| Concern | File(s) |
| --- | --- |
| Route gating, role cache, public paths | `middleware.ts` |
| Server-side role assertions | `src/lib/auth-guard.ts` |
| Ownership scope and memoized identity | `src/lib/personnel-scope.ts` |
| Delivery logging | `src/app/personnel/deliveries/actions.ts`, `log-delivery-mock-form.tsx` |
| Inspection recording | `src/app/personnel/inspections/actions.ts`, `[id]/inspection-form.tsx` |
| Pass/partial and cumulative math | `src/lib/inspection-rules.ts` |
| Idempotent stocking / high-water mark | `src/lib/stock.ts` |
| Inspection → stock sync | `src/app/personnel/inventory/actions.ts` (`syncUnstockedInspections`) |
| PAR/ICS threshold and totals | `src/lib/issuance-rules.ts` |
| Issuance and assignment | `src/app/personnel/issuances/actions.ts` |
| Request approval and transitions | `src/app/personnel/requests/actions.ts`, `request-types.ts` |
| Duplicate-write protection | `src/lib/idempotency.ts` |
| AIR/IAR generation | `src/app/personnel/inspections/[id]/iar/page.tsx`, `src/lib/air-excel.ts` |
| PAR/ICS exports | `src/lib/par-excel.ts`, `src/lib/ics-excel.ts` |
| Documents hub | `src/app/personnel/documents/page.tsx` |
| QR tags and scan actions | `src/lib/asset-tag.ts`, `src/lib/scan-actions.ts`, `src/lib/scan-actions-server.ts` |
| Reports | `src/lib/reporting-queries.ts`, `src/lib/report-excel.ts` |
| Recommendations | `src/lib/prescriptive-queries.ts`, `src/lib/prescriptive/*` |
| PPMP analytics and planning | `src/lib/ppmp/**` |
| Data model | `prisma/schema.prisma` |
| Tests for the shared rules | `src/__tests__/**` |

---

## 10. Verification checklist

Use this as a demo script or a smoke test. Each item should pass on a clean dataset.

- [ ] A `pending` account is signed out and cannot open a portal.
- [ ] An approved employee lands on `/employee`, personnel on `/personnel`, Super Admin on `/super-admin`.
- [ ] Logging a delivery sets `inspection_status = pending` and creates line items.
- [ ] With 6 of 10 received, **Passed** is disabled/rejected; **Partial** succeeds.
- [ ] Without an AIR/IAR, stocking does nothing; after generating one, 6 units stock.
- [ ] Re-processing the same inspection adds 0 units.
- [ ] A second inspection for the remaining 4 passes and stocks exactly 4 more.
- [ ] Direct issuance of a ₱45,000 item creates an **ICS**; a ₱60,000 item creates a **PAR**.
- [ ] Issuing an unavailable asset is refused with a specific reason.
- [ ] A new-assignment request issues the item on approval; a repair request creates a ticket.
- [ ] A pending request cannot be completed; an approved request can.
- [ ] Completing a request exposes a QR handover code.
- [ ] A repair ticket requires a technician to start and a cost to complete.
- [ ] Reports show the aging bucket, quarterly issuance, and asset-condition breakdown.
- [ ] The public asset lookup returns no costs, remarks, suppliers, account numbers, or assignees.
- [ ] `npm test` passes for the inspection, issuance, stock, idempotency, and pagination suites.

---

## 11. Related reading

| Document | Why read it |
| --- | --- |
| [`USER-GUIDE.md`](USER-GUIDE.md) | Plain-language screens, buttons, and the same story without code. |
| [`SYSTEM-OBJECTIVES-GUIDE.md`](SYSTEM-OBJECTIVES-GUIDE.md) | Where each of the six objectives lives in the menus, routes, and roles. |
| [`README.md`](../README.md) §5 | Full end-to-end workflows, status reference, business rules. |
| [`assessments/OBJECTIVES-ASSESSMENT.md`](assessments/OBJECTIVES-ASSESSMENT.md) | Objective-by-objective verdict and evidence. |
| [`assessments/SCOPE-AND-LIMITATIONS-VERIFICATION.md`](assessments/SCOPE-AND-LIMITATIONS-VERIFICATION.md) | Honest boundaries: what is not implemented (for example, no standalone RIS, no document approval lifecycle). |
| [`plans/OBJECTIVE-4-DESCRIPTIVE-ANALYTICS-PLAN.md`](plans/OBJECTIVE-4-DESCRIPTIVE-ANALYTICS-PLAN.md) | Reports workspace, aging, quarterly issuance, conditions. |
| [`plans/OBJECTIVE-5-PRESCRIPTIVE-ANALYTICS-PLAN.md`](plans/OBJECTIVE-5-PRESCRIPTIVE-ANALYTICS-PLAN.md) | Recommendations and PPMP suggestions. |
| [`plans/OBJECTIVE-6-QR-SCANNING-PLAN.md`](plans/OBJECTIVE-6-QR-SCANNING-PLAN.md) | Scan-to-action and prefill. |
