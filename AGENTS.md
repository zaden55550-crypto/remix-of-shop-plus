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
- Dashboard reads the shared ERP snapshot without mutations; unavailable financial sources stay unset rather than presenting fabricated totals.
- Keep reorder AI helpers server-only and require Cloud identity for paid AI requests; recommendations are advisory and never mutate ERP stock or purchase records.
- Commission is a ledger in the ERP state: returns append negative adjustment rows instead of editing earned rows, so history stays auditable.
- Reports (`src/lib/reports.ts`) are read-only builders over the ERP snapshot; sources that don't exist yet return null and render as a dash.
- Backups are whole-ERP JSON files validated before restore; a failed restore puts the previous records back.
- Purchases, expenses, supplier payments and float moves are signed rows in the shared `payments` ledger (`src/lib/finance.ts`), so Float, POS cash-up and Accounting read one money source.
- Accounting (`src/lib/accounting.ts`) is a read-only double-entry journal derived from ERP records; never store separate ledger rows that could drift.
- Demo seed lives in src/lib/demo.ts and only calls public ERP actions; it loads only into an empty shop and reset works only on demo-flagged devices, so real records are never wiped.
- Support chat lives in Cloud (support_threads/support_messages): owners need Google sign-in, AI replies are written only by the server route, and the support role (user_roles) gates the /support-inbox, so messages can't be forged or read by others.
