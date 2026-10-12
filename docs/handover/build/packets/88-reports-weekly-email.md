# 88 · Reports: weekly template emails (INS-09)

## Screen
The email parts of the Reports screens: the "Email it every Monday at 07:00" toggle in `template-save`, `template-new` and
`template-edit` (with the sent hints and "Change the day"), the `report-send` sheet over a run page, the catalogue's bulk and row ⋯
email items, the run page's selection "Email every Monday", and the worker that sends template PDFs.

## Units
INS-09 (plus the email toggle and `email` field of the template endpoints that the spec puts in INS-08; moved here so storage and
sending land together). Spec `70-insights-reports.md` §2 W-56 ("From a report" row), W-73/W-74/W-75 email steps, §3.5, §4.2,
§4.4 (`email` in `TemplateInput`, `…/templates/email`), §5.10 bulk/⋯, §5.12 selection, §5.15.1–5.15.3 toggles, §5.15.5, §5.16
`sendstop`, §3.8 INS-09, §7 INS-09. Overrides: C-35 (recipients are people who open Reports), C-40.

## What already exists
- Packet 81: `ReportSend` (subjects INSIGHT and TEMPLATE, partial unique for a template's own email), `lib/retail/sends/*`
  (`nextRunAt`, `startSend`, `changeSend`, `stopSend`, `runDueSends` for INSIGHT, claim by conditional UPDATE), `/api/v2/retail/sends`
  CRUD, the `report-sends` worker job, `sendstop` ask, `RETAIL_REPORT_SEND` notifications, `renderPdfFromHtml`.
- Packets 85–87: faces, built-ins, run page, the three template sheets **without** the email toggle, template endpoints with audit,
  catalogue with Share/Delete, `RunContext` (`email: null`, `mySend: null`).
- `lib/reports/export-templates.ts#exportDocument("layout", …)`, `lib/reports/request.ts#fetchListExport`, `lib/email/send.ts`.

## What INS-09 adds
1. **Endpoints' email**: `TemplateInput.email?: { on: boolean; weekday?: 1–7; time?: "HH:MM" }`. POST with `email.on` creates the
   template's own `ReportSend { subject: TEMPLATE, subjectRef: <template id>, templateId, channel: EMAIL, recipientId: null, weekday
   1, time "07:00", createdById, nextRunAt }` in the same transaction; PATCH `email.on` upserts it (weekday/time from the body) or
   deletes it when off; audits carry `email` (`SAVED.email: true`, `CHANGED.changed` includes "email"). Only `canChangeTemplate`
   people reach it (PATCH rules). `ReportTemplateRecord.email = { on, weekday, time, recipients, lastSentAt }` and `RunContext.email`
   for saved templates the caller may change; `RunContext.mySend` = the caller's personal TEMPLATE send (`SendView`).
2. **Personal template sends**: `POST /api/v2/retail/sends { subject: "TEMPLATE", ref }` — `ref` a built-in slug (stored
   `builtin:<slug>`) or a saved id (stored with `templateId`); the caller must see the template (else 404 "Template not found");
   channel EMAIL (a person without an email → 400 `fieldErrors.channel` "Add your email address in Profile to get it by email.",
   Defined here); PATCH/DELETE as packet 81.
3. `POST /api/v2/retail/reports/templates/email { refs: string[] (≤ 200) }` (`retail.reports:view`): a saved template the caller may
   change → its own email on (Monday 07:00); anything else → a personal send to the caller; `{ templates, personal }`; 400 on a bad
   body. Toast "{n} templates go out every Monday at 07:00." (singular "1 template goes out …").
4. **Runner** `runDueSends` handles TEMPLATE: recipients = the one person (personal) or, for an own email, every active user with an
   email whose role holds `retail.reports:view` (C-35), whom the template's audience includes (`canSeeTemplate`) and whose role reads
   the source; rows fetched **as each recipient** (`fetchListExport` with the template's query, period resolved at send time;
   a cashier would only ever see their own rows, but cashiers no longer receive Reports); PDF via `exportDocument("layout", …)` +
   `renderPdfFromHtml`, file "{name}, {reportPeriodWords without year}.pdf" ("Weekend takings by shop, 25 to 27 September.pdf");
   email subject "{name} — {period}" ("Weekend takings by shop — 25 to 27 September"), body the period and Σ line, PDF attached;
   one `RetailMessage { channel: EMAIL, to, template: "report-weekly", status: SENT|FAILED, mediaName }` per recipient;
   `lastSentAt`, `lastRecipients` = recipients reached, `lastError`. Failures notify the recipient (personal) or the template's maker
   (own email): "Your Monday {template name} did not go" with the reason ("No email address for Ruvimbo Chari.", "Email is not set
   up."). A personal sender who lost the right: send deleted + "Your Monday {name} stopped" / "Your role cannot see it any more.".
5. **Sheets**: toggle "Email it every Monday at 07:00" (default off; hint "As a PDF, to the people who see it. Change the day in the
   template later.") in `template-save` and `template-new` (submit `email.on`); in `template-edit` the toggle reads "Email it every
   {Weekday} at {HH:MM}" with hint: on and sent "Sent to {n} {managers|manager|people|person}. Last sent {Weekday} at {HH:MM}." (Just me:
   "Sent to you. Last sent …"); on, never sent "Goes to {n} {managers|people}. First on {Weekday} {D Month} at {HH:MM}."; off the
   default hint; while on, a link "Change the day" (Defined here) shows Day (`seg` Mon…Sun) and At (`text`, mono, half, "07:00", error
   "Write a time like 07:00."). Closed link = the board.
   `report-send` (Defined here; `retail.reports:view` + template visible): title "Email me every Monday"; sub the template's name;
   To (`read`, the person's email), Day (`seg`, default Mon), At (`text`, mono, half, "07:00", hint "In Harare time."); note "Sends
   the whole report as a PDF, not just the rows ticked."; primary "Send it every Monday" (new) / "Save" (existing); danger "Stop
   sending" (existing; ask `sendstop`); submit POST/PATCH `/api/v2/retail/sends`; done "{name} goes to you every {Weekday} at {HH:MM}."
6. **Catalogue and run page**: catalogue bulk "Email every Monday" (between Share and Delete, → `…/templates/email`); row ⋯ "Email it
   every Monday" / "Stop the Monday email" (`canChange`, saved: PATCH `email.on`) or "Email me every Monday" / "Stop emailing me"
   (otherwise: `?sheet=report-send&ref={id}` over the run page / `DELETE /api/v2/retail/sends/[id]`); run page selection bar "Email
   every Monday" → `?sheet=report-send&ref={ref}` (acts on the whole report).

## Boards
- `TemplateEdit.png`: card with the green switch on, "Email it every Monday at 07:00" / "Sent to 3 managers. Last sent Monday at
  07:00."
- `ReportSaveTemplate.png`, `TemplateNew.png`: the toggle off with "As a PDF, to the people who see it. Change the day in the
  template later."
- `ReportsList.png` and `ReportSales.png`: the bulk "Email every Monday" (board bulk list).

## Workflows
W-56 "From a report": template email via the toggle (save/new/edit) or bulk; personal via `report-send`; the worker sends each due
send on its weekday and time (Harare). W-73/W-74 email step; W-75 "Email it every Monday" step.

## Roles
Turn a template's own email on/off: whoever may change it (maker, or owner once shared). Personal sends: anyone who opens Reports
(owner, manager, bookkeeper). Recipients: active users with an email who open Reports and whom the audience includes. Accounts
C-40.

## Data
`ReportSend`, `ReportTemplate`, `RetailMessage`, `User`, `Notification`. **No schema change** (packet 81's migration covers it).

## Server
- `lib/retail/sends/run-templates.ts#sendTemplate(send, now)` called by `runDueSends` for TEMPLATE; `templateRecipients(send)`.
- Sheet words in `lib/retail/sends/words.ts` (`sentHint`, `firstHint`).
- Same claim rule as packet 81 (no double send).

