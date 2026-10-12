# 35 · Platform › Companies › Business type and features (support console)

## Screen
- `/admin/company/[companyId]/shop` on the admin portal host — file `app/portal/admin/company/[companyId]/shop/page.tsx`
  (the admin portal's routes live under `app/portal/admin/**`). Full-bleed page with its own 52px top bar (the board's layout,
  Corelith theme), not the portal sidebar shell.
- Entry points: companies list row action "Business type and features" (`app/portal/admin/companies/page.tsx` /
  `components/admin-portal/**`), and a link on the company page (`app/portal/admin/company/[companyId]/dashboard`).

## Units
ADM-09 (docs/handover/80-admin.md §W-68 rows 1–4, §4.7 (shop GET/PATCH), §5.12 (main column and "Last changes by support"), §7
ADM-09, seed `seedSupport()`). The aside's "Act as the owner" section is drawn entirely by packet 42 (ADM-10); this unit's aside
holds "Last changes by support" only. "Verbatim §x" = that section of `80-admin.md`.

## Boards
`SupportCompany.png` — top bar (ink): "Corelith" (600), "Platform · Companies" (muted; "Companies" links to `/admin/companies`),
right "Signed in as support: Nyasha, superuser". Main (max 720): "Company" small; h1 "Harare Bottle Store"; mono line
"hurudza-creative · Retail · Grow · 2 sites". Section "Business type": four cards in two columns — General retail "Groceries,
hardware, clothing: anything sold by the unit."; **Liquor store** (selected: 2px ink outline, filled ring) "Beer, wine and spirits.
Age checks, licence hours, empties and cases."; Pharmacy badge "Soon" (dimmed) "Prescriptions, batches and expiry dates.";
Restaurant and bar badge "Soon" "Tables, tabs and the kitchen.". Section "Liquor store features" (only while Liquor store): four
toggle rows Age check at the till · Licence trading hours · Empties and deposits · Cases and singles (green when on). Section
"Plan and modules": Plan seg Start · **Grow** · Scale; toggle rows Fiscal receipts (on), Posting to the books (on), Sales and CRM
(off, hint "Adds the Sales and CRM workspace beside Retail."). Section "Logged": "Why you are changing it" (area) with hint "Shown
to the owner in Activity, with your name.". Button "Save for this company". Aside: "Act as the owner" (packet 42) and "Last
changes by support": "2 Oct · Nyasha · Empties and deposits on", "14 Mar · Tawanda · Fiscal device registered".

## Workflows
W-68 Support a shop (Corelith superuser; Platform › Companies): Set the business type and features · Say why: it is logged for
the owner — verbatim §W-68 rows "Open the company", "Set the business type and features", "Say why", "Save for this company".
(The third step, act as the owner, is packet 42.)

## Roles
Platform superuser only (`isPlatformSuperuser`: SUPERADMIN in the platform company and an email in
`ADMIN_PORTAL_ALLOWED_EMAILS`), on the admin host (`requirePlatformAdminAccess`, `app/api/platform-admin/_auth.ts`). Every tenant
user (owner included) → 403 on `/api/platform-admin/**`. Accounts: Nyasha `nyasha@corelith.test` (seeded by `seedSupport()`, run
with `--support`), or the platform superadmin the seeds already create (C-40); tenant owner `owner@bottlestore.test` for the
refusal and to read the result.

## Data
Existing, no migration: `Company`, `RetailShopProfile` (business type + four switches), `CompanySubscription`,
`SubscriptionPlan` (START/GROW/SCALE), `CompanySubscriptionAddon` (`ADDON_ZIMRA_FISCAL`, `ADDON_ACCOUNTING_CORE`,
`ADDON_CRM_SUITE` in `lib/platform/feature-catalog.ts`), `PlatformAuditEvent` (tenant chain + platform chain), `Notification`
(`RETAIL_SUPPORT` type exists).

