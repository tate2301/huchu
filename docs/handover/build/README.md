# Retail handover: finishing the build with an agent team

This folder hands the rest of the retail dashboard build to a Claude Code CLI session running in teammate mode
(agent teams). Everything the team needs is in the repo; nothing refers to the cloud session that built stages 1–6.

## Where it stands

Branch `claude/corelith-design-system-ox0036`, PR #209. Stages 1–5 are built, tested, fixed and pushed. Stage 6
(Buying) was stopped by the owner part-way through the build pass, so it is built but **not yet tested**:

| # | Stage | Packets |
|---|---|---|
| 1 | Date picker, Insights custom dates, Reports grouped by area | 90, 80a, 85a, 86 |
| 2 | The floor: sales, shifts, drawers, end of day, overview | 50, 51, 54, 57, 59, 62 |
| 3 | Products: record, price lists, labels, prices, bundles, promotions, vouchers | 15, 18–23 |
| 4 | Stock: count review, empties | 16, 17 |
| 5 | Floor part 2 + customers: loyalty, refunds/voids, lay-bys, till at the counter, till pricing, customer record, points, merge | 52, 53, 55, 56, 58, 60, 61, 63, 64, 65 |
| 6 | Buying, **built only**: orders (31), follow-up (33), requisitions (34), money out (36), receiving (38) | 31, 33, 34, 36, 38 |

What is left, in sidebar order. Build them in this order; each stage depends on the ones above it.

| # | Stage | Packets (in `packets/`) |
|---|---|---|
| 6 (finish) | Buying: bills and supplier payments, deliveries list, returns, retire the old buying code; then the **test → fix → verify** pass over all nine Buying screens, which has not run | 41, 43, 44, 45 |
| 7 | Customer accounts: accounts, payments on account, the till on account, statements | 66, 67, 68, 69 |
| 8 | Insights | 80, 81, 82, 83, 84 |
| 9 | Reports | 85, 87, 88 |
| 10 | Setup and platform: activity, price approvals, onboarding, finish-setup card, support console, act as owner, liquor | 32, 40, 37, 39, 35, 42, 46 |
| 11 | Retire the old frames (last, after everything else is merged) | 89 |

`packets/index-*.json` list every packet per area with its units and dependencies.

### Half-built Bills (BUY-07), packet 41

The builder for packet 41 was about halfway (migration, schema, `bills.ts`, `payments.ts`, routes; no UI, no seed, no
tests yet) when the owner stopped the run. Its working tree is saved as `wip/buy-07-bills.patch` (made with
`git diff --binary` against the Buying commits). Apply it with `git apply docs/handover/build/wip/buy-07-bills.patch`
before building packet 41, review it against the packet, finish it, and delete the patch in the same commit. It is a
starting point, not reviewed code.

The patch includes the migration folder `prisma/migrations/20261012090000_retail_bills/`. The stage base for the
Buying test pass is `d7fac560` (the last stage 5 commit).

## What is in this folder

- `packets/` — one build spec per screen ("packet"): the boards it matches, data and server rules, routes, UI,
  what it reuses, what it removes, seed rows, tests and acceptance. **The packet is the spec.**
- `boards/` — the canvas boards the remaining packets name, rendered at 1440 wide. Read the PNG to see a board.
- `canvas/` — the "Corelith data tables" canvas sources (v32). `List.dc.html`, `Record.dc.html` and
  `Sheet.dc.html` hold the per-kind configs (`cfg[kind]`, `C`, `K`); `WorkflowMap.dc.html` holds the 76 workflows.
- `smoke-lib.js` — Playwright screenshot helper: `session(email, password?, w?, h?)` → `{browser, ctx, page, shot(name)}`.
- `agents/` — the two teammate definitions, `retail-builder.md` and `retail-tester.md`. `.claude/` is gitignored, so
  copy them in before you start: `mkdir -p .claude/agents && cp docs/handover/build/agents/*.md .claude/agents/`.
- `wip/` — the half-built Bills patch (see below).
- `../98-decisions.md` — owner decisions. **They override the packets** where the two disagree.
- `../00-foundations.md` … `../80-admin.md` — the area specs the packets were cut from.

## First job: merge `main`

`main` moved while stage 6 was building (PRs #206, #208 and #210: the owner's till work, Vane, the core-modules
handover). The branch conflicts with it in nine files: `components/retail/till/{history,lookups,sale-parts,sell,
shift,state,tile}.tsx`, `components/retail/till/till.css` and `prisma/schema.prisma`. Both sides changed the till
(stage 5's approvals, lay-bys, messages and pricing on this branch; the owner's feel, keys, customer screen and
reload-safe sale on `main`), so the merge needs someone who keeps both. Do it before anything else:
`git merge origin/main`, resolve keeping both behaviours, run the schema lock command (it also regenerates the
client), the till tests and the typecheck, then push.

## Local setup

```sh
pnpm install
pnpm dev:up                     # Postgres (Docker) + dev server
npx prisma migrate deploy       # dev DB
set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy   # test DB
npx tsx scripts/seed-retail-demo.ts --slug hurudza-creative --reset
```

- App: `http://hurudza-creative.apps.localtest.me:3000` (Chromium needs `--host-resolver-rules=MAP *.localtest.me 127.0.0.1`).
- Demo tenant "Harare Bottle Store": `owner@bottlestore.test` / `RetailDemo123!`. Other roles (manager, cashier
  Chipo, stock clerk, bookkeeper) are in `scripts/seed-retail-demo.ts`.
