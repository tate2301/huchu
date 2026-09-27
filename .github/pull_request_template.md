<!--
Keep every heading. Delete the guidance comments as you fill them in.
Write "None" under a heading that does not apply instead of removing it,
so the reviewer knows you considered it.
-->

## Preview

**Hurudza Creative:** _pending_ <!-- filled in by the preview-link workflow when Vercel finishes deploying -->

<!--
The link above opens the Vercel preview for this branch signed in to the
`hurudza-creative` tenant (owner: tafadzwa@hurudza.test, see
docs/demo-playbook/tenants.md). To switch tenant on the same preview, append
`?__tenant=<slug>` to any path or open `/preview-host`.

If the workflow has not run yet, take the Preview URL from the Vercel bot
comment and add `/login?__tenant=hurudza-creative` to it.
-->

**Screens to open, in order:**

1. `/…` — what to look for

## Summary

<!-- Two or three sentences. What changed and why, in words the reviewer can
repeat back without opening the diff. -->

## Behaviour change

<!-- For a refactor the answer is "None intended." If anything a user, an
operator or another module can observe changed, list each one here, one line
each. Anything observable that is NOT in this list is a bug. -->

None intended.

## What moved where

<!-- Refactors only, otherwise "None". Old location → new location, one line
per move. Put deletions here too. This is the map the reviewer reads the diff
with. -->

| Before | After | Why |
| --- | --- | --- |
| `lib/old/thing.ts` | `lib/new/thing.ts` | |

## Where to look first

<!-- The two or three files that carry the real decision. Everything else in
the diff follows from them. Mention anything you are unsure about here. -->

-

## Database

<!-- One of: "No schema change." / "Migration `<name>` — `pnpm db:push` locally;
run migrations in staging/production." Name any backfill script and whether
it is idempotent. -->

No schema change.

## Verification

<!-- Tick what you ran. Paste the failing output if something is red and say
why it is acceptable. -->

- [ ] `pnpm typecheck`
- [ ] `npx eslint <changed files>`
- [ ] `pnpm test` (or the targeted files: `pnpm test -- <path>`)
- [ ] `pnpm test:e2e` — only when route, auth, portal or UI workflow behaviour changed
- [ ] Checked on the preview above, signed in as `hurudza-creative`

## Screenshots

<!-- Before / after for UI changes. Skip for pure refactors with no visual
change, and say so. -->

## Out of scope

<!-- Things you saw and deliberately did not touch, so the reviewer does not
ask for them. -->

-
