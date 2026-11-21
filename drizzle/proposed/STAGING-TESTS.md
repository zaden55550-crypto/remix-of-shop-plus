# Staging tests for the proposed migrations

Run these only on a separate staging project. A Lovable project's preview and published app share one database, so the current project can't be used. Never point any step at the live backend.

**Before starting, confirm**
- The staging project's ID differs from the live one in `.env` (`meictxsatogyncyeqvsi`).
- Staging has the live schema, from the read-only schema queries, and no real customer data unless the owner has approved a copy.
- Test accounts use made-up details.

**Apply in this order.** Stop at the first error.

1. Whichever of journal `0000` to `0010` staging is missing
2. `drizzle/proposed/0010_fix_sync_validation.sql` (becomes `0011_fix_sync_validation`)
3. `drizzle/proposed/0011_dynamic_user_allowance.sql` (becomes `0012_dynamic_user_allowance`)
4. `drizzle/proposed/0012_enforce_synced_location_limit.sql` (becomes `0013_enforce_synced_location_limit`)
5. `drizzle/proposed/0013_staff_recording.sql` (becomes `0014_staff_recording`)
6. `drizzle/proposed/0014_trial_read_only.sql` (becomes `0015_trial_read_only`). Apply it only together with server-side payment verification: until then a plan bought in `PAYMENT_TEST_MODE` changes only the device, and this would still refuse that owner's uploads once the server's trial has ended. Section J tests it.
- `drizzle/proposed/0015_money_accounts.sql` (becomes `0016_money_accounts`) runs after `0013_staff_recording` and after `0014_trial_read_only`; section I tests it.
- `drizzle/proposed/0016_flat_login_allowance.sql` (becomes `0017_flat_login_allowance`) runs after `0011_dynamic_user_allowance` and last in the chain. It replaces the location-based login sum with one total per plan (Basic 2, Growth 12, Business 24, the owner included). Section K tests it; rollback is `rollback/0017_flat_login_allowance.down.sql`. Until it is applied, the server still enforces the older per-location sums, which are lower than what /setup and /plans now show.

Local rehearsal of all of the below: `npx vitest run src/test/migration-rehearsal.test.ts src/test/sync-operations.test.ts src/test/entitlements.test.ts src/test/staff-selling.test.ts`. A pass there doesn't replace these steps, because it uses stand-ins for the sign-in system and two tables.

## A. Basic: 1 location, 2 logins

| # | Do | Expect |
|---|---|---|
| A1 | Add a second location | Refused: location limit |
| A2 | Invite a manager or admin | Refused: manager limit |
| A3 | Invite one employee | Accepted, 2 logins in use |
| A4 | Invite a second employee | Refused |
| A5 | Add an employee record with no login | Accepted, logins still 2 |

## B. Growth: 5 locations, 1 owner, 1 manager

| # | Do | Expect |
|---|---|---|
| B1 | Create 3 shops, 1 store, 1 warehouse | Employee allowance 8; total 1 + 1 + 8 = 10 |
| B2 | Add a sixth location | Refused |
| B3 | Invite a manager across 3 locations | Counts once, uses no employee place |
| B4 | Invite a second manager | Refused |
| B5 | Invite 3 employees to one shop | Third refused |
| B6 | Invite 2 employees to a store, then a warehouse | Second refused at each |
| B7 | Change a shop to a warehouse | Allowance recalculates, nobody is removed, nobody new can join if over |

## C. Business: 10 locations, 1 owner, up to 3 managers

| # | Do | Expect |
|---|---|---|
| C1 | Create 2 shops, 1 store, 1 warehouse | Employee allowance 6; total 1 + 3 + 6 = 10 |
| C2 | Grow to 10 locations, then add an eleventh | Eleventh refused |
| C3 | Invite 3 managers, then a fourth | Fourth refused |
| C4 | Read the plan price | $50 a month, $540 a year |

## D. Existing data migration and reconciliation

