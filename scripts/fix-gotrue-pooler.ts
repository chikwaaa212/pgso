import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

async function main() {
  const client = await pool.connect()
  try {
    const userRes = await client.query('SELECT current_user, current_database()')
    console.log('Current user:', userRes.rows[0])

    const funcs = await client.query(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'auth' ORDER BY proname`
    )
    console.log('Auth functions:', funcs.rows.map(r => r.proname).join(', '))

    // Create all missing GoTrue functions
    const functions = [
      `CREATE OR REPLACE FUNCTION auth.email_check_confirmed(user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id = user_id $$`,
      `CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid $$`,
      `CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'role')::text $$`,
      `CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'email')::text $$`,
      `CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims', true)::jsonb $$`,
      `CREATE OR REPLACE FUNCTION auth.instance_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'instance_id')::uuid $$`,
      `CREATE OR REPLACE FUNCTION auth.hash_password(password text) RETURNS text LANGUAGE sql AS $$ SELECT crypt(password, gen_salt('bf', 6)) $$`,
      `CREATE OR REPLACE FUNCTION auth.generate_salt() RETURNS text LANGUAGE sql AS $$ SELECT gen_salt('bf', 6) $$`,
    ]

    for (const fn of functions) {
      try {
        await client.query(fn)
        console.log('Created:', fn.match(/FUNCTION auth\.(\w+)/)![1])
      } catch(e) {
        console.error('Failed:', fn.match(/FUNCTION auth\.(\w+)/)![1], e.message)
      }
    }

    const funcs2 = await client.query(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'auth' ORDER BY proname`
    )
    console.log('Auth functions now:', funcs2.rows.map(r => r.proname).join(', '))
  } finally {
    client.release()
    await pool.end()
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })