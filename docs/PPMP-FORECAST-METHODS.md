# PPMP Planning — Forecast Methods Explained

Reference for the **Forecast method** dropdown on `/personnel/ppmp/planning`, and how each option derives the low / base / high quantities in the generated PPMP draft.

Source of truth: [`src/lib/ppmp/analytics/planning.ts`](../src/lib/ppmp/analytics/planning.ts), [`src/lib/ppmp/analytics/consumption.ts`](../src/lib/ppmp/analytics/consumption.ts), [`src/lib/ppmp/analytics/forecast.ts`](../src/lib/ppmp/analytics/forecast.ts).

---

## Algorithm names at a glance

| Dropdown option | Formal algorithm name(s) |
| --- | --- |
| **Average / carryover** | Arithmetic mean (simple average) with min–max range band; single-value case → naive last-value forecast (random walk / carryover) |
| **Trend (statistical where available)** | Ordinary Least Squares (OLS) simple linear regression; model selection among Simple Moving Average SMA(3), OLS regression, and Simple Exponential Smoothing (SES) using lowest one-step-ahead backtest MAPE |
| **Growth rate** | Compound growth (geometric / CAGR-style compounding), with the high case adding one extra compounding period |
| **Issuance history (actual usage)** | Exact-key (normalized string) join + mean annual consumption with min–max band, adjusted by on-hand inventory (net requirement) |
| **Ceiling fit** | 0/1 knapsack solved as a binary integer linear program (BILP) via `javascript-lp-solver`; fallback = greedy smallest-first heuristic |
| **Quarter split** | Floor-and-redistribute remainder apportionment (largest-remainder family, round-robin tie-break) |

---

## Shared pipeline (applies to every method)

| Step | Algorithm | Code |
| --- | --- | --- |
| **Horizon** | `max(0, targetYear − latest history year)` — how many annual steps are projected forward. Same-year target holds figures. | `planningHorizon()` |
| **Quantity** | Method-specific (below) → produces `low / base / high`. | `projectQtyHistory()`, `buildForecastsFromItems()` |
| **Unit cost** | Recorded cost × `(1 + price%)^years` (compound). Missing cost → category median → file-wide median (flagged "for canvass"). | `compoundPct()`, `medianOf()` |
| **Total** | `qty × unit_cost` for each band. | — |
| **Quarter split** | Observed start-month mix from history; otherwise 25% per quarter. Floors, then distributes the remainder. | `quarterSplit()` |
| **Ceiling fit** | 0/1 knapsack maximizing funded line count (`javascript-lp-solver`); falls back to greedy smallest-first. | `fitDraftToCeilingLP()`, `fitDraftToCeilingGreedy()` |
| **Statistical engine** | `simple-statistics` (`mean`, `min`, `max`, `linearRegression`, `linearRegressionLine`). | — |

---

## 1. Average / carryover

**Algorithm name:** Arithmetic mean (simple average) with a min–max range band; when only one value exists, a naive last-value (carryover / random-walk) forecast.

**Algorithm**

- `base = mean(all history years)`
- `low = min(history)`
- `high = max(history)`
- Single-year history → carry that one value forward unchanged.
- No growth is added.

**Pattern:** central tendency (mean) + observed range band.

**User-friendly description**

> Take the average quantity you planned or used across the past years and use that as next year's figure. The low and high numbers are simply your best and worst years, so you see the normal range. If you only have one year of data, we keep that number as-is.

---

## 2. Trend (statistical where available)

**Algorithm names:**
- Base projection: **Ordinary Least Squares (OLS) simple linear regression**.
- Backend model selection: **Simple Moving Average SMA(3)**, **OLS simple linear regression**, and **Simple Exponential Smoothing (SES)** ranked by **lowest one-step-ahead backtest MAPE** (mean absolute percentage error).

**Algorithm**

- Multi-year history → `linearRegression` over points `[0…n-1]`; `base = line(n-1+horizon)`, `low/high = min/max` of history ∪ prediction.
- When the backend forecaster passes its 3-year gate, `forecast.ts` competes three candidates:
  - `moving_average_3`
  - `linear_regression`
  - `exponential_smoothing(alpha)` (4+ years only)
  
  The one with the **lowest backtest MAPE** (one-step-ahead error) wins. Confidence: LOW at 3 periods, MEDIUM at 4+.
- Single-year history → flat carryover, with an explicit "add a second year to enable trend" note.

**Pattern:** least-squares linear fit; model selection by backtest error.

**User-friendly description**

> We draw a straight line through your past years and extend it to the target year, so items that were rising keep rising and items that were falling keep falling. When enough history exists, we test several forecasting formulas and use whichever predicted your past years most accurately. With only one year of data, we can't detect a trend, so the number stays flat.

---

## 3. Growth rate

**Algorithm name:** **Compound growth** (geometric compounding, CAGR-style: `qty × (1 + rate)^n`), with the high scenario adding one extra compounding period.

**Algorithm**

- `base = last recorded qty × (1 + growth%)^horizon` (compound, not simple)
- `low = last recorded qty`
- `high = base × (1 + growth%)` — one extra year as the aggressive case
- With a statistical forecast available, growth is layered on top of its point estimate for the residual years.

**Pattern:** compound interest applied to quantity.

**User-friendly description**

> Start from your most recent quantity and add your growth percentage every year, compounding — e.g. 10% over 3 years is ×1.33, not ×1.30. The low number keeps this year's quantity flat, and the high number adds one more growth year as a safety margin.

---

## 4. Issuance history (actual usage)

**Algorithm name:** **Exact-key join** (normalized `description|unit` string matching) + **mean annual consumption** with a **min–max band**, adjusted by **on-hand inventory deduction** (net requirement).

**Algorithm** (`consumption.ts`)

- Joins PPMP lines to real issuance records by an exact normalized key `description|unit` (lowercase alphanumerics — deliberately no fuzzy matching).
- Aggregates the last 3 fiscal years, then:
  - `base = total issued / window − on-hand stock`
  - `low = min annual issuance − on-hand`
  - `high = max annual issuance − on-hand`
  - Values never go below 0.
- Confidence: 3 usable years → high, 2 → medium, 1 → low.
- Unmatched lines keep their workbook quantity and are labeled `consumption_no_history_…`.

**Pattern:** exact-key join + actual-usage averaging with stock offset.

**User-friendly description**

> Instead of guessing from last year's budget, we look at what your office actually issued over the past three years, average it per year, and subtract stock you still have on hand. The low and high are your quietest and busiest years. If an item has never been issued, we leave your workbook quantity and mark it so you can confirm.

---

## Cross-cutting notes

- **Every number is a projection.** Each row is editable and carries its `method` + `assumptions`, surfaced in the "How each line was projected" section (`buildPlanningBasis()`).
- **Fallbacks are transparent, never invented:**
  - Budget-only lines → 1 lot at the recorded budget.
  - Missing cost → median unit cost.
  - No history → workbook quantity.
- **Ceiling is a proposal, not an order.** The LP/greedy solver only suggests which lines fit; Budget/BAC still prioritize.
- **Trend vs Growth:** Trend follows the data's own direction (can go down); Growth always forces the entered % upward from the last value.
