# Runtime verification of the audit findings

The first pass of this audit was a static read of the code. This second pass ran the product against a seeded local database and checked the main findings by driving it as each persona. Where the two passes disagree, the runtime result wins and the persona documents have been corrected.

## Environment

| Item | Value |
|---|---|
| Commit | `main` at `01de8a3`, audit branch `claude/school-system-audit-4u9gdn` |
| Database | PostgreSQL 16, local, built from the migration history with `pnpm e2e:bootstrap` (all 65 migrations applied cleanly, feature catalogue synced: 122 features, 21 bundles, 6 tiers) |
| Tenant | St Marys High School (`stmarys`), created with `scripts/seed-staging-tenant.ts` and populated with `scripts/seed-school-demo.ts --reset` |
| Seeded data | 2026 year with 3 terms (Term 3 current), 6 classes, 13 subjects, 8 teachers, 78 class-subject assignments, 120 pupils (one suspended, 40 boarders), 119 guardians (one pupil with none), 90 attendance sessions with 1,800 marks, 156 assessments with 3,100 scores (one unmarked), 6 fee structures, 120 invoices (45 paid, 20 part-paid, 55 issued, 8 overdue), document templates seeded |
| Accounts | head (SUPERADMIN), three HODs and five TEACHER users linked to teacher profiles, `student@` and `parent@` portal users from the seed; `bursar@`, `registrar@` and `warden@` added for this pass with the seed password |
| Server | `pnpm dev:e2e` on port 300 with `.env.e2e`, hosts `stmarys.apps.pagka.local` and the three portal prefixes resolved locally; portal hosts nominated with the preview-host cookie, as the e2e suite does |
| Driver | Playwright with the pre-installed Chromium, service workers blocked (the repository's own portal specs do the same), viewports 1440×900, 1024×768, 390×844 and 1280×800 |
| Unit and integration tests | `vitest run lib/schools app/api/v2/schools lib/documents/schools-sources.test.ts lib/id-generator-school-numbering.test.ts` against a local `huchu_test` database |

Not exercised: ZIMRA fiscalisation (no device configured), email or SMS delivery (none exists), the Vercel build.

## Automated tests

| Run | Result |
|---|---|
| Schools-only suite: 34 files | 743 passed, 0 failed |
| Whole repository suite: 197 files | 196 passed; 2 tests failed in `lib/inventory/shelf-price-integrity.test.ts` (retail, unrelated to schools) |

The schools domain tests pass in full. That supports the first pass's statement that the money core and the domain rules are well covered, and it does not contradict any finding, because the findings are about routes and screens the suite does not exercise (results transitions, receipt void against fiscal state, draft-invoice allocation, guardian-link PATCH, portal scoping of term marks, and every screen).

## Browser checks

Each row is one check from the verification script. Verdicts: CONFIRMED means the runtime behaved as the static finding said; PARTIAL means part of the finding held; REFUTED means it did not hold and the persona document has been corrected; INCONCLUSIVE means the seeded data could not settle it; INFO is an observation with no pass or fail.

RESULTS_TABLE

## Corrections made to the persona documents after this pass

CORRECTIONS

## Screenshots

The screenshots captured during this pass are kept under `docs/audits/schools/reference/runtime-shots/`. They supersede the older sets under `docs/screenshots/schools/` where the two differ, because they were taken on the audited commit with the seeded tenant.

SHOTS_LIST
