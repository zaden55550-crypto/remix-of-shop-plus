<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep SHOPBOOK plan pricing and entitlement data centralized in `src/lib/shopbook.ts` so selection and access stay consistent.

- Use the shared useLanguage hook for interface language across pre-login and account screens; persist choices separately from accounts to keep selectors synchronized.
- Keep additional interface translations in interface-translations.ts and existing keyed app translations in i18n.ts; translate plan presentation without changing centralized entitlement data.
- All business data flows through the transaction engine in `src/lib/erp.ts` (`commit` = validate-then-save atomically); stock only changes via recorded movements, so every app shares one product/stock source of truth with history and audit.
- Use the shared KpiRow and Kpi components for all summary metrics so every app obeys the global non-wrapping strip rule.
- Scope Inventory's approved theme and compact control styles to its screen so other apps retain their shared theme; reuse the shared KPI and transaction components to prevent divergence.
- Dashboard reads the shared ERP snapshot without mutations; unavailable financial sources stay unset rather than presenting fabricated totals.
- Keep reorder AI helpers server-only and require Cloud identity for paid AI requests; recommendations are advisory and never mutate ERP stock or purchase records.
- Commission is a ledger in the ERP state: returns append negative adjustment rows instead of editing earned rows, so history stays auditable.
- Record per-product commission amounts when earning commission and reverse returned items from those recorded amounts; historical rows without allocations retain their legacy fallback.
- Reports (`src/lib/reports.ts`) are read-only builders over the ERP snapshot; sources that don't exist yet return null and render as a dash.
- Backups are whole-ERP JSON files validated before restore; they include allowlisted Settings/import history and roll back on failure.
- Purchases, expenses, supplier payments and float moves are signed rows in the shared `payments` ledger (`src/lib/finance.ts`), so Float, POS cash-up and Accounting read one money source.
- Accounting (`src/lib/accounting.ts`) is a read-only double-entry journal derived from ERP records; never store separate ledger rows that could drift.
- Demo seed lives in src/lib/demo.ts and only calls public ERP actions; it loads only into an empty shop and reset works only on demo-flagged devices, so real records are never wiped.
- Support chat lives in Cloud (support_threads/support_messages): owners need Google sign-in, AI replies are written only by the server route, and the support role (user_roles) gates the /support-inbox, so messages can't be forged or read by others.
- Purchase drafts are device-local unsaved work (not ERP records); only confirmed purchases go through finance.ts so stock, money and supplier balances change once.
- Part payments (P.PAY) after a sale/purchase are tracked in a separate settled amount on the record; the original pay split stays untouched so accounting never counts money twice. Purchases and Sales share the navy shell in erp-shell.tsx.
- All printing goes through PrintPreview (src/components/shopbook/print.tsx): white preview, always-working Exit, timeout to a failure state, and no false 'Printed' claim because browsers can't confirm paper output. Expense paid/balance is derived from EXPENSE ledger rows, never stored.
- Every money screen picks payment with the shared PayPicker (Cash, M-Pesa, Bank, Credit, P.PAY last); unpaid remainder always lands on credit. Device prefs (interface size, VAT) live in src/lib/prefs.ts; sale VAT is stored on the sale and posted to VAT payable.
- Accounting and Float share the ERP shell and money-ui controls; money-activity builds read-only financial documents and actual account movements separately to prevent double-counting.
- Cash-up notes are saved through the shared ERP cashUp action so POS and Float preserve one reconciliation history.
- Global cloud-backup mounts once at the root and snapshots ERP plus allowlisted device preferences/drafts; authenticated user/device isolation and revision checks prevent cross-user reads and stale uploads, and restore is explicit, never a merge.
- Backup snapshots exclude passwords, sessions and subscription entitlements; validate all ERP collections before atomic restore and show cloud success only after acknowledgement.
- Contacts and Payroll use the shared ERP shell and people actions; contact edits preserve audit values, partial settlements are atomic, and employee records remain separate from contacts.
- Shared compact analytics charts use read-only chart-data datasets and accounting-derived financial/book-balance series; overview screens and Reports/Summary reuse these without mutating ERP records.
- Settings keep twelve ordered categories; Import & Data stays in General and uses one atomic ERP commit. Business AI is read-only and session-only, with server-side Gateway calls over validated shop context.
- Live phone sync (src/lib/shop-sync.ts): one shopbook_shop_sync row per owner; phones merge ERP collections by record id with revision-checked writes, so concurrent saves never overwrite each other.
