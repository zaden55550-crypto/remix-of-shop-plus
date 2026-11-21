# Master plan progress

Kept up to date as work lands. "Tested" says how. Nothing here has been run against the live database: migrations 0005 to 0010 are written and tested locally, and are applied through Lovable.

## Stack note
The specification mentions Express. The project is TanStack Start with Supabase, and it stays that way: nothing needed replacing.

## Phases

| Phase | Status | What exists |
|---|---|---|
| 1. Audit | Done | Findings below |
| 2. Ownership & subscription | Server done, partly connected | Owner accounts, shared allowances, one subscription per owner. No real payment connection yet |
| 3. Auth & permissions | People & Access done | Individual logins, role templates, per-person and per-role permissions, audit log |
| 4. Inventory distribution | Not started | Stock is still one pool per business, not split by location |
| 5. Financial foundation | Not started | No per-location financial accounts or owner money transfers yet |
| 6. App integration | Started | Employee devices are view-only: they can't record sales yet |
| 7. Security & audit | Started | Enforced for logins and access. Business records still live on the owner's device and sync as one document |
| 8. UI | Settings done | Other multi-location screens wait on phases 4 to 6 |
| 9. Testing | Ongoing | See below |

## Audit findings still open
1. **Owner sign-in is device-only.** The owner's password is kept in the browser's storage in plain text, and only that browser knows it. Employees use the real sign-in system; owners connect to it with Google. Moving owners onto it needs a migration of existing accounts.
2. **Payments are simulated.** The Plans page says payment succeeded without charging anything, and sets the plan on the device only. The server therefore treats every owner as being on the 30-day trial. When that ends, employee logins stop until a real payment provider confirms a plan.
3. **Sync bug in migrations 0001 to 0007.** Any upload holding a sale or purchase failed on PostgreSQL with `column reference "key" is ambiguous`. Fixed in 0010. Check the live project: if it has been failing, those records are waiting on owners' devices and will upload once 0010 is applied.
4. **Failing test unrelated to this work:** `inventory.test.ts` "stock leaves once on send". `receiveTransfer` moves stock back into the single pool, and two tests disagree about whether it should. Needs a decision when phase 4 splits stock by location.

## People & Access

Employee record: the existing ERP `employees` collection, so payroll works without a login. Login account: `owner_members` on the server, linked by `employee_ref`.

Requested entity, and where it lives:

| Requested | Where |
|---|---|
| employee_profiles | ERP `employees` record |
| user_accounts | Supabase Auth users plus `owner_members` |
| employee_invitations | `employee_invitations` (hash only, never the token) |
| business_memberships | `member_businesses` |
| employee_location_assignments | `member_locations` |
| roles, role_permissions | `role_permissions` (template), `account_role_permissions` (owner's version) |
| permissions, user_permissions | `permissions`, `member_permissions` |
| access_scopes | Worked out by `my_access`, `can_see_business`, `can_see_location` |
| user_sessions | Supabase Auth sessions plus `sessions_revoked_at` |
| audit_logs | `audit_logs` (append only), `login_events` |

### Test results (7 Nov 2026)
- `npx tsc --noEmit`: no errors. `pnpm build`: succeeds, and no admin client or provider code in the browser bundle.
- `pnpm vitest run`: 307 of 308 pass. The failure is finding 4 above.
- Two-browser run of the 18 workflows on the real screens: 109 of 109 checks. It used a local stand-in for Supabase Auth and its API, on a real PostgreSQL engine with the real migrations. It has not been run against the real Supabase project.
- Real email and SMS delivery has not been tested: no provider is configured.

### Not done yet
- Employees can't record anything. Their device holds a filtered, read-only copy and `commit` refuses.
- Records have no location on them, so an employee assigned to one shop sees that shop's location record and all of the business's sales and stock their permissions allow.
- Screens for a shopkeeper show a buying price of 0 rather than hiding the column.
- Only the owner can use People & Access. Giving it to admins and managers needs server checks on each ERP record change.
- More businesses can be held on the server, and allowances count across them, but there is no screen to add one, and ERP records still belong to one business.
- Email and SMS adapters are written and tested with a stand-in, not against the real services.
