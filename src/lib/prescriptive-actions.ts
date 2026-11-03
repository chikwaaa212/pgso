'use server'

import { requirePersonnelScope } from '@/lib/personnel-scope'
import {
  getIssuanceConsumption,
  getPrescriptiveOverview,
  type PrescriptivePortal,
} from '@/lib/prescriptive-queries'
import type { ConsumptionResult } from '@/lib/ppmp/analytics/consumption'
import type { PrescriptiveOverview } from '@/lib/prescriptive/types'

/**
 * Server-action wrappers for the shared Recommendations workspace.
 *
 * Authorization is enforced here (never only in the UI) and again inside the
 * scoped queries. `requirePersonnelScope` accepts active personnel and super
 * admins; employees are rejected. Recommendations are read-only — no action
 * in this file mutates an asset, disposal record, request, or stock level.
 */

export async function fetchPrescriptiveRecommendations(
  portal: PrescriptivePortal = 'personnel'
): Promise<PrescriptiveOverview> {
  await requirePersonnelScope()
  return getPrescriptiveOverview(portal === 'super-admin' ? 'super-admin' : 'personnel')
}

/** Consumption suggestions used by the PPMP planning page. */
export async function fetchIssuanceConsumption(): Promise<ConsumptionResult> {
  await requirePersonnelScope()
  return getIssuanceConsumption()
}
