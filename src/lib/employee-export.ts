/**
 * Employee export access decision (pure, unit-testable).
 *
 * Order is fixed: authenticate (401) → authorize role (403) → resource
 * existence/ownership/type (404). Ownership failures return 404 (not 403)
 * so one employee can never probe another employee's document IDs.
 */

export type EmployeeExportStatus = 401 | 403 | 404 | 200

export interface EmployeeExportDoc {
  employee_id: string
  doc_type: string
}

export function resolveEmployeeExportAccess(input: {
  userId: string | null
  role: string | null
  doc: EmployeeExportDoc | null
  wantType: 'PAR' | 'ICS'
}): EmployeeExportStatus {
  if (!input.userId) return 401
  if (input.role !== 'employee') return 403
  if (!input.doc) return 404
  if (input.doc.employee_id !== input.userId) return 404
  if (input.doc.doc_type !== input.wantType) return 404
  return 200
}
