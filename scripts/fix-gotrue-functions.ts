import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Create the GoTrue helper functions that are missing
  // These are required by GoTrue for email/password authentication

  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
      SELECT
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
    $$
  `

  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
      SELECT
        (current_setting('request.jwt.claims', true)::jsonb ->> 'role')::text
    $$
  `

  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
      SELECT
        (current_setting('request.jwt.claims', true)::jsonb ->> 'email')::text
    $$
  `

  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
      SELECT
        current_setting('request.jwt.claims', true)::jsonb
    $$
  `

  // This is the critical function - checks if email is confirmed
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.email_check_confirmed(user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
      SELECT
        (
          SELECT
            email_confirmed_at IS NOT NULL
          FROM
            auth.users
          WHERE
            id = user_id
        )
    $$
  `

  // Instance ID function
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.instance_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
      SELECT
        current_setting('request.jwt.claims', true)::jsonb ->> 'instance_id'
    $$
  `

  // Hash password function (needed for password verification)
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.hash_password(password text) RETURNS text
    LANGUAGE sql
    AS $$
      SELECT
        crypt(password, gen_salt('bf', 6))
    $$
  `

  // Generate salt
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.generate_salt() RETURNS text
    LANGUAGE sql
    AS $$
      SELECT
        gen_salt('bf', 6)
    $$
  `

  // Check if a user exists by email (used during login)
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION auth.user_exists(email text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
      SELECT
        EXISTS (
          SELECT 1 FROM auth.users WHERE auth.users.email = email
        )
    $$
  `

  console.log('All GoTrue functions created successfully')

  // Verify functions exist
  const funcs = await prisma.$queryRaw<{ proname: string }[]>`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'auth' ORDER BY proname
  `
  console.log('Auth functions now:', funcs.map(f => f.proname).join(', '))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })