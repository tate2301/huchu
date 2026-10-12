# 42 · Support: act as the owner, with their yes

## Screen
- Admin host: the aside "Act as the owner" on `/admin/company/[companyId]/shop` (packet 35's page), with its five states.
- Tenant host: `/support/answer/[token]` (the owner's yes, in the retail shell), `/support/enter?token=…` (signs support in as the
  owner), the support banner on every tenant page during a session, and the line in the owner's account menu.
- Admin portal support-access pages lose Approve/Deny.

## Units
ADM-10 (docs/handover/80-admin.md §W-68 row "Act as the owner, with their yes", §3.3 `support_act_as_owner`, §3.4 `supportAccess*`,
`supportSession*`, §3.5 `RETAIL_SUPPORT` asks, §4.3 (support claims), §4.7 support-access rows + tenant rows, §5.12 aside, §5.13, §6 ADM-10
row, §7 ADM-10). C-39: the owner answers through the link (admin open question 13's recommendation); reading a WhatsApp reply is not
built.

## Boards
`SupportCompany.png` aside: h2 "Act as the owner"; paragraph "Opens their admin as Tendai Mhlanga for 30 minutes, with a banner on every
page. Needs the owner’s yes on WhatsApp first."; outline button "Ask Tendai for access". Other states and the tenant screens have no
board (**Defined here**, verbatim §5.12 aside states and §5.13): asked "Asked at 13:58. Waiting for Tendai’s yes on WhatsApp." + link "Ask
again"; yes "Tendai said yes at 14:02." + primary "Open their admin"; in "In their admin until 14:35." + outline "End it"; no "Tendai said
no at 14:03." + the ask button again; no phone "Tendai Mhlanga has no WhatsApp number. Ask them another way." and no button. Answer page:
480px card "Let Corelith support into your admin?" … "Not now" / "Let them in"; done "Done. Nyasha can open your admin until 14:32." /
"Done. Nyasha has been told no."; expired "This has run out. Corelith support can ask again.". Banner (40px, `--warn-soft`, above the 48px
header): "You are in Harare Bottle Store as Tendai Mhlanga, for Corelith support, until 14:35. Everything you do is logged with your name."
+ outline "End it". Owner's account menu line "Corelith support is in your admin until 14:35" + "End it".

## Workflows
W-68 third step "Act as the owner, with their yes" — verbatim §W-68 last row: ask (reason) → WhatsApp `support-ask` with the answer link
→ the owner says yes/no → "Open their admin" starts a 30-minute `SupportSession` and a `SessionHandoff` → the tenant signs the superuser
in **as the owner** with support claims → every permission check uses the `CORELITH_SUPPORT` row, every audit event carries
`payload.support` and `source: "SUPPORT"` → "End it" or 30 minutes end it.

## Roles
- Platform superuser on the admin host (`requirePlatformAdminAccess`) for ask/open/end.
- The owner asked (`ownerUserId`, the owner approver from `getApprovalLimits` or the first active owner) answers; another signed-in
  user on the answer page → "This was sent to Tendai Mhlanga." (403).
- During a session: `CORELITH_SUPPORT` grants (ALL except `activity`, `insights`, `money`: view) via `canRetailSessionDo` (landed in
  ADM-01: `session.user.supportSessionId` switches the role key).
- End: the support session itself or any owner.
Accounts: Nyasha `nyasha@corelith.test` (packet 35's `seedSupport()`), owner `owner@bottlestore.test` (phone `+263 77 412 0098`).

## Data
Existing: `SupportAccessRequest`, `SupportSession`, `SessionHandoff`, `RetailMessage` (outbox), `PlatformAuditEvent`, `Notification`
(`RETAIL_SUPPORT`). Migration `<stamp>_support_act_as_owner`, witness `lib/platform/support-act-as-owner-migration.test.ts`, verbatim
§3.3: `SupportAccessRequest` + `ownerUserId`, `answerTokenHash @unique`, `answeredAt`; `SupportSession` + `actorUserId`, `actorName`,
`actingAsUserId`; `SessionHandoff` + `supportSessionId`. Witness: six columns, the unique index.

## Server
- `lib/platform/support-access.ts` (+ test):
  - `askOwner(superuser, companyId, reason 5–500)` → `SupportAccessRequest` (IMPERSONATE, READ_WRITE, `ownerUserId`, `answerTokenHash` =
    SHA-256 of a random token, status REQUESTED); WhatsApp `support-ask` to the owner's phone through the outbox, body "Nyasha from
    Corelith asks for 30 minutes in your admin as you, to: <reason>. Answer here: <tenant URL>/support/answer/<token>"; notification
    `RETAIL_SUPPORT` "Corelith support asks to open your admin"; audit `RETAIL_SUPPORT.ACCESS_ASKED { reason }` on the tenant chain.
    Errors: 400 `fieldErrors.reason` "Say why, so Tendai knows."; 409 "Tendai Mhlanga has no WhatsApp number. Ask them another way.";
    409 "You are in their admin already.". "Ask again" re-asks: the old token stops working (new hash).
  - `answer(owner, token, "yes"|"no")` — the asked owner only; an ask is good for 24 hours (409 "This has run out."); answered once (409
    "You answered already."); APPROVED/DENIED, `answeredAt`, token spent; audit `RETAIL_SUPPORT.ACCESS_ANSWERED { answer }`.
  - `open(superuser, companyId)` — needs a yes within 30 minutes (409 "Tendai has not said yes." / "That yes has run out. Ask again.");
    `SupportSession` (ACTIVE, `expiresAt` now + 30 min, `actorUserId`, `actorName` = first name, `actingAsUserId` = owner, `requestId`);
    `SessionHandoff` for the owner with `supportSessionId`, valid 2 minutes; returns `https://<tenant host>/support/enter?token=…`; audit
    `RETAIL_SUPPORT.SESSION_STARTED { until }`; notification to owners "Corelith support is in your admin" "Until 14:35. Everything they
    do is in Activity.".
  - `end(by, companyId)` — REVOKED, `endedAt`; audit `.SESSION_ENDED { how: "ended" }`; 409 "Nothing to end.".
  - `expireSupportSessions(now)` — ACTIVE past `expiresAt` → EXPIRED, `.SESSION_ENDED { how: "expired" }`; retail worker job every
    minute (`lib/retail/worker/jobs.ts`).
  - `accessState(companyId)` → `AccessState` (none | asked | yes | no | in) for the console aside.
- Auth (file lock A): `lib/auth.ts` `handoff` provider: a handoff with `supportSessionId` signs in as its user with token claims
  `supportSessionId`, `supportActorName`, `authExpiresAt` = the session's `expiresAt`; `lib/auth-core/session-claims.ts`
  `enrichTokenClaims` carries them and, on every request, re-checks the `SupportSession` is ACTIVE and not past `expiresAt` — otherwise
  the session ends and the browser lands on `/login`. Packet 32's `writeRetailAuditEvent` already reads `supportSessionId` /
  `supportActorName` (actor name "Nyasha (Corelith support)", `source SUPPORT`, `payload.support`).
- Remove platform-side approval: `approveRequest` from `PLATFORM_ADMIN_MANIFEST.support` (`lib/admin-portal/manifest.ts`),
  `approveSupportAccess` in `scripts/platform/domain/support-service.ts`, the approve/deny actions on
  `app/portal/admin/support-access/page.tsx` and `app/portal/admin/company/[companyId]/support-access/page.tsx` and in the platform
  TUI's Support module, and `startSupportSession` without an owner's yes (it now requires an APPROVED request answered by the owner).

API:
| Method · path | Who | Body | Success | Errors |
|---|---|---|---|---|
| POST `/api/platform-admin/companies/[companyId]/support-access` | platform superuser | `{ reason }` | `{ access: AccessState }` | 400; 409 |
| POST `…/support-access/open` | platform superuser | `{}` | `{ url }` | 409 |
| POST `…/support-access/end` | platform superuser | `{}` | `{ access }` | 409 "Nothing to end." |
| GET `/api/v2/retail/support-access/answer?token=` | the owner asked (signed in) | — | `{ data: { askerFirstName, reason, askedAt, state } }` | 403 "This was sent to Tendai Mhlanga."; 404 |
| POST `/api/v2/retail/support-access/answer` | the owner asked | `{ token, answer }` | `{ data: { state } }` | 409 |
| POST `/api/v2/retail/support-access/end` | the support session or any owner | `{}` | `{ ended: true }` | 409 |
Add the tenant routes to `lib/retail/route-guard-coverage.test.ts`; `/support/enter` to `lib/public-routes.ts` (it signs in); the
answer page needs a signed-in owner (normal guard).
Audit constants `supportAccessAsked`, `supportAccessAnswered`, `supportSessionStarted`, `supportSessionEnded` + `LIST_WORDS`
("Corelith support" info: "Asked to act as the owner", "Tendai said yes"/"Tendai said no", "In the admin until 14:35", "Left the admin").

## UI
- Console aside (packet 35's page): the "Act as the owner" section with its states (above); "Open their admin" opens the URL in a new tab.
- `app/support/answer/[token]/page.tsx` (tenant host, inside the retail shell): the card and its done/expired lines.
- `app/support/enter/page.tsx`: `signIn("handoff", { token })` then `/retail`; spent or stale → "This link has been used or has run
  out.".
- Banner: `components/layout/support-banner.tsx` rendered by the shell above the header while `session.user.supportSessionId` is set;
  "End it" → `POST /api/v2/retail/support-access/end` then `/login`. The owner's account menu (logo-tile popover — keep it as is,
  98-decisions owner direction 6) gains one line while a session is on, with "End it". The sidebar keeps every function (direction 5).

## Reuse
`lib/auth-core/session-handoff.ts`, `lib/auth.ts` handoff provider, `lib/auth-core/session-claims.ts`, `lib/retail/permission-matrix.ts`
(`CORELITH_SUPPORT`, `canRetailSessionDo`), `lib/retail/approvals/limits.ts` (owner approver), `lib/retail/messages/*`,
`lib/platform/tenant-url.ts`, packet 35's console page, packet 32's writer.

## Remove
See "Remove platform-side approval" above (verbatim §6 ADM-10 row).

## Seed
None beyond packet 35's `seedSupport()`.

## Tests
- Witness.
- `lib/platform/support-access.test.ts`: ask needs a reason and an owner phone; ask again invalidates the old token; answer only by the
  asked owner, once, within 24 h; open needs a yes within 30 min; the handoff carries the session; session expiry; end by owner and by
  support; a request approved without the owner cannot start a session.
- `lib/auth-core/session-claims.test.ts`: a token with `supportSessionId` whose session is REVOKED/EXPIRED is refused on the next
  request; the role key is `CORELITH_SUPPORT` during the session.
- `lib/retail/audit.test.ts`: during a session events carry `payload.support`, `source SUPPORT`, actor name "Nyasha (Corelith support)".

## Acceptance
1. Migration on dev + test; witness green; `--support` reseed.
2. As Nyasha on the admin host: the aside vs `SupportCompany.png` ("Act as the owner", paragraph, "Ask Tendai for access"). With the
   "Why" filled → "Asked at hh:mm. Waiting for Tendai’s yes on WhatsApp."; a `RetailMessage` `support-ask` to +263 77 412 0098 (QUEUED or
   FAILED "WhatsApp is not set up"); the owner's notification.
3. As `owner@bottlestore.test`, open the link from the message body → "Let Corelith support into your admin?" → "Let them in" → "Done.
   Nyasha can open your admin until hh:mm."; as `tafara.manager@` the same link → "This was sent to Tendai Mhlanga.".
4. Console shows "Tendai said yes at hh:mm." → "Open their admin" → a new tab on the tenant host signed in as Tendai Mhlanga with the
   banner "You are in Harare Bottle Store as Tendai Mhlanga, for Corelith support, until hh:mm. …".
5. In that tab change a product's price → Activity shows Who "Nyasha, Corelith support", Where "Corelith support"; owner-level reads work
   (`GET /api/v2/retail/people`); Activity has no write endpoint.
6. "End it" in the banner → back to sign-in; the session REVOKED; a session past 30 minutes is refused on its next request and marked
   EXPIRED by the worker; "Not now" on a new ask → the console shows "Tendai said no at hh:mm.".
7. The admin portal's support-access pages no longer offer Approve or Deny.
8. `npx eslint <changed>`; `npx vitest run lib/platform lib/auth-core lib/retail/audit.test.ts`; `pnpm typecheck` alone.

## Depends on
Packet 35 (console page), packet 32 (writer's support fields, Activity), ADM-01 (`CORELITH_SUPPORT`, landed), SET-07 (outbox). Holds the
auth (A), worker (W) and messaging (M) locks.

## Risk
standard (no money), but security-sensitive: tokens stored as hashes only, single use, short-lived; the session re-checked on every
request; never log the token.

## Open questions
- C-39 / admin open question 13: the owner answers by the link; inbound WhatsApp is not read for this.
- Admin open question 14: removing platform-side approval applies to every product's tenants; taken as the spec recommends.
