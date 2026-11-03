/**
 * Tunable thresholds for prescriptive analytics.
 *
 * Keeping these in one client-safe file means rules and tests share the same
 * numbers, and a future settings screen can pass overrides without touching
 * the rule implementations.
 */

export interface PrescriptiveConfig {
  /** An available, unassigned asset is idle after this many days. */
  idleDays: number
  /** Repair-heavy window (months are approximated as 30.44 days). */
  repairWindowDays: number
  /** Number of repairs inside the window that triggers replacement review. */
  repairCountThreshold: number
  /** Repair spend / recorded asset cost that triggers replacement review. */
  repairCostRatio: number
  /** Replenishment lead time used for suggested order quantities. */
  leadTimeDays: number
  /** Safety-stock days added on top of the lead time. */
  safetyDays: number
  /** Number of fiscal years of issuance history to inspect. */
  consumptionYears: number
  /** Maximum rows rendered per recommendation group. */
  maxRowsPerGroup: number
}

export const PRESCRIPTIVE_CONFIG: PrescriptiveConfig = {
  idleDays: 180,
  repairWindowDays: 365,
  repairCountThreshold: 3,
  repairCostRatio: 0.5,
  leadTimeDays: 60,
  safetyDays: 15,
  consumptionYears: 3,
  maxRowsPerGroup: 50,
}

/** Allow tests / future settings to override a subset of defaults. */
export function withPrescriptiveConfig(
  overrides: Partial<PrescriptiveConfig> = {}
): PrescriptiveConfig {
  return { ...PRESCRIPTIVE_CONFIG, ...overrides }
}
