/*
# Add is_blocked column to customers

1. Modified Tables
- `customers` — add `is_blocked` boolean column, default false.
  When true, the customer is blocked and cannot log in on the customer page
  and their visits are flagged in the admin panel.

2. Security
- No new tables. Existing RLS policies already cover the new column
  since they use USING (true) for anon/authenticated.
- Update the existing UPDATE grant to remain on all columns (default behavior).

3. Important Notes
- The column is nullable-safe with a default of false so existing rows
  are treated as unblocked.
- The customer login function (`loginCustomer` in the app) should reject
  blocked customers.
*/

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