## Server
- `lib/platform/support-shop.ts` (+ test):
  - `loadSupportShop(companyId, superuser)` → `{ company: { id, name, slug, productLabel: "Retail", planName, sites }, values: {
    businessType: "General retail"|"Liquor store", ageCheck, licenceHours, emptiesAndDeposits, casesAndSingles, plan:
    "Start"|"Grow"|"Scale", fiscalReceipts, postingToTheBooks, salesAndCrm }, owner: { id, name, firstName, hasPhone } | null,
    lastSupportChanges: [{ at, by, text }] (newest five events on the tenant chain with `payload.support`), signedInAs: {
    firstName } }`. 404 "That company does not exist.".
  - `saveSupportShop(companyId, superuser, { changes, reason })` — reason trimmed 5–500 → 400 `fieldErrors.reason` "Say why. The
    owner reads it in Activity."; a "Soon" type → 400 "Pharmacy is not ready yet."; nothing changed → 400 "Nothing has changed."
    (the page shows it beside the button). In the tenant: shop fields through `saveSettings(companyId, "company", changes, actor)`
    (`lib/retail/settings/index.ts` — the same store the Company page saves through, so categories seed the same way); plan through
    the platform's tier assignment (`assignTier` in `scripts/platform/domain/commercial-service.ts`, or SET-10's
    `lib/platform/plan-change.ts` if it exists — plan and billing stay in Management, decision 8), refusing a plan the usage does not
    fit with that service's own sentence (409); modules by adding/removing `CompanySubscriptionAddon` rows. Audit on the tenant
    chain: `RETAIL_SETTINGS.CHANGED { page: "company", changes }` for shop fields and `RETAIL_SUPPORT.PLAN_CHANGED { changes }` for
    plan and modules, each with `reason` = the why, `payload.support = { name, email }`, `source: "SUPPORT"`, actor = the platform
    user id (packet 32's writer accepts an explicit source/support). Platform chain: `appendAuditEvent` as today. Notification to
    every active owner, type `RETAIL_SUPPORT`, title "Corelith support changed your shop", summary "<Nyasha>: <changes>. Why:
    <reason>", view path `/preferences/organization/activity?kind=support` (packet 32's page).
- Change sentences: toggles "<Label> on"/"<Label> off" ("Cases and singles off"), business type "Business type: Liquor store",
  plan "Plan: Grow → Scale", modules "Sales and CRM on" — one function shared with packet 32's `LIST_WORDS` "Corelith support"
  row.

API (admin host):
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| GET `/api/platform-admin/companies/[companyId]/shop` | platform superuser | — | the load shape above | 403; 404 "That company does not exist." |
| PATCH `/api/platform-admin/companies/[companyId]/shop` | platform superuser | `{ changes: Partial<values>, reason }` | `{ values, lastSupportChanges }` | 400 reason / Soon / nothing changed; 409 plan |
Audit constant `supportPlanChanged` (`RETAIL_SUPPORT.PLAN_CHANGED`) in `RETAIL_AUDIT_EVENTS` + `LIST_WORDS` ("Corelith support"
info, Record "Company", Change = the change sentence).

## UI
- Page (client) on the admin host: Corelith theme, full-bleed grid `minmax(0,1fr) 360px`; top bar 52px `--ink` ground; main
  padding 24 40; sections use the settings field kit (`.cx-seg--field`, `.cx-switch-row`, cards field from
  `components/sheet-form/sheet-field.tsx` or the settings frame's field components); "Save for this company" 38px primary; after a
  save "Saved. The owner sees it in Activity." (`--ok`) beside it until the next edit; errors under the reason field or beside the
  button. Aside: h2 "Last changes by support" + list (12.5, `--ink-2`, gap 8) "<d Mon> · <first name> · <summary>"; none: "None
  yet.".
- Phone width: the aside drops under the main column; no horizontal scroll.

## Reuse
`app/api/platform-admin/_auth.ts`, `lib/admin-portal/manifest.ts`, `scripts/platform/domain/commercial-service.ts`
(`assignTier`), `lib/platform/feature-catalog.ts`, `lib/retail/settings/index.ts` (`saveSettings`, company store),
`lib/retail/shop-profile.ts`, `lib/retail/audit.ts` (packet 32's writer), `emitRetailNotification`.

## Remove
Nothing (the support-access pages change in packet 42).

## Seed
`seedSupport()` (only with `--support`): platform superusers Nyasha `nyasha@corelith.test` and Tawanda `tawanda@corelith.test` in
`ADMIN_PORTAL_COMPANY_ID`'s company, both added to `ADMIN_PORTAL_ALLOWED_EMAILS` in `.env.example`; two support events on the
tenant chain: 14 March 10:20 Tawanda `RETAIL_SETTINGS.CHANGED { page: "fiscal" }` "Fiscal device registered" (reason "Registered the
FDMS device for the owner.") and the latest 2 October 07:55 Nyasha `RETAIL_SETTINGS.CHANGED { page: "company" }` "Empties and
deposits on" (reason "Owner asked on WhatsApp to switch on empties.").

## Tests
- `lib/platform/support-shop.test.ts`: reason required (4 chars refused), Soon type refused, nothing-changed refused; a switch change
  goes through `saveSettings` (so `RETAIL_SHOP.PROFILE_CHANGED` and categories behave as the Company page) and writes one tenant
  event with `payload.support` and `source SUPPORT`; plan change calls the tier service; module toggles add/remove addons; owners
  notified once; `lastSupportChanges` newest five.
- Route test: a tenant owner session → 403 on both routes.

## Acceptance
1. As Nyasha on the admin host, `/admin/company/<Harare Bottle Store>/shop` vs `SupportCompany.png` (main column and "Last changes by
   support"; the "Act as the owner" block comes with packet 42): top bar words, "hurudza-creative · Retail · Grow · 2 sites", cards
   with Liquor store chosen and two "Soon", four switches on, Plan Grow, Fiscal receipts and Posting on, Sales and CRM off with its
   hint, the reason field and its hint, the button, the two seeded lines.
2. Turn "Cases and singles" off with "Owner asked on WhatsApp to switch off cases." → "Saved. The owner sees it in Activity."; in the
   tenant: `/retail/manage/company` shows it off; the owner's notification "Corelith support changed your shop"; Activity (Kind
   Support) row "Nyasha, Corelith support · Corelith support · Company · Cases and singles: off · Corelith support"; the aside gains
   "<today> · Nyasha · Cases and singles off". DB: one `RETAIL_SETTINGS.CHANGED` with `payload.support`.
3. Empty reason → "Say why. The owner reads it in Activity." under the field; nothing saved.
4. Plan Scale → the tenant's subscription tier changes (or 409 with the tier service's sentence when usage does not fit).
5. As `owner@bottlestore.test` (tenant), `GET /api/platform-admin/companies/<id>/shop` → 403.
6. `npx eslint <changed>`; `npx vitest run lib/platform/support-shop.test.ts lib/retail/activity-words.test.ts`; `pnpm typecheck` alone.

## Depends on
Packet 32 (ADM-06: explicit `source`/`support` in `writeRetailAuditEvent`, Activity page and `?kind=support`), ADM-01 (landed),
SET-01/FND-08 company store (landed). SET-10 is not built (decision 8): the plan goes through the platform tier service.

## Risk
standard. Pitfall: the save must run in the tenant's company context (actor = platform user id, never a tenant user); never write
plan changes on the tenant chain without `payload.support`.

## Open questions
- Spec open question 12 (chrome/theme): the board's full-bleed layout with its own top bar, Corelith theme.
- Plan change without SET-10: through the platform's existing tier assignment; its own usage refusal sentence is shown.
- Notification link points at Management's Activity (packet 32), not `/retail/manage/activity`.