Use a device holding older-style records: products with no movements, sales, purchases, customer and supplier balances, and 3 locations. Put the server account on Basic.

| # | Do | Expect |
|---|---|---|
| D1 | Sign in and let the first upload run | Accepted whole |
| D2 | Compare device and server: every collection, record by record | Identical |
| D3 | Compare balance sheet, float balances, stock per product | Identical, and the balance sheet balances |
| D4 | Call `synced_location_status()` | Allowed 1, active 3, over 2, the 2 newest flagged |
| D5 | Open Settings › Organisation › Locations | Those 2 show "Over plan", with the warning |
| D6 | Check `audit_logs` | One `LOCATIONS OVER PLAN` row |
| D7 | Add, reactivate, or swap in a location | Refused while over |
| D8 | Record a sale | Syncs normally |
| D9 | Archive until within the allowance, or upgrade | Flags clear at once, no record changed |

**Modified client:** send a first upload of 100 locations directly to the function.

| # | Do | Expect |
|---|---|---|
| D10 | Call `synced_location_status()` | 100 flagged |
| D11 | Mirror two to the server's location list | First accepted on Basic, second refused |
| D12 | Read `account_usage` | Still 1 location and 2 logins |
| D13 | Delete the shop's synced row | Permission denied |

## E. Offline synchronization and stock movement

| # | Do | Expect |
|---|---|---|
| E1 | Go offline, make sales, stock in and out, and a transfer; reconnect | All sync in order, with stock matching the device |
| E2 | Lose the connection mid-upload, then retry | Same acknowledgement, nothing doubled |
| E3 | Sell the same product on two offline devices | Second gets a conflict, the server is unchanged, its records stay on its device |
| E4 | Edit or remove a recorded movement directly | Refused |
| E5 | Change a product's quantity with no movement | Refused |
| E6 | Reset products and stock from Settings | Accepted, and an old device can't bring them back |

## F. Sales and purchase synchronization

