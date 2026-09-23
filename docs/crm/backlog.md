# CRM backlog

Everything asked for that is not yet built, written down so it stops living in
a chat log. Ordered by what unblocks the most work, not by who asked loudest.

Items marked **done** are here because they came out of the same conversation
and it is useful to see them beside what they enabled.

## Pipeline and timing

| | |
|---|---|
| **done** | A lead past Contacted becomes a deal automatically. `stagePromotesToDeal` in `lib/crm/pipeline.ts`. |
| **done** | Per-stage SLAs in working hours: 30 minutes to first contact, 3 working days to follow up, and a target on every stage after. `lib/crm/sla.ts`. |
| todo | SLA targets configurable per tenant. The numbers are constants today; the shape (`STAGE_TARGET_MINUTES`) is already a table so this is a settings screen and a column, not a rewrite. |
| todo | Working hours configurable per tenant. `DEFAULT_WORKING_HOURS` is 8–5 Mon–Fri; every function already takes hours as a parameter. |
| todo | Public holidays. Working-hours maths currently knows about weekends and nothing else, so a Christmas Day lead is "late" by the 26th. |
| todo | Notify on breach. The clock is visible on the board; nothing pushes when it runs out. Needs an automation trigger — `SLA_BREACHED` — which the rules engine can already act on once it fires. |
| todo | Unify the board. Leads carry a `CrmLeadStage` enum; deals carry configurable `CrmPipelineStage` rows. The board shows one axis and labels promoted cards as deals. Showing deals on *their own* stages in the same board means reconciling two stage systems — a product decision, not a refactor. |

## Site visits

| | |
|---|---|
| **done** | Visits can be booked against a deal or a site, and from the Site visits page. |
| todo | Location as a pin or reverse-geocoded address, not just a text line. |
| todo | A public brief at `/v/[token]` — where to go, directions, who to ask for — for couriers and contractors who have no account. The route prefix is already reserved in `lib/public-routes.ts`. |
| **done** | Configurable visit questions per product, with an editor. `CrmQuestionSet` / `CrmQuestion`, seeded from a template on first use; the designer is CRM settings → Site visit questions. See [site-visit-questions.md](./site-visit-questions.md). |
| todo | Photographs against a question, captured on site. The schema is there (`CrmSiteVisitPhoto` hangs off an answer, `requiresPhoto` marks the questions that want one) and the capture UI is not. |
| todo | Offline capture for visits. The unique keys the outbox needs already exist — `(companyId, clientVisitId)`, `(sectionId, questionKey)`, `(companyId, clientPhotoId)` — so this is registering a module, not a migration. |

## After the job

| | |
|---|---|
| todo | Client sign-off and feedback when a job is done and its invoice is paid. Route prefix `/s/[token]` reserved. |
| todo | Signature capture on sign-off. |
| todo | Feed feedback into rep performance, so the profile shows what customers said and not only what they billed. |

## Forms and documents

| | |
|---|---|
| todo | High-fidelity form designer on the design system, with starting templates. The intake form builder exists and is plain — it now shares `FieldRow` with the site-visit question editor, so a redesign lands in both. |
| todo | Polished document templates: quotation, invoice, receipt, site brief. |
| todo | Product lead times — branded mats take 3 days — enforced so a quote cannot promise a date the catalogue cannot meet. Needs a `leadTimeDays` on `Product` and a check in the document builder. |

## Getting leads in

| | |
|---|---|
| todo | Facebook lead ads straight into the CRM. There is a public webhook (`/api/public/crm/webhook/leads`) and an intake token; this is a channel mapping and a signature check on top. |
| todo | Other online sources — ads, marketplace scraping. Worth scoping separately: scraping third-party sites has terms-of-service exposure that a webhook does not. |
| todo | Connect mailboxes so invoices and quotes send from the company's own address and replies land on the record. |
| todo | Follow-up on quotations as a first-class queue rather than a generic task. |

## Projects and money

Shipped 22 Sep from James's email. See [projects-and-money.md](./projects-and-money.md).

| | |
|---|---|
| **done** | Projects, as the thing a job belongs to when work runs past a day. Raised from a job in one press. |
| **done** | Per-project cost rollup: approved, outstanding, spent, against budget. |
| **done** | Requisitions with approval, disbursement and acquittal kept apart. `projectId` nullable, because fuel and airtime belong to no project. |
| **done** | Daily cost log per person per day, offline-idempotent, closed by the person who kept it. |
| **done** | Daily report per person, assembled from records and sent to management when the day is closed. |
| todo | Post requisitions and cost entries into the ledger. They are recorded in the CRM and nothing writes a journal yet — the figures are right, the accounting integration is the next piece. |
| todo | Receipt photographs on a cost entry. `receiptUrl` / `receiptPathname` are on the row and the upload control is not; the report already counts spends without one. |
| todo | Multi-currency. Every amount carries a `currency` and every total assumes they match. |
| todo | A project's own document set — quotes and invoices raised against the project rather than the deal. |

## Records

| | |
|---|---|
| todo | Gender on a person. Trivial column plus a select. |
| todo | Location on a person and a company beyond the address line — the same pin the site visits want. |

## Reporting

| | |
|---|---|
| todo | Graphs on performance. The rep profile shows numbers; the ask is a shape over time. `lib/crm/reports.ts` already buckets by period, so this is a chart component and a route, not new analysis. |

## Documentation

| | |
|---|---|
| todo | A CRM manual for the people using it — not API docs. Best written once the flows above settle, or it documents a moving target. |
| **done** | Developer notes for the two areas that shipped 22 Sep: [site-visit-questions.md](./site-visit-questions.md) and [projects-and-money.md](./projects-and-money.md). |
