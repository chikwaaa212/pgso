# Stock Delivery Details + Stock Type Master Data — Implementation Plan

**Request:** On `/personnel/deliveries` → **Log a delivery**, choosing *Stocks* should show **Stock Code / Account Title / Stock Type** (not asset labels), and the stock/asset details must be separated on delivery records and receipts. Add a **Stock types** list to Super Admin → Master Data and seed 5 rows.

**Current status:** Planned, not implemented.

---

## 1. Current behaviour (verified in code)

| Concern | Where it lives now |
| --- | --- |
| Log-a-delivery stepper and fields | `src/app/personnel/deliveries/log-delivery-mock-form.tsx` |
| Step 1 label | `STEPS = ["Asset Details", …]` — always says *Asset Details* |
| Field labels | Always *Account Code*, *Account Title*, *Asset Type* |
| Asset Type source | Derived from `account_catalog.asset_type` via `getDeliveryFormOptions().accountTitleTypes` |
| Delivery persistence | `src/app/personnel/deliveries/actions.ts` → `logDelivery` writes `asset_type`, `account_code`, `account_title` |
| Delivery record | `src/app/personnel/deliveries/[id]/delivery-receipt.tsx` always shows *Account Code* and *Asset Type / Account Title* |
| Preview receipt | `src/app/personnel/deliveries/delivery-receipt.tsx` always shows *Asset Type / Account Code / Account Title* |
| Inspection record | `src/app/personnel/inspections/components/inspection-receipt.tsx` and `[id]/inspection-form.tsx` always show *Asset Type* |
| Inventory category after inspection | `src/lib/stock.ts` sets `category = delivery.asset_type` |
| Master Data | Departments, Units, Account catalog only (`src/app/super-admin/master-data/*`) |
| Delivery form option cache | `personnel:delivery-form-options` (300s), **not** busted by Master Data writes today |

There is **no stock-type concept** in the schema. `InventoryItem.category` is free text and `AccountCatalog.asset_type` is shared by both stocks and assets.

---

## 2. Confirmed decisions

| Decision | Choice |
| --- | --- |
| Stock Type source | New **Stock types** master-data table (add/deactivate), not the account catalog |
| Detail separation | Delivery record page **and** delivery/inspection receipts show stock labels for stock deliveries, asset labels for asset deliveries |
| Storage | Dedicated `Delivery.stock_type` column; `asset_type` stays asset-only |
| Seed data | 5 stock types **and** 5 matching stock catalog entries so the Account Title dropdown is usable end-to-end |
| Catalog kind filter (`stock` vs `asset` on `account_catalog`) | **Deferred** — out of scope; noted as a follow-up |
| Existing rows | Untouched; `stock_type` stays `null` for historical deliveries |

**Trade-off accepted:** `AccountCatalog` has no `kind` flag, so stock titles still appear in the Assets flow and vice versa. A future `kind` column can filter them.

---

## 3. Data model

### 3.1 New `StockType` model

```prisma
model StockType {
  id          String    @id @default(uuid()) @db.Uuid
  name        String    @unique @db.VarChar
  description String?   @db.VarChar
  status      String    @default("active") @db.VarChar
  created_by  String?   @db.Uuid
  created_at  DateTime? @default(now()) @db.Timestamptz

  @@index([status])
  @@map("stock_types")
}
```

### 3.2 `Delivery` gains `stock_type`

```prisma
model Delivery {
  // …
  asset_type String? @db.VarChar   // assets only
  stock_type String? @db.VarChar   // stocks only (references stock_types.name)
  // …
  @@index([stock_type])
}
```

### 3.3 Migration

- New migration `34_stock_types_and_delivery_stock_type`.
- Apply with `npm run db:migrate` (or `npm run db:push` while prototyping), then `npm run db:generate`.

---

## 4. Super Admin → Master Data

### `src/app/super-admin/master-data/actions.ts`

| Function | Behaviour |
| --- | --- |
| `StockTypeRow` | `id`, `name`, `description`, `status`, `usage`, `created_at` |
| `getStockTypes()` | `requireSuperAdmin`, 60s scoped cache `super-admin:master-stock-types`, usage = `delivery.count({ stock_type: name })` |
| `createStockType()` | Trim name, 2–120 chars, case-insensitive duplicate check, `status: active`, audit `master-data:create_stock_type` |
| `setStockTypeStatus()` | Block deactivation when `usage > 0`, audit create/reactivate/deactivate |
| `revalidate()` | Existing helper; also bust `personnel:delivery-form-options` (see `personnel-cache.ts` below) |

