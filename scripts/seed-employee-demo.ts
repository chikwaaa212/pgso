/**
 * Demo seed for an employee account: assigns available assets and files one
 * request of each self-service type (transfer, new_assignment, repair).
 * Uses Prisma directly (seed scripts must not import server-only modules).
 *
 * Run: npx tsx scripts/seed-employee-demo.ts [email]
 * Defaults to akeroshii@gmail.com. Safe to re-run (skips existing demo rows).
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", override: true });
config({ path: ".env" });

const prisma = new PrismaClient();
const EMAIL = (process.argv[2] ?? "akeroshii@gmail.com").toLowerCase();
const MARK = "[demo]";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const authUser = data.users.find((u) => (u.email ?? "").toLowerCase() === EMAIL);
  if (!authUser?.email) throw new Error(`No auth user with email ${EMAIL}`);

  const profile = await prisma.profile.findUnique({ where: { id: authUser.id } });
  if (!profile) throw new Error(`No profile for user ${authUser.id} (${EMAIL})`);
  if (profile.role !== "employee" || profile.status !== "active") {
    throw new Error(
      `Profile is ${profile.role}/${profile.status} — demo seed needs an active employee.`
    );
  }
  const name = profile.full_name?.trim() || authUser.email!;
  console.log(`seeding ${name} <${EMAIL}> (${authUser.id})`);

  // ── Assign up to 3 available, unassigned assets ──
  const already = await prisma.asset.count({ where: { assigned_to: authUser.id } });
  if (already === 0) {
    const candidates = await prisma.asset.findMany({
      where: { assigned_to: null, status: "available" },
      orderBy: { account_code: "asc" },
      take: 3,
      select: { id: true, account_code: true, article: true },
    });
    for (const c of candidates) {
      await prisma.asset.update({
        where: { id: c.id },
        data: { assigned_to: authUser.id, end_user: name },
      });
      console.log(`assigned ${c.account_code} (${c.article ?? "asset"})`);
    }
    if (candidates.length === 0) console.log("no available unassigned assets to assign");
  } else {
    console.log(`already has ${already} assigned assets — skipping assignment`);
  }

  const mine = await prisma.asset.findMany({
    where: { assigned_to: authUser.id },
    orderBy: { account_code: "asc" },
    take: 3,
    select: { id: true, account_code: true },
  });
  if (mine.length === 0) throw new Error("No assigned assets available for request seeding");

  const existingTypes = new Set(
    (
      await prisma.request.findMany({
        where: { employee_id: authUser.id, description: { contains: MARK } },
        select: { request_type: true },
      })
    ).map((r) => r.request_type)
  );

  async function ensureRequest(
    type: string,
    data: { asset_id: string | null; description: string },
    label: string
  ) {
    if (existingTypes.has(type)) {
      console.log(`request [${type}] already seeded — skipping`);
      return;
    }
    const created = await prisma.request.create({
      data: {
        employee_id: authUser.id,
        request_type: type,
        asset_id: data.asset_id,
        description: data.description,
        status: "pending",
      },
      select: { id: true },
    });
    // new_assignment line item (mirrors createRequest's request_items insert).
    if (type === "new_assignment") {
      await prisma.$executeRaw`
        INSERT INTO request_items (id, request_id, asset_id, description, quantity, unit_cost)
        VALUES (${randomUUID()}::uuid, ${created.id}::uuid, NULL, ${"Office chair for workstation"}, 1, NULL)`;
    }
    console.log(`request [${type}] filed (${label})`);
  }

  await ensureRequest(
    "transfer",
    {
      asset_id: mine[0].id,
      description: `Transfer to Records Office — Annex Building\n${MARK} Demo transfer request for ${mine[0].account_code}.`,
    },
    mine[0].account_code
  );

  await ensureRequest(
    "new_assignment",
    {
      asset_id: null,
      description: `Office chair for workstation\n${MARK} Demo new-assignment request.`,
    },
    "office chair"
  );

  const repairAsset = mine[Math.min(1, mine.length - 1)];
  await ensureRequest(
    "repair",
    {
      asset_id: repairAsset.id,
      description: `Repair needed\n${MARK} Demo repair request (unit won't power on).`,
    },
    repairAsset.account_code
  );

  // Mark the repair request approved so status badges vary.
  const repair = await prisma.request.findFirst({
    where: { employee_id: authUser.id, request_type: "repair", description: { contains: MARK } },
    select: { id: true, status: true },
  });
  if (repair && repair.status === "pending") {
    await prisma.request.update({ where: { id: repair.id }, data: { status: "approved" } });
    console.log("repair request marked approved (demo variety)");
  }

  const totals = await Promise.all([
    prisma.asset.count({ where: { assigned_to: authUser.id } }),
    prisma.request.count({ where: { employee_id: authUser.id } }),
  ]);
  console.log(`done: assigned assets=${totals[0]}, total requests=${totals[1]}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("SEED FAILED:", e?.message ?? e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
