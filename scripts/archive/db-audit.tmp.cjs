// READ-ONLY database health audit. SELECTs only.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const out = {};
(async () => {
  const counts = {};
  for (const [name, model] of [
    ['profiles', 'profile'], ['assets', 'asset'], ['deliveries', 'delivery'],
    ['delivery_items', 'deliveryItem'], ['inspections', 'inspection'],
    ['iar_records', 'iarRecord'], ['inventory', 'inventoryItem'],
    ['repairs', 'repair'], ['documents', 'document'], ['requests', 'request'],
    ['request_items', 'requestItem'], ['audit_logs', 'auditLog'],
    ['document_views', 'documentView'], ['issuance_records', 'issuanceRecord'],
    ['units', 'unit'], ['account_catalog', 'accountCatalog'],
  ]) {
    try { counts[name] = await p[model].count(); }
    catch (e) { counts[name] = 'ERROR: ' + e.message.split('\n')[0]; }
  }
  out.counts = counts;

  try {
    out.profiles_by_role_status = await p.$queryRaw`
      SELECT role, status, COUNT(*)::int AS n FROM profiles GROUP BY role, status ORDER BY 1, 2`;
  } catch (e) { out.profiles_by_role_status = 'ERROR: ' + e.message.split('\n')[0]; }
  try {
    out.requests_by_status_type = await p.$queryRaw`
      SELECT status, request_type, COUNT(*)::int AS n FROM requests GROUP BY status, request_type ORDER BY 1, 2`;
  } catch (e) { out.requests_by_status_type = 'ERROR: ' + e.message.split('\n')[0]; }
  try {
    out.requests_null_recipient = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM requests WHERE recipient_id IS NULL`;
  } catch (e) { out.requests_null_recipient = 'ERROR'; }
  try {
    // recipient_id / employee_id pointing outside profiles
    out.requests_bad_recipient = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM requests r LEFT JOIN profiles pr ON pr.id = r.recipient_id
      WHERE r.recipient_id IS NOT NULL AND pr.id IS NULL`;
    out.requests_bad_employee = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM requests r LEFT JOIN profiles pr ON pr.id = r.employee_id
      WHERE pr.id IS NULL`;
  } catch (e) { out.requests_fk = 'ERROR: ' + e.message.split('\n')[0]; }
  try {
    // requests.asset_id resolving to neither assets nor inventory
    out.requests_dangling_asset = await p.$queryRaw`
      SELECT r.id::text AS id, r.request_type, r.status FROM requests r
      LEFT JOIN assets a ON a.id = r.asset_id LEFT JOIN inventory i ON i.id = r.asset_id
      WHERE r.asset_id IS NOT NULL AND a.id IS NULL AND i.id IS NULL LIMIT 10`;
  } catch (e) { out.requests_dangling_asset = 'ERROR'; }
  try {
    out.request_items_orphan = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM request_items ri LEFT JOIN requests r ON r.id = ri.request_id WHERE r.id IS NULL`;
    out.request_items_bad_asset = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM request_items ri
      LEFT JOIN assets a ON a.id = ri.asset_id LEFT JOIN inventory i ON i.id = ri.asset_id
      WHERE ri.asset_id IS NOT NULL AND a.id IS NULL AND i.id IS NULL`;
  } catch (e) { out.request_items_fk = 'ERROR'; }
  try {
    out.repairs_dangling_asset = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM repairs rp
      LEFT JOIN assets a ON a.id = rp.asset_id LEFT JOIN inventory i ON i.id = rp.asset_id
      WHERE a.id IS NULL AND i.id IS NULL`;
    out.repairs_bad_reporter = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM repairs rp LEFT JOIN profiles pr ON pr.id = rp.reported_by WHERE pr.id IS NULL`;
  } catch (e) { out.repairs_fk = 'ERROR'; }
  try {
    out.issuance_dangling = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM issuance_records ir LEFT JOIN profiles pr ON pr.id = ir.employee_id WHERE pr.id IS NULL`;
    out.issuance_bad_asset = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM issuance_records ir
      LEFT JOIN assets a ON a.id = ir.asset_id LEFT JOIN inventory i ON i.id = ir.inventory_id
      WHERE (ir.asset_id IS NOT NULL AND a.id IS NULL) OR (ir.inventory_id IS NOT NULL AND i.id IS NULL)`;
    out.issuance_docno_dupes = await p.$queryRaw`
      SELECT doc_no, COUNT(*)::int AS n FROM issuance_records WHERE doc_no IS NOT NULL GROUP BY doc_no HAVING COUNT(*) > 1 LIMIT 10`;
  } catch (e) { out.issuance_fk = 'ERROR'; }
  try {
    out.deliveries_bad_receiver = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM deliveries d LEFT JOIN profiles pr ON pr.id = d.received_by WHERE pr.id IS NULL`;
    out.delivery_items_orphan = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM delivery_items di LEFT JOIN deliveries d ON d.id = di.delivery_id WHERE d.id IS NULL`;
    out.inspections_orphan = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM inspections ins LEFT JOIN deliveries d ON d.id = ins.delivery_id WHERE d.id IS NULL`;
  } catch (e) { out.delivery_fk = 'ERROR'; }
  try {
    out.documents_bad_refs = await p.$queryRaw`
      SELECT COUNT(*)::int AS n FROM documents doc
      LEFT JOIN assets a ON a.id = doc.related_asset_id
      LEFT JOIN inventory i ON i.id = doc.related_inventory_id
      LEFT JOIN deliveries d ON d.id = doc.related_delivery_id
      LEFT JOIN inspections ins ON ins.id = doc.related_inspection_id
      LEFT JOIN iar_records iar ON iar.id = doc.related_iar_record_id
      WHERE (doc.related_asset_id IS NOT NULL AND a.id IS NULL)
        OR (doc.related_inventory_id IS NOT NULL AND i.id IS NULL)
        OR (doc.related_delivery_id IS NOT NULL AND d.id IS NULL)
        OR (doc.related_inspection_id IS NOT NULL AND ins.id IS NULL)
        OR (doc.related_iar_record_id IS NOT NULL AND iar.id IS NULL)`;
    out.documents_refno_dupes = await p.$queryRaw`
      SELECT reference_number, COUNT(*)::int AS n FROM documents GROUP BY reference_number HAVING COUNT(*) > 1 LIMIT 10`;
  } catch (e) { out.documents_fk = 'ERROR'; }
  try {
    out.qr_dupes = await p.$queryRaw`
      SELECT qr_code, COUNT(*)::int AS n FROM assets WHERE qr_code IS NOT NULL GROUP BY qr_code HAVING COUNT(*) > 1 LIMIT 10`;
    out.propno_dupes = await p.$queryRaw`
      SELECT property_number, COUNT(*)::int AS n FROM assets WHERE property_number IS NOT NULL GROUP BY property_number HAVING COUNT(*) > 1 LIMIT 10`;
  } catch (e) { out.asset_dupes = 'ERROR'; }
  try {
    out.audit_recent = await p.$queryRaw`
      SELECT action, COUNT(*)::int AS n FROM audit_logs WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY action ORDER BY n DESC LIMIT 15`;
  } catch (e) { out.audit_recent = 'ERROR'; }

  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
})().catch(async (e) => { console.error('FATAL', e.message); try { await p.$disconnect(); } catch {} process.exit(2); });
