# 81 · Insights: Export and "Send me this" on every insight page (INS-05)

## Screen
All seven insight pages `/retail/insights/{sales,profit,products,stock,losses,customers,money}`: the header "Export" menu,
each table's "Export", the aside "Send me this", and the sheet `?sheet=insight-send&topic=<topic>`. Server: the export
endpoint, the weekly sends API and the worker job that sends insight pictures.

## Units
INS-05. Spec: `70-insights-reports.md` §1 rows 1–7 (Export, Send me this), §2 W-55 (insight part) and W-56 (insight part),
§3.2.1, §3.4, §3.5, §4.1 export, §4.2, §5.1 header Export / tabs Export / aside 3, §5.15.6, §5.16 `sendstop`, §7 INS-05.
Overrides: direction 7 (no "What it says" lines: the message carries the headline), C-02/C-03 (SET-07 owns media columns and
the one drain), C-40.

## What already exists
- `InsightAside` has the "Send me this" section behind an optional `send: { words, onWords, onSend, busy, error }` prop; it
  has no "Change" link. `InsightTabs` takes an optional `exportAction` node. Neither is passed today.
- `components/list-frame/export-menu.tsx#ExportMenu` (caption + Spreadsheet / Comma-separated / PDF, ready to print).
- SET-07 (landed): `RetailMessage` with `channel WHATSAPP|EMAIL`, `mediaUrl`, `mediaName`, `mediaKind IMAGE|DOCUMENT`,
  `scheduledFor`; `lib/retail/messages/drain.ts` (WhatsApp by template with an optional media header; email as text);
  `lib/messaging/whatsapp.ts#sendMedia`; worker jobs registry `lib/retail/worker/jobs.ts` (job `message-outbox` every 5 min).
- `lib/documents/pdf-renderer.ts#renderPdfFromHtml` (puppeteer), `lib/documents/html-renderer.ts#renderDocumentShell`,
  `lib/reports/export-xlsx.ts#buildWorkbook`, `lib/email/send.ts#sendEmail` (attachments), `lib/uploads/upload-file.ts`.
- `RETAIL_AUDIT_EVENTS.exportDownloaded` (`RETAIL_EXPORT.DOWNLOADED`), `emitRetailNotification`.
- Phones are seeded by ADM-02 (`seedPeople`): owner Tendai Mhlanga `+263774120098`, Tafara Nyathi `+263773012290`.
- Nothing else: no `ReportSend`, no export endpoint, no sends API, no picture rendering.

## What INS-05 adds
Everything below. It does **not** add `RetailMessage.mediaUrl` (SET-07 did, C-02) and does not touch the drain beyond
nothing (the drain already sends an IMAGE header).

## Boards
Every Insights board: header right, outline 32px "Export"; tab row right, 28px outline "Export"; aside section "Send me this":
"This page, as a picture and three lines, every Monday at 07:00 on WhatsApp." then outline 34px/600 "Send it every Monday".
Defined here (no board): the Export menus' headings and items, the on state "Every Monday at 07:00 on WhatsApp, to +263 77 412
0098." in `--ok` 500 + "Change" (underlined `--ink-2`), the `insight-send` sheet, the `sendstop` ask.

