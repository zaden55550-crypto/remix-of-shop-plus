# Stage 0 — Audit and blueprint

Date: 2026-11-18. No product code was changed to produce this document. It records what exists, what is
missing, the conflicts between the brief and the current architecture, and a proposed stage order.

## 1. Verified baseline

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | Clean. 0 errors. |
| Full suite | `npx vitest run` | **Did not complete.** Ran 20+ minutes with no output and zero CPU movement on the test process. Unreliable on this machine. |
| Engine subset | 8 files: inventory, sales-rules, finance, entitlements, shop-scope, warehouse-stock, trial-read-only, shop-sync | **111 / 113 pass.** |
| The 2 failures | `warehouse-stock.test.ts` | Pre-existing, not caused by this audit. See below. |

### The two baseline failures are stale tests, not product defects

Both assert the **superseded** location-derived login allowance:

- `a change of type is recorded and leaves the plan's login total as it is` expects
  `{ total: 12, staff: 11, managers: 11 }`; `loginAllowance` now returns `{ total: 5, staff: 3, … }`.
- `no plan gets the smallest allowance; the trial the largest` expects `loginAllowance({ plan: "trial" }).total === 24`;
  it now returns `1`.

`AGENTS.md` records the change of 2026-11-08: *"every plan has one fixed login total… Basic 1 site / 2 logins,
Growth 5 / 12, Business 10 / 24."* The tests were not updated with it. They should be rewritten to the fixed
model as part of the first stage that touches entitlements — not deleted to make the suite pass.

> Full-suite verification is a Stage 0 gap. Every stage below must state which files it actually ran, because
> `vitest run` cannot be relied on here until the hang is diagnosed.

## 2. What the project is

- **Stack (verified in `package.json`):** React 19.2, TypeScript 5.8, TanStack Start 1.168 + TanStack Router,
  Vite 8, Vitest 4, Drizzle ORM, Supabase Postgres/Auth. Matches the "inspect before deciding" requirement; no
  framework change is needed or proposed.
- **Size:** 24 routes, 96 test files, ~11.6k lines in `src/lib`, a 15,103-line `src/styles.css`.
- **Source of truth:** the ERP state lives on the device (`localStorage["shopbook.erp"]`) and syncs as
  operations through the outbox to `apply_shopbook_operation`. Records are *not* server-first.
- **One write path:** `commit()` in `src/lib/erp.ts` — validate a copy, then save atomically or not at all.
  Every module, importer and restore goes through it.
- **Accounting:** `src/lib/accounting.ts` derives a double-entry journal *read-only* from ERP records. No separate
  ledger rows are stored, so nothing can drift.
- **Single money ledger:** all money movements are signed rows in `payments` (`src/lib/finance.ts`), read by
  Float, POS cash-up, Accounting and Dashboard.
- **Multi-location is real:** shops / stores / warehouses, per-location stock via movements, dispatch-then-receive
  transfers, per-shop prices, shop-scoped records and an employee copy cut on the server.

This is a working single-business-per-device Trade ERP with strong invariants. The brief's job is to extend it,
and the engine is a sound base for that.

## 3. Gap analysis against the brief

### 3.1 Already satisfied

| Requirement | Evidence |
|---|---|
| Exactly 8 industries, 101 types | `src/lib/industry-config.ts`; counts `15/12/13/12/22/9/9/9 = 101`; `validateIndustryCatalogue()` is called by tests. |
| Preserve all 13 Trade apps | `EXISTING_TRADE_APP_IDS`; `APPS` in `shopbook.ts`. |
| Double-entry that balances | `accounting.ts` posts balanced entries per event; `balanceSheet().balanced` is asserted in tests. |
| Reports traceable to transactions | Reports and the journal are pure functions of ERP records. |
| Four apps per row at every width | `grep` of `styles.css` shows one grid rule, `repeat(4, minmax(0, 1fr))`, with no breakpoint override. |
| Offline recording, atomic local write | `outbox.ts` shares one storage write for records + queue. |
| Server-side authorization for staff | `filterForStaff`, `runIntent`, proposed 0013/0014. |
| Audit trail | Append-only `s.audit` plus server `audit_logs`. |

### 3.2 Partial

