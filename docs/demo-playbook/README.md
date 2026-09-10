# Demo playbook

**Started 2026-09-01.** How to stand up a believable demo of this platform and
walk a client through it, per vertical.

This grew out of the end-to-end testing work — the five demo tenants, their
seeded histories and the screenshots all come from the same place the tests do,
which is the point. A demo built on the test fixtures cannot drift from what the
product actually does, and a demo that breaks is a test that should have caught
it.

| | |
|---|---|
| [environment.md](environment.md) | Standing the demo up from nothing |
| [tenants.md](tenants.md) | The five tenants: logins, what is in each, and the beats to hit |
| [known-issues.md](known-issues.md) | What not to click on stage, and why |
| `screenshots/` | Curated stills per vertical, from the e2e run |

Related, and more technical:

- `docs/testing/e2e-plan-2026-09-01.md` — the test plan these fixtures serve
- `docs/testing/e2e-status.md` — what is green and what is not

---

## The one rule

**Demo from the seeded tenants, never from a hand-made one.** The seeds are
deterministic and re-runnable, so a demo can be reset to a known state in about
a minute, and the same data is what the test suite asserts against. A tenant
somebody built by hand the night before is a tenant nobody can restore when a
client asks to see it again.

## Why the data looks the way it does

Every seed deliberately includes **rows that are wrong**: a pupil with no
guardian on file, an invoice long overdue, a shift that came up short, a bar of
gold still sitting in the safe. That is not untidiness.

A demo of the happy path proves the software can add up. What a client is
actually buying is what happens when things go wrong — when a pupil stops coming
to school, when a purchase order arrives half-filled, when the till is short at
cash-up. Those states are seeded so they can be *shown*, and the strongest
moments in any of these demos are the ones where the system notices a problem
before the operator does.

Each vertical's section in [tenants.md](tenants.md) names its exception rows.
Use them.

## The screenshots

`docs/screenshots/<vertical>/<journey>/NN-name.png` — 68 of them, covering all
five verticals and both phone portals. Produced by `e2e/marketing-shots.spec.ts`
and reproducible:

```bash
pnpm start:e2e
npx playwright test e2e/marketing-shots.spec.ts
```

They are taken from the same seeded tenants the tests run against, which is the
point: a year of trading in the CRM, a quarter at the mine, a term at the
school, 180 days of a bottle store. Nothing was staged for the camera.

Every shot asserts before it fires — `expectHealthyPage` runs first, so a page
throwing in the console or rendering `NaN` fails the run instead of being
photographed. A marketing screenshot of a broken page is worse than none: it
outlives the bug, because nobody re-opens an image once it is in a deck.
