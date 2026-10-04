# PGSO System — Technology Stack Report

**Date:** 2026-10-04
**Audience:** Everyone — no technical background needed
**Purpose:** Explain, in plain language, what technologies power the PGSO asset-management system, what each one does for you, and why it was chosen.

---

## 1. What Is This System, in One Paragraph?

The PGSO system is a **website that runs your office's asset paperwork** — tracking equipment, stock, deliveries, inspections, issuances, repairs, and requests. It has **three doors**: one for **Super Admins** (full oversight), one for **Personnel** (daily operations), and one for **Employees** (viewing their own assets and filing requests). Everything below is simply the list of tools used to build those doors, the rooms behind them, and the filing cabinets inside.

---

## 2. The Big Picture

Think of the system like a **modern office building**:

| Part of the building | Technology | Plain-English job |
|---|---|---|
| The building itself | Next.js + React | Holds every page together; draws screens and handles button clicks |
| The building's quality inspector | TypeScript | Double-checks the construction plans so fewer mistakes reach you |
| The filing room | Supabase (PostgreSQL database) | Stores every record safely — assets, users, deliveries, logs |
| The librarian | Prisma | Fetches exactly the right file from the filing room, fast and accurately |
| The security guard | Supabase Login + door checker (middleware) | Checks your ID at the entrance and only opens doors your role may enter |
| The photocopy shelf | Upstash Redis (memory cache) | Keeps copies of frequently viewed lists so pages open instantly |
| The intercom | Supabase Realtime | Announces changes the moment they happen, so screens update without refresh |
| The interior design | Tailwind CSS + Radix parts + Lucide icons | Clean layout, readable buttons, pop-up windows, and notifications |
| The charts on the wall | Recharts | Turns numbers into dashboard graphs you can read at a glance |
| The printer/scanner corner | Excel tools + QR codes | Imports/exports spreadsheets; prints and scans QR labels for assets |
| The land it stands on | Vercel hosting | Keeps the website online 24/7 so you can open it from any browser |

---

## 3. Floor by Floor — What Each Tool Does for You

### 3.1 Next.js + React — the building itself

**Techy name:** Next.js 16 with React 19.
**What it does for you:** This is the framework every page is built from. It draws what you see (tables, forms, dashboards) and also runs the behind-the-scenes work when you click Approve, Save, or Submit — all in one place, so the site stays fast and consistent.
**Everyday example:** Opening the Requests page and clicking Approve is handled by this layer from click to confirmation message.

### 3.2 TypeScript — the quality inspector

**Techy name:** TypeScript.
**What it does for you:** Before any update goes live, this tool re-checks all the "construction plans" for mistakes (like a wrong date format or a missing field). You never see it — you just experience fewer bugs and broken screens.

### 3.3 Supabase database (PostgreSQL) — the filing room

**Techy name:** PostgreSQL database, hosted on Supabase.
**What it does for you:** This is where **everything is permanently stored**: every asset, stock item, delivery, inspection, user account, and audit log. It is a professional-grade filing system used by companies worldwide — reliable, backed up, and able to hold millions of records.
**Everyday example:** When you search for an asset by property number, the answer comes from this filing room.

### 3.4 Prisma — the librarian

**Techy name:** Prisma (database toolkit).
**What it does for you:** Instead of staff digging through filing cabinets by hand, the librarian knows exactly which drawer, folder, and page to pull — and returns only what was asked for. This keeps the system accurate and quick.
**Everyday example:** The dashboard numbers (how many assets, pending requests, low stocks) are gathered by this librarian in seconds.

### 3.5 Login + door checker — the security guard

**Techy name:** Supabase Authentication (Google sign-in + email code) with a middleware role guard.
**What it does for you:** Three things: (1) proves you are who you say you are when you log in — with your Google account or a code sent to your email, so no passwords to forget; (2) a guard at every door checks your role — Super Admin, Personnel, or Employee — and only lets you into your areas; (3) deactivated accounts are signed out automatically.
**Everyday example:** An employee who types a personnel-only web address is politely bounced back — they never see screens they shouldn't.

### 3.6 Memory cache — the photocopy shelf (why pages feel instant)

**Techy name:** Upstash Redis cache + in-browser snapshot cache.
**What it does for you:** Lists you open often (deliveries, requests, assets) are "photocopied" and kept nearby for 30–60 seconds. Going back to a page you just visited shows the copy **instantly**, while a fresh copy is quietly fetched in the background. If the copier is ever unavailable, the system simply walks to the filing room instead — nothing breaks.
**Everyday example:** Pressing the browser Back button shows your list immediately instead of a loading spinner.

### 3.7 Realtime intercom — updates without refresh

**Techy name:** Supabase Realtime (live data channels).
**What it does for you:** When one person approves a request or logs a delivery, the intercom announces it to everyone else viewing that list, and their screens update **on their own** — no refresh button needed.
**Everyday example:** Two admins watching the Requests queue: one clicks Approve, and the other's screen updates by itself.

