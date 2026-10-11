import "server-only";

/**
 * Header alias dictionary for PPMP workbooks.
 * Matching is always on normalized text (lowercase, alnum-only), so
 * "Quantity and Size", "QUANTITY/SIZE" and "Quantity/Size" all hit.
 */

// GPPB 12-col signature tokens. A row scoring >= HEADER_MIN_SCORE is the
// header anchor. Tokens were taken from the actual sample files
// (BM JOSSONE/MONTOJO, DOPH-CATEEL, GUADA 2026).
const SIGNATURE_TOKENS = [
  "generaldescription",
  "typeoftheproject",
  "quantityandsize",
  "quantitysize",
  "recommendedmode",
  "preprocurement",
  "startofprocurement",
  "endofprocurement",
  "expecteddelivery",
  "implementationperiod",
  "sourceoffunds",
  "estimatedbudget",
  "authorizedbudgetary",
  "authorizedbudgetory",
  "supportingdocuments",
] as const;

export const HEADER_MIN_SCORE = 3;

/** Canonical field -> normalized alias list. */
export const FIELD_ALIASES: Record<string, string[]> = {
  description: [
    "generaldescriptionandobjectiveoftheprojecttobesupplied",
    "generaldescription",
    "itemdescription",
    "description",
    "particulars",
    "projecttitle",
  ],
  type: ["typeoftheprojecttobeprocured", "type", "goodesservices", "goodsservices", "goods"],
  quantity_text: [
    "quantityandsizeoftheprojecttobeprocured",
    "quantityandsize",
    "quantitysize",
    "quantity",
    "qty",
  ],
  qty: ["quantity", "qty", "column3"],
  unit: ["unit", "uom", "column3b"],
  price: ["price", "unitcost", "unitprice"],
  total: ["total", "totalcost", "amount", "totalabc"],
  mode: ["recommendedmodeofprocurement", "recommendedmode", "modeofprocurement", "mode"],
  preproc: ["preprocurementconference", "preproc"],
  start: ["startofprocurementactivity", "startofprocurement", "start"],
  end: ["endofprocurementactivity", "endofprocurement", "end"],
  delivery: ["expecteddeliveryimplementationperiod", "expecteddelivery", "deliveryperiod", "targetdate"],
  source_funds: ["sourceoffunds", "fundsource", "sourceoffund"],
  budget: [
    "estimatedbudgetauthorizedbudgetaryallotment",
    "estimatedbudgetauthorizedbudgetoryallotment",
    "estimatedbudget",
    "totalabc",
    "amount",
    "abc",
  ],
  docs: ["attachedsupportingdocuments", "supportingdocs", "supportingdocuments"],
  remarks: ["remarks", "schedule"],
  code: ["code", "accountcode", "itemno", "itemnumber"],
  office: ["office", "enduser", "enduserorimplementingunit", "implementingunit"],
};

export function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return "";
  let s: string;
  if (typeof value === "string" || typeof value === "number") s = String(value);
  else if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") s = v.text;
    else if (Array.isArray(v.richText))
      s = (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    else if (v.result !== undefined && v.result !== null) s = String(v.result);
    else return "";
  } else return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Count of GPPB signature tokens present in a row's normalized cells. */
export function scoreHeaderRow(cells: string[]): number {
  const joined = ` ${cells.join(" ")} `;
  let score = 0;
  for (const token of SIGNATURE_TOKENS) {
    if (joined.includes(token)) score++;
  }
  return score;
}

/** True when the row looks like the "Column 1..12" helper row under the header. */
export function isHelperRow(cells: string[]): boolean {
  const hits = cells.filter((c) => /^column\d{1,2}$/.test(c)).length;
  return hits >= 3;
}

/** True when the first two cells are CODE/OFFICE-ish and the row is wide. */
export function isPivotHeaderRow(cells: string[], colCount: number): boolean {
  if (colCount < 10) return false;
  const a = cells[0] ?? "";
  const b = cells[1] ?? "";
  return (
    (a === "code" || a === "accountcode" || a === "itemno") &&
    (b === "office" || b === "enduser" || b.includes("office"))
  );
}

export function canonicalField(normalized: string): string | null {
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => normalized === a || normalized.startsWith(a))) return field;
  }
  return null;
}