### `src/app/super-admin/master-data/master-forms.tsx`

- `AddStockTypeForm` — dialog with **Name*** and **Description** fields, same pattern as `AddUnitForm`.
- `StockTypeToggle` — ActionButton with confirm + toast, same pattern as `UnitToggle`.
- On success bust `CLIENT_CACHE_KEYS.adminMasterData`, `resourcePrefix("super-admin", "master-data")`, `pgso:master-data:active`.

### `src/app/super-admin/master-data/page.tsx`

- Snapshot loader includes `getStockTypes()` in the `Promise.all`.
- New Card **“Stock types”** between Units and Account catalog:
  - Columns: Name · Description · Used in · Status · Action.
  - Empty state: “No stock types yet — add the first one above.”
- Subtitle counts: `… active stock types …`.

### `src/app/super-admin/master-data/loading.tsx`

- Add a matching Stock types skeleton panel (5 rows).

### `src/lib/personnel-cache.ts`

- Add `personnel:delivery-form-options` to the `master-data` scope in `bustSuperAdminScopes` so new stock types appear in the form immediately instead of after the 5-minute TTL.

---

## 5. Log-a-delivery modal (`log-delivery-mock-form.tsx`)

### Data

- `Step1Data` gains `stockType: string`.
- `DeliveryFormOptions` gains `stockTypes: string[]` (active names, sorted).
- `PreviewData` inherits `stockType`; preview receipt renders it.

### Labels

| Element | Stocks | Assets |
| --- | --- | --- |
| Stepper step 1 | **Stock Details** | Asset Details |
| Code field | **Stock Code** | Account Code |
| Third field | **Stock Type** (select from master list) | Asset Type (read-only, auto-filled from title) |

- Helper text updates accordingly (“Type a code for this stock…” / “Stock type is managed in Master Data.”).
- `Generate` already prefixes `STK` for stocks — unchanged.

### Validation

- `isStep1Valid`:
  - stocks: kind chosen, code ≥ 2 chars, title in catalog, `stockType` in `formOptions.stockTypes`
  - assets: existing behaviour (title + derived asset type)
- Step 1 for stocks no longer requires the catalog-derived asset type.

### Server action `logDelivery`

- Read `stockType` from the form.
- `deliveryKind === "stock"`:
  - Validate against active `StockType` names (canonical casing from the DB).
  - Save `stock_type = canonicalStockType`, `asset_type = null`.
  - Error text: “Choose a stock type from Master Data.”
- `deliveryKind === "asset"`:
  - Existing catalog-derived `asset_type` path; `stock_type = null`.
- Account title validation stays shared for both kinds.
- Audit summary unchanged (already records the kind).

### `getDeliveryFormOptions` (`deliveries/actions.ts`)

- Query active `StockType` rows and return `stockTypes`.
- Keep the 300s cache; bust it from Master Data writes (section 4).

---

## 6. Record and receipt separation

### Delivery detail (`src/app/personnel/deliveries/[id]/delivery-receipt.tsx`)

- `DeliveryDetails` + `getDeliveryDetails` add `stock_type`.
- For `delivery_kind === "stock"`:
  - **Stock Code** → `account_code`
  - **Account Title** → `account_title`
  - **Stock Type** → `stock_type`
- Otherwise keep **Account Code** and **Asset Type / Account Title**.

### Preview receipt (`src/app/personnel/deliveries/delivery-receipt.tsx`)

- Conditional on `data.deliveryKind`: stock → *Stock Type*; asset → *Asset Type*.
- Rename *Account Code* to *Stock Code* for stocks.

### Inspections

- `src/app/personnel/inspections/actions.ts`: `DeliveryForInspection` gains `delivery_kind` and `stock_type`; add both to the Prisma select and return value.
- `inspection-receipt.tsx` and `[id]/inspection-form.tsx`: stock deliveries show *Stock Code / Account Title / Stock Type*; assets keep *Asset Type / Code*.

### Stocking (`src/lib/stock.ts`)

