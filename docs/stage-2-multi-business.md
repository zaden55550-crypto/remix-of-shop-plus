# Stage 2 — Multi-business management

Date: 2026-11-19. Company-level (Stage 3) work was not started.

## How it works

- **One owner, many businesses, one account.** The first business is the owner's account itself (`biz-main`, usually with no row:
  `mainBusiness` in `erp.ts` reads its name, currency, country and industry from the account). Every other business is a row in the ERP
  `businesses` collection. `listBusinesses` always lists the first business first, so an existing Trade owner can never lose access to it.
- **Records belong to a business.** `commit` stamps every new record with the open business (`stampBusiness`); untagged records are the first
  business's, so nothing older was converted. Screens read `scopeToBusiness` (through `useShopErp` / `useBusinessErp`), and `hereBiz` refuses
  to change another business's record.
- **Switching** (`selectBusiness`, `openBusiness`) clears the chosen shop. `selectedShop` only accepts a shop of the open business, and
  `defaultShop` is the open business's first shop, so a shop of one business is never used in another. Device settings are split:
  business settings are kept per business (`shopbook.settings@<id>`; the first business keeps `shopbook.settings`), display and sync
  preferences stay per device.
- **Identity on screen.** `useAccount` / the Apps page show the open business's name, currency, country and industry (`forOpenBusiness`),
  display only. Settings › Business Profile edits the open business's own record when it isn't the first business, and refuses to write
  identity fields into the account while another business is open.
- **Creating a business** (`createBusiness`, `businesses.ts`) saves the business and its first location in one transaction and one sync
  operation. Its rules (`business-rules.ts`) require a name, one of the 8 industries, a business type of that same industry (one of the 101),
  a phone number, a country and a three-letter currency; email is optional. Only the owner can create or change a business.
- **Locations** are counted across all businesses (the plan's allowance is shared). A location keeps its business when edited, names are unique
  within a business, and a shop can only connect to its own business's stores and warehouses.
- **Employees' copies** (`filterForStaff`, server) hold one business only: the business of the shop they work at. An admin or manager with no
  location works in the first business only.

## Proposed migration: `drizzle/proposed/0019_sync_businesses.sql` (not applied)

**Missing.** `apply_shopbook_operation_for` (latest definition: proposed 0015) has a collection allow-list without `businesses`. Every upload
that holds a business row (creating or editing a business, loading the sample data) is refused with `Invalid record collection` and stays
pending on the device. Records of other collections that carry a `businessId` already sync.

**Why it is needed.** Without it a second business exists on one device only: other devices and the server never learn its name, industry or
type, although its products, sales and locations do sync.

**Exact server changes.**
1. New table `business_type_catalogue (industry_id, business_type)` holding the 101 approved types by industry, generated from
   `src/lib/industry-config.ts`. Row security is on with no policies; `anon` and `authenticated` have no grants.
2. New function `shopbook_business_problem(jsonb)` (security definer, service role only) returning the first problem with a business row.
3. `apply_shopbook_operation_for` repeated exactly from 0015 with three changes: `businesses` added to the allow-list; each business row
   checked with `shopbook_business_problem`; a business row can't be deleted (it is archived with `active: false`).

**Validation.** id `biz-main` or 6-40 lower-case letters/digits; name 1-80 characters; currency `^[A-Z]{3}$`; `active` boolean or absent;
phone 7-15 digits (when given); email up to 120 characters in a valid form (when given); industry one of the 8 when given; business type,
and every entry of `businessTypes`, one of that industry's approved types. A row without an industry (older first-business rows) must still
use an approved type name.

**Authorization.** Unchanged: only the owner's own authenticated call (`apply_shopbook_operation`, `auth.uid()`) reaches the function, and it
writes only that owner's row. Employees cannot send business rows: they record only through `apply_member_operation` (0013).

**Backward compatibility.** Nothing stored changes. Pending uploads refused only for this reason go through once it is live.

**Rollback.** `drizzle/proposed/rollback/0019_sync_businesses.down.sql` restores 0015's function byte for byte and drops the function and the
catalogue table. Business rows already synced stay in the owner's records; new ones are refused again and wait on the device.

**Tests.** `src/test/business-sync.test.ts` (catalogue equals the app's 101 types; all 101 accepted for their own industry and refused for
another; invented type, unknown industry, bad fields and deletion refused; legacy row accepted; rollback and re-apply),
`src/test/sync-operations.test.ts` (a business, its location, a change and its sale go through the real sync function), and the migration
rehearsal (the whole chain forward, back and forward again).

**Numbering.** It keeps the working number 0019 because 0018 is already used by the separate unified-identity proposal; the owner decides the
final order. It must run after 0015.

## Limitations (documented, not solved in Stage 2)

- Cross-device persistence of business rows is **not** complete until 0019 is approved and applied. Until then they are device-local.
- The server's own `businesses` table (owner accounts, 0008) is not linked to the ERP businesses; employee logins still belong to the owner's
  first server business, so employees can't yet be assigned to a second business's locations through People & Access.
- Built-in payment methods (Cash, M-Pesa, Bank) have fixed ids, so their saved names and order are shared by all businesses.
- Payroll drafts carry no business, so `scopeToBusiness` can't separate them. Reference counters (`seq`) are shared, so receipt numbers
  continue across businesses.
- Backups include `shopbook.settings` only; a second business's settings key is not in the backup allow-list yet.
- The app's plan data (`PLANS`) still differs from the approved subscription rules (see Stage 1); the shared location allowance is enforced
  with the app's current numbers, which Stage 2 did not change. On Basic (1 location in the app) the first business fills the allowance, so a
  second business can't be created.
- Industry-specific app availability is unchanged: every industry still opens the Trade apps allowed by its plan, and the launcher shows the
  open business's planned industry modules. Hiding Trade apps for other industries needs an approved rule (`appsForIndustry`'s comment and
  code disagree about the shared core).
- Settings › Export Data, imports and backups work on all businesses together (by design for backups).
