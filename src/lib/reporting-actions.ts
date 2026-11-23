'use server'

import { requirePersonnelScope } from '@/lib/personnel-scope'
import {
  getAgingReport,
  getAssetAvailabilityReport,
  getAssetConditionReport,
  getAssignedAssetsReport,
  getDisposalReport,
  getQuarterlyIssuanceReport,
  type AgingReport,
  type AssetAvailabilityReport,
  type AssetConditionReport,
  type AssignedAssetsReport,
  type DisposalReport,
  type QuarterlyIssuanceReport,
  type ReportPortal,
} from '@/lib/reporting-queries'

/**
 * Server-action wrappers for the shared Reports workspace.
 *
 * Authorization is enforced here (never only in the UI) and again inside the
 * scoped queries. `requirePersonnelScope` accepts active personnel and super
 * admins; employees are rejected. Super Admin readers intentionally reuse the
 * personnel queries — the scope helper returns `isSuperAdmin` so owner filters
 * are skipped rather than duplicated.
 */

export async function fetchAgingReport(opts: {
  portal?: ReportPortal
  module?: string
  bucket?: string
  page?: number
  pageSize?: number
}): Promise<AgingReport> {
  await requirePersonnelScope()
  return getAgingReport(opts)
}

export async function fetchQuarterlyIssuanceReport(opts: {
  year?: number
}): Promise<QuarterlyIssuanceReport> {
  await requirePersonnelScope()
  return getQuarterlyIssuanceReport(opts)
}

export async function fetchAssetAvailabilityReport(): Promise<AssetAvailabilityReport> {
  await requirePersonnelScope()
  return getAssetAvailabilityReport()
}

export async function fetchAssetConditionReport(): Promise<AssetConditionReport> {
  await requirePersonnelScope()
  return getAssetConditionReport()
}

export async function fetchDisposalReport(): Promise<DisposalReport> {
  await requirePersonnelScope()
  return getDisposalReport()
}

export async function fetchAssignedAssetsReport(): Promise<AssignedAssetsReport> {
  await requirePersonnelScope()
  return getAssignedAssetsReport()
}
