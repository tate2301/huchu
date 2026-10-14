# Ledger

Every correction, newest first. A lesson that holds beyond this project is also proposed for the
plugin's rules.

| Date | Screen or component | Proposed | His words | Lesson |
|---|---|---|---|---|
| 13 Oct 2026 | Shell | Shell A (home as a desk); a workspace is a record you open, not a context | "lets use B. but the admin must clearly operate in either global or workspace context. with clear indicators" | Shell B. Two contexts, each with its own switcher label, scope bar and sidebar. Changes to a workspace happen inside it, and the server enforces it from the URL |
| 13 Oct 2026 | Every table | Kit tables: sentence-case heads, status as a dot and a word | "tables must be designed cleanly like in the apps" | Draw the product's record table: uppercase 10px heads with icons, filled badges, mono values, one trailing control. The product's standard beats the kit's default |
| 13 Oct 2026 | Workspace pages | Housekeeping spread across a rail and a menu | "add controls for doing all admin and housekeeping work on workspaces. leaving other things to being resolved with impersonation" | Every housekeeping action has a home inside the workspace (Members, Plan and billing, Settings). Everything inside the product goes through sign in as |
| 13 Oct 2026 | Sign-in-as peek | Buttons with `role="radio"` for look only and make changes | Rams: broken ARIA pattern | Use native radios inside labelled rows; style with `:has(input:checked)` |
| 13 Oct 2026 | Sign-in-as peek | "Sign in as Rutendo" | Rams: the button hides the mode | The commit button names the mode chosen, and follows the choice |
| 13 Oct 2026 | Proof of payment | "Reject proof" and "Confirm $758.40" act on one press | Rams: irreversible money action on one click | Both send the customer a message, so both ask twice: Reject opens the reason, Confirm turns into "Confirm and send receipt". Second state drawn at stage 7 |
| 13 Oct 2026 | Every screen | Mono for every figure and time, in sentences too | (self, on the render) | Atkinson Mono set wide in prose. Mono only for codes, slugs and references |
| 13 Oct 2026 | Proof of payment | A class named `.check` | (self, on the render) | It collided with the kit's checkbox and centred the section. Check kit class names before naming one |

## Changed in the build (14 Oct 2026)

What the real system made different from the canvas, and why. Each is the
product's truth over the drawing.

| Where | The canvas drew | The build does | Why |
|---|---|---|---|
| Sign-in code | "Trust this computer for 12 hours" | No checkbox; a session lasts 12 hours, and 2 idle hours end it | The session already lasts the working day; the box would promise nothing more |
| Members, states | Invited, Active, Locked, Suspended | Active, Invited (retail staff invite open), Never signed in, Till PIN locked, Access removed | Only states the product can be in. Members have no password lockout; only till PINs lock |
| Members, menu | Unlock, password reset, make owner, suspend, remove | Sign in as, change role, sign out everywhere, remove access, give access back | The product has no reset email and no owner apart from its top role. A forgotten password is an emailed sign-in code; unlocking a till PIN is done by signing in as the owner |
| Sign out everywhere | Drawn | Built new: `User.sessionsEndedAt`, checked on every request | Nothing could end a member's sessions short of removing their access |
| Proof-of-payment queue | A customer's screenshot checked against the statement | "Record a payment" (any method, with its reference) and "Confirm as paid / Mark as failed" for gateway payments nobody heard back about | Customers cannot send proof in the product yet. When they can, it lands in this same queue |
| Settings | Custom domain, change owner, sample data, export everything | Rename, sign everyone out, end sign-in-as sessions, access record CSV, suspend, reinstate, close | Domains and data live inside the product: sign in as. "Owner" is the first top-role member until the product has its own owner field |
| Sign-in as | Customer not asked | Same, and the owner's "end it" link is a button on a page, not the link itself | Mail scanners open every link in an email; opening must not end the session |
| Operators | Invite from a list | Invite by email, with the link also shown once to copy | Email may not reach them; WhatsApp is how the team actually talks |

## Deliberate breaks

| Where | Rule broken | Reason |
|---|---|---|
| Scope bar inside a workspace | Colour 8, do not fill things to say them | The tint is the context. It has to be seen at a glance from anywhere on the page, because every change made under it lands on that workspace |
| Codes, slugs, transaction references | T1, one family | AGENTS.md asks for `font-mono` on numeric values. Kept to codes and references, where telling 0 from O matters |
| Icons | Icons 1, MingCute | The codebase draws with Phosphor through `@/lib/icons`. Same weight rule as `lib/icons.tsx`: carets, X, plus and check in bold, the magnifier regular, the rest fill. `dots-three` added to the bold list because its fill weight is a solid box; propose the same in `lib/icons.tsx` |
| EcoCash, InnBucks | Icons 3, real marks | No official marks are packaged. A neutral phone glyph and the name until the files are supplied |

## Switches turned on in rules.json

| Switch | Reason |
|---|---|
| uppercase | Table column heads only, to match the product's record table (`.acct-col-head`). He asked for tables like in the apps |
