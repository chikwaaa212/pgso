# PGSO-PSMS — How the System Works

**A plain-language guide to every feature: where to find it, what to do, and what the system does for you.**

This guide is written for **non-technical users** — property custodians, supply officers, administrators, and employees. It explains the screens, the buttons, the workflow, and the reasoning behind the rules. You do not need to understand code, databases, or servers to use it.

If you are a developer looking for architecture and setup instructions, read the root `README.md` instead. This document is about **using** the system.

---

## Table of contents

1. [How to read this guide](#1-how-to-read-this-guide)
2. [The big picture](#2-the-big-picture)
3. [Signing in and account states](#3-signing-in-and-account-states)
4. [Where to see / where to act: the master map](#4-where-to-see--where-to-act-the-master-map)
5. [The employee portal](#5-the-employee-portal)
6. [The personnel portal, module by module](#6-the-personnel-portal-module-by-module)
7. [The Super Admin portal](#7-the-super-admin-portal)
8. [The complete workflow, told as a story](#8-the-complete-workflow-told-as-a-story)
9. [Status cheat sheet](#9-status-cheat-sheet)
10. [“Why did the system stop me?” — rules in plain English](#10-why-did-the-system-stop-me--rules-in-plain-english)
11. [Common tasks cheat sheet](#11-common-tasks-cheat-sheet)
12. [Glossary](#12-glossary)

---

## 1. How to read this guide

Every feature section follows the same shape:

| Label | What it tells you |
| --- | --- |
| **Where to find it** | The portal and menu item (and page address, if you like bookmarks). |
| **What you see** | The lists, cards, and fields on that page. |
| **What you can do** | The actions available to you. |
| **What the system does** | The behind-the-scenes logic, in everyday language. |
| **Why it matters** | The real-world problem the feature prevents. |

Three words appear constantly:

- **Record** — one saved entry (a delivery, an inspection, an employee request, etc.).
- **Status** — the current “state” of a record, shown as a colored badge.
- **HQ** — not used here; ignore.

> **Golden rule of the whole system:** nothing enters stock and nothing is issued without the paperwork that justifies it. If a button is disabled or an action is refused, the system is protecting the paper trail, not malfunctioning.

---

## 2. The big picture

### 2.1 What PGSO-PSMS does

PGSO-PSMS is the operating system of the Provincial General Services Office. It follows property from the moment a supplier knocks on the warehouse door to the moment an employee signs for it — and every repair, transfer, and report in between.

It replaces spreadsheets with one connected chain:

```text
Supplier delivers goods
        ↓
You log the delivery
        ↓
You inspect what actually arrived
        ↓
The AIR / IAR is generated or attached
        ↓
Stock or an asset record is created — only now
        ↓
You issue the item to an employee (PAR or ICS)
        ↓
The employee acknowledges it
        ↓
Repairs, transfers, reports, and audits follow
```

### 2.2 Why the chain matters

In a manual system, three things go wrong constantly:

1. **Stock is recorded before inspection** — the count is wrong and nobody knows why.
2. **Property is issued without a signed document** — nobody can prove who holds it.
3. **A short delivery is treated as complete** — the province pays for goods it never received.

PGSO-PSMS blocks all three. The rules are enforced by the server, not just suggested by the screen, so they hold even if someone bookmarks a page or clicks a stale button.

### 2.3 The three portals

| Portal | Who uses it | What they see | Address |
| --- | --- | --- | --- |
| **Employee** | Rank-and-file employees | Only their own property, documents, and requests | `/employee/*` |
| **Personnel** | PGSO property and supply staff | The records they created or own, plus shared master data and asset registry | `/personnel/*` |
| **Super Admin** | The PGSO administrator | Everything, everywhere, plus user and master-data management | `/super-admin/*` |

The system sends each person to the correct portal automatically after sign-in. You cannot wander into another portal by editing the address bar — the system redirects you back.

### 2.4 A simple analogy

Think of the system as a **warehouse with a strict receiving clerk**:

- The **delivery** is the supplier’s claim (“I brought 10 laptops”).
- The **inspection** is the clerk counting them (“I received 6”).
- The **AIR/IAR** is the signed receipt that makes the count official.
- **Stock/Assets** is what is actually on the shelf.
- **PAR/ICS** is the borrower’s signed promissory note.
- **Reports and Recommendations** are the manager reading the shelves and asking, “What should we buy next, and what is sitting idle?”

---

## 3. Signing in and account states

### 3.1 Where to find it

The public landing page is `/`. The sign-in page is `/login`; self-registration is `/signup`.

You can sign in with:

- Email and password,
- A one-time code sent to your email, or
- Google sign-in.

### 3.2 Account states

Every account has a status:

| Status | Meaning | Can sign in? |
| --- | --- | --- |
| `pending` | You registered, but an administrator has not approved you yet. | No — you are signed out with a “pending” notice. |
| `active` | Approved and enabled. | Yes. |
| `inactive` | Disabled by an administrator. | No — you are signed out with an “inactive” notice. |

**What the system does:** every request checks your status first. A pending or inactive account is signed out even if the browser still holds a valid session. This is deliberate: deactivating an account takes effect immediately.

### 3.3 First sign-in

When an employee is approved for the first time, a **Complete your profile** overlay appears. It asks for:

- Name parts (first, middle, last),
- Employee number,
- Position,
- Department.

You cannot use the portal until this is submitted. Departments are checked against the master list that the Super Admin maintains, so spelling must match an existing department.

### 3.4 The account menu

Every portal shows the same account menu in the top-right corner:

| Option | What it does |
| --- | --- |
| **Edit name** | Changes the display name shown across the system. |
| **Change password** | Changes your password without leaving the portal. |
| **Department** | Personnel can set or update their assigned department. |

Name and profile edits are recorded in the audit trail.

### 3.5 Why it matters

The account state is the first line of defense. A former employee cannot keep using an old session, and a new employee cannot act until an administrator has verified them.

---

## 4. Where to see / where to act: the master map

Use this table when you know **what you want to do** but not **where it lives**.

| I want to… | Portal | Menu / page |
| --- | --- | --- |
| See my assigned property and my PAR/ICS | Employee | **My Assets** |
| Ask for a transfer, a new item, or a repair | Employee | **My Requests** |
| See my dashboard and current requests | Employee | **Dashboard** |
| Log a supplier delivery | Personnel / Super Admin | **Deliveries → Log delivery** |
| Inspect a delivery | Personnel / Super Admin | **Inspections → Inspect**, or the delivery row |
| Generate or attach an AIR/IAR | Personnel / Super Admin | Inspection detail → **AIR / IAR** |
| See inventory quantities | Personnel / Super Admin | **Stock** |
| Add or correct stock | Personnel / Super Admin | **Stock → Add stock** |
| Pull in stock from completed inspections | Personnel / Super Admin | **Stock → Sync from inspections** |
| Add, import, or edit assets | Personnel / Super Admin | **Assets** |
| Show an asset’s QR code | Personnel / Super Admin | **Assets → QR icon** |
| Issue an asset to an employee | Personnel / Super Admin | **Assets → Send icon**, or approve a new-assignment request |
| See all PAR/ICS documents | Personnel / Super Admin | **PAR / ICS** |
| See what was issued to whom | Personnel / Super Admin | **Issues** |
| Review and approve employee requests | Personnel / Super Admin | **Requests** |
| Create a stock replenishment request | Personnel / Super Admin | **Requests → New request** |
| Work on a repair ticket | Personnel / Super Admin | **Repairs** |
| Find a document | Personnel / Super Admin | **Documents** (tabs) |
| Scan a QR code | Personnel / Super Admin | **QR Scanner** |
| Analyse delays, issuance, and asset conditions | Personnel / Super Admin | **Reports** |
| Get advice on restocking, replacement, and idle assets | Personnel / Super Admin | **Recommendations** |
| Upload and analyse PPMP workbooks | Personnel / Super Admin | **PPMP** |
| Download blank forms and templates | Personnel / Super Admin | **Templates** |
| Review my own activity | Personnel | **Logs** |
| Approve users and manage roles | Super Admin | **Users** |
| Manage account codes, units, and departments | Super Admin | **Master Data** |
| See province-wide transactions | Super Admin | **Transactions** |
| Browse every record type in one place | Super Admin | **All Records** |

> **Super Admin shortcut:** every personnel module exists under `/super-admin/*` with the same name, but without the “only my records” filter. Use the Super Admin portal when you need the whole province in one view.

---

## 5. The employee portal

Employees have three pages. The design is intentionally simple: see your property, see your paperwork, ask for something.

### 5.1 Dashboard — `/employee/dashboard`

**What you see**

- A welcome banner with your name.
- Two large shortcuts: **My Assets** and **My Requests**.
- A summary of how much property is assigned to you and whether you have open requests.

**What you can do**

- Jump straight to your property or requests.
- Complete your profile if this is your first visit.

**Why it matters**

Most employees only need two questions answered: “What do I hold?” and “What did I ask for?” The dashboard answers both in one glance.

---

### 5.2 My Assets — `/employee/assets`

**Where to find it:** Employee portal → **My Assets**.

**What you see**

1. **Assigned assets** — every asset and stock lot currently assigned to you.
   - Account code, quantity, date received, location, condition.
   - The type (asset or stock) and current status.
2. **Requested & transferred to me** — requests and transfers that involve you, with their status.
3. **My PAR / ICS documents** — the accountability documents issued to you, with a **Download** button.

**What you can do**

- Search and filter the list.
- Open an asset to see more detail.
- Download your PAR or ICS as an Excel workbook.
- Show the QR code for a completed request so personnel can scan it during handover.

**What the system does**

- It only ever shows records where **you** are the assigned person. You cannot see another employee’s property, even by guessing a web address.
- The PAR/ICS download is generated from the stored snapshot of the document — the same values that were recorded when it was issued.

**Why it matters**

An employee should always be able to prove what they hold and produce the signed document on demand. No more “please ask the property custodian to search the filing cabinet.”

---

### 5.3 My Requests — `/employee/requests`

**Where to find it:** Employee portal → **My Requests**.

**What you see**

- A **File a new request** form at the top.
- A **Request history** table below it: type, recipient, item, reason, status, dates, and a QR column.

**What you can do — the three employee request types**

| Request type | What it means | What you choose |
| --- | --- | --- |
| **Transfer** | “Move this item I hold to another person.” | The asset/stock you hold, the person receiving it, the new location, and a reason. |
| **New Assignment** | “I need an additional item.” | The asset or stock lot you are asking for, and a reason. |
| **Repair** | “This item I hold is broken.” | The asset you hold, what is wrong, and a reason. |

After submitting, the request status is **Pending**.

**What the system does**

- Validates that the item actually belongs to you (for transfer and repair).
- Sends the request to the personnel queue.
- Enforces a strict status path: `Pending → Approved → Completed`, or `Pending → Rejected`. Nothing else is allowed.
- When a request is marked **Completed**, the system exposes a QR code. Personnel scan it to confirm the physical handover.

**Why it matters**

Requests are how employees start a paper trail without needing to visit the office. The QR code connects the digital approval to the real-world handover.

---

## 6. The personnel portal, module by module

The personnel portal is the operational heart of the system. Each section below explains one module.

### 6.1 Dashboard — `/personnel/dashboard`

**What you see**

- Counters for deliveries, pending inspections, stock levels, assets, open requests, open repairs, and documents.
- “Needs attention” shortcuts — for example, deliveries waiting for inspection or requests waiting for approval.
- Recent activity.

**What you can do**

- Click any counter or shortcut to jump to the filtered list.
- Use it as your morning checklist.

**What the system does**

- Counts are scoped to what **you** are allowed to see (your own records, plus shared pools such as the asset registry and master data).
- The page is cached briefly so it loads quickly, then refreshes in the background.

**Why it matters**

It answers “what should I do next?” in one screen instead of six menu visits.

---

### 6.2 Deliveries — `/personnel/deliveries`

**Where to find it:** Personnel → **Deliveries**.

**What you see**

- A **Delivery log** table: supplier, PO reference, delivery date, kind (stocks or assets), status, inspection status, and actions.
- Only deliveries **you created** are listed. Super Admins see all of them.
- A detail page for each delivery with items, inspection history, receipts, and linked documents.

**What you can do — log a delivery**

1. Click **Log delivery**.
2. Enter the header details:
   - Supplier
   - PO reference
   - Delivery date
   - Expected arrival date
3. Choose the **delivery kind**:
   - **Stocks** — consumables and semi-expendable items that live in inventory (for example, bond paper, ink, batteries).
   - **Assets** — equipment that lives in the asset registry (for example, laptops, chairs, vehicles).
4. Choose the account title from the master list. The **asset type** fills in automatically. The account code can be typed or generated from previous entries.
5. Add line items: item name, unit, quantity, unit cost.
6. Save.

**What the system does**

- Creates the delivery with `inspection_status = pending`.
- Tracks two independent statuses:
  - **Delivery status** (`complete`, `partial`, `awaiting`) describes whether the shipment arrived.
  - **Inspection status** (`pending`, `passed`, `partial`) describes whether it was accepted.
- Prevents other personnel from reading or editing your delivery. Only you (or a Super Admin) can open it.
- Enables the **Inspect** action directly from the row, so you do not have to re-enter the same delivery in another screen.

**Why it matters**

This is the first link in the chain. If the delivery is logged correctly, everything downstream — inspection, AIR/IAR, stock, assets — has a clean starting point.

---

### 6.3 Inspections and AIR/IAR — `/personnel/inspections`

**Where to find it:** Personnel → **Inspections**, or the **Inspect** action on a delivery row.

**What you see**

- A queue of deliveries awaiting inspection.
- A history table of completed inspections with delivery reference, supplier, PO reference, dates, inspector, and result.
- Counters for total records, AIR/IAR issued, and inspections still waiting for an AIR/IAR.

**What you can do — record an inspection**

1. Open **Inspections** and choose **Inspect** on a delivery (or open the delivery and use its inspection action).
2. Enter:
   - Inspection date
   - Inspector name
   - Per-item **quantity received this round**
   - Supplier checks and item checks
   - Remarks
3. Choose the result:
   - **Passed** — everything ordered arrived in full.
   - **Partial** — something is short, damaged, or incomplete.
4. Optionally attach up to **5 documentary photos**. Photos upload immediately and are stored with the inspection.
5. Generate the **AIR/IAR** from the inspection, **or** attach an externally prepared one (including a scanned, signed copy).
6. Save.

**What the system does — the most important rule in the app**

- It adds the quantity you entered **this round** to what was already stocked, producing a **cumulative received quantity**.
- **Passed is only allowed when every item’s cumulative received quantity equals its PO quantity.** If even one item is short, the system refuses “Passed” and requires “Partial”.
- **Stocking requires two things:** a passed or partial inspection **and** at least one linked AIR/IAR record.
- `stocked_qty` is a **high-water mark**. Stocking the same inspection twice adds nothing.
- A later inspection of a partial delivery stocks only the **remaining** quantity.

**Worked example**

```text
PO says 10 boxes.
Round 1: 6 boxes arrive → record a partial inspection → stock +6.
Round 2: the other 4 arrive → record a passed inspection → stock +4.
Total stocked: 10. Nothing double-counted.
```

**Why it matters**

This is the rule that prevents phantom inventory and overpayment. A short delivery can never be disguised as complete, and the same goods can never be counted twice.

> **Legacy note:** you may occasionally see an inspection marked `failed` from an older version. It does not move stock, and it can be edited to `partial` or `passed` so it can be corrected.

---

### 6.4 Stock (the menu says “Stock”, the page title says “Stocks”) — `/personnel/inventory`

**Where to find it:** Personnel → **Stock**.

**What you see**

- A table of consumables and semi-expendable items: item, account code, type, quantity, unit, unit cost, location, and **stock level**.
- Search and filters by account code, type, and stock level.
- A detail page for each stock item with its movement history.

**Stock-level badges**

| Badge | Meaning |
| --- | --- |
| **Out of stock** | Quantity is zero. |
| **Low stock** | Quantity is at or below the reorder threshold. |
| **Critical** | Quantity is at or below half of the reorder threshold. |
| **No threshold** | No reorder threshold has been set. |

**What you can do**

- **Add stock** — create or correct an inventory line manually (useful for opening balances and corrections).
- **Sync from inspections** — pull in any passed/partial inspection that has not yet been stocked. The system reports how many items it added and whether it repaired any missing costs.
- Set a **reorder threshold** so the system can warn you before you run out.
- Open a stock item to see its history.

**What the system does**

- Normally, stock is created **automatically** by passed or partial inspections that have an AIR/IAR. Manual entry is the exception, not the rule.
- Issuing stock decreases the quantity. Quantities can never go below zero.
- If unit costs arrive later, the system updates the cost on the existing stock record **without changing quantities**.

**Why it matters**

“Do we have bond paper?” should have a trustworthy answer. Automatic stocking keeps the number aligned with what was actually received and accepted.

---

### 6.5 Assets — `/personnel/assets`

**Where to find it:** Personnel → **Assets**.

**What you see**

- The asset registry: property number, QR code, account code/title/name, article, description, quantity, unit, acquisition date, unit cost, total cost, location, condition, status, end user, vehicle details, and funding references.
- A unified view that can include both assets and stock lots.
- Filters for status, source, condition, unit, and asset type.

**What you can do — add assets**

- **Add asset** — create one asset with the full form.
- **Import Excel** — upload the official 34-column asset template to add many assets at once.
- **Add custom column** — define an extra field (for example, “Warranty expiry”) and fill it per asset.
- **Edit** — update details on an existing asset.
- **QR icon** — display the asset’s QR code.
- **Send icon** — issue the asset to an employee (see 6.6).

**Asset states**

| State | Meaning |
| --- | --- |
| `available` | In the registry, not assigned to anyone. |
| `in use` | Assigned to an employee. |
| `maintenance` | Under repair. |
| `retired` | Disposed or no longer serviceable. |

**What the system does**

- Only **available** assets that are **not already assigned** can be issued.
- An asset already in use cannot be issued a second time — the **Send** button is disabled with a reason.
- Editing an asset never rewrites history. Issuance documents keep the values captured at the moment of issue.
- The QR code encodes a link to the asset’s live record.

**Why it matters**

The registry is the single source of truth for “what property exists, where it is, and who holds it.” Duplicate assignment and mystery assets disappear.

---

### 6.6 Issuance — `/personnel/issuances` (menu: “PAR / ICS”)

**Where to find it:**

- **Issue:** Personnel → **Assets** → **Send** icon on an available asset.
- **Review documents:** Personnel → **PAR / ICS**.
- **From a request:** Personnel → **Requests** → approve a new-assignment request.

**What you see**

- A list of accountability documents: type (PAR or ICS), document number, employee, item, quantity, total, and date.
- A detail view with the full snapshot of what was issued.
- A **Report** link to open the stored document.

**What you can do**

- Issue an available asset or a sufficient quantity of stock to an active employee.
- Enter quantity, unit cost, and document details.
- Download the official PAR or ICS as an Excel workbook.
- Open a document to review every line.

**What the system does — the ₱50,000 rule**

The system calculates `unit cost × quantity` and chooses the document automatically:

| Total amount | Document |
| --- | --- |
| **More than ₱50,000** | **PAR** — Property Acknowledgment Receipt |
| **₱50,000 or less** | **ICS** — Inventory Custodian Slip |

Other guards:

- The recipient must be an **active** employee.
- The asset must be **available and unassigned**, or the stock quantity must be sufficient.
- A consolidated approval produces **one** PAR/ICS with multiple lines, not one document per line.
- The document stores an **immutable snapshot** of the values at issuance time.

**Why it matters**

The PAR/ICS threshold is a real audit rule, not a preference. Automating it removes the most common compliance mistake in property management.

---

### 6.7 Documents — `/personnel/documents`

**Where to find it:** Personnel → **Documents**.

**What you see**

A single filing cabinet organized into tabs:

| Tab | What is inside |
| --- | --- |
| **Delivery** | Delivery records and receipts |
| **Inspection** | Inspection reports and documentary photos |
| **Stocks** | Stock records and stock cards |
| **Assets** | Asset records |
| **Repairs** | Repair tickets |
| **IAR Reports** | Generated and attached AIR/IAR records |
| **PAR** | Property Acknowledgment Receipts |
| **ICS** | Inventory Custodian Slips |

**What you can do**

- Search, filter, and page through each tab.
- Open a document to preview it.
- Download or print the official layout.
- Mark a document as viewed (the system also does this when you open it).

**What the system does**

- The hub **aggregates** records that already exist elsewhere; it does not create a second copy.
- Viewed state is stored **per user per document**, so “new” means new to you, not new to the world.

**Why it matters**

One place to find any piece of paper, without knowing which module produced it.

---

### 6.8 Issues ledger — `/personnel/issues`

**Where to find it:** Personnel → **Issues**.

**What you see**

- A ledger of every asset and stock line issued to employees: receiving employee, account, quantity, and document.
- **Costs are deliberately excluded** from this view.
- A second tab lists **completed** transfers, assignments, repairs, and stock replenishments.
- QR codes are generated only for the rows on the current page.

**What you can do**

- Search and filter to answer “who received this?” or “what did this employee receive?”
- Scan or show a QR code for a completed request.

**What the system does**

- Pages the data on the server so the ledger stays fast even with years of records.
- Loads QR images lazily for the visible page only.

**Why it matters**

This is the custody question — “who has it now?” — answered without exposing sensitive costs to every viewer.

---

### 6.9 Requests — `/personnel/requests`

**Where to find it:** Personnel → **Requests**.

**What you see**

- A queue of requests: employee, recipient, type, asset, description, requested date, resolved date, status, and actions.
- A **New request** button for personnel-initiated requests (for example, stock replenishment).

**What you can do**

- **Approve** a request, with a remark.
- **Reject** a request, with a remark.
- **Complete** an approved request after the physical handover.
- **Create a stock replenishment request** when inventory is low.

**What the system does — type-specific behavior**

| Request type | On approval |
| --- | --- |
| **New Assignment** | The system can immediately issue the selected asset/stock and generate the PAR/ICS. |
| **Repair** | The system automatically creates a repair ticket. |
| **Transfer** | The system records the transfer; handover is confirmed when the request is completed. |
| **Stock Replenishment** | The system flags the item for restocking. |

**Status transitions are strict:**

```text
pending ──approve──▶ approved ──complete──▶ completed
   │
   └──reject──▶ rejected (final)
```

No other change is accepted. A rejected or completed request cannot be reopened.

**Why it matters**

Approvals and handovers are the moment where property changes hands. Enforcing the path prevents “approve then quietly reverse” and keeps the audit trail honest.

---

### 6.10 Repairs — `/personnel/repairs`

**Where to find it:** Personnel → **Repairs**.

**What you see**

- Counters for total tickets, pending, in progress, and completed.
- A queue with status tabs.
- Each ticket shows the asset, who reported it, the issue, technician, repair date, cost, progress, and receipt.

**What you can do**

- **Start** a ticket (set it to in progress, add technician and diagnosis).
- **Complete** a ticket (add cost and resolution).
- **Edit** a ticket’s details.
- Print a repair receipt.

**Repair statuses**

| Status | Meaning |
| --- | --- |
| `pending` | Reported, not started. |
| `in_progress` | Being worked on. |
| `completed` | Finished. |

**What the system does**

- Creates a ticket automatically when a repair request is approved.
- Restricts editing to the ticket creator or a Super Admin.
- Keeps the repair history attached to the asset.

**Why it matters**

Repairs are where assets quietly disappear. A ticket with a cost, a technician, and a resolution makes the repair auditable — and feeds the **Replacement & disposal** recommendations later.

---

### 6.11 QR Scanner — `/personnel/scan`

**Where to find it:** Personnel → **QR Scanner** (Super Admin has the same page at `/super-admin/scan`).

**What you see**

- A live camera preview.
- After a successful scan, an identification card showing the scanned item’s details.
- Action buttons appropriate to what was scanned.

**What you can do**

| Scanned item | Actions |
| --- | --- |
| **Asset** | **Open asset details** · **View history** · **Log repair** · **Request transfer** |
| **Stock item** | **Open stock item** · **Request replenishment** |

The scanner is **camera-only** — there is no image-upload or paste box. This is intentional: it keeps the action tied to a physical item in front of you.

**What the system does**

- Resolves the QR code to the correct asset, stock item, or completed request.
- Opens the right page with the asset **and current holder prefilled**, so you never retype a property number.
- Keeps Super Admin links inside `/super-admin/*` (because the system redirects across portal boundaries).
- Strips the prefilling query string after the dialog opens, so refreshing or going back does not re-open it.

**The public scanner — `/scan`**

Anyone can scan without signing in. It returns **identification fields only**: property number, account code, article, description, category, status, condition, location, quantity, unit, and acquisition date. It never exposes costs, remarks, suppliers, account numbers, or assignees. A “sign in to act” hint invites staff to log in for the full actions.

**Why it matters**

Scanning turns a physical label into an action. Instead of finding the asset in a list, you point your phone at it and choose “Log repair.”

---

### 6.12 Reports — `/personnel/reports`

**Where to find it:** Personnel → **Reports** (Super Admin: `/super-admin/reports`).

**What you see**

Three tabs, each with charts, tables, and a **Download XLSX** button.

#### Tab 1 — Aging & delays

Answers: *what is stuck, and for how long?*

- Tracks **pending inspections**, **pending requests**, and **open repairs**.
- Buckets records into `0–3`, `4–7`, `8–14`, and `15+` days.
- A record is **delayed** once it is older than **7 days**.
- Shows open records, delayed count, the oldest open record, and a paged, filterable list.

**Why it matters:** a request that has sat for three weeks is a service failure. This page finds it.

#### Tab 2 — Quarterly issuance

Answers: *how much did we issue this quarter, and to whom?*

- Uses **calendar quarters** (Q1 = January–March).
- Shows document counts, the PAR/ICS split, total quantity, total amount, an 8-quarter trend, and breakdowns by item, office, and employee.
- Consolidated multi-line documents count **once** in the summary and **per line** in the item table.

**Why it matters:** it turns issuance records into a spending and distribution picture.

#### Tab 3 — Asset conditions

Answers: *what shape is our property in?*

- Shows the current-condition distribution from the shared asset registry.
- Highlights the **serviceable vs unserviceable** split, with percentages.
- Puts blank or unrecognized values into an explicit **Unspecified** bucket.

**Important:** the system stores the *current* condition, not a history of condition changes. This is a snapshot, not a trend.

**What the system does**

- Scopes every report to what **you** are allowed to see.
- Caches report data briefly for speed.
- Makes the page and the Excel download read the **same query**, so the numbers always match.

**Why it matters**

Reports are where the system becomes management information rather than data entry.

---

### 6.13 Recommendations — `/personnel/recommendations`

**Where to find it:** Personnel → **Recommendations** (Super Admin: `/super-admin/recommendations`).

**What you see**

- Four counter cards: **Replenishment**, **Replacement / disposal**, **Idle / reassignment**, and **PPMP quantity signals**.
- Tabs to filter by group.
- Every row explains its numbers and links to the relevant page.

**What each group means**

| Group | What it looks at | Example advice |
| --- | --- | --- |
| **Replenishment** | Stock at or below its reorder threshold. | “Order 200 reams — you have 15 on hand and used 240 last year.” |
| **Replacement & disposal** | Assets that are unserviceable, repair-heavy, or retired without disposal paperwork. | “This printer has had 4 repairs; compare repair cost with replacement.” |
| **Idle & reassignment** | Available assets idle beyond **180 days**, assets matching a pending request, and duplicate custody. | “This laptop has been available for 2 years; a pending request matches it.” |
| **PPMP quantity signals** | Actual issuance history over the last **three fiscal years**. | “History suggests buying 120 units, not the 300 in the draft plan.” |

**What the system does**

- Replenishment suggestions prefer **three-year issuance history**; when history is missing, it falls back to a clearly labelled threshold rule.
- Idle recommendations are **age-based prompts**, because the system does not store the exact date an asset became unassigned. The wording says so.
- Replacement recommendations are **advisory only** — no asset status is changed automatically.
- Every recommendation includes evidence (property numbers, quantities, costs, confidence) so you can verify it before acting.

**Why it matters**

This is the difference between a record-keeping system and a decision-support system. It tells you what to buy, what to retire, and what is gathering dust.

---

### 6.14 PPMP — `/personnel/ppmp`

**Where to find it:** Personnel → **PPMP** (Super Admin: `/super-admin/ppmp`, labeled **PPMP Files**).

PPMP is the **Procurement Plan for Goods and Services**. This module turns uploaded workbooks into analysis and a draft plan.

#### Uploading files

1. Open **PPMP**.
2. Upload an `.xlsx` workbook (maximum **10 MB**).
3. The system parses the sheets, detects fiscal years, counts usable rows, and records a SHA-256 fingerprint.
4. The same workbook uploaded twice is recognized and not stored twice for the same user.
5. Uploaded files appear in the vault.

**Limits (enforced by the system):**

| Limit | Value |
| --- | --- |
| File type | `.xlsx` only (`.xls` must be re-saved) |
| File size | 10 MB |
| Files per analysis/planning run | 3 |
| Analyses per user per hour | 100 |
| Sheets per workbook | 100 |

#### Analytics — “What happened, and what looks unusual?”

Select up to three files, click **Validate files**, then run the analysis. The report includes:

| Section | What it shows |
| --- | --- |
| **Overview** | Files, years, line items, total budget, offices, categories, budget-only lines, low-confidence lines, yearly totals |
| **Quarterly calendar** | Procurement starts, deliveries, and lump budgets by quarter |
| **File insights** | Parse quality, sheet coverage, detected issues |
| **Year-over-year** | Quantity and budget changes between years, with percentages |
| **Trends** | Per-item series marked `INCREASING`, `DECREASING`, `STABLE`, `VOLATILE`, or `INSUFFICIENT_DATA` |
| **Anomalies** | Statistical outliers above a configurable z-score threshold |
| **Cost changes** | Budget movement, including whether it is quantity-driven |
| **Forecasts** | A point estimate plus low/high band and confidence level |
| **Recommendations** | Rule-based suggestions with calculation traces |
| **Limitations** | Data-quality caveats to read before acting |

Every finding carries an **evidence reference**: file, sheet, row, item, quantity, unit, budget, fiscal year, and fingerprint. You can always trace a conclusion back to the row that produced it.

#### Planning — “What should next year look like?”

1. Select up to three historical files.
2. Choose the target fiscal year.
3. Enter the agency, budget ceiling, and planning method.
4. Set annual quantity growth and price adjustment percentages.
5. Optionally filter by category.
6. Generate the plan.

**Planning methods**

| Method | How it calculates |
| --- | --- |
| `average` | Uses the historical average as the base case. |
| `trend` | Fits a straight line through the available years. |
| `growth` | Applies a compounded annual growth percentage from the latest year. |
| `consumption` | Plans from **actual issuance history** (last three fiscal years), matches descriptions and units, and deducts on-hand stock. |

**What you get**

- Low / base / high quantity and total for each item.
- Projected unit cost after price adjustment.
- A **GPPB-style draft table** with the standard 12-column layout.
- A quarterly distribution (Q1–Q4).
- Assumptions, evidence, and risk notes.
- A downloadable Excel draft.

> **Forecasts are decision support, not procurement authority.** Always read the limitations and low-confidence warnings before using a plan.

**Why it matters**

Procurement planning is usually a yearly scramble through old spreadsheets. This module makes the assumptions explicit and the evidence traceable.

---

### 6.15 Logs — `/personnel/logs`

**Where to find it:** Personnel → **Logs**.

**What you see**

- Your personal audit trail: what you did, in which module, and when.
- Filters by module, action, and date.

**What the system does**

- Records state-changing actions automatically.
- Shows personnel only their own activity. Super Admins can see the wider audit trail.

**Why it matters**

“Who changed this?” is answerable. The audit trail is also what makes the system defensible in a COA review.

---

### 6.16 Templates — `/personnel/templates`

**Where to find it:** Personnel → **Templates**.

**What you can do**

- Download the **asset import template** (34 columns) for bulk asset uploads.
- Download blank **AIR**, **PAR**, and **ICS** forms.
- Download the sample header/data workbook.

**Why it matters**

The imports only work if the columns match. The templates guarantee that.

---

## 7. The Super Admin portal

The Super Admin portal mirrors every operational module — Deliveries, Inspections, Stock, Assets, Documents, PAR/ICS, Issues, Requests, Repairs, Reports, Recommendations, Logs, Templates, PPMP, and QR Scanner — but with **unscoped visibility**. Where personnel see “my records,” the Super Admin sees everything.

On top of that, four modules are unique to the Super Admin.

### 7.1 Users — `/super-admin/users`

**What you see**

- **Pending approvals** — verified self-registrations waiting for review.
- **All accounts** — searchable, paged list of every account.

**What you can do**

- **Approve** a pending account (activates it immediately).
- **Reject** a pending account (deactivates it).
- **Activate / deactivate** an existing account.
- **Change a role** between employee, personnel, and Super Admin.
- Review account details and activity.

**What the system does**

- Role and status changes take effect immediately; the 60-second role cache is cleared on write.
- A deactivated account is signed out on its next request, even if it still holds a browser session.
- Approving an employee for the first time triggers the **Complete your profile** overlay on their first sign-in.

**Why it matters**

Self-registration is open, but access is not. No one can use the system until an administrator verifies them.

---

### 7.2 Master Data — `/super-admin/master-data`

**Where to find it:** Super Admin → **Master Data**.

**What you see**

- **Departments** — name and description.
- **Units** — name and abbreviation.
- **Account catalog** — account code, account title, account name, and asset type.
- Counts of active entries at the top.

**What you can do**

- Add, edit, activate, or deactivate each entry.
- **Import the account catalog from Excel** using the 4-column template.
- Re-importing updates existing account codes instead of duplicating them.

**What the system does**

- These lists power the dropdowns and auto-fill behavior across deliveries, assets, and profiles.
- Deactivating an entry hides it from new records without breaking old ones.

**Why it matters**

Consistent account codes and department names are what make reports comparable. Master data is the vocabulary of the whole system.

---

### 7.3 Transactions — `/super-admin/transactions`

**What you see**

- A combined, system-wide view of operational transactions.

**What you can do**

- Reconcile records across modules.
- Sample transactions for audit review.

**Why it matters**

Instead of opening five modules to trace one transaction, you see the combined flow in one place.

---

### 7.4 All Records — `/super-admin/records`

**What you see**

- Every record type in one browser.

**What you can do**

- Look up any record by type, without knowing which module owns it.

**Why it matters**

The fastest way to answer “where is that thing?” during an audit or a phone call.

---

### 7.5 PPMP Files — `/super-admin/ppmp`

**What you can do**

- See all uploaded PPMP workbooks across users.
- Run **Analytics** and **Planning** on any accessible file.

**Why it matters**

The Super Admin can review the province’s planning inputs without chasing individual staff accounts.

---

## 8. The complete workflow, told as a story

This section ties everything together. Follow one delivery and one employee through the whole system.

### Monday — the delivery arrives

1. A supplier delivers **10 laptops**.
2. The property custodian opens **Deliveries → Log delivery**.
3. They choose kind **Assets**, select the account title, and add a line: `Laptop, unit, 10, ₱45,000`.
4. The delivery appears with **inspection status: pending**.

### Monday afternoon — the inspection

5. The inspector opens **Inspections** and clicks **Inspect**.
6. Only **6 laptops** arrived. The inspector enters `6` received, adds remarks, attaches two photos of the boxes, and chooses **Partial**.
7. The system refuses **Passed** — correctly, because 6 ≠ 10.
8. The inspector generates the **AIR/IAR**.

### Tuesday — stock and assets appear

9. Because the inspection is partial **and** an AIR/IAR exists, the system stocks **6 laptops**.
10. The remaining **4** are still outstanding. `stocked_qty` remembers that only 6 were received.
11. The 6 laptops now exist as assets with status **available**.

### Next week — the rest arrives

12. The remaining 4 laptops arrive. The inspector records a second inspection, this time with `4` received.
13. Cumulative received is now 10 = PO quantity, so **Passed** is allowed.
14. The system stocks the remaining **4**. Total = 10. Nothing is double-counted.

### An employee needs a laptop

15. The employee opens **My Requests → New Assignment**, selects a laptop, writes a reason, and submits. Status: **Pending**.
16. Personnel open **Requests**, review it, and click **Approve**.
17. Because it is a new assignment, the system issues the selected laptop and generates the accountability document.
18. The laptop costs ₱45,000 — **not** more than ₱50,000 — so the document is an **ICS**. Had it been ₱60,000, it would be a **PAR**.
19. The employee sees the ICS under **My Assets → My PAR / ICS documents** and can download it.
20. After the physical handover, personnel mark the request **Completed**. A QR code appears.

### The laptop breaks

21. The employee files a **Repair** request.
22. Personnel approve it. The system automatically creates a **repair ticket** with status **Pending**.
23. The technician starts the work: status **In progress**, technician and diagnosis recorded.
24. When finished, personnel complete the ticket with the cost and resolution. Status: **Completed**.

### Month-end — management asks questions

25. **Reports → Aging & delays** shows whether any request or repair has been sitting for more than 7 days.
26. **Reports → Quarterly issuance** shows how many PAR/ICS documents were issued this quarter, to which offices and employees.
27. **Reports → Asset conditions** shows how much of the fleet is serviceable.
28. **Recommendations** flags low stock, repair-heavy assets, and laptops that have been idle for 180+ days.
29. **PPMP → Analytics** compares this year’s plan with last year’s; **Planning** produces next year’s draft within a budget ceiling.
30. **Logs** and **Documents** provide the paper trail for any audit question.

---

## 9. Status cheat sheet

### Accounts

| Status | Meaning |
| --- | --- |
| `pending` | Waiting for Super Admin approval. Cannot sign in. |
| `active` | Approved and enabled. |
| `inactive` | Disabled by an administrator. Cannot sign in. |

### Deliveries

| Field | Value | Meaning |
| --- | --- | --- |
| Delivery status | `complete` | All expected items arrived. |
| | `partial` | Only part of the order arrived. |
| | `awaiting` | Not yet arrived / expected. |
| Inspection status | `pending` | Not yet inspected. |
| | `passed` | Fully accepted. |
| | `partial` | Partially accepted. |
| | `failed` | Legacy state; editable so it can be corrected. |

### Inspections

| Value | Meaning |
| --- | --- |
| `passed` | Every item’s cumulative received quantity equals its PO quantity. |
| `partial` | At least one item is short, damaged, or incomplete. |
| `failed` | Legacy; does not move stock; can be corrected. |

### Assets

| Value | Meaning |
| --- | --- |
| `available` | In the registry, not assigned. |
| `in use` | Assigned to an employee. |
| `maintenance` | Under repair. |
| `retired` | Disposed / no longer serviceable. |

### Requests

| Value | Meaning |
| --- | --- |
| `pending` | Submitted, awaiting review. |
| `approved` | Accepted; handover or issuance in progress. |
| `rejected` | Denied (final). |
| `completed` | Handover finished (final). |

### Repairs

| Value | Meaning |
| --- | --- |
| `pending` | Reported, not started. |
| `in_progress` | Being worked on. |
| `completed` | Finished. |

### Accountability documents

| Type | Rule |
| --- | --- |
| **PAR** | Total amount **greater than ₱50,000**. |
| **ICS** | Total amount **₱50,000 or less**. |

---

## 10. “Why did the system stop me?” — rules in plain English

### “Why can’t I mark this inspection as Passed?”

Because at least one item’s cumulative received quantity is still below its PO quantity. **Passed means everything arrived in full.** Record the shortfall as **Partial**, then inspect again when the rest arrives.

### “Why isn’t my stock updating after I inspected?”

Stocking needs **two** things: a passed/partial inspection **and** a linked AIR/IAR. Generate or attach the AIR/IAR first, then check **Stock → Sync from inspections**.

### “Why did nothing happen when I inspected the same delivery twice?”

Because `stocked_qty` is a high-water mark. The system only stocks the **not-yet-stocked remainder**. Re-processing the same inspection adds zero. This is a safety feature, not a bug.

### “Why is it a PAR instead of an ICS?”

The total (`unit cost × quantity`) is **greater than ₱50,000**. At or below ₱50,000, the system chooses ICS.

### “Why can’t I issue this asset?”

One of these is true:

- The asset is not **available**.
- It is already assigned to someone.
- The recipient is not an **active** employee.
- For stock, the quantity is insufficient.

The **Send** button shows the specific reason when you hover over it.

### “Why can’t I complete this request?”

Only an **approved** request can be completed. A `pending` request must be approved or rejected first. `rejected` and `completed` are final.

### “Why can’t I see a record that someone else created?”

Personnel see the records they created or own. Employees see only their own property, documents, and requests. Super Admins see everything. This is enforced on the server, so it applies everywhere.

### “Why was I signed out even though I was logged in?”

Your account is `pending` or `inactive`. Contact the Super Admin. Approval or reactivation takes effect immediately.

### “Why can’t I approve my own registration?”

Self-registration creates a `pending` account by design. Only a Super Admin can approve it.

### “Why can’t I open the asset I scanned?”

The public scanner is read-only and shows identification only. Sign in to view the full record and use actions like **Log repair** or **Request transfer**.

### “Why did my PPMP upload fail?”

Check the file type and size: only `.xlsx` up to 10 MB is accepted, with up to 100 sheets, and at most 3 files per analysis or planning run. `.xls` files must be re-saved as `.xlsx`.

---

## 11. Common tasks cheat sheet

| Task | Steps |
| --- | --- |
| **Log a delivery** | Deliveries → **Log delivery** → fill header → choose Stocks/Assets → add line items → Save. |
| **Inspect a delivery** | Inspections → **Inspect** (or delivery row) → enter received quantities → choose Passed/Partial → attach photos → Save. |
| **Generate an AIR/IAR** | Open the inspection → **AIR / IAR** → generate, or attach a prepared file. |
| **Sync stock** | Stock → **Sync from inspections**. |
| **Add a stock item manually** | Stock → **Add stock** → fill item, unit, cost, threshold → Save. |
| **Add one asset** | Assets → **Add asset** → fill the form → Save. |
| **Import many assets** | Templates → download the asset template → fill it → Assets → **Import Excel**. |
| **Show an asset QR** | Assets → QR icon on the row. |
| **Issue an asset** | Assets → **Send** icon on an available asset → choose employee → confirm. |
| **Approve a request** | Requests → **Approve** → add a remark → confirm. |
| **Complete a request** | Requests → **Complete** after the handover. |
| **Start a repair** | Repairs → **Start** → technician and diagnosis → Save. |
| **Finish a repair** | Repairs → **Complete** → cost and resolution → Save. |
| **Scan an item** | QR Scanner → point the camera at the tag → choose an action. |
| **Review delays** | Reports → **Aging & delays**. |
| **Review issuance** | Reports → **Quarterly issuance** → choose the year. |
| **Review asset conditions** | Reports → **Asset conditions**. |
| **Get restocking advice** | Recommendations → **Replenishment** tab. |
| **Get disposal advice** | Recommendations → **Replacement & disposal** tab. |
| **Find idle assets** | Recommendations → **Idle & reassignment** tab. |
| **Analyse PPMP** | PPMP → **Open analytics** → select files → **Validate files** → run. |
| **Plan next year’s PPMP** | PPMP → **Open planning** → select files → set year/budget/method → generate. |
| **Approve a new user** | Super Admin → Users → **Approve**. |
| **Add an account code** | Super Admin → Master Data → Account catalog → add, or import the catalog template. |
| **Check my activity** | Personnel → Logs. |
| **Find any document** | Documents → choose the tab → search. |

---

## 12. Glossary

| Term | Plain-language meaning |
| --- | --- |
| **AIR / IAR** | The official inspection and acceptance report that turns a delivery into accepted property. |
| **Asset** | A tracked piece of equipment with its own record (laptop, chair, vehicle). |
| **Account code / title** | The government accounting classification for an item. |
| **Consolidated issuance** | One document covering several issued lines. |
| **Delivery kind** | Whether the goods are **stocks** (consumables) or **assets** (equipment). |
| **GPPB** | Government Procurement Policy Board — the standard procurement-plan format. |
| **ICS** | Inventory Custodian Slip — issued for property worth **₱50,000 or less**. |
| **Idempotency** | A safety rule that stops the same action from being counted twice. |
| **Master data** | The shared reference lists: departments, units, and the account catalog. |
| **PAR** | Property Acknowledgment Receipt — issued for property worth **more than ₱50,000**. |
| **Partial inspection** | Some items arrived short, damaged, or incomplete. |
| **Passed inspection** | Every item arrived in full. |
| **PPMP** | Procurement Plan for Goods and Services. |
| **QR code** | A scannable square that opens an asset, stock item, or completed request. |
| **Request** | An employee’s ask for a transfer, a new assignment, a repair, or (for personnel) stock replenishment. |
| **Snapshot** | The values recorded at the moment of issuance; later edits do not change it. |
| **Stock** | Consumables and semi-expendable items tracked by quantity. |
| **Stocked quantity** | The high-water mark of how much of a delivery line has entered stock. |
| **Super Admin** | The administrator who sees everything and manages users and master data. |
| **Unserviceable** | Property that can no longer be used for its purpose; a candidate for disposal. |

---

## Where to go next

- **Root `README.md`** — full technical and operational reference, setup, environment variables, deployment.
- **`docs/plans/`** — the implementation plans behind Reports, Recommendations, and QR scanning.
- **`docs/assessments/`** — objective-by-objective verification and scope notes.
- **`docs/audits/`** — performance, technology-stack, and codebase audits.
- **`docs/README.md`** — the index of all documentation.

If something in this guide disagrees with what the screen shows, **the screen and the server are correct** — this document describes the intended behavior and may lag behind a new release.
