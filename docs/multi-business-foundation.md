# Multi-business foundation hardening

Date: 2026-11-19. Stage 3 (Company ERP) was not started. No migration was applied to any real database and nothing was deployed;
"applied" below always means the PGlite test database built by `src/test/migration-chain.ts`.

Each section separates **Implemented** (code in the repository, tested) from **Proposed** (needs approval before it is built or applied).

---

## 1. Migration 0019 review (`drizzle/proposed/0019_sync_businesses.sql`)

**What it does (checked in the SQL, not the comments).**
- Creates `business_type_catalogue (industry_id, business_type)` with a CHECK on the 8 industry ids and 101 rows generated from
  `src/lib/industry-config.ts`. Row security on, no policies, no grants to `anon`/`authenticated`.
- Creates `shopbook_business_problem(jsonb)` (SECURITY DEFINER, `search_path = public`, service role only).
- Replaces `apply_shopbook_operation_for` with 0015's text plus exactly: a `problem` variable, `'businesses'` in the allow-list, a refusal to
  delete a business row, and the per-row check. The diff against 0015 was verified mechanically (only those lines differ).
- **New in this task:** replaces `apply_member_operation` (0013, the employee path) with 0013's text plus one refusal: an employee operation
  that carries any `businesses` change is refused in SQL. Before, only the app server's code (staff intents are sales and customers) kept
  employees away from business rows; now the database enforces it too.

**Verification.**

| Check | Result | Evidence |
|---|---|---|
| 101 types represented correctly | Yes | `business-sync.test.ts`: the table equals `BUSINESS_TYPES` row for row, industry by industry |
| Industry/type compatibility server-side | Yes | Every one of the 101 types accepted for its own industry and refused for another; invented types, unknown industries and mismatched `businessTypes` entries refused |
| Only authorised owners create/modify | Yes | Owner path is `apply_shopbook_operation` → `auth.uid()`; employee path now refuses business rows (`business-sync.test.ts`) |
| No access to another owner's data | Yes | The function only reads and writes the caller's own `shopbook_shop_sync` row (`WHERE user_id = owner_id`); a business id is just data inside that row. An employee calling the owner wrapper directly writes only their own (empty) row |
| Archiving safe | Yes | `active: false` accepted and reversible; deletion refused |
| Invalid records rejected | Yes | id, name, currency, phone, email, `active`, industry and type each tested |
| Existing Trade sync compatible | Yes | Full `sync-operations.test.ts` passes on the chain including 0019; a legacy first-business row (approved type, no industry) is accepted |
| Doesn't overwrite applied migrations | Yes | It only replaces functions last defined by proposed files (0013, 0015); applied 0001–0010 are untouched |
| Rollback safe | Yes | Rollback restores 0015's `apply_shopbook_operation_for` and 0013's `apply_member_operation` byte for byte, drops only what 0019 created; rehearsal runs forward → back → forward |

**Findings.**
1. *Fixed:* employee-path enforcement was application-only (above).
2. *Note:* 0019 depends on 0013 and 0015 being applied first; it must not be approved alone.
3. *Note:* the working number 0019 skips 0018 (the separate unified-identity proposal). The final number is the owner's choice.
4. *Note:* `businesses` rows may hold `paymentSettings` and `code` (this task); 0019 does not validate those fields. They carry no money and
   no pay keys, so this is safe, but a later migration may add shape checks.

**Approval recommendation:** approve 0019 together with (after) 0013 and 0015. Files: `0019_sync_businesses.sql`,
`rollback/0019_sync_businesses.down.sql`. Tests: `business-sync.test.ts` (9), `sync-operations.test.ts`, `migration-rehearsal.test.ts`.

---

## 2. Subscription correction proposal (nothing changed)

**Approved rules:** Basic $11 · 2 locations · 2 users; Growth $22 · 4 · 6; Business $40 · 8 · 10. Owner counts as a user. Shared across
the owner's businesses.

**Every discrepancy found.**

| Where | Basic | Growth | Business | Status |
|---|---|---|---|---|
| Applied DB `subscription_plans` (0008 prices + 0009 limits) | $11 · 2 · 2 | $22 · 4 · 6 | $40 · 8 · 10 | **Matches** |
| App `PLANS` (`src/lib/shopbook.ts`) | $11 · **1** · 2 | $22 · **5** · **location-derived** | **$50** · **10** · **location-derived** | Wrong |
| App `loginAllowance` | fixed 2 | 1 + managers + 2/shop + 1/store | same | Wrong model |
| App `planAllowanceLines`, `planEmployeeRule` | "1 Owner + 1 Shopkeeper" | "Managers + Staff by location" | same | Wrong wording |
| App `saveLocation` | refuses any store/warehouse on Basic | – | – | Open question |
| Proposed 0011 / 0016 | sets 1 location | sets 5 · NULL users | sets 10 · NULL · **$50** · $540/yr | Would overwrite the approved DB |
| Proposed 0016 functions | location-derived `account_usage`, `check_login_allowance` | | | Wrong model (file name says "flat") |
| Tests | `entitlements.test.ts` (location model), `warehouse-stock.test.ts` (12/24), `owner-schema`, `people-access`, `plan-to-dashboard`, `migration-rehearsal` ($50, 10 locations) | | | Encode old rules |
| AGENTS.md subscription paragraph | 1 site · 2 logins | 5 · 12 | 10 · 24 | Superseded |

