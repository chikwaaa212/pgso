// Static mock data for the personnel dashboard shell.
// Nothing here touches the backend — wire to Prisma/Supabase later.

export const mockStats = [
  { label: "Total Assets", value: "1,248", delta: "+32 this month" },
  { label: "Deliveries", value: "48", delta: "+6 vs last month" },
  { label: "Pending Requests", value: "12", delta: "4 need review" },
  { label: "Low Stock Alerts", value: "7", delta: "2 critical" },
];

export const mockChartBars = [
  { month: "Mar", deliveries: 22, inspections: 18 },
  { month: "Apr", deliveries: 30, inspections: 26 },
  { month: "May", deliveries: 26, inspections: 24 },
  { month: "Jun", deliveries: 34, inspections: 30 },
  { month: "Jul", deliveries: 40, inspections: 35 },
  { month: "Aug", deliveries: 48, inspections: 42 },
];

export const mockDeliveries = [
  { id: "DLV-1042", supplier: "Acme Office Supply", po: "PO-2026-081", date: "Sep 02, 2026", status: "Complete" },
  { id: "DLV-1041", supplier: "Metro Fixtures Inc.", po: "PO-2026-079", date: "Aug 28, 2026", status: "Complete" },
  { id: "DLV-1040", supplier: "Acme Office Supply", po: "PO-2026-077", date: "Aug 21, 2026", status: "Partial" },
  { id: "DLV-1039", supplier: "Harbor IT Depot", po: "PO-2026-075", date: "Aug 15, 2026", status: "Complete" },
  { id: "DLV-1038", supplier: "Northwind Traders", po: "PO-2026-072", date: "Aug 08, 2026", status: "Complete" },
];

export const mockRequests = [
  { id: "REQ-331", type: "New asset", from: "J. Dela Cruz", date: "Sep 05, 2026", status: "Pending" },
  { id: "REQ-330", type: "Transfer", from: "M. Santos", date: "Sep 04, 2026", status: "Pending" },
  { id: "REQ-329", type: "New supply", from: "A. Reyes", date: "Sep 03, 2026", status: "Approved" },
  { id: "REQ-328", type: "Transfer", from: "R. Bautista", date: "Sep 01, 2026", status: "Completed" },
];

export const mockInspections = [
  { id: "INS-220", delivery: "DLV-1042", result: "Passed", date: "Sep 03, 2026" },
  { id: "INS-219", delivery: "DLV-1041", result: "Passed", date: "Aug 29, 2026" },
  { id: "INS-218", delivery: "DLV-1040", result: "Partial", date: "Aug 22, 2026" },
  { id: "INS-217", delivery: "DLV-1039", result: "Passed", date: "Aug 16, 2026" },
  { id: "INS-216", delivery: "DLV-1038", result: "Failed", date: "Aug 09, 2026" },
];

export const mockInventory = [
  { id: "INV-501", item: "Bond paper (A4, 80gsm)", qty: "120 reams", location: "Stockroom A", flag: null },
  { id: "INV-502", item: "Ballpoint pen (black)", qty: "35 boxes", location: "Stockroom A", flag: null },
  { id: "INV-503", item: "Toner cartridge TN-2380", qty: "4 pcs", location: "Stockroom B", flag: "Low stock" },
  { id: "INV-504", item: "Filing folder (long)", qty: "2 bundles", location: "Stockroom A", flag: "Critical" },
  { id: "INV-505", item: "Extension cord 5m", qty: "18 pcs", location: "Stockroom B", flag: null },
];

export const mockAssets = [
  { id: "AST-9001", propertyNo: "2026-00142", category: "IT Equipment", status: "Assigned", location: "Admin Office" },
  { id: "AST-9002", propertyNo: "2026-00141", category: "Furniture", status: "Available", location: "Warehouse" },
  { id: "AST-9003", propertyNo: "2026-00140", category: "Vehicle", status: "Under repair", location: "Motorpool" },
  { id: "AST-9004", propertyNo: "2026-00139", category: "IT Equipment", status: "Available", location: "Warehouse" },
  { id: "AST-9005", propertyNo: "2026-00138", category: "Appliance", status: "Assigned", location: "Records Room" },
];

export const mockDocuments = [
  { id: "DOC-710", ref: "RIS-2026-0710", type: "RIS", status: "Released" },
  { id: "DOC-709", ref: "PAR-2026-0709", type: "PAR", status: "Approved" },
  { id: "DOC-708", ref: "ICS-2026-0708", type: "ICS", status: "Pending" },
  { id: "DOC-707", ref: "AIR-2026-0707", type: "AIR", status: "Approved" },
  { id: "DOC-706", ref: "RIS-2026-0706", type: "RIS", status: "Pending" },
];

export const mockRepairs = [
  { id: "RPR-120", asset: "2026-00140", issue: "Aircon not cooling", tech: "J. Ramos", status: "In progress" },
  { id: "RPR-119", asset: "2026-00098", issue: "Printer paper jam", tech: "Unassigned", status: "Pending" },
  { id: "RPR-118", asset: "2026-00102", issue: "Office chair wheel", tech: "M. Aquino", status: "Completed" },
  { id: "RPR-117", asset: "2026-00087", issue: "Flickering light", tech: "J. Ramos", status: "Completed" },
];
