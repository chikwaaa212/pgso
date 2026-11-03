import ExcelJS from 'exceljs'

import {
  AGING_BUCKETS,
  DELAYED_THRESHOLD_DAYS,
  conditionLabel,
} from '@/lib/reporting'
import type {
  AgingReport,
  AssetConditionReport,
  QuarterlyIssuanceReport,
  ReportPortal,
} from '@/lib/reporting-queries'

/**
 * Official XLSX report builders (Objective 4).
 *
 * Mirrors the PAR/ICS export conventions: ExcelJS workbook, fixed header
 * block with report period / filters / threshold, then one or more tables.
 * All data is read through the same scoped queries the pages use, so an
 * export can never contain rows the caller could not see on screen.
 */

const NAVY = 'FF1B2A4A'
const YELLOW = 'FFF5C518'
const GREY = 'FFF2F4F7'
const BORDER_COLOR = 'FFD0D5DD'
const MONEY_FMT = '#,##0.00'
const NUMBER_FMT = '#,##0'
const DATE_FMT = 'yyyy-mm-dd'

type Workbook = ExcelJS.Workbook
type Worksheet = ExcelJS.Worksheet

function thinBorder(): Partial<ExcelJS.Borders> {
  const side = { style: 'thin' as const, color: { argb: BORDER_COLOR } }
  return { top: side, left: side, bottom: side, right: side }
}

function createWorkbook(): Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PGSO Property & Supply Management System'
  wb.created = new Date()
  return wb
}

function addTitle(ws: Worksheet, title: string, columns: number): void {
  ws.mergeCells(1, 1, 1, columns)
  const cell = ws.getCell(1, 1)
  cell.value = title
  cell.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } }
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  ws.getRow(1).height = 28
}

function addMeta(ws: Worksheet, startRow: number, lines: string[], columns: number): number {
  let row = startRow
  for (const line of lines) {
    ws.mergeCells(row, 1, row, columns)
    const cell = ws.getCell(row, 1)
    cell.value = line
    cell.font = { name: 'Arial', size: 10, color: { argb: 'FF475467' } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    row++
  }
  return row + 1
}

function addSection(ws: Worksheet, row: number, title: string, columns: number): number {
  ws.mergeCells(row, 1, row, columns)
  const cell = ws.getCell(row, 1)
  cell.value = title
  cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1B2A4A' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } }
  ws.getRow(row).height = 20
  return row + 1
}

function addTableHeader(ws: Worksheet, row: number, headers: string[]): number {
  headers.forEach((header, index) => {
    const cell = ws.getCell(row, index + 1)
    cell.value = header
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder()
  })
  ws.getRow(row).height = 22
  return row + 1
}

function addTableRow(
  ws: Worksheet,
  row: number,
  values: Array<string | number | null>,
  formats?: Array<'money' | 'number' | 'date' | undefined>
): number {
  values.forEach((value, index) => {
    const cell = ws.getCell(row, index + 1)
    cell.value = value ?? ''
    cell.font = { name: 'Arial', size: 10 }
    cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'left' : 'right' }
    cell.border = thinBorder()
    const format = formats?.[index]
    if (format === 'money') cell.numFmt = MONEY_FMT
    if (format === 'number') cell.numFmt = NUMBER_FMT
    if (format === 'date') cell.numFmt = DATE_FMT
  })
  return row + 1
}

function addTotalRow(
  ws: Worksheet,
  row: number,
  values: Array<string | number | null>,
  formats?: Array<'money' | 'number' | undefined>
): number {
  values.forEach((value, index) => {
    const cell = ws.getCell(row, index + 1)
    cell.value = value ?? ''
    cell.font = { name: 'Arial', size: 10, bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } }
    cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'left' : 'right' }
    cell.border = thinBorder()
    const format = formats?.[index]
    if (format === 'money') cell.numFmt = MONEY_FMT
    if (format === 'number') cell.numFmt = NUMBER_FMT
  })
  return row + 1
}

function setWidths(ws: Worksheet, widths: number[]): void {
  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width
  })
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

function portalLabel(portal: ReportPortal): string {
  return portal === 'super-admin' ? 'Super Admin — all records' : 'PGSO Personnel — own records'
}

// ─── Aging ─────────────────────────────────────────────────────────────────