| Requirement | What exists | What is missing |
|---|---|---|
| Multi-business (§3) | `Business` record, `businessId` stamping (`stampBusiness`), `atBusiness` scoping, `activeBusiness`/`selectBusiness`, and a business switcher in `global-application-header.tsx`. | `addBusiness()` exists in the engine but **has no caller** — no screen creates a business. `businesses` is also absent from every `apply_shopbook_operation` allow-list, so a second business would be refused by the server on sync. |
| Financial architecture (§5) | Chart of accounts (fixed), general ledger, P&L, balance sheet, trial balance, AR/AP, invoices, bills, payments, expenses, payroll, journal. | **No financial periods / close, no budgeting, no forecasting, no inter-business transfers.** Chart is fixed, not user-defined. Reconcile (`/reconciliation`) matches imported historical rows to records; it is *not* bank/account reconciliation. |
| Complete operations (§4) | Trade workflows are end-to-end. | 7 of 8 industries are `configuration-only`. Their launcher tiles are labelled "coming soon" and never open. No documented per-type operational requirements profile exists for any of the 101. |
| UX (§9) | Liquid Glass, responsive scaling, 4-per-row launcher. | **Simple Mode / Advanced Mode do not exist** (`grep` finds no implementation). |
| Security (§8) | Owner/business isolation, per-shop scope, RBAC, staff filtering, audit. | Healthcare privacy controls and protected documents do not exist yet. Location-level permissions exist for stock, not for every financial record. |

### 3.3 Missing entirely

- **Companies (§3).** `grep` for `company|consolidat` across `src/` and `drizzle/` finds only copy text
  ("company name", "Established business") and signup labels. There is **no** company table, no `company_id`,
  no company-level consolidation, and no company switcher. This is the largest structural gap.
- **Departments / Operations (§3, §4).** `DepartmentDef` is declared in `industry-config.ts` and never stored or
  shown.
- **Operational requirement profiles (§4)** for the 101 types.
- **Automation and intelligence** beyond advisory Reorder AI and ShopBot.

## 4. Conflicts between the brief and the current architecture

These need a decision before any destructive change; none is implemented yet.

1. **Companies above businesses.** The brief wants Owner → Companies → Businesses → Departments → Locations.
   The engine already scopes every record by `businessId` and the server by `business_id uuid`. The safe design is
   to add a **company record that groups existing businesses** (`company_id` on the company record; businesses
   point up to it), leaving `business_id` untouched so no record is migrated and no sync payload changes shape.
   Anything that instead re-parents records under companies is a data migration and should be avoided.
2. **"Posted financial entries must not be silently overwritten."** The journal is recomputed from source records
   on every read. That guarantees it can never drift, but there is no *posted* artifact that could be altered.
   Adding periods/close means introducing a posting boundary — the recommended path is a **period-close record
   that freezes a snapshot and blocks editing of records inside it**, rather than storing a second ledger.
3. **Multi-business needs server support before it is exposed.** Building a UI to create businesses first would
   let owners create data that the server then refuses to accept. The sync allow-list and backup validation must
   land before or with any screen that calls `addBusiness()`.
4. **Plans and payments are device-only and simulated** (`PAYMENT_TEST_MODE`). The brief forbids silently changing
   subscription prices or payment logic. Nothing in the stage plan below touches prices; the real payment provider
   is called out as out of scope until it is separately approved.

## 5. Proposed stage order

Stage 0 is done; each later stage stops for approval. Ordering is chosen so that no stage exposes data the
server cannot yet accept, and so tests can be repaired early rather than accumulating.

| Stage | Scope | Why here |
|---|---|---|
| 0 | This audit and blueprint | — |
| 1 | Baseline repair: rewrite the 2 stale entitlement tests to the fixed model; diagnose the full-suite hang; add a scripted subset runner so every later stage has a real regression gate. | Nothing can be honestly "verified" until the suite runs. |
| 2 | Multi-business made real and safe: add `businesses` + `moneyAccounts` to sync allow-list and backup validation (with rollback SQL), then the create/switch screen. | Unblocks §3 with no data migration and no server refusals. |
| 3 | Companies: company record grouping businesses; company switcher; consolidated read-only reporting that never merges ledgers. | The brief's headline hierarchy gap. |
| 4 | Departments / Operations as ERP records, seeded from `defaultDepartments`, with location linkage. | Required by §3 and §4. |
| 5 | Universal accounting extensions: user-editable chart of accounts, financial periods + close, inter-business transfers. | Builds on the existing derived journal without a second ledger. |
| 6 | Budgeting and forecasting on top of the closed periods. | Needs period boundaries from stage 5. |
| 7 | Simple Mode / Advanced Mode. | UX requirement; depends on knowing which modules exist. |
| 8 | Operational requirement profiles for the 101 types, documented per type. | §4; large, and needed before any industry module is built. |
| 9–12 | Industry environments, built one family at a time against the profiles from stage 8. | §2, §4. |

### Decision needed

The brief refers to "12 controlled stages" but does not list them. If you already have that list, I will follow
yours instead of the proposal above — send it and I will re-cut the table. Otherwise, confirm this order or tell
me what to move.

## 6. What this stage did not do

No files under `src/` or `drizzle/` were modified. No migrations were added. The only new file is this document.