Limits that follow from these: **business creation** = the shared location allowance (`createBusiness` → `saveLocation`); **user
invitations** = `check_login_allowance` (server, 0016) and `loginAllowance` (app, `/setup`, People & Access); **location creation** =
`saveLocation` (app) and the 0012 trigger (server, reads `max_locations`, which is already correct in the applied DB).

**Safest correction plan (for approval, in this order).**
1. *Server, before anything is applied:* amend the not-yet-applied proposals rather than add a corrective migration: remove the
   `UPDATE subscription_plans` value changes from 0011 and 0016 (the applied values are already right), and make 0016's `account_usage` /
   `check_login_allowance` count logins against the flat `max_users` (a person counts once). Their rollbacks change accordingly. No live
   row changes, because the live table already holds the approved numbers.
2. *App:* `PLANS` → 2/4/8 locations, 2/6/10 users, $40 and $432/yr for Business; `loginAllowance` → the plan's flat `maxUsers`;
   card wording from those numbers. The trial keeps Business limits (8 · 10).
3. *Tests:* rewrite the six files above to the approved rules (not delete them).
4. *AGENTS.md:* replace the subscription paragraph.
5. *Existing customers:* plans are device-only today. An owner over a new limit (e.g. 5 Growth locations) is shown as over and blocked from
   adding more; nothing is removed (existing behaviour). No payment behaviour or stored subscription changes.

**Open questions for the owner:** May Basic have a warehouse among its 2 locations? Do role limits (no managers on Basic) remain?
Are the yearly prices 118.80 / 237.60 / 432 (as in 0008) still approved?

---

## 3. Employee multi-business architecture

**Existing:** one seat per person per owner (`owner_members`, one role), `member_businesses`, `member_locations` (each location belongs to a
business), one permission set per seat (`member_permissions`), `my_access`, `has_permission`. Server businesses were not linked to ERP
businesses, and `filterForStaff` (Stage 2) chose the business from the employee's shop.

**Implemented (app, works with or without 0020):**
- `staffScope` (`src/lib/staff-access.ts`): one business at a time: the one asked for, else the one holding the requested location, else the
  first. Its own role, permissions and locations only. Without memberships it returns exactly the previous behaviour.
- `filterForStaff` takes the chosen `business`; a login with no business gets an empty copy (`NO_BUSINESS`).
- `staffSnapshot` and `staffRecord` (`people-access.functions.ts`) use `member_business_access()` when it exists, else the seat's access as
  before. The device may ask for a business; it only gets one its login holds. A sale's permission check now uses the business of the sale's
  location.
- `makeCtx` (`erp.ts`): an employee's sale worked out on the server is recorded in the business of their shop (before: always the first).

**Proposed (`drizzle/proposed/0020_member_business_access.sql`, additive only):** `businesses.erp_ref`, `member_businesses.role`,
`member_business_permissions` (cascades with its membership), `has_business_permission`, `member_business_access`, owner-only
`link_erp_business`, `grant_member_business`, `revoke_member_business` (keeps `check_login_allowance`; a person counts once).
Existing seats get exactly `has_permission`'s answer. Rollback drops only what 0020 adds.

**Tests:** `member-business-access.test.ts` (6, real owner and employee identities), `multi-business-foundation.test.ts` (staff scope, server
copy, staff sale business).
**Remaining:** a People & Access screen to grant per-business access and permissions; linking businesses automatically when the owner
creates one; an employee business switcher on the device (the snapshot already accepts `business` and returns the list).
**Risks:** an employee with locations in two businesses but no 0020 still gets the business of their first/active shop (as in Stage 2).

---

## 4. Business-specific payment configuration

**Existing:** `moneyAccounts` rows; Cash, M-Pesa and Bank use fixed ids, and the server (0015) accepts only those ids or `acct-…`, so a
second business could not have its own Cash row. Screens read all rows; a cached name lookup could show the first business's names.