| # | Do | Expect |
|---|---|---|
| F1 | Cash sale, credit sale, part payment | All sync; customer balance matches |
| F2 | Sales return | Stock, refund and commission match |
| F3 | Purchase, supplier payment, purchase return, cancellation | All sync; supplier balance matches |
| F4 | Order, receive in part, invoice | All sync, stock moves only on receipt |
| F5 | Sale with a payment split that doesn't equal the total, sent directly | Refused |
| F6 | Second device signs in | Sees the same records (needs Phase 2's device linking) |

## H. Separate shops and employee selling

Use an owner with two shops, Shop 1 and Shop 2, each with its own products and stock, and a shopkeeper login assigned only to Shop 2, on the shopkeeper's own device.

| # | Do | Expect |
|---|---|---|
| H1 | Sign in as the shopkeeper | Goes straight into Shop 2 with no question asked |
| H2 | Look through Sales, POS and Customers | Only Shop 2's products, stock, prices, sales and customers; nothing from Shop 1 |
| H3 | Sell while online | Receipt shows at once; the owner sees the sale under Shop 2, under the shopkeeper's name, with the real cost |
| H4 | Turn off the connection, sell twice and add a customer, then reconnect | All three reach the server once each; each receipt number matches the record |
| H5 | Sell offline, sign out, sign back in with the same login online | The sale reaches the server, once |
| H6 | Two shopkeepers each sell the last item offline, then reconnect | One is recorded; the other shopkeeper is told it wasn't, and the owner's audit shows STAFF REFUSED |
| H7 | Suspend the shopkeeper, then have their device send a sale | Refused; nothing added to the records |
| H8 | Sell on the owner's device at the same moment as the shopkeeper | Both are recorded; the owner's device doesn't stay stuck on a conflict |
| H9 | Sign in as the owner on a phone with records already on it | Owner's own sync works exactly as before |

## I. Money accounts the owner names

Use an owner on any plan. In Float › Other Accounts › Manage accounts, add "Airtel Money".

| # | Do | Expect |
|---|---|---|
| I1 | Before 0015 is applied: sell 100 paid with Airtel Money, then reconnect | Stays pending with "Invalid payment split"; nothing lost on the device |
| I2 | Apply 0015, then reconnect the same device | The pending sale goes through once; Working Balance shows Airtel Money 100 |
| I3 | Purchase, expense and supplier payment paid from Airtel Money; transfer Airtel Money to Bank | All sync; balances match on a second device |
| I4 | A shopkeeper sells with Airtel Money (employee selling) | Recorded under their shop; the owner sees Airtel Money on the sale |
| I5 | Rename the account, then retire it once its balance is 0 | Both sync; old sales still show the new name; Airtel Money leaves every payment picker |
| I6 | Send a sale whose split names `acct-Bad Key`, directly | Refused with "Invalid payment split" |
| I7 | Run `rollback/0016_money_accounts.down.sql` | Records kept; a new sale paid with Airtel Money is refused again; cash sales still sync |

## J. After the 30-day trial: read-only

Use an owner on the server's trial with one shop and one shopkeeper login. To end the trial, set `owner_subscriptions.trial_ends_at` to yesterday for that account only.

| # | Do | Expect |
|---|---|---|
| J1 | During the trial: sell on the owner's device and as the shopkeeper | Both sync |
| J2 | End the trial. Owner signs in, opens every app, exports spreadsheets, a report PDF and a backup | All work; every record is there |
| J3 | Owner tries a sale, purchase, payment, return, stock adjustment, product edit and backup restore | Each refused on the device with the trial-ended message; nothing changes |
| J4 | Send an upload directly to `apply_shopbook_operation` for that owner | Refused: `SUBSCRIPTION_INACTIVE`; stored records unchanged |
| J5 | Shopkeeper signs in after the trial | Signs in; sees only their shop, as before; cannot sell; `my_access` shows `writable: false` |
| J6 | Before ending the trial, make a sale offline on the owner's device and the shopkeeper's; end the trial; reconnect | Both stay pending on their devices, not sent and not deleted; the owner sees the "kept here" message |
| J7 | Record a verified payment with `apply_verified_subscription` (service role) | Owner and shopkeeper record again; the J6 sales go through once |
| J8 | A second owner's account | Its records and logins are unaffected and still invisible to the first business |
| J9 | Run `rollback/0015_trial_read_only.down.sql` | Records kept; an ended trial blocks the employee's sign-in again, as before 0014 |

## G. Rollback and recovery

| # | Do | Expect |
|---|---|---|
| G1 | Run `rollback/0014`, `0013`, `0012`, `0011` in that order | Records kept, earlier limits back, Business stays at $50, sales still sync |
| G2 | With a store present, run `rollback/0012` | Stops with an error and changes nothing |
| G3 | Re-apply the four migrations | Back to the final rules |
| G4 | Take and restore a backup on staging | Records as of that backup; note how long the app is unavailable |

Record the date, staging project, and pass or fail for every row. Production approval needs all of them passed.

## K. One login total per plan (0016)

| # | Do | Expect |
|---|---|---|
| K1 | Business owner with 1 shop: read `account_usage` | `max_users` 24, `active_users` 1 |
| K2 | Add sites until there are 2, 5, then 10 (mix shops and warehouses) | `max_users` stays 24 every time |
| K3 | Growth owner: create 11 logins of mixed roles (admin, manager, shopkeeper, warehouse staff, staff) at one warehouse | All succeed; a 12th login is refused with USER_LIMIT |
| K4 | Give one person 3 locations | `active_users` rises by 1, not 3 |
| K5 | Basic owner: invite a manager | Refused with MANAGER_LIMIT; one staff login succeeds, a second is refused with USER_LIMIT |
| K6 | Run `rollback/0017_flat_login_allowance.down.sql` | Logins and locations kept; `max_users` again follows the locations |
