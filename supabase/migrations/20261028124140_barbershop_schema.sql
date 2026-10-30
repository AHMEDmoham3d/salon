/*
# Barbershop Management System Schema (محل الحلاقة)

Creates the full data model for a barbershop that manages customers,
subscription plans, monthly subscriptions, individual haircut visits,
and a loyalty system (visit count per customer).

## 1. New Tables

### plans (باقات الاشتراك)
- Subscription packages. Each plan bundles a fixed number of haircuts
  for a set price over a fixed duration (e.g. monthly).
- `id` (uuid, pk)
- `name` (text, not null) — Arabic name of the plan
- `description` (text) — what the plan includes
- `haircut_count` (int, not null) — number of haircuts included
- `price` (numeric, not null) — price of the plan
- `duration_days` (int, default 30) — subscription length in days
- `is_active` (bool, default true) — can still be sold
- `created_at` (timestamptz)

### customers (العملاء)
- The shop's customers.
- `id` (uuid, pk)
- `name` (text, not null) — customer name
- `phone` (text) — optional phone for lookup
- `notes` (text) — admin notes
- `created_at` (timestamptz)

### subscriptions (الاشتراكات)
- A customer's active subscription to a plan.
- `id` (uuid, pk)
- `customer_id` (uuid, fk -> customers)
- `plan_id` (uuid, fk -> plans)
- `start_date` (date, not null) — subscription start
- `end_date` (date, not null) — subscription end (start + duration)
- `haircuts_used` (int, default 0) — haircuts consumed within this subscription
- `status` (text, default 'active') — active | expired | cancelled
- `created_at` (timestamptz)

### visits (زيارات الحلاقة)
- Every haircut visit, whether covered by subscription or paid individually.
- `id` (uuid, pk)
- `customer_id` (uuid, fk -> customers)
- `subscription_id` (uuid, nullable, fk -> subscriptions) — set when the visit was covered by a subscription
- `payment_type` (text, not null) — 'subscription' (covered by plan) | 'paid' (regular charge)
- `haircut_type` (text) — type of haircut/service performed
- `charge_amount` (numeric, default 0) — amount paid (0 when covered by subscription)
- `visit_date` (timestamptz, default now)
- `notes` (text)
- `created_at` (timestamptz)

## 2. Security
- This is a single-shop tool with no sign-in: the admin uses the app directly
  and customers look themselves up publicly. All tables are intentionally
  shared, so RLS allows anon + authenticated full CRUD on every table.
- Grants + policies follow the single-tenant no-auth pattern (USING (true)).

## 3. Important Notes
- Loyalty (visit count) is computed by counting rows in `visits` per customer.
- A visit is "within subscription" when the customer has an active subscription
  with remaining haircuts; the admin records it as payment_type='subscription'
  with charge_amount=0 and increments the subscription's haircuts_used.
- A visit "outside subscription" is recorded as payment_type='paid' with the
  regular haircut price as charge_amount.
- Subscription status is derived: a subscription is expired when end_date has
  passed; the app checks this on lookup and can refresh it.
*/

-- plans
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  haircut_count integer NOT NULL DEFAULT 1,
  price numeric(10,2) NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON plans TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_plans" ON plans;
CREATE POLICY "anon_select_plans" ON plans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_plans" ON plans;
CREATE POLICY "anon_insert_plans" ON plans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_plans" ON plans;
CREATE POLICY "anon_update_plans" ON plans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_plans" ON plans;
CREATE POLICY "anon_delete_plans" ON plans FOR DELETE TO anon, authenticated USING (true);

-- customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE TO anon, authenticated USING (true);

-- subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL,
  haircuts_used integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_subscriptions" ON subscriptions;
CREATE POLICY "anon_select_subscriptions" ON subscriptions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_subscriptions" ON subscriptions;
CREATE POLICY "anon_insert_subscriptions" ON subscriptions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_subscriptions" ON subscriptions;
CREATE POLICY "anon_update_subscriptions" ON subscriptions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_subscriptions" ON subscriptions;
CREATE POLICY "anon_delete_subscriptions" ON subscriptions FOR DELETE TO anon, authenticated USING (true);

-- visits
CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  payment_type text NOT NULL DEFAULT 'paid',
  haircut_type text,
  charge_amount numeric(10,2) NOT NULL DEFAULT 0,
  visit_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON visits TO anon, authenticated;
DROP POLICY IF EXISTS "anon_select_visits" ON visits;
CREATE POLICY "anon_select_visits" ON visits FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_visits" ON visits;
CREATE POLICY "anon_insert_visits" ON visits FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_visits" ON visits;
CREATE POLICY "anon_update_visits" ON visits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_visits" ON visits;
CREATE POLICY "anon_delete_visits" ON visits FOR DELETE TO anon, authenticated USING (true);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_name_lower ON customers (lower(name));

-- Seed default plans so the app has content immediately
INSERT INTO plans (name, description, haircut_count, price, duration_days, is_active)
VALUES
  ('باقة الزيارة', 'حلاقة واحدة فقط', 1, 50.00, 30, true),
  ('باقة الأسبوع', 'حلاقتين خلال أسبوع', 2, 90.00, 7, true),
  ('الباقة الشهرية', 'أربع حلاقات في الشهر', 4, 160.00, 30, true),
  ('باقة VIP الشهرية', 'ثماني حلاقات + تصفيف شعر', 8, 280.00, 30, true)
ON CONFLICT DO NOTHING;