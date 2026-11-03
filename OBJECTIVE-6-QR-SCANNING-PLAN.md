# Objective 6 — QR-Based Asset Identification and Scanning Implementation Plan

**Objective:** Enhance asset tracking with QR-based identification and scanning.

**Current status:** Fully met. Asset QR tags resolve in the scanner, and scans open prefilled repair/transfer/replenishment actions on both staff portals (`npm test` and `npm run build` pass; `npm run lint` still reports only the known pre-existing failures in unrelated files).

**What already exists (verified in code, not assumed):**

| Capability | Where |
| --- | --- |
| QR generation — asset tags encode the live detail-page URL via `NEXT_PUBLIC_APP_URL` | `src/lib/qrcode.ts` (`assetPageUrl`, `stockPageUrl`) |
| QR display / printing — QR card on the asset detail page, QR modal in the super-admin asset list | `src/app/personnel/assets/[id]/AssetDetailEditor.tsx`, `src/app/super-admin/assets/page.tsx` |
| QR on documents — request and issuance QR payloads (`PGSO-REQUEST`, `PGSO-ISSUE`) | `src/app/personnel/requests/actions.ts:1337`, `src/app/personnel/issues/actions.ts:102` |
| Scanner UI — camera + `jsQR` frame loop, result card, last-result client cache | `src/components/QrScanner.tsx` |
| **Asset tags are already resolved** — URL / `PGSO-ASSET` payload → public lookup → details card | `resolveScan()` in `QrScanner.tsx:125`, `parseAssetTagRef()` in `src/lib/asset-tag.ts:43`, `src/app/api/public/assets/[id]/route.ts` |
| Public no-login scanning | `src/app/scan/page.tsx` |
| Role portals | `src/app/personnel/scan/page.tsx`, `src/app/super-admin/scan/page.tsx` |

**What is missing (the gaps this plan closes):**

1. **No scan-to-asset action.** A scanned asset card offers only "Open full asset details". There is no "log repair", "request transfer", or "view custody/history" action.
2. **No prefill.** The repairs and requests pages ignore query parameters, so a scan cannot open a pre-filled form.

**Assessment corrections carried in this plan (the assessment is stale in two places):**

| Assessment claim | Reality |
| --- | --- |
| "The in-app scanner cannot resolve **asset** QR tags" | **Already resolved** since `resolveScan()` was added. Must be removed from the gap list. |
| "the scanner supports camera, **image upload**, and pasted payloads" | **Camera only.** `startCamera()` promises "or upload an image instead" but no file input exists. This plan keeps image upload out of scope and instead corrects the wording. |

---

## 1. Gap → implementation map

| Requirement | Current state | What this plan adds |
| --- | --- | --- |
| Scan asset → identify | Works (details card) | Unchanged |
| Scan asset → **act** | Only a "open details" link | A role-aware action row on the asset card: open, view history, log repair, request transfer (stock: request replenishment) |
| Actions must be usable | Repairs/requests dialogs require the asset to be re-selected from a 15-row text-search picker | `?asset=` deep links that open the correct dialog with the asset (and current holder) pre-selected |
| Super-admin parity | `/super-admin/*` is redirect-blocked from `/personnel/*`; the super-admin repairs/requests pages have **no create UI** | Shared create dialogs mounted in both portals |
| Honest documentation | Assessment overstates image upload and understates asset resolution | Correct `OBJECTIVES-ASSESSMENT.md`, `README.md`, `AGENTS.md` |

No new database tables, columns, or migrations are required. No QR payload format changes. No new mutation rules — prefill only opens existing dialogs, and every server action keeps its own authorization.

---

## 2. Confirmed decisions

| Decision | Choice |
| --- | --- |
| Scope | **Scan-to-action + prefill** (the core gap) |
| Excluded from scope | Image-upload decoding, paste box, offline queue, batch scan, request/issue deep links |
| Portal coverage | **Full parity** — personnel and super-admin scanners both get actions |
| Prefill depth | **Asset + current holder**, both editable by the user |
| Action matrix location | **Pure function** in `src/lib/scan-actions.ts`, unit-tested (Node test runner cannot render React) |
| Super-admin transfer UI | **Compact scan-transfer dialog** rather than extracting the 52 KB multi-type personnel request dialog |
| Super-admin repair UI | **Extract** the existing create-repair dialog into a shared component and mount it in both portals |
| Public scanner | Read-only: identification only, no mutating actions |
| Schema | No changes |

**Constraint discovered during planning:** `middleware.ts:272-288` redirects any cross-portal path to `/`, so a super-admin scan action cannot link to `/personnel/repairs`. The action must exist inside the super-admin portal.

