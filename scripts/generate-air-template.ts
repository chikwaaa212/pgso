// Generates the blank, printable Appendix 62 template used by Generate AIR.
// Run: node scripts/generate-air-template.ts
// Layout lives in src/lib/air-excel.ts (single source of truth).
import { BLANK_AIR_INPUT, buildAirWorkbook } from "../src/lib/air-excel.ts";

const OUT = "public/templates/AIR-TEMPLATE.xlsx";

const wb = buildAirWorkbook(BLANK_AIR_INPUT);
await wb.xlsx.writeFile(OUT);
console.log(`wrote ${OUT}`);