**Implemented:**
- The first business keeps its rows exactly as before. Another business keeps its built-in settings on its own record
  (`Business.paymentSettings`, synced with 0019) and its added methods as `acct-` rows tagged with it. `businessMoneyAccounts` gives each
  business its own list; the business view, the payment checks (`checkPayRecord`, `checkMethod`) and every write in `finance.ts`
  (add, rename, category, enable/disable with that business's balance, order) use it.
- Country defaults: a new business outside Kenya starts with **Mobile Money** (id still `mpesa`); Kenya keeps M-Pesa.
- Payment Methods manager, PayPicker, Expenses and Purchases pay rows read the open business.
- **No pay record, payment or balance changed.** Pay keys stay `cash/mpesa/bank/credit/acct-…`.

**Tests:** 3 in `multi-business-foundation.test.ts`. **Database:** none needed (0019 carries `paymentSettings`).
**Remaining:** more country presets (approved list needed). **Risk:** a second business's built-in settings are device-local until 0019.

---

## 5. Payroll and receipt isolation

**Existing:** payroll drafts carried no business; one reference counter per prefix for all businesses (`SALE-000123`), and refs are used as
join keys, so per-business restarts would have collided.

**Implemented:**
- Payroll drafts are stamped with their employee's business, keep it on edit, can only be made for the open business's employees, and each
  business view shows only its own (older untagged drafts follow their employee). Payroll calculations already read the business view.
- Reference numbers: the first business keeps its counters and format (existing numbers stay valid, sequences continue). Every other
  business counts on its own (`seq["SALE@<id>"]`) and prefixes its code (`B2-SALE-000001`), so numbers are independent per business and
  unique across businesses. Numbers are taken inside the one atomic save, and a save refuses if another window changed the records first,
  so one device can't issue a duplicate.

**Tests:** 2 in `multi-business-foundation.test.ts`.
**Proposed (not implemented):** two devices of the same business working offline can still both issue the next number (true before this
task too). A server rule could refuse a second record with the same `ref` in the same collection and business; the device would then need to
renumber and resend. Needs a migration and a device renumbering flow, so it is left for approval.

---

## 6. Backup and restore

**Existing:** whole-ERP JSON (`data`, all businesses' records), device settings allow-list, the first business's name/currency/logo.

**Implemented (version 3, `src/lib/backup.ts`; local, cloud and snapshots all use it):** each other business's settings, the open
business, the first business's country and industry. Restore validates them, restores them, reopens the saved business only if it is in the
restored records, clears a stale shop choice, and rolls every key back on failure. Version 2 files restore exactly as before.
Businesses, locations, payment settings and all records were already in `data`.

**Tests:** 1 (v3 round trip, v2 compatibility, damaged settings) in `multi-business-foundation.test.ts`; existing backup tests pass.
**Risk:** a version 3 file restored by an older app build ignores the new fields (no error).

---

## 7. Industry application registry

**Existing:** the launcher showed all Trade apps to every industry, plus ghost tiles for planned industry modules.

**Implemented (`src/lib/app-registry.ts`, used by `/apps`):** capability from the business type (when approved and of the same industry),
else the industry, else Trade for unclassified older accounts; implemented apps open, planned modules show and never open; plan locks via
`canOpen`; employee permissions; owner-hidden apps; Settings on its own row; four tiles per row (`APPS_PER_ROW`, grid unchanged).
Trade keeps all 13. Other industries get Dashboard, Contacts, Expenses, Accounting, Reports, Settings and their planned modules.

**Tests:** 3 in `multi-business-foundation.test.ts`.
**Risk (behaviour change):** an existing non-Trade business no longer sees Inventory, Purchases, Sales, POS, Float, Payroll or Summary on the
launcher. Records are untouched and exports still include them; the routes are not blocked yet (a route guard can use the same registry).
**Remaining:** Settings › Manage Apps still lists all 12 apps; the industry modules themselves.

---

## 8. Translation capitalisation

**Existing:** `lookup` fell back to a case-insensitive dictionary row and, in English, returned that row's English text, so "Low Stock"
showed as "Low stock" and "Business name" as "Business Name".

**Implemented (`src/lib/interface-translations.ts`):** English returns the text exactly as the screen wrote it. The other 10 languages still
match any capitalisation; all-caps labels stay all-caps. No translation row changed.
**Tests:** 1 in `multi-business-foundation.test.ts`; this also fixes the Stage 1 failure "Low Stock vs Low stock".
**Risk:** English text shown now equals the source text everywhere, including any screen that relied on the dictionary to fix its casing.

---

## Update (final corrections, same day)

- **Registry per business type.** `src/lib/app-requirements.ts` holds one entry for each of the 101 approved types: the implemented apps it
  reuses and the industry modules it requires (planned, not built). Shared apps (Dashboard, Contacts, Expenses, Float, Accounting, Payroll,
  Reports, Summary, Settings) are reused by all; Inventory and Purchases only where the type holds stock; Sales and POS stay Trade's
  (Distribution Business keeps Sales, not POS). Clinical, patient, student, client and tenant modules are marked as needing restricted access.
  This supersedes §7's industry-wide lists.
- **Route protection.** `AppAccessGate` (mounted in `__root`) applies the same registry to every URL: an app the business type doesn't use,
  a hidden app, an app the login may not view, or a plan-locked app sends the person back to the Apps launcher. It re-checks on business
  switches and settings changes. Pages outside the apps always open; Trade routes are unchanged.
- **Migrations.** See `docs/migration-0019-0020-approval.md`.
- **Cross-device.** `src/test/cross-device-business.test.ts` sends a second business, its location, payment settings, added method and sales
  from one device to another and back through the real sync function on the migrated test database. Device-only settings do not sync.
