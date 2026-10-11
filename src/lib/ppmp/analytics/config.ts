import "server-only";

import prisma from "@/lib/prisma";

export interface AnalyticsConfig {
  version: number;
  qty_increase_pct: number;
  cost_increase_pct: number;
  anomaly_z: number;
  trend_epsilon_pct: number;
  forecast_min_history: number;
  smoothing_alpha: number;
}

/** Frozen V1 defaults (confirmed). Used when the DB row is unreachable. */
export const DEFAULT_CONFIG: AnalyticsConfig = {
  version: 1,
  qty_increase_pct: 25,
  cost_increase_pct: 30,
  anomaly_z: 2.0,
  trend_epsilon_pct: 5,
  forecast_min_history: 3,
  smoothing_alpha: 0.5,
};

interface ConfigRow {
  version: number;
  qty_increase_pct: number;
  cost_increase_pct: number;
  anomaly_z: number;
  trend_epsilon_pct: number;
  forecast_min_history: number;
  smoothing_alpha: number;
}

/**
 * Latest config row. Uses raw SQL so reads keep working even if the
 * generated Prisma client predates the model (regenerate after stopping
 * `next dev`: the engine DLL is locked while the dev server runs).
 */
export async function loadConfig(): Promise<AnalyticsConfig> {
  try {
    const rows = await prisma.$queryRaw<ConfigRow[]>`
      SELECT version, qty_increase_pct, cost_increase_pct, anomaly_z,
             trend_epsilon_pct, forecast_min_history, smoothing_alpha
      FROM ppmp_analytics_config ORDER BY version DESC LIMIT 1`;
    const row = rows[0];
    if (!row) return DEFAULT_CONFIG;
    return {
      version: row.version,
      qty_increase_pct: Number(row.qty_increase_pct),
      cost_increase_pct: Number(row.cost_increase_pct),
      anomaly_z: Number(row.anomaly_z),
      trend_epsilon_pct: Number(row.trend_epsilon_pct),
      forecast_min_history: Number(row.forecast_min_history),
      smoothing_alpha: Number(row.smoothing_alpha),
    };
  } catch (e) {
    console.error("[loadConfig]", e);
    return DEFAULT_CONFIG;
  }
}