## UI
SheetForm kinds in `lib/retail/sheet-kinds/reports.ts` (toggle fields, `report-send`); catalogue and run-page actions in the
catalogue source and run-page ListFrame props. Switch on uses the board's green (`.cx-switch-row`, decision 9).

## Reuse
Packet 81's `lib/retail/sends/*`, `lib/documents/pdf-renderer.ts`, `lib/reports/export-templates.ts`, `lib/reports/request.ts`,
`lib/email/send.ts`, `lib/notifications.ts`.

## Remove
Nothing old.

## Seed
`seedReportSends()` (idempotent, after `seedReportTemplates`): the Weekend template's own email (`TEMPLATE`, `EMAIL`, weekday 1,
"07:00", recipient null, created by Tendai Mhlanga, `lastSentAt` the last Monday 07:00 Harare before the run, `lastRecipients` 3,
`nextRunAt` the next Monday 07:00), so the edit sheet reads "Sent to 3 managers. Last sent Monday at 07:00." (Tendai Mhlanga, Tafara
Nyathi and Ruvimbo Chari the bookkeeper: active Managers-audience people with an email; Rufaro is inactive).

## Tests
- `lib/retail/sends/run-templates.test.ts` (test DB): a Managers template reaches the owner, the manager and the bookkeeper and not a
  cashier or an inactive manager; a missing email → `lastError` and a notification to the maker; the PDF's Σ equals the run page's;
  two runners send once; a personal send of a template the person no longer sees is deleted with a notification.