### 3.8 Design pieces — readable screens for everyone

**Techy names:** Tailwind CSS (styling), Radix UI (dialogs, dropdowns, toasts), Lucide (icons), Sonner (pop-up notifications).
**What they do for you:** They make buttons, tables, calendars, confirmation windows, and success/error pop-ups look clean and behave the same on every page — including for users with screen readers or keyboards instead of a mouse.
**Everyday example:** The "Request approved" pop-up message and the calendar you pick dates from come from these parts.

### 3.9 Dashboard charts — the graphs on the wall

**Techy names:** Recharts (charts) + date-fns (dates).
**What they do for you:** They turn raw numbers into monthly bars, status pies, and trend lines on the dashboards, and format all dates consistently (e.g. delivery and inspection dates).
**Everyday example:** The "deliveries per month" chart on the Super Admin dashboard.

### 3.10 Spreadsheet + QR corner — paper meets digital

**Techy names:** ExcelJS + xlsx (spreadsheets), qrcode + jsQR (QR codes).
**What they do for you:** (1) Bulk lists — like yearly procurement plans or catalogs — can be **uploaded from Excel** instead of typed row by row (files up to 10 MB); reports can be **downloaded to Excel**. (2) Every asset can get a **QR label**; pointing the built-in scanner at it opens that asset's record instantly.
**Everyday example:** Importing 500 catalog items from a spreadsheet in one upload, or scanning a printer's QR sticker to see its history.

### 3.11 Smooth motion — polish, not just looks

**Techy names:** Framer Motion, GSAP, Lenis (smooth scrolling).
**What they do for you:** Gentle animations and smooth scrolling on the public landing pages, so the site feels modern and pleasant rather than jumpy. They never get in the way of the actual work screens.

### 3.12 The land it stands on — always-open hosting

**Techy name:** Vercel hosting.
**What it does for you:** This is the service that keeps the website switched on and reachable from any browser, day and night — like renting space in a mall instead of building your own. Updates are published here with one command.

### 3.13 Safety nets you never see

| Safety net | What it does for you |
|---|---|
| Audit logs | Every important action (who approved what, when) is written down automatically — accountability built in |
| Duplicate protection (idempotency keys) | If you double-click Submit on a slow connection, the system still records it only once |
| Input validation + remarks required | Forms refuse to save until required notes are filled in, so records stay complete |
| Error fallbacks | If one service hiccups (e.g. the photocopy shelf), the page still loads from the filing room |

---

## 4. How It All Fits Together (30-Second Version)

1. You open the website (hosted on **Vercel**) and log in (**security guard** checks your ID and role).
2. Pages are drawn by **Next.js + React**, styled by the **design pieces**.
3. Lists appear instantly from the **photocopy shelf**; the **librarian** fetches anything fresh from the **filing room**.
4. You act (approve, log, update) → the change is saved, announced on the **intercom**, and written in the **audit log**.
5. Spreadsheets and QR codes bridge the gap between paper processes and the digital records.

---

## 5. Frequently Asked Questions (Non-Technical)

**Do I need to install anything?**
No. It runs in a normal web browser (Chrome, Edge, Firefox) on a computer, tablet, or phone.

**Where is our data?**
In a managed Supabase (PostgreSQL) database in the cloud — professionally maintained, backed up, and access-controlled. Only signed-in users with the right role can see their data.

**What happens if the internet is slow?**
The system degrades gracefully: cached copies keep pages readable, and actions queue through normal web requests. Some features (like live auto-updates) simply wait quietly until the connection recovers.

**Can two people work at the same time?**
Yes. The realtime intercom keeps everyone's lists converging, and duplicate protection prevents double-saving when two people act at once.

**Who can see what?**
Super Admins see everything for oversight; Personnel see operational screens for daily work; Employees see only their own assets, documents, and requests. The door checker enforces this on every single page.

**Are our Excel files and uploads safe?**
Uploads are size-limited (10 MB) and validated; spreadsheet imports report plain-language errors row by row instead of failing silently.

---

## 6. Glossary — Techy Word, Plain Meaning

| Word you might hear | What it means |
|---|---|
| Framework | A ready-made foundation for building the site (Next.js) |
| Database | The permanent filing room for all records (PostgreSQL) |
| Cache / snapshot | A temporary nearby copy that makes pages open instantly |
| Realtime | Screens updating by themselves when someone else makes a change |
| Authentication | Proving who you are at login (Google or email code) |
| Role / permission | Which doors your account is allowed to open |
| Audit log | The automatic diary of who did what and when |
| Hosting | The always-on service that keeps the website reachable (Vercel) |
| QR code | The square barcode label that opens an asset's record when scanned |
| Import / export | Moving lists into the system from Excel, or out of it into Excel |

---

*Companion to the Super Admin Performance Audit. Technical details (versions, config) match `package.json`, `prisma/schema.prisma`, `next.config.ts`, and `middleware.ts` on `main` as of 2026-10-04.*