- Select `stock_type` on the delivery.
- `category = delivery.stock_type ?? delivery.asset_type` so new inventory rows are categorised by stock type.
- No quantity/watermark logic changes; existing tests unaffected.

---

## 7. Seed data

### `scripts/seed-stock-types.ts`

Idempotent (`upsert` by name), loads `.env.local` like `backfill-master-data.ts`:

| Stock type |
| --- |
| Office Supplies |
| Janitorial Supplies |
| Medical Supplies |
| ICT Supplies |
| Fuel & Lubricants |

### `scripts/seed-stock-catalog.ts` (or one combined script)

5 matching active catalog rows so the Account Title dropdown has stock titles:

| Code | Account title | Asset type (= stock type) |
| --- | --- | --- |
| 5-02-01-010 | OFFICE SUPPLIES | Office Supplies |
| 5-02-02-010 | JANITORIAL SUPPLIES | Janitorial Supplies |
| 5-02-03-010 | MEDICAL SUPPLIES | Medical Supplies |
| 5-02-04-010 | ICT SUPPLIES | ICT Supplies |
| 5-02-05-010 | FUEL AND LUBRICANTS | Fuel & Lubricants |

- Codes are placeholders following the existing `X-XX-XX-XXX` style; adjust if the client’s chart of accounts uses different codes.
- Add npm scripts:
  - `"seed:stock-types": "tsx --env-file=.env.local scripts/seed-stock-types.ts"`
  - `"seed:stock-catalog": "tsx --env-file=.env.local scripts/seed-stock-catalog.ts"`
- Run both once and verify Master Data shows 5 stock types + 5 catalog rows.

---

## 8. Files touched

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `StockType` model; `Delivery.stock_type` |
| `prisma/migrations/34_stock_types_and_delivery_stock_type/migration.sql` | New tables/columns/indexes |
| `src/app/super-admin/master-data/actions.ts` | Stock type readers/writers |
| `src/app/super-admin/master-data/master-forms.tsx` | Add form + toggle |
| `src/app/super-admin/master-data/page.tsx` | New panel + snapshot + counts |
| `src/app/super-admin/master-data/loading.tsx` | Skeleton panel |
| `src/lib/personnel-cache.ts` | Bust delivery form options on master-data writes |
| `src/app/personnel/deliveries/actions.ts` | Form options + stock validation + detail field |
| `src/app/personnel/deliveries/log-delivery-mock-form.tsx` | Dynamic labels + stock type dropdown + validation |
| `src/app/personnel/deliveries/delivery-receipt.tsx` | Preview labels |
| `src/app/personnel/deliveries/[id]/delivery-receipt.tsx` | Record labels |
| `src/app/personnel/inspections/actions.ts` | Kind + stock type on `DeliveryForInspection` |
| `src/app/personnel/inspections/components/inspection-receipt.tsx` | Conditional labels |
| `src/app/personnel/inspections/[id]/inspection-form.tsx` | Conditional summary labels |
| `src/lib/stock.ts` | Category from `stock_type` |
| `scripts/seed-stock-types.ts` | New seed |
| `scripts/seed-stock-catalog.ts` | New seed |
| `package.json` | Seed scripts |
| `docs/README.md` | Add this plan to the index |

No changes to route gating, ownership scope, issuance rules, or request transitions.

---

## 9. Verification

- `npm run lint`
- `npm test` (stock rules + cache invalidation)
- `npm run build`

Manual checks:

1. **Stocks:** Log a delivery → step 1 says *Stock Details* with *Stock Code / Account Title / Stock Type*; save succeeds; record page shows those three values and no asset type.
2. **Assets:** Log a delivery → still *Asset Details*; asset type auto-fills from the title; record shows *Asset Type / Account Title*.
3. **Stocking:** Inspect + generate AIR for a stock delivery → inventory row category equals the stock type.
4. **Master Data:** Add a stock type; toggle one off; deactivation blocked while a delivery uses it; the new type appears in the delivery form without waiting 5 minutes.
5. **Seed:** Scripts re-run without creating duplicates.

---

## 10. Follow-ups (not in scope)

- Add `kind` (`stock` / `asset`) to `AccountCatalog` and filter Account Title options by the selected delivery kind.
- Surface `stock_type` as a filter/column in the inventory and delivery lists.
