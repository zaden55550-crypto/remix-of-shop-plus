# Approval report — proposed migrations 0019 and 0020

Date: 2026-11-19. **Neither migration has been applied to any real database.** Everything below was verified against the SQL files
themselves and on the PGlite test database built in deployment order by `src/test/migration-chain.ts`.

## Deployment order

The applied journal ends at `0010_fix_sync_payment_check`. The proposed chain, in the order it must run:

`0010_fix_sync_validation` → `0011_dynamic_user_allowance` → `0012_enforce_synced_location_limit` → `0013_staff_recording` →
`0014_trial_read_only` → `0015_money_accounts` → `0016_flat_login_allowance` → **`0019_sync_businesses`** → **`0020_member_business_access`**

- 0019 needs 0013 (it replaces `apply_member_operation`) and 0015 (it replaces `apply_shopbook_operation_for`).
- 0020 needs 0009 (people tables) and the allowance function `check_login_allowance` (0011/0016). It does not depend on 0019.
- Rollback runs in reverse: 0020, 0019, then the earlier rollbacks. Rehearsed forward → back → forward (`migration-rehearsal.test.ts`).
- 0018 (unified identity) is a separate proposal, not in this chain. 0019/0020 keep working numbers until an order is approved.
- **Subscription plans:** 0011 and 0016 are listed only because 0019/0020 run after them. They were not changed in this task, and the plan
  discrepancies documented in `docs/multi-business-foundation.md` §2 remain open.

## 0019 — `drizzle/proposed/0019_sync_businesses.sql`

**Exact changes.**
1. `CREATE TABLE IF NOT EXISTS business_type_catalogue (industry_id text CHECK (one of the 8 ids), business_type text CHECK (1–80 chars),
   PRIMARY KEY (industry_id, business_type))`; `ENABLE ROW LEVEL SECURITY`; `REVOKE ALL FROM PUBLIC, anon, authenticated`; 111 `INSERT … ON CONFLICT DO NOTHING`.
2. `CREATE OR REPLACE FUNCTION shopbook_business_problem(jsonb) RETURNS text` — STABLE, SECURITY DEFINER, `search_path = public`; execute
   granted to `service_role` only.
3. `CREATE OR REPLACE FUNCTION apply_shopbook_operation_for(…)` — 0015's text plus: `problem text` variable; `'businesses'` appended to the
   allow-list; deletion of an existing business row refused; each new or changed business row checked by `shopbook_business_problem`.
   Mechanically diffed against 0015: no other line differs. Grants unchanged (service role only).
4. `CREATE OR REPLACE FUNCTION apply_member_operation(…)` — 0013's text plus one refusal: an employee operation carrying any `businesses`
   change raises `Not allowed: only the owner can change a business`. Grants unchanged (service role only).

**Expected impact.** Owners' uploads that hold business rows (currently refused with `Invalid record collection` and waiting on the device)
are accepted. Nothing stored changes. No index added (the catalogue's primary key serves the lookups).

**Rollback** (`rollback/0019_sync_businesses.down.sql`): restores 0015's `apply_shopbook_operation_for` and 0013's `apply_member_operation`
byte for byte, drops `shopbook_business_problem` and the catalogue table. Business rows already synced stay in the owner's records; new
ones are refused again and wait on the device. No unrelated object is touched.

## 0020 — `drizzle/proposed/0020_member_business_access.sql`

**Exact changes (all additive; no existing row or function is rewritten).**
1. `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS erp_ref text CHECK (NULL or '^(biz-main|[a-z0-9]{6,40})$')`;
   `CREATE UNIQUE INDEX businesses_owner_erp_ref ON businesses (owner_account_id, erp_ref) WHERE erp_ref IS NOT NULL`.
2. `ALTER TABLE member_businesses ADD COLUMN IF NOT EXISTS role text CHECK (NULL or admin/manager/shopkeeper/warehouse_staff/staff)` — never 'owner'.
3. `CREATE TABLE member_business_permissions (member_id, business_id, permission_key → permissions(key), allowed,
   PRIMARY KEY (member_id, business_id, permission_key), FOREIGN KEY (member_id, business_id) → member_businesses ON DELETE CASCADE)`;
   row security on; no grants to API roles.
4. Functions (SECURITY DEFINER, `search_path = public`; execute granted to `authenticated` and `service_role`; each checks the caller):
   - `business_erp_ref(uuid)` — the ERP business a server business stands for; an account's oldest business is `biz-main` when unlinked.
   - `has_business_permission(account, business, key)` — business override → seat override (`member_permissions`) → business role's account
     template → role default. Requires the business to be the account's, not archived, and the caller to hold a membership in it.
   - `member_business_access(account)` — the caller's memberships **in that one account** (role, permissions, locations of that business only),
     with my_access's subscription gate.
   - `link_erp_business(account, erp_ref, name, currency)` — owner only; idempotent; refuses a duplicate name.
   - `grant_member_business(member, business, role, locations, permissions)` / `revoke_member_business(member, business)` — owner only;
     business and locations must belong to the member's account; owner seats can't be granted; `check_login_allowance` is kept.

**Expected impact.** Existing employees keep exactly their current access: with no new rows, `member_business_access` returns their first
business with `has_permission`'s permissions and `my_access`'s locations (tested). The app uses it when present and falls back to the seat's
one access set when absent.

**Rollback** (`rollback/0020_member_business_access.down.sql`): first removes memberships and locations in businesses linked through 0020
(so a rollback can only narrow access, never widen it), then drops the functions, the table, the `role` column, the index and `erp_ref`.
Server businesses, the first business's memberships, `my_access` and `has_permission` are untouched.

## Verification against the requirements

| Requirement | Result | Test |
|---|---|---|
| Existing data compatible | Yes — nothing stored is rewritten; legacy first-business rows accepted | business-sync, member-business-access |
| Owner only reaches their own businesses | Yes — all writes scoped to the caller's sync row / `is_account_owner` | business-sync, member-business-access |
| Employees only their assigned businesses | Yes — memberships only; another owner's business can't be granted | member-business-access |
| A person with seats at two owners | Each owner's businesses only from that owner's seat | member-business-access (**fixed in this review**) |
| Business-specific roles and locations | Yes — per membership; locations must belong to that business | member-business-access |
| Existing employees keep permissions | Yes — identical to `my_access` | member-business-access |
| Employees can't create/modify businesses | Yes — SQL refusal on the employee path; management functions owner-only | business-sync, member-business-access |
| Rollback doesn't destroy unrelated data | Yes; 0020 rollback narrows access only | business-sync, member-business-access, rehearsal |
| Trade sync compatible | Yes | sync-operations, cross-device-business |

**Corrected during this review:** (1) `member_business_access` took the caller's first active seat in any account; it now takes the account
explicitly (the one `my_access` chose), so records and permissions always come from the same seat. (2) `link_erp_business` now refuses a
duplicate name with a clear message. (3) 0020's rollback could have widened access in a second business; it now removes that access first.

## Remaining risks

1. `my_access` (0014) and `member_business_access` both let an account **with no subscription row** through (their `ok` is NULL). This is
   existing 0009/0014 behaviour, not introduced here; every account created by `connect_owner` has a subscription row.
2. 0019's business-row check does not validate `paymentSettings` or `code` (they carry no money and no pay keys).
3. Two offline devices of the same business can still issue the same reference number (existing behaviour; a server rule is proposed in
   `docs/multi-business-foundation.md` §5).
4. Device settings (`shopbook.settings@<id>`) are not synced; they move with backups only.
5. The People & Access screen does not yet call `grant_member_business`; until it does, business access is managed only through SQL.