## Workflows
- **W-55 (insights)**: header Export → menu headed "This page, {periodWords}" ("This page, last 30 days"): "PDF, ready to print"
  (what `page`), "Spreadsheet" (what `tables`). Table Export → menu headed `exportCaption` ("The 6 categories the table shows"):
  Spreadsheet, Comma-separated, PDF, ready to print (what `table`). While running: spinner, inert button. Failure toast "The
  export did not work. Try again." Server re-computes the insight as the caller; audit `RETAIL_EXPORT.DOWNLOADED { key:
  "insight-sales", format, what }`.
- **W-56 (insight)**: "Send it every Monday" → `POST /api/v2/retail/sends { subject: "INSIGHT", ref: topic, options: { period,
  siteId } }` → on state, no toast. "Change" → `?sheet=insight-send&topic=sales`: How (WhatsApp/Email), To (read), Day
  (Mon…Sun), At ("07:00") → Save → `PATCH /api/v2/retail/sends/[id]`; "Stop sending" → ask `sendstop` → `DELETE`. Each Monday
  the worker sends the picture.

## Roles
Export and Send: anyone who can view the page (`retail.insights:view`; Money also `retail.money:view`): owner
`owner@bottlestore.test`, manager `tafara.manager@bottlestore.test` (not Money), bookkeeper `bookkeeper@bottlestore.test`.
Cashier/stock clerk: 403 "Your role cannot view insights". PATCH/DELETE of a send: its recipient only, else 404 "Send not found".

## Data
Existing: `RetailMessage`, `User` (`phone`, `email`, `role`, `isActive`), `ReportTemplate`, `Notification`.
**Migration** `<stamp>_report_sends` (stamp at landing, after the last folder, C-11; today the last is
`20261006082500_fiscal_receipt_date`), from spec §3.2.1 **without** the `RetailMessage.mediaUrl` part:
- enums `ReportSendChannel { WHATSAPP EMAIL }`, `ReportSendSubject { INSIGHT TEMPLATE }`;
- model `ReportSend` exactly as §3.2.1 (`subjectRef`, `templateId?` FK cascade, `options Json default "{}"`, `channel`,
  `weekday Int default 1`, `time String default "07:00"`, `recipientId?` FK cascade (`"ReportSendRecipient"`), `createdById` FK
  cascade (`"ReportSendCreatedBy"`), `nextRunAt`, `lastSentAt?`, `lastRecipients Int?`, `lastError?`, timestamps);
  `@@unique([companyId, subject, subjectRef, recipientId])`, `@@index([nextRunAt])`, `@@index([templateId])`; back-relations
  `Company.reportSends`, `User.reportSendsReceived`, `User.reportSendsMade`, `ReportTemplate.sends`;
- SQL: partial unique `"ReportSend_template_own_key" ON ("companyId","subject","subjectRef") WHERE "recipientId" IS NULL`;
  checks `"ReportSend_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7)` and `"ReportSend_time_check" CHECK ("time" ~
  '^([01][0-9]|2[0-3]):[0-5][0-9]$')`;
- `NotificationType` and `NotificationEntityType` gain `RETAIL_REPORT_SEND`.
Apply with `npx prisma migrate deploy`, then on the test DB. **Witness** `lib/reports/report-sends-migration.test.ts`: both
enums and values; the two notification values; table and every column type/nullability; the unique and the partial unique
(two own emails for one template fail; two personal sends for two people succeed); both checks reject 0/8 and "7:00"; the three
FKs cascade; the `nextRunAt` index.

## Server
- `lib/retail/sends/next-run.ts#nextRunAt(weekday: number, time: string, after: Date, zone = "Africa/Harare"): Date` — pure;
  the first instant strictly after `after` that is that weekday at that local time.
- `lib/retail/sends/words.ts`: `sendWords(send, to)` "Every Monday at 07:00 on WhatsApp, to +263 77 412 0098." / "Every
  Wednesday at 08:00 by email, to owner@bottlestore.test."; `offWords(hasPhone)` "This page, as a picture and three lines, every
  Monday at 07:00 on WhatsApp." / "… by email."; phone display `+263 77 412 0098` from E.164.
- `lib/retail/sends/service.ts`:
  - `startSend(session, { subject, ref, channel?, weekday?, time?, options? })`: INSIGHT ref ∈ topics and the caller passes the
    insight's gates; channel defaults WHATSAPP when `User.phone` else EMAIL; WHATSAPP without phone → 400 `fieldErrors.channel`
    "Add your phone number in Profile to get it on WhatsApp."; bad time → `fieldErrors.time` "Write a time like 07:00.". Upsert
    on (company, subject, subjectRef, recipientId = caller): existing → 200 `{ send }`, new → 201. `nextRunAt` from `nextRunAt()`.
    One transaction with audit `RETAIL_REPORT_SEND.STARTED { subject, ref, channel, weekday, time, recipientId }`
    (`reportSendStarted`). (TEMPLATE subjects are accepted by the schema but used from packet 88.)
  - `changeSend(session, id, patch)`: own send only (else 404 "Send not found"); recompute `nextRunAt`; audit
    `RETAIL_REPORT_SEND.CHANGED { before, after }`.
  - `stopSend(session, id)`: own only; delete; audit `RETAIL_REPORT_SEND.STOPPED { subject, ref }`.
