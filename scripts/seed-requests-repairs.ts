import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SEED_TAG = "(seed)";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function ensureEmployees() {
  const existing = await prisma.profile.findMany({
    where: { role: "employee", status: "active" },
    select: { id: true, full_name: true },
  });

  const wanted = ["Juan Dela Cruz", "Maria Santos", "Jose Rizal", "Ana Reyes"];
  const have = new Set(existing.map((e) => e.full_name));
  const created = [...existing];

  for (const name of wanted) {
    if (!have.has(name)) {
      const row = await prisma.profile.create({
        data: {
          id: randomUUID(),
          full_name: name,
          role: "employee",
          status: "active",
        },
        select: { id: true, full_name: true },
      });
      created.push(row);
      console.log(`Created employee profile: ${name}`);
    }
  }
  return created;
}

async function main() {
  // Clean previous seed runs so the script is rerunnable.
  const prevReq = await prisma.request.deleteMany({
    where: { description: { contains: SEED_TAG } },
  });
  const prevRep = await prisma.repair.deleteMany({
    where: { description: { contains: SEED_TAG } },
  });
  if (prevReq.count + prevRep.count > 0) {
    console.log(
      `Cleared previous seed: ${prevReq.count} requests, ${prevRep.count} repairs`
    );
  }

  const employees = await ensureEmployees();
  if (employees.length < 2) throw new Error("Need at least 2 employees");

  const assets = await prisma.asset.findMany({
    orderBy: { created_at: "asc" },
    select: { id: true, article: true },
    take: 12,
  });
  if (assets.length < 4) throw new Error("Need at least 4 assets to seed");

  const stocks = await prisma.inventoryItem.findMany({
    where: { quantity: { gt: 0 } },
    orderBy: { item_name: "asc" },
    select: { id: true, item_name: true, quantity: true },
    take: 6,
  });
  if (stocks.length < 2) throw new Error("Need at least 2 stocks to seed");

  const [e1, e2, e3, e4] = employees;
  const [a1, a2, a3, a4, a5, a6] = assets;
  const [s1, s2] = stocks;

  const requests = [
    {
      employee_id: e1.id,
      request_type: "transfer",
      asset_id: a1.id,
      description: `Transfer to ${e2.full_name} — Registrar Office\nLaptop reassignment for new staff ${SEED_TAG}`,
      status: "pending",
      date_requested: daysAgo(1),
      date_resolved: null,
    },
    {
      employee_id: e2.id,
      request_type: "transfer",
      asset_id: a2.id,
      description: `Transfer to ${e3.full_name}\nOffice reshuffle ${SEED_TAG}`,
      status: "approved",
      date_requested: daysAgo(6),
      date_resolved: daysAgo(5),
    },
    {
      employee_id: e3.id,
      request_type: "transfer",
      asset_id: a3.id,
      description: `Transfer to ${e1.full_name} — Motorpool\nReassign service vehicle ${SEED_TAG}`,
      status: "completed",
      date_requested: daysAgo(10),
      date_resolved: daysAgo(8),
    },
    {
      employee_id: e1.id,
      request_type: "new_assignment",
      asset_id: s1.id,
      description: `${s1.item_name} for office use\nQty: ${Math.min(10, s1.quantity)}\nRestock department supply ${SEED_TAG}`,
      status: "pending",
      date_requested: daysAgo(2),
      date_resolved: null,
    },
    {
      employee_id: e2.id,
      request_type: "new_assignment",
      asset_id: s2.id,
      description: `${s2.item_name} for field work\nQty: ${Math.min(50, s2.quantity)}\nMonthly consumption ${SEED_TAG}`,
      status: "completed",
      date_requested: daysAgo(9),
      date_resolved: daysAgo(7),
    },
    {
      employee_id: e4.id,
      request_type: "new_assignment",
      asset_id: a4.id,
      description: `Laptop for new hire\n${e4.full_name} onboarding ${SEED_TAG}`,
      status: "approved",
      date_requested: daysAgo(4),
      date_resolved: daysAgo(3),
    },
    {
      employee_id: e3.id,
      request_type: "repair",
      asset_id: a5.id,
      description: `Repair needed\nWon't power on, possible PSU failure ${SEED_TAG}`,
      status: "pending",
      date_requested: daysAgo(1),
      date_resolved: null,
    },
    {
      employee_id: e2.id,
      request_type: "repair",
      asset_id: a6.id,
      description: `Repair needed\nScreen flickering and overheating ${SEED_TAG}`,
      status: "rejected",
      date_requested: daysAgo(7),
      date_resolved: daysAgo(6),
    },
  ];

  for (const r of requests) {
    await prisma.request.create({ data: r });
  }
  console.log(`Inserted ${requests.length} requests`);

  const repairs = [
    {
      asset_id: a1.id,
      reported_by: e1.id,
      repair_date: daysAgo(2),
      description: `Screen flickering, needs diagnostics ${SEED_TAG}`,
      status: "pending",
      technician: null,
      cost: null,
    },
    {
      asset_id: a2.id,
      reported_by: e2.id,
      repair_date: daysAgo(5),
      description: `Paper jam and strange noise during printing ${SEED_TAG}`,
      status: "pending",
      technician: "J. Santos",
      cost: null,
    },
    {
      asset_id: a3.id,
      reported_by: e3.id,
      repair_date: daysAgo(4),
      description: `Engine won't start, battery suspected ${SEED_TAG}`,
      status: "in_progress",
      technician: "M. Reyes",
      cost: null,
    },
    {
      asset_id: a4.id,
      reported_by: e4.id,
      repair_date: daysAgo(6),
      description: `Keyboard replacement and OS reinstall ${SEED_TAG}`,
      status: "in_progress",
      technician: "J. Santos",
      cost: 1200,
    },
    {
      asset_id: a5.id,
      reported_by: e1.id,
      repair_date: daysAgo(12),
      description: `Compressor overhaul completed ${SEED_TAG}`,
      status: "completed",
      technician: "R. Cruz",
      cost: 8500,
    },
    {
      asset_id: a6.id,
      reported_by: e2.id,
      repair_date: daysAgo(15),
      description: `Wiring fixed and tested OK ${SEED_TAG}`,
      status: "completed",
      technician: "M. Reyes",
      cost: 2500,
    },
  ];

  for (const r of repairs) {
    await prisma.repair.create({ data: r });
  }
  console.log(`Inserted ${repairs.length} repairs`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
