import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    // Get all assets and stocks
    const allAssets = await prisma.asset.findMany({
      select: { id: true, unit_cost: true, total_cost: true, quantity: true, article: true, status: true, qr_code: true },
    });
    console.log('All assets:', JSON.stringify(allAssets, null, 2));

    const allStocks = await prisma.inventoryItem.findMany({
      select: { id: true, unit_cost: true, total_cost: true, quantity: true, item_name: true },
    });
    console.log('All stocks:', JSON.stringify(allStocks, null, 2));

    // Get all requests with their asset_ids
    const requests = await prisma.request.findMany({
      where: { request_type: 'new_assignment' },
      select: { id: true, employee_id: true, asset_id: true, description: true, status: true },
    });
    console.log('NewAssignmentRequests:', JSON.stringify(requests, null, 2));

    // Check if request asset_ids match any asset or stock
    for (const req of requests) {
      if (req.asset_id) {
        const assetMatch = allAssets.find(a => a.id === req.asset_id);
        const stockMatch = allStocks.find(s => s.id === req.asset_id);
        console.log(`Request ${req.id}: asset_id=${req.asset_id}`);
        console.log(`  Asset match: ${assetMatch ? JSON.stringify(assetMatch) : 'NONE'}`);
        console.log(`  Stock match: ${stockMatch ? JSON.stringify(stockMatch) : 'NONE'}`);
      }
    }

    // Test the num function with actual data
    const testCases = [null, undefined, '950000', 950000, 0, '0', ''];
    for (const tc of testCases) {
      const n = Number(tc);
      const result = (tc === null || tc === undefined) ? null : (Number.isFinite(n) ? n : null);
      console.log(`num(${JSON.stringify(tc)}) = ${result} (Number=${n}, isFinite=${Number.isFinite(n)})`);
    }

    // Test Decimal conversion
    const decimalAsset = allAssets.find(a => a.unit_cost !== null);
    if (decimalAsset) {
      console.log('Decimal test - unit_cost:', decimalAsset.unit_cost, 'type:', typeof decimalAsset.unit_cost);
      console.log('Number(unit_cost):', Number(decimalAsset.unit_cost));
      console.log('isFinite:', Number.isFinite(Number(decimalAsset.unit_cost)));
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
