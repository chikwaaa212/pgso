/**
 * Seeds a single active employee account (Supabase Auth + Profile).
 *
 * Run: npx tsx scripts/seed-employee.ts
 * Override via env: EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, EMPLOYEE_NAME.
 *
 * The profile is created pre-completed so the account can sign in and use the
 * employee portal immediately instead of hitting the first-login overlay.
 * Safe to re-run: existing auth users are reused and the profile is upserted.
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local"), override: true });
config({ path: resolve(process.cwd(), ".env") });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const prisma = new PrismaClient();

const email = (process.env.EMPLOYEE_EMAIL ?? "pgso.employee@gmail.com").toLowerCase();
const password = process.env.EMPLOYEE_PASSWORD ?? "employee123";
const fullName = process.env.EMPLOYEE_NAME ?? "Employee User";
const [firstName, ...rest] = fullName.split(/\s+/);
const lastName = rest.join(" ") || "User";

async function ensureEmployeeNo(): Promise<string> {
  const base = "EMP-0001";
  const taken = await prisma.profile.findUnique({
    where: { employee_no: base },
    select: { id: true },
  });
  if (!taken) return base;
  const stub = `${email.replace(/[^a-z0-9]/g, "-")}`.slice(0, 40);
  return `EMP-${stub}`;
}

async function main() {
  const { data: existingUsers, error: listError } =
    await supabaseAdmin.auth.admin.listUsers();
  if (listError) throw listError;

  const existingUser = existingUsers?.users?.find(
    (u) => (u.email ?? "").toLowerCase() === email
  );

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    console.log("Auth user already exists:", existingUser.email);
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      throw new Error(`Failed to create auth user: ${error?.message ?? "unknown error"}`);
    }
    userId = data.user.id;
    console.log("Created auth user:", userId);
  }

  const current = await prisma.profile.findUnique({
    where: { id: userId },
    select: { employee_no: true, profile_completed: true },
  });
  const employeeNo = current?.employee_no ?? (await ensureEmployeeNo());

  const data = {
    full_name: fullName,
    role: "employee",
    status: "active",
    prefix: "Mr.",
    first_name: firstName,
    last_name: lastName,
    employee_no: employeeNo,
    department: "Provincial General Services Office",
    position: "Employee",
    office: "Provincial General Services Office",
    profile_completed: true,
    profile_completed_at: new Date(),
  };

  await prisma.profile.upsert({
    where: { id: userId },
    update: data,
    create: { id: userId, ...data },
  });

  console.log("Profile ready for employee:", userId);
  console.log(`\n  email:    ${email}\n  password: ${password}\n  role:     employee\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