- `lib/retail/sends/run.ts#runDueSends(now)` (INSIGHT now; TEMPLATE in packet 88): select due ids (`nextRunAt ≤ now`, limit 50);
  claim each with `UPDATE "ReportSend" SET "nextRunAt" = $next WHERE id = $1 AND "nextRunAt" = $old` (0 rows → skip; two workers
  never send twice). Re-check the recipient: inactive or lacks the insight's grants → delete the send, notify "Your Monday {Title}
  picture stopped" / "Your role cannot see it any more.". Load the insight **as the recipient** for the stored period and site,
  render the picture (below). WHATSAPP: upload the PNG (`uploadFileToBlob`, new context `insight-pictures`, PNG ≤ 2 MB), queue
  `RetailMessage { channel: WHATSAPP, to: phone, template: "insight-weekly", body, mediaUrl, mediaKind: IMAGE, mediaName:
  "sales.png" }` for SET-07's drain. Body: "{Title}, {periodWords}" then the headline's fact and notice on their own lines, then
  the page link (`${APP_URL}/retail/insights/sales`). EMAIL: send at once through `sendEmail` (subject "Sales, last 30 days",
  HTML with the two sentences and the PNG inline, PNG attached) and log `RetailMessage { channel: EMAIL, status: SENT|FAILED,
  template: "insight-weekly" }`. Then `lastSentAt`, `lastRecipients = 1`, `lastError` null or the reason; on failure notify the
  recipient "Your Monday {Title} picture did not go" with the reason ("WhatsApp is not set up.", "Pictures cannot be stored
  here yet."). Type and entity `RETAIL_REPORT_SEND`, viewPath the insight page.
- Worker: `lib/retail/worker/jobs.ts` gains `{ name: "report-sends", when: { everyMinutes: 5 }, run: runDueSends }` (lock W).
- `lib/documents/pdf-renderer.ts#renderPngFromHtml({ html, width: 1080, height: 1350 }): Promise<Buffer>` beside
  `renderPdfFromHtml` (same browser launch).
- `lib/retail/insights/render.tsx`: `insightPictureHtml(insight)` (title, period line, headline, KPI strip, question panel) and
  `insightPageHtml(insight, company)` (adds every table with Σ) via `renderToStaticMarkup`, inlining
  `components/dashboard-frame/dashboard-frame.css` and the Tender tokens. The chart components it renders must be pure
  (no `"use client"`, no hooks): split `HeatGrid`, `InsightBars`, `ColumnsChart`, `KpiStrip`, `QuestionPanel` into a pure
  drawing part and the existing client wrapper that adds hover tooltips; page and server draw the same SVG/HTML.
- `POST /api/v2/retail/insights/[topic]/export`: zod `{ what: "page"|"tables"|"table"; table?: string; format: "pdf"|"xlsx"|"csv";
  period?; from?; to?; siteId? }`; `page` only pdf, `tables` only xlsx, `table` any; gates as GET; 400 "That export request could
  not be read"; 404 "There is no such table". Recomputes with `all=1` for tables. PDF: `renderDocumentShell` + `renderPdfFromHtml`,
  A4 landscape, company branding. XLSX: `exceljs` — title row, period line, each table with its Σ row (one sheet per tab for
  `tables`). CSV: header, rows, a total line. File `<topic>_<from>_<to>.<ext>` ("sales_2026-09-04_2026-10-03.pdf"),
  `Content-Disposition: attachment`. Audit `RETAIL_EXPORT.DOWNLOADED { key: "insight-<topic>", format, what, table? }`.
- `GET /api/v2/retail/sends?subject=INSIGHT&ref=sales` → `{ send: SendView | null, defaults: { channel, to, words } }`;
  `POST /api/v2/retail/sends` → 201/200 `{ send }`; `PATCH /api/v2/retail/sends/[id] { channel?, weekday?, time? }` →
  `{ send }`; `DELETE` → `{ stopped: true }`. Errors as above. `SendView` per §4.2.
- `GET /api/v2/retail/insights/[topic]` now fills `send` (the caller's INSIGHT send of that topic) and `sendWords`.
- `RETAIL_AUDIT_EVENTS` gains `reportSendStarted`, `reportSendChanged`, `reportSendStopped`.

## UI
- Header: `PageChrome actions={<InsightExport …/>}` — outline "Export" → menu (260px) headed "This page, {periodWords}" with
  "PDF, ready to print" and "Spreadsheet". Downloads through the endpoint.
- `InsightTabs exportAction={<ExportMenu caption={table.exportCaption} …/>}` with the 28px outline trigger.
- Aside: `InsightAside send={…}`; add "Change" (underlined) after the on words, linking `?sheet=insight-send&topic=<topic>`.
  Pressing "Send it every Monday" posts and flips to on without a toast; failure keeps the button and shows the error in `--bad`.
- Sheet kind `insight-send` in `lib/retail/sheet-kinds/insights.ts` (+ index line): title "Send me this"; sub "Insights ›
  {Title}"; loads `GET /api/v2/retail/sends?subject=INSIGHT&ref=<topic>`; fields How (`seg` WhatsApp · Email; WhatsApp disabled
  with hint "Add your phone number in Profile to get it on WhatsApp." without a phone), To (`read`, phone or email for the chosen
  way), Day (`seg` Mon…Sun), At (`text`, mono, half, hint "In Harare time."); note "This page, as a picture and three lines.";
  danger "Stop sending" (ask `sendstop`); primary "Save"; done "{Title} goes to you every {Weekday} at {HH:MM} on
  {WhatsApp|email}."; invalidates `["retail-insight", topic]`.
- Ask `sendstop` in `lib/retail/asks/reports.ts` (+ index export): title "Stop sending {name}?", body "Nothing else changes. You
  can turn it on again from the page.", keep "Keep sending", go "Stop sending", tone bad.
- Phone: Export stays in the header (⋯ on a phone via `phoneMenu`), the aside moves under the main column.

## Reuse
`components/list-frame/export-menu.tsx`, `components/dashboard-frame/insight-aside.tsx`, `insight-table.tsx`,
`lib/reports/export-xlsx.ts` patterns, `lib/documents/*`, `lib/email/send.ts`, `lib/uploads/upload-file.ts`,
`lib/retail/messages/drain.ts` (unchanged), `lib/retail/worker/jobs.ts`, `lib/notifications.ts#emitRetailNotification`,
`lib/retail/audit.ts`, `components/sheet-form/*`, `lib/workspace/sheet-kind.ts`.

## Remove
Nothing old exists for these features.

## Seed
Nothing new: phones already seeded by ADM-02. No send is seeded (boards show "Send it every Monday").

## Tests
- `lib/reports/report-sends-migration.test.ts` (witness, above).
- `lib/retail/sends/next-run.test.ts`: Monday 07:00 after Sat 3 Oct 2026 14:42 = Mon 5 Oct 07:00; after Mon 07:00 exactly = the
  next Monday; Sun 23:30 → Mon 07:00 next day; Wednesday 08:00.
- `lib/retail/sends/run.test.ts` (test DB): two concurrent `runDueSends` with the same clock send once (one `RetailMessage`);
  a recipient who lost `retail.money:view` has the Money send deleted and gets a notification; WhatsApp queues a message with
  `mediaKind IMAGE`, `mediaUrl` and the body "Sales, last 30 days\n<fact>\n<notice>\n<link>"; no blob token → `lastError` and a
  failure notification; email logs a SENT message.
- `lib/retail/sends/service.test.ts`: second POST returns 200 and the same id; WhatsApp without a phone → 400 field error; PATCH
  of another person's send → 404.
- `lib/retail/insights/render.test.tsx`: heat grid, bars and columns render to static markup with no client hooks.
- Export route test: page PDF starts `%PDF`; tables workbook has one sheet per tab with its Σ row; CSV of "category" has 6 rows +
  total line; `what: page, format: csv` → 400.

## Acceptance
1. Seeded, owner, `/retail/insights/sales`: header "Export" → "This page, last 30 days" with "PDF, ready to print" and
   "Spreadsheet"; the PDF shows KPIs, grid and the category table with Σ; the workbook has three sheets with Σ rows. Table
   "Export" → "The 6 categories the table shows"; the CSV has 6 rows and a total line. `PlatformAuditEvent` rows
   `RETAIL_EXPORT.DOWNLOADED` with key `insight-sales`.
2. Aside reads "This page, as a picture and three lines, every Monday at 07:00 on WhatsApp." + "Send it every Monday"; pressing it
   shows "Every Monday at 07:00 on WhatsApp, to +263 77 412 0098." + "Change"; one `ReportSend` row (INSIGHT, sales, WHATSAPP,
   1, "07:00", recipient = owner, `nextRunAt` next Monday 07:00 Harare) and audit `RETAIL_REPORT_SEND.STARTED`.
3. "Change" → Email, Wed, 08:00 → Save → "Every Wednesday at 08:00 by email, to owner@bottlestore.test."; "Stop sending" →
   `sendstop` → button back; row deleted; audits CHANGED, STOPPED.
4. With a send due, calling `runDueSends(<its nextRunAt>)` queues one WhatsApp `RetailMessage` (or logs one EMAIL) whose picture
   shows the grid; `nextRunAt` moved a week; a second call at the same clock sends nothing.
5. Every other insight page has the same header Export, table Export and aside. Manager: no Money page, so no Money send;
   `POST /api/v2/retail/sends { subject: "INSIGHT", ref: "money" }` as the manager → 403 "Your role cannot view the money page".
6. Cashier: `POST …/insights/sales/export` → 403.
7. eslint clean on changed files; vitest on the tests above; `pnpm typecheck`.

## Depends on
Packet 80 (INS-01: the contract, `sendWords`, `send`), SET-07 (landed: outbox, media columns, drain), FND-07 (landed: SheetForm),
ADM-02 (landed: phones). Locks: **IN**, **W** (worker job), **M** only if the drain must change (it should not).

## Risk
standard. Pitfalls: render components must be pure to work in a route handler and in the tsx worker; claim with the
conditional UPDATE; time zone for `nextRunAt`; WhatsApp needs a stored picture URL (no blob token = honest failure, not a fake).

## Open questions
- "Three lines" with no "What it says": the message is the title line plus the headline's two sentences (direction 7); the
  board's copy "a picture and three lines" stays true.
- `RetailMessage.mediaUrl` already exists (C-02): the spec's column is dropped from this migration.