- `.env` needs `DATABASE_URL` and `DATABASE_URL_TEST` (a separate `huchu_test` database).

## The process: one section at a time

The owner's rule: hold a section, build all of its pages and workflows, test them at once, fix them, verify, push.
No per-screen check rounds.

1. **Build** — one builder per packet, in packet order (later packets in a stage build on earlier ones). Lean:
   implement the whole packet, eslint the changed files, run the packet's tests once, typecheck once, reseed if
   the seed changed, commit per unit. No screenshots, no browsing, no push.
2. **Test** — one tester over the whole section: `git diff <stage base>..HEAD`; per screen one screenshot at 1440
   and one at 390 compared with its boards; the main workflow once in the browser with its DB effects; forbidden
   roles and bad input by API; money screens get tests that try to break their invariants (balancing, reversals,
   double or lost postings). Runs the section's tests together and the typecheck. Edits nothing. Returns one
   issue list (blocker / major / minor, with screen, where and fix).
3. **Fix** — every issue in the list, majors and minors together, each proved by a test or by reading the result.
4. **Verify** — confirm each issue is fixed at HEAD, take the final screenshots (one per page or sheet at 1440,
   one list at 390), push, update PR #209.

### Running it as an agent team

Enable agent teams (experimental): `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the shell or in
`~/.claude/settings.json` under `"env"`. Optional split panes: `"teammateMode": "tmux"` (needs tmux or iTerm2).
Docs: https://code.claude.com/docs/en/agent-teams

Then, in an interactive `claude` session on this branch, as the lead:

> Read docs/handover/build/README.md. Finish stage 6 (Buying), then run stage 7. Spawn builders from the `retail-builder` definition, one per
> packet, and when they are all committed spawn one `retail-tester` over the section. Then have a builder fix the
> issue list, verify, and push.

Team shape that works:
- **Lead** (your session): makes the task list per stage, assigns packets, holds the stage base commit, decides
  on anything a packet leaves open (record it in `../98-decisions.md`), pushes.
- **Builders** (`retail-builder`, from `agents/retail-builder.md`): 2–3 at a time at most. Only run two builders together when
  their packets touch different files and neither adds a migration; packets in one stage often share
  `lib/retail/**` files, `scripts/seed-retail-demo.ts` and `prisma/schema.prisma`, and two teammates editing one
  file overwrite each other. When in doubt, build in sequence.
- **Tester** (`retail-tester`, from `agents/retail-tester.md`): one per section, after all builds are committed.

## Ground rules (every teammate)

- Read `AGENTS.md`, `docs/handover/98-decisions.md`, then the packet and the boards it names.
- Shared resources are serialised with locks: schema
  `flock /tmp/huchu-schema.lock sh -c 'npx prisma migrate deploy && set -a && . ./.env && set +a && DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy && npx prisma generate'`
  (restart the dev server after a generate); seed `flock /tmp/huchu-seed.lock npx tsx scripts/seed-retail-demo.ts --slug hurudza-creative --reset`;
  typecheck `flock /tmp/huchu-typecheck.lock pnpm typecheck` (about 6 GB; one at a time; plain `tsc` runs out of heap).
  On macOS use `brew install flock` or run these one at a time.
- `prisma generate` takes 4–5 minutes on this schema; that is normal. Do not start a second one.
- New migrations: a SQL folder with a timestamp after the newest in `prisma/migrations/`, applied with
  `migrate deploy` to dev and test, and a witness test (e.g. `lib/retail/till-approver-migration.test.ts`).
  Never `prisma db push`, never `migrate reset`, never edit `_prisma_migrations`.
- Tests: `set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx vitest run <files>`.
- Real data only: no sample rows in UI code; demo rows go in `scripts/seed-retail-demo.ts`.
- No backward compatibility: delete what a screen replaces.
- Conventional commits ending in the unit id, e.g. `feat(customers): accounts list and record (CUS-07)`.

## Open items carried forward

- **Vercel previews time out.** The build needs about 9 GB; the Standard build machine has 8 GB and passes the
  45-minute limit. It builds locally in about 4 minutes. Fix: Vercel → Settings → Build and Deployment → Build
  Machine → Enhanced.
- **Cloudflare Workers Builds fails** on every commit (no OpenNext or wrangler config) — on `main` too. Keep it
  (needs an OpenNext setup) or disconnect it.
- **Typecheck speed-up, agreed, not done:** run `typecheck` on TypeScript 7 as an aliased package
  (`"typescript-7": "npm:typescript@7.x"`), keeping TypeScript 5.9 for Next and eslint; move `vitest/globals` into a
  test-only tsconfig.
- Loyalty settings aside reads 7,680 points earned against the board's 38,204 (the seed's 30 days earn too little).
- Cold room till: the Castle case promotion note is cut off in the cart row.
- The till logs a hydration mismatch when it reloads while signed in; nothing visible breaks.
- D4 Insights scheduled emails is packet 88.
- Buying has had no test pass. Its five built screens committed with their own tests and a typecheck, but nothing
  has checked them together, against the boards, or for money invariants. Run the tester over the whole section
  once 41, 43, 44 and 45 are built.

Once stage 11 is merged, delete `docs/handover/build/` (packet 89 retires the old frames; this folder goes with it).