---

## 3. Proposed design

### 3.1 Action matrix (`src/lib/scan-actions.ts`)

```ts
export type ScanPortal = "personnel" | "super-admin" | "public";
export type ScanActionId = "open" | "history" | "repair" | "transfer" | "replenish";

export interface ScanAction {
  id: ScanActionId;
  label: string;
  href: string;
  kind: "primary" | "secondary";
}

export function scanActionsFor(ref: AssetTagRef, portal: ScanPortal): ScanAction[];
```

| Scanned item | personnel / super-admin | public (`/scan`) |
| --- | --- | --- |
| Asset | Open asset · View history · **Log repair** · **Request transfer** | Open asset (redirects to login) |
| Stock item | Open stock item · **Request replenishment** | Open stock item (redirects to login) |

Rules:

- Hrefs are built with the existing `assetTagHref(ref, superAdmin)` (`src/lib/asset-tag.ts:70`) so portal prefixes cannot drift.
- `history` appends `#asset-history`.
- `repair` → `{base}/repairs?asset={id}`.
- `transfer` → `{base}/requests?asset={id}&scan=transfer`.
- `replenish` → `{base}/requests?asset={id}&scan=replenish` (stock items only).
- Stock items never offer `repair` (consumables are not repaired).
- `public` returns identification links only — no mutating actions.

### 3.2 Scanner UI (`src/components/QrScanner.tsx`)

- Compute `portal` from the existing `usePathname()` check, extended with a `public` case for `/scan`.
- Replace the single inline "Open full asset details" link (`lines 426-434`) with the rendered action row.
- Keep `parsePayload`, `resolveScan`, the camera loop, and the `CLIENT_CACHE_KEYS.scan` cache untouched.
- Add a "Sign in to act" hint when `portal === "public"`.

History anchors: add `id="asset-history"` to the history section in `AssetDetailEditor.tsx` (around `lines 535-539`) and the equivalent in `StockDetailEditor.tsx`.

### 3.3 Prefill plumbing

**Resolver action** (`getScannedAssetOption(id)`):

```ts
// src/lib/scan-actions-server.ts ("use server")
getScannedAssetOption(id: string): Promise<
  | {
      option: RepairAssetOption & AssetOption;
      assignedToId: string | null;
      assignedToName: string | null;
      holderName: string | null;
    }
  | { error: string }
>;
```

- Guarded by `requirePersonnelScope()` (accepts `pgso_personnel` and `super_admin`, rejects employees).
- Returns exactly one option in the shape the dialogs already consume, reusing the existing label builders.
- Needed because `getRepairFormOptions` / `getRequestFormOptions` search by text `q` only and cap at `PAGE_SIZE = 15` — a scanned asset is usually outside that window.
- Returns the current holder so the repair reporter / transfer "from" can be prefilled.

**Page behaviour (both portals):**

- Read `asset` (and `scan` where relevant) with `useSearchParams()`.
- Resolve the option, open the dialog, preselect asset + holder.
- `router.replace(pathname)` afterwards, guarded by a `useRef` so a re-render or back-navigation cannot re-open the dialog.
- Merge the resolved option into the pick-list state so the `<Select>` can display a label for it.

### 3.4 Repairs parity — extract the dialog

- Move the create-repair dialog and its eight state variables out of `src/app/personnel/repairs/page.tsx` (`~752-923`) into `src/components/personnel/RepairCreateDialog.tsx`:

```ts
interface RepairCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAssetId?: string;
  initialEmployeeId?: string;
  onCreated?: () => void;
}
```

- Personnel JSX must stay identical apart from being relocated (no visual or behavioural change for the existing flow).
- Mount on `/personnel/repairs` and `/super-admin/repairs`.
- `createRepair` currently authorizes only "signed in" (`actions.ts:447-461`). Add `requirePersonnelScope()` so the super-admin mount is explicitly authorized and employees cannot call it.

### 3.5 Transfer parity — compact scan dialog

New `src/components/personnel/ScanTransferDialog.tsx`:

- Asset shown read-only (title + property number).
- "From" holder prefilled from the resolver, editable.
- Recipient employee picker, quantity, required reason.
- Submits `createRequest({ requestType: "transfer", assetId, quantity, transferTo, reason, employeeId })`.
- Mounted on `/personnel/requests` and `/super-admin/requests`, opened by `?asset={id}&scan=transfer`.
- The existing 52 KB multi-type request dialog in `personnel/requests/page.tsx` is **not** modified — it continues to handle manual filing.

---

## 4. Architecture summary

