# Documentation index

Project documentation lives here. App code, config, and the root README stay at the
repository root because the build and tooling expect them there.

## `USER-GUIDE.md`

Plain-language guide for non-technical users. Explains where each feature lives, what
to click, how the workflow moves from delivery to issuance, and why the system enforces
each rule. Start here if you are learning the app rather than the codebase.

## `OBJECTIVE-FOCUS-WORKFLOW.md`

Detailed explanation of the featured workflow — delivery → inspection → AIR/IAR →
stocking → PAR/ICS issuance — and how each stage answers a project objective. Written
for reviewers, demo presenters, and new team members. Includes the rules, a worked
example, failure modes, a code map, and a verification checklist.

## `SYSTEM-OBJECTIVES-GUIDE.md`

Maps the six official system objectives to the real menus, routes, roles, and rules.
For each objective it shows where to find it in the personnel, Super Admin, and
employee portals, how the feature works, what to demonstrate, the supporting code,
and the honest limits. Includes a role matrix and a ten-minute demo script.

## `DATABASE-DIAGRAM.md`

Mermaid ER diagram of every Prisma model, the core delivery → inspection → AIR/IAR →
stock → issuance flow, and a connection reference that separates real foreign keys from
the soft (app-enforced) UUID and account-code joins. Paste the blocks into
<https://mermaid.live> to render.

## `UI-SITEMAP.md`

Mermaid sitemap of every screen: public/auth routes, the three portal trees, the
per-portal screen inventory (tabs, dialogs, read-only vs writable), cross-portal
journeys (account, delivery, request, scan, PPMP), navigation patterns, and known gaps.
Paste the blocks into <https://mermaid.live> to render.

## `plans/`

Implementation plans written before each feature push.

| File | Scope |
| --- | --- |
| `OBJECTIVE-4-DESCRIPTIVE-ANALYTICS-PLAN.md` | Reports workspace, aging, quarterly issuance, asset conditions |
| `OBJECTIVE-5-PRESCRIPTIVE-ANALYTICS-PLAN.md` | Recommendations (replenishment, replacement/disposal, idle assets, consumption) |
| `OBJECTIVE-6-QR-SCANNING-PLAN.md` | Scan-to-action and prefill on both staff portals |

## `assessments/`

| File | Purpose |
| --- | --- |
| `OBJECTIVES-ASSESSMENT.md` / `.pdf` | Objective-by-objective verdict and evidence |
| `SCOPE-AND-LIMITATIONS-VERIFICATION.md` | Scope and limitation checks against the objectives |

## `audits/`

| File | Purpose |
| --- | --- |
| `TECH-STACK-REPORT.md` / `.pdf` | Stack and dependency review |
| `web-development-codebase-audit.md` / `.pdf` | Full codebase audit (architecture, structure, hygiene) |
| `PERSONNEL-PERFORMANCE-AUDIT.md` / `.pdf` | Personnel portal performance audit |
| `SUPER-ADMIN-PERFORMANCE-AUDIT.md` / `.pdf` | Super Admin portal performance audit |

## `misc/`

Scratch files kept for reference (not part of the build).