- `lib/reports/templates.test.ts` additions: POST with `email.on` creates the own send; PATCH off deletes it; deleting the template
  cascades its sends.
- Bulk email endpoint: own email for a template the caller may change, personal for a built-in.
- Sheet words tests for the hints (plural/singular, Just me, never sent).

## Acceptance
1. Seeded, owner, Weekend template's edit sheet matches `TemplateEdit.png` exactly including "Sent to 3 managers. Last sent Monday at
   07:00.".
2. "Change the day" → Wed, 08:00 → Save → toggle reads "Email it every Wednesday at 08:00"; `ReportSend.weekday = 3`, `time "08:00"`,
   `nextRunAt` next Wednesday 08:00 Harare; audit CHANGED with "email".
3. `runDueSends(<that nextRunAt>)` writes three EMAIL `RetailMessage` rows (Tendai Mhlanga, Tafara Nyathi, Ruvimbo Chari) each with
   "Weekend takings by shop, 25 to 27 September.pdf" (dates of the last weekend at run time); a second call sends nothing.
4. Catalogue: tick Sales and Weekend takings by shop → "Email every Monday" → "2 templates go out every Monday at 07:00." (one
   personal send for Sales, the Weekend template's own email stays on).
5. Run page selection "Email every Monday" opens "Email me every Monday" with To = the owner's email; "Send it every Monday" →
   "Sales goes to you every Monday at 07:00."; row ⋯ then offers "Stop emailing me".
6. Save as a template with the toggle on → own send row created; the bookkeeper (no create) cannot reach the toggle.
7. eslint clean; vitest on the tests above; `pnpm typecheck`.

## Depends on
Packet 81 (INS-05: `ReportSend`, sends service, worker job) and packet 87 (INS-08). Locks: **W** (worker job behaviour), **M** not
needed (email sent directly, logged as `RetailMessage`).

## Risk
standard. Pitfalls: rows fetched as each recipient, never as the maker; the partial unique index for own emails; Harare time for
`nextRunAt` after a day/time change.

## Open questions
- The email toggle and `email` field move from INS-08 to here so storing and sending land together.
- Personal sends need an email address; the error wording is Defined here.