| Layer | File |
| --- | --- |
| Pure action matrix | `src/lib/scan-actions.ts` (new) |
| Tag recognition (existing) | `src/lib/asset-tag.ts` |
| Auth-scoped resolver | `src/lib/scan-actions-server.ts` (new) |
| Scanner | `src/components/QrScanner.tsx` (modified) |
| Shared repair dialog | `src/components/personnel/RepairCreateDialog.tsx` (new, extracted) |
| Scan transfer dialog | `src/components/personnel/ScanTransferDialog.tsx` (new) |
| Pages | `src/app/{personnel,super-admin}/{scan,repairs,requests}/page.tsx` |
| Tests | `src/__tests__/scan-actions.test.ts` (new) |

No new server namespaces and no cache-key changes are required: the scan result is already cached client-side (`CLIENT_CACHE_KEYS.scan`), and the dialogs reuse existing readers and mutation paths.

---

## 5. Implementation phases

### Phase 1 — Pure logic + tests

- Create `src/lib/scan-actions.ts`.
- Add `src/__tests__/scan-actions.test.ts` covering:
  - public portal never yields `repair`, `transfer`, or `replenish`;
  - super-admin hrefs never contain `/personnel/`;
  - stock items never yield `repair`;
  - `open` and `history` are always present for assets;
  - hrefs carry the `?asset=` / `#asset-history` fragments.

### Phase 2 — Scanner UI

- Render the action row in the asset result branch.
- Add `id="asset-history"` anchors in the asset/stock detail editors.
- Verify the request/issue branches and the raw-payload fallback are unchanged.

### Phase 3 — Resolver + repair parity

- Add `getScannedAssetOption(id)` and harden `createRepair` with `requirePersonnelScope()`.
- Extract `RepairCreateDialog` and mount it in both portals.
- Support `?asset=` prefill on both repairs pages.

### Phase 4 — Transfer parity

- Build `ScanTransferDialog` and mount it on both requests pages.
- Support `?asset=…&scan=transfer` prefill; confirm `createRequest` succeeds from the super-admin portal.

### Phase 5 — Documentation and verification

- `OBJECTIVES-ASSESSMENT.md`: Objective 6 → **Fully met**; correct both stale claims; remove gap #1 from §4; refresh the demo checklist.
- `README.md`: scan section (camera-only; scan-to-action flow).
- `AGENTS.md`: add the scanner files to "Where to look".
- `npm test`, `npm run build`.

---

## 6. Acceptance criteria

- [x] Scanning an asset tag on `/personnel/scan`, `/super-admin/scan`, and `/scan` resolves the asset and shows identifying details (no regression).
- [x] Personnel and super-admin scanners show asset actions: open, view history, log repair, request transfer.
- [x] Stock tags show open + request replenishment, and never offer repair.
- [x] The public scanner shows identification only, with a "sign in to act" hint.
- [x] "View history" lands on the history section of the asset detail page.
- [x] "Log repair" opens the create-repair dialog with the asset and current holder pre-selected, both editable.
- [x] "Request transfer" opens the transfer dialog with the asset and holder pre-selected, both editable.
- [x] `?asset=` (and `scan`) is stripped after use; refresh or back-navigation does not re-open the dialog.
- [x] Every scan action works from the super-admin portal without redirecting to `/personnel/*`.
- [x] `createRepair` rejects callers outside personnel/super-admin scope.
- [x] No QR payload format change, no schema change, no new mutation path.
- [x] `npm test` and `npm run build` pass; `npm run lint` shows only the known pre-existing failures.

---

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Prefill dialog re-opens on re-render / back-navigation | `router.replace` to strip params + a `useRef` guard |
| Scanned asset missing from the 15-row pick list | Dedicated `getScannedAssetOption(id)` resolver merged into the option state |
| Extracting the repair dialog breaks a heavily used flow | Move JSX and state verbatim; keep the personnel page's rendered output byte-identical |
| Super-admin calling personnel server actions | Established pattern (`super-admin/repairs` already imports `getRepairsPage`); add explicit `requirePersonnelScope()` guards instead of relying on middleware |
| Scope creep into image upload / offline scanning | Explicitly out of scope in §2; the assessment wording is corrected instead |

---

## 8. Definition of done

Objective 6 can be marked **Fully met** when:

- Scanning a printed asset tag inside the system produces a resolved record **and** a usable next action.
- Both staff portals offer the same scan actions, with no cross-portal redirects.
- Those actions open correctly pre-filled forms, so a scan saves data entry rather than adding a step.
- The public scanner remains read-only and leaks no sensitive fields.
- `OBJECTIVES-ASSESSMENT.md`, `README.md`, and `AGENTS.md` describe the scanner accurately — including that it is camera-only.
