/*
# Multi-shop system: shops, shop_admins, and shop-scoping

1. New Tables
- `shops` — each barbershop registered on the platform.
  - id, shop_name, owner_name, owner_phone, owner_email,
    national_id, shop_type (owner/renter), has_branches, branch_count,
    shop_address, personal_address, year_started, approved_at,
    status (pending/approved/rejected/blocked), created_at, updated_at
- `shop_admins` — admin login credential tied to a shop.
  - id, shop_id (fk->shops), full_name, phone, email, national_id,
    created_at

2. Modified Tables
- `customers` — add `shop_id` (nullable, fk->shops) to scope customers per shop.
- `visits` — add `shop_id` (nullable, fk->shops) so company can see visits per shop.
- `subscriptions` — add `shop_id` (nullable, fk->shops) for scoping.

3. Security
- RLS enabled on shops + shop_admins, with anon/authenticated CRUD
  (single-tenant no-auth model — the app uses the anon key).
- New columns inherit existing policies (USING true pattern).

4. Important Notes
- Existing rows get NULL shop_id. The app will treat NULL shop_id rows
  as belonging to the "default"/first-approved shop for backward compat.
- The company dashboard reads ALL shops. The admin page filters by its shop_id.
- shop status 'blocked' prevents admin login AND customer login for that shop.
*/

-- shops
CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name text NOT NULL,
  owner_name text NOT NULL,
  owner_phone text NOT NULL,
  owner_email text NOT NULL,
  national_id text NOT NULL,
  shop_type text NOT NULL DEFAULT 'owner',
  has_branches boolean NOT NULL DEFAULT false,
  branch_count integer NOT NULL DEFAULT 0,
  shop_address text,
  personal_address text,
  year_started integer,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON shops TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_shops" ON shops;
CREATE POLICY "anon_select_shops" ON shops FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_shops" ON shops;
CREATE POLICY "anon_insert_shops" ON shops FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_shops" ON shops;
CREATE POLICY "anon_update_shops" ON shops FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_shops" ON shops;
CREATE POLICY "anon_delete_shops" ON shops FOR DELETE TO anon, authenticated USING (true);

-- shop_admins
CREATE TABLE IF NOT EXISTS shop_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  national_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shop_admins ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_admins TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_shop_admins" ON shop_admins;
CREATE POLICY "anon_select_shop_admins" ON shop_admins FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_shop_admins" ON shop_admins;
CREATE POLICY "anon_insert_shop_admins" ON shop_admins FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_shop_admins" ON shop_admins;
CREATE POLICY "anon_update_shop_admins" ON shop_admins FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_shop_admins" ON shop_admins;
CREATE POLICY "anon_delete_shop_admins" ON shop_admins FOR DELETE TO anon, authenticated USING (true);

-- Add shop_id to existing tables (nullable for backward compat)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES shops(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES shops(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES shops(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_visits_shop ON visits(shop_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_shop ON subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status);
