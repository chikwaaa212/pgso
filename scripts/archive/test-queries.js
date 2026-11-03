const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    // Check profiles
    const profiles = await prisma.profile.findMany({
      where: { status: 'active', role: 'employee' },
      select: { id: true, full_name: true, position: true, office: true },
    });
    console.log('Profiles count:', profiles.length);
    console.log('Profiles sample:', JSON.stringify(profiles.slice(0, 3), null, 2));

    // Check assets
    const assets = await prisma.asset.findMany({
      where: { status: 'available' },
      take: 3,
      select: { id: true, unit_cost: true, total_cost: true, quantity: true, article: true, status: true },
    });
    console.log('Available assets count:', assets.length);
    console.log('Assets sample:', JSON.stringify(assets, null, 2));

    // Check all assets (no filter)
    const allAssets = await prisma.asset.findMany({
      take: 3,
      select: { id: true, unit_cost: true, total_cost: true, quantity: true, article: true, status: true },
    });
    console.log('All assets count:', allAssets.length);
    console.log('All assets sample:', JSON.stringify(allAssets, null, 2));

    // Check inventory items
    const stocks = await prisma.inventoryItem.findMany({
      take: 3,
      select: { id: true, unit_cost: true, total_cost: true, quantity: true, item_name: true },
    });
    console.log('Inventory items count:', stocks.length);
    console.log('Stocks sample:', JSON.stringify(stocks, null, 2));

    // Check request_items
    const requestItems = await prisma.requestItem.findMany({
      take: 10,
      select: { id: true, request_id: true, asset_id: true, description: true, quantity: true, unit_cost: true },
    });
    console.log('RequestItems count:', requestItems.length);
    console.log('RequestItems sample:', JSON.stringify(requestItems, null, 2));

    // Check new_assignment requests
    const requests = await prisma.request.findMany({
      where: { request_type: 'new_assignment' },
      take: 5,
      select: { id: true, employee_id: true, request_type: true, asset_id: true, description: true },
    });
    console.log('NewAssignmentRequests count:', requests.length);
    console.log('NewAssignmentRequests:', JSON.stringify(requests, null, 2));

    // Now test what the dialog sees: join request_items with assets/stocks
    if (requestItems.length > 0) {
      const assetIds = requestItems.filter(r => r.asset_id).map(r => r.asset_id);
      const stockIds = requestItems.filter(r => r.asset_id).map(r => r.asset_id);

      const matchingAssets = await prisma.asset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, unit_cost: true, total_cost: true, quantity: true, status: true },
      });
      console.log('Matching assets for request items:', JSON.stringify(matchingAssets, null, 2));

      const matchingStocks = await prisma.inventoryItem.findMany({
        where: { id: { in: stockIds } },
        select: { id: true, unit_cost: true, total_cost: true, quantity: true },
      });
      console.log('Matching stocks for request items:', JSON.stringify(matchingStocks, null, 2));
    }

    // Test the num function
    const testDecimal = assets.length > 0 ? assets[0].unit_cost : null;
    console.log('Test Decimal value:', testDecimal);
    console.log('Number(Decimal):', Number(testDecimal));
    console.log('typeof:', typeof testDecimal);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