export function buildAgingWorkbook(report: AgingReport, portal: ReportPortal): Workbook {
  const wb = createWorkbook()
  const ws = wb.addWorksheet('Aging & delays', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const columns = 9
  setWidths(ws, [20, 26, 40, 24, 16, 16, 14, 14, 12])

  addTitle(ws, 'Delayed & Aging Transactions', columns)
  let row = addMeta(ws, 2, [
    `Scope: ${portalLabel(portal)}`,
    `Generated: ${fmtDateTime(report.generatedAt)} (Asia/Manila)`,
    `Delayed threshold: older than ${report.thresholdDays} days (uniform for inspections, requests and repairs)`,
    `Filters — module: ${report.module === 'all' ? 'All workflows' : report.module}; bucket: ${
      report.bucket === 'all' ? 'All buckets' : report.bucket
    }`,
  ], columns)

  row = addSection(ws, row, 'Aging summary by workflow', columns)
  row = addTableHeader(ws, row, [
    'Workflow',
    'Open records',
    `Delayed (> ${DELAYED_THRESHOLD_DAYS}d)`,
    'Oldest (days)',
    ...AGING_BUCKETS.map((b) => b.label),
  ])
  for (const summary of report.summaries) {
    row = addTableRow(
      ws,
      row,
      [
        summary.label,
        summary.total,
        summary.delayed,
        summary.oldestDays,
        ...summary.buckets.map((b) => b.count),
      ],
      [undefined, 'number', 'number', 'number', ...summary.buckets.map(() => 'number' as const)]
    )
  }

  row += 1
  row = addSection(ws, row, 'Delayed records', columns)
  row = addTableHeader(ws, row, [
    'Workflow',
    'Reference',
    'Subject',
    'Owner',
    'Status',
    'Opened',
    'Age (days)',
    'Bucket',
    'Delayed',
  ])
  for (const item of report.rows.rows) {
    row = addTableRow(
      ws,
      row,
      [
        item.moduleLabel,
        item.reference,
        item.subject,
        item.owner,
        item.status ?? '',
        fmtDate(item.openedAt),
        item.ageDays,
        item.bucket,
        item.delayed ? 'Yes' : 'No',
      ],
      [undefined, undefined, undefined, undefined, undefined, undefined, 'number']
    )
  }
  if (report.rows.rows.length === 0) {
    ws.mergeCells(row, 1, row, columns)
    const cell = ws.getCell(row, 1)
    cell.value = 'No records match the selected filters.'
    cell.font = { name: 'Arial', size: 10, italic: true }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder()
    row++
  }
  ws.mergeCells(row + 1, 1, row + 1, columns)
  ws.getCell(row + 1, 1).value = `Page ${report.rows.page} of ${report.rows.totalPages} — ${report.rows.total} matching record(s)`
  ws.getCell(row + 1, 1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF475467' } }

  return wb
}

// ─── Quarterly issuance ────────────────────────────────────────────────────

export function buildQuarterlyWorkbook(
  report: QuarterlyIssuanceReport,
  portal: ReportPortal
): Workbook {
  const wb = createWorkbook()
  const ws = wb.addWorksheet(`Quarterly ${report.year}`, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const columns = 7
  setWidths(ws, [22, 12, 10, 10, 10, 12, 16])

  addTitle(ws, `Quarterly Supply Issuance — ${report.year}`, columns)
  let row = addMeta(ws, 2, [
    `Scope: ${portalLabel(portal)}`,
    `Generated: ${fmtDateTime(report.generatedAt)} (Asia/Manila)`,
    'Quarter basis: calendar quarters (Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec)',
    'Documents count once in the summary; consolidated multi-line documents count per line in the item breakdown.',
  ], columns)

  row = addSection(ws, row, `Quarter summary — ${report.year}`, columns)
  row = addTableHeader(ws, row, [
    'Quarter',
    'Documents',
    'PAR',
    'ICS',
    'Other',
    'Quantity',
    'Amount (PHP)',
  ])
  for (const q of report.quarters) {
    row = addTableRow(
      ws,
      row,
      [q.label, q.documents, q.par, q.ics, q.others, q.quantity, q.amount],
      [undefined, 'number', 'number', 'number', 'number', 'number', 'money']
    )
  }
  row = addTotalRow(
    ws,
    row,
    [
      'Total',
      report.totals.documents,
      report.totals.par,
      report.totals.ics,
      report.totals.others,
      report.totals.quantity,
      report.totals.amount,
    ],
    [undefined, 'number', 'number', 'number', 'number', 'number', 'money']
  )

  row += 1
  row = addSection(ws, row, 'Last 8 quarters trend', columns)
  row = addTableHeader(ws, row, [
    'Quarter',
    'Documents',
    'PAR',
    'ICS',
    'Other',
    'Quantity',
    'Amount (PHP)',
  ])
  for (const q of report.trend) {
    row = addTableRow(
      ws,
      row,
      [q.label, q.documents, q.par, q.ics, q.others, q.quantity, q.amount],
      [undefined, 'number', 'number', 'number', 'number', 'number', 'money']
    )
  }

  row += 1
  row = addSection(ws, row, 'Top items issued (per line)', columns)
  row = addTableHeader(ws, row, ['Item', 'Lines', 'Quantity', 'Amount (PHP)'])
  for (const item of report.topItems) {
    row = addTableRow(
      ws,
      row,
      [item.name, item.lines, item.quantity, item.amount],
      [undefined, 'number', 'number', 'money']
    )
  }

  row += 1
  row = addSection(ws, row, 'Issuance by office / department', columns)
  row = addTableHeader(ws, row, ['Office', 'Documents', 'Quantity', 'Amount (PHP)'])
  for (const item of report.byOffice) {
    row = addTableRow(
      ws,
      row,
      [item.name, item.documents, item.quantity, item.amount],
      [undefined, 'number', 'number', 'money']
    )
  }

  row += 1
  row = addSection(ws, row, 'Issuance by employee', columns)
  row = addTableHeader(ws, row, ['Employee', 'Documents', 'Quantity', 'Amount (PHP)'])
  for (const item of report.byEmployee) {
    row = addTableRow(
      ws,
      row,
      [item.name, item.documents, item.quantity, item.amount],
      [undefined, 'number', 'number', 'money']
    )
  }

  return wb
}

// ─── Asset conditions ──────────────────────────────────────────────────────

export function buildConditionWorkbook(
  report: AssetConditionReport,
  portal: ReportPortal
): Workbook {
  const wb = createWorkbook()
  const ws = wb.addWorksheet('Asset conditions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const columns = 5
  setWidths(ws, [28, 20, 14, 12, 24])

  addTitle(ws, 'Asset Condition Breakdown', columns)
  let row = addMeta(ws, 2, [
    `Scope: ${portalLabel(portal)} — shared asset registry`,
    `Generated: ${fmtDateTime(report.generatedAt)} (Asia/Manila)`,
    'Condition distribution only: the registry stores the current condition, so a historical trend is not available.',
  ], columns)

  row = addSection(ws, row, 'Headline', columns)
  row = addTableHeader(ws, row, ['Measure', 'Assets', 'Share', '', ''])
  row = addTableRow(ws, row, ['Total assets', report.total, 100, '', ''], [undefined, 'number', 'number'])
  row = addTableRow(ws, row, ['Serviceable', report.serviceable, report.serviceablePct, '', ''], [undefined, 'number', 'number'])
  row = addTableRow(
    ws,
    row,
    [
      'Unserviceable',
      report.unserviceable,
      report.total > 0 ? Math.round((report.unserviceable / report.total) * 100) : 0,
      '',
      '',
    ],
    [undefined, 'number', 'number']
  )
  row = addTableRow(
    ws,
    row,
    [
      'Unspecified',
      report.unspecified,
      report.total > 0 ? Math.round((report.unspecified / report.total) * 100) : 0,
      '',
      '',
    ],
    [undefined, 'number', 'number']
  )

  row += 1
  row = addSection(ws, row, 'Condition distribution', columns)
  row = addTableHeader(ws, row, ['Condition', 'Classification', 'Assets', 'Share', 'Notes'])
  for (const item of report.rows) {
    row = addTableRow(
      ws,
      row,
      [
        item.label || conditionLabel(item.condition),
        item.cls === 'unspecified' ? 'Unspecified' : item.cls,
        item.count,
        item.pct,
        item.cls === 'unspecified' ? 'Condition not recorded or not recognized' : '',
      ],
      [undefined, undefined, 'number', 'number']
    )
  }

  return wb
}
