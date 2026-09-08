-- Seed personnel user
-- Run this in Supabase Dashboard -> SQL Editor

-- 1. Create the auth user
INSERT INTO auth.users (
  email,
  encrypted_password,
  email_confirmed_at,
  confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role
)
VALUES (
  'personnel@pgso.com',
  crypt('personnel123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated',
  'authenticated'
)
RETURNING id INTO TEMP TABLE new_user;

-- 2. Create the profile with personnel role
INSERT INTO profiles (id, full_name, role, status, created_at)
SELECT id, 'Personnel User', 'personnel', 'active', now()
FROM new_user;

-- 3. Cleanup
DROP TABLE new_user;

-- 4. Verify
SELECT u.id, u.email, p.full_name, p.role, p.status
FROM auth.users u
JOIN profiles p ON p.id = u.id
WHERE u.email = 'personnel@pgso.com';