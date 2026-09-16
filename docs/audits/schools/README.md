# Schools vertical audit (September 2026)

An audit of the Huchu schools vertical against three yardsticks: its own documentation, a capability list drawn from established K-12 school management systems, and the platform's stated future plans. It covers the three back-office dashboards (admin, head, bursar) and the three external portals (student, staff, parent). Each surface has two documents: one on workflows and functionality, one on UI and UX for those workflows. Every document ends with suggested edits, proposed restructuring, and proposed new workflows or features.

Audit date: 2026-09-14, on `main` at `01de8a3`. Revised 2026-09-15, after the implementation described below. Method: a static reading of the code and documentation plus the existing screenshot sets, followed by a runtime pass against a locally seeded database (St Marys High School demo tenant) that re-checked the main findings as each persona and ran the schools test suites. The runtime results, with corrections to the static pass, are in [reference/runtime-verification.md](reference/runtime-verification.md); 34 of 42 browser checks confirmed the static finding, 2 refuted it. PDF renderings of every document are under `pdf/`.

**The audit was then acted on.** Eighteen commits followed it, and every document below says which of its findings are now fixed, which are still open, and — in three places — where the audit itself was wrong. Nothing has been deleted: what was wrong is the part worth keeping. The state of the work is summarised under "What has been fixed" below.

## Documents

| Surface | Workflows | UI/UX |
|---|---|---|
| Admin dashboard (setup and master data; tenant admins, SCHOOL_ADMIN, REGISTRAR) | [admin/workflows.md](admin/workflows.md) | [admin/ui-ux.md](admin/ui-ux.md) |
| Head dashboard (governance and oversight; SCHOOL_ADMIN, HOD, WARDEN) | [head/workflows.md](head/workflows.md) | [head/ui-ux.md](head/ui-ux.md) |
| Bursar dashboard (fees and finance; BURSAR) | [bursar/workflows.md](bursar/workflows.md) | [bursar/ui-ux.md](bursar/ui-ux.md) |
| Student portal (`students.<tenant>`) | [student-portal/workflows.md](student-portal/workflows.md) | [student-portal/ui-ux.md](student-portal/ui-ux.md) |
| Staff portal (`staff.<tenant>`, the teacher portal) | [staff-portal/workflows.md](staff-portal/workflows.md) | [staff-portal/ui-ux.md](staff-portal/ui-ux.md) |
| Parent portal (`parents.<tenant>`) | [parent-portal/workflows.md](parent-portal/workflows.md) | [parent-portal/ui-ux.md](parent-portal/ui-ux.md) |

Reference material:

- [reference/docs-baseline.md](reference/docs-baseline.md): what the documentation claims, plans and sells, and thirty-four places where the documents contradict each other. Produced before any code was read.
- [reference/k12-benchmark.md](reference/k12-benchmark.md): the capability list of mature K-12 systems (PowerSchool, Arbor, iSAMS, Veracross, Fedena and others) with Zimbabwe-specific additions, used to grade each surface.
- [reference/runtime-verification.md](reference/runtime-verification.md): environment, test results, the 42 browser checks with verdicts, corrections made after the runtime pass, and the runtime screenshot set.
- [reference/backoffice-workflows-evidence.md](reference/backoffice-workflows-evidence.md), [reference/portal-workflows-evidence.md](reference/portal-workflows-evidence.md), [reference/backoffice-ui-ux-evidence.md](reference/backoffice-ui-ux-evidence.md), [reference/portal-ui-ux-evidence.md](reference/portal-ui-ux-evidence.md): the raw page, API, model, rule and screenshot findings with file and line references.

## How to read the verdicts

Workflow status uses four words. Implemented means UI, API, database, permission check and audit where the action is sensitive. Partial means it works with a named gap. Broken means the user reaches a refusal or a dead end. Missing means absent. Priorities are P0 (blocks a core job, breaks the contract, or misleads), P1 (friction on a core job or a rule breach met on every visit), P2 (polish).

## The shape of the system

The roadmap (`docs/expansion-plan/schools-roadmap.md`) has 127 stories: 84 done, 40 todo, 1 in progress, 2 parked. Everything in Iterations 7 (messaging and payments), 8 (offline) and 9 (head dashboard, notifications, board pack) is todo. The code is broader than that count suggests in some places (notice compose, an office message channel, a head overview) and narrower in others (several `done` portal stories are broken for their user). The money core is the strongest layer: transactional, Decimal, dual-currency, DB-constrained, audited, posted to the ledger, fiscalisable, and well tested. The setup layer is complete but hard to reach. The governance layer works but is not transactional or audited where it matters. The portals are real and correctly scoped but thin, and the sign-in and communication story that would make them self-service does not exist.

## Cross-cutting findings

These recur in most of the twelve documents and are best fixed once.

1. **The role model breaks working features.** `schools.reports:create` belongs only to SCHOOL_ADMIN, yet notices and office-inbox replies are guarded on it, so the bursar cannot send a fee reminder and the HOD cannot answer a results query. TEACHER lacks the grants behind two of its own portal buttons (open a parents' evening, "tell the family"). PARENT cannot call the document render route, so every portal download fails. Welfare is gated as boarding, so day schools have no health records. One mutating route (`PATCH /guardian-links/[id]`) has no persona check at all. The fix is a small set of new verbs (`notify-families`, `reply`, `book-meeting`, a `schools.welfare` resource, a portal branch in the render path), not blanket grants. **Fixed.** Four verbs (`notify-families`, `reply`, `book-meeting`, `lock`) and a `schools.welfare` resource; guards repointed; the guardian-link PATCH gained its check; the render route gained a portal branch. The teacher deliberately did not get `lock` or inbox `reply`.
2. **The register never leaves DRAFT from the staff portal.** There is no submit control, so the office board shows every class as unsubmitted and the parent app labels every day "not yet submitted". One button and one state chip fix the most visible defect in the product. **Fixed.** Save writes the marks, then submits. A submitted register stays its teacher's to correct; only the office locking it stops that.
3. **Unpublished marks leak to pupils** through the student subjects and goals routes, which do not filter on `PUBLISHED`. A one-line fix each. **Fixed.** One shared helper enforces PUBLISHED across all three routes. A publish-window check was added alongside it and then reverted: no school has a window configured, so it would have hidden every published mark from every family.
4. **Money-flow control gaps.** A draft receipt can never be posted; one bursar can create, approve and apply a scholarship; GL posting runs after commit with failures only logged; a fiscalised receipt can be voided locally; draft invoices take allocations. None of these is hard; all of them matter to an auditor. **Fixed.** The draft receipt path is gone, waiver approval and application are separated, a fiscalised receipt cannot be voided, allocation is ISSUED-only, and every fee document now records whether its journal entry exists — which showed 120 issued invoices on the seeded tenant with no ledger entry at all.
5. **The shipped sidebar is the wrong one.** `lib/workspaces.ts` overrides the eleven-band definition in `lib/navigation.ts`, drops sixteen working routes including all master data, shows a meaningless top-level "Whole school" item, and its only academic-setup entry redirects into the teacher portal. Generate the sidebar from one source and filter bands by persona. **Fixed.** The rail is generated from `lib/navigation.ts`, filtered by persona, with master data in a Setup band and per-persona landing pages. Band icons were added, without which Fees opened with a warning triangle.
6. **Screens name themselves two or three times and repeat their counts.** Twenty-five pages draw an in-page heading under an app bar that already says the name; fourteen repeat band chips in tabs or stat cards; ten have two search boxes. On a phone, the ledger, results and attendance pages show no record on the first screen. **Mostly fixed.** Rationale and duplicate cards are gone from ten back-office screens, each names itself once, and the portals were rebuilt. A full Title Case sweep across every remaining screen is still open.
7. **Rationale prose ships as product copy.** Seven back-office screens carry cards such as "Every row is a dead end" and "That was the fault this board was built to fix"; the student settings screen tells a child "Three things from the design are not here yet". Move it all to comments or docs. **Fixed.** Removed from every screen named here, including the student settings alert.
8. **Row verbs are clipped off the right edge** on every fee screen (28 of 49 buttons past the viewport on the class fees page at runtime) and on admissions and welfare, at every width; teachers and guardians showed the same in an earlier screenshot set. `layout="menu"` on `RecordActions` fixes it. **Fixed** on fees, admissions and welfare: one inline primary per row, the rest in a menu. The phone ledger also gained a row renderer, and an invoice gained the "Take payment" verb it never had.
9. **Three ageing computations.** The finance overview, the reports page and the dashboard each bucket arrears in their own code with their own labels. On the seeded tenant they agree; in an earlier screenshot set they showed the same $3,920 in different buckets. One service, one component, so they cannot drift. **Fixed, and the finding understated it.** There were four computations, not three, and they did not agree: the finance overview called a bill due today overdue while the arrears report called it current. One service now owns the boundaries.
10. **No channel.** Notices, reminders, invites and results publication are in-app only, and families without a claimed account are counted and dropped. Guardians without an email cannot be invited at all. Nothing school-side sends an email, SMS or WhatsApp. Every self-service promise on the marketing site depends on this. **Still open.** Nothing school-side sends an email, SMS or WhatsApp. This remains the largest gap in the product.
11. **No account self-service.** No password reset for any portal or staff user except a SUPERADMIN route; no teacher invite; the student settings "change your password" link is bounced by the proxy; the claim flow can reset an existing account chosen by the inviter. **Still open.** No password reset or self-service for portal accounts. The claim flow's account-takeover path is closed, and the student settings link that the proxy bounced is gone.
12. **The marketing site sells five things the roadmap has not built**: offline registers and receipting, a head's term dashboard, a board pack, multi-campus consolidation, and fiscalised tuck-shop and uniform sales. Branding is both included in Premier and a $79 add-on. The commercial doc itself says not to claim offline. **Still open.** A product and commercial decision, not a code change.
13. **Documentation drift.** The roadmap is six weeks stale with `_pending_` hashes; `live-capabilities.md`, `schools.md` §10, the pack spec, the phase 2 to 5 specs and several open-questions entries describe states that no longer exist. Two design rules conflict (class as navigation vs class as a filter; hidden vs disabled actions) and the UX playbook and the campus canvas law each claim precedence. **Partly addressed.** These documents are current as of 2026-09-15; the roadmap, `live-capabilities.md` and the phase specs are not, and the two design-rule conflicts are unresolved.
14. **Test shape.** The schools suites (34 files, 743 tests) pass and cover the domain well. No browser test records a receipt, publishes results, enrols an applicant, submits a register, or claims an invite; e2e is a page-render sweep, the portal-host rewrite is untested, and the route-guard test checks file-level markers only. **Partly fixed.** Guard coverage is now checked per exported method rather than per file, and the money, marks, scoping, ageing and claim paths gained tests. No browser test yet records a receipt, publishes results or submits a register.

## What has been fixed

Eighteen commits, on a branch built and typechecked at each step; the schools
suites stand at 1,064 tests across 44 files.

Week 1 of the programme below is done: the persona verbs, the register submit,
the `PUBLISHED` filter, all five money-control gaps, the guardian-link check, the
parent document render branch and the claim hardening. So is most of weeks 2 and
3: the sidebar from one source, the rationale copy, the row menus, one ageing
service, the phone ledger, route-level states, and all three portal shells.

Three findings turned out to be wrong, and the documents say so rather than
dropping them:

- The student portal's Help chevron already rotated. The rule exists and
  out-specifies its base; the screenshot behind the finding was taken with every
  accordion shut.
- The bursar was not refused an inbox reply by a permission check. The refusal
  fired before the request body was read, because no reply action existed for
  anybody — the gap was every office role, not one of them.
- The ageing computations were recorded as agreeing on the seeded data. They do
  not agree in general, and there were four of them rather than three.

Two changes were proposed during implementation and deliberately not made, both
recorded in their commit messages: scoping the office by class teaching
assignment, which would have refused a registrar the roll they keep; and gating
the parent marks list on the report card's publish window, which would have
hidden every published mark from every family, because no school has a window
configured.

One new finding came out of the work: the report card requires an open publish
window, and no seeded school has one, so report-card printing throws
independently of the permission failure the audit recorded.

What remains is the layer the audit called the one that makes it a product — a
communication channel, account self-service, in-portal payment — plus the
roadmap's own next iterations. None of it is blocked by anything above.

## A programme, in order

The documents propose many changes; this is the order that pays back fastest.
Weeks 1 to 3 are now done, and are kept here as the record of the sequence.

**Week 1, correctness and access (no design work).** Persona verbs (finding 1); register submit (2); PUBLISHED filter (3); receipt post route, waiver segregation, fiscal-aware void, persist posting outcome, ISSUED-only allocation (4); guardian-link PATCH check; parent document render branch; portal claim hardening. Add browser tests for the money path and the results chain.

**Weeks 2 to 3, the surface sweep.** Sidebar from one source with persona filtering (5); `PageChrome` on 25 pages, one search, one set of chips (6); rationale cards out (7); row menus (8); one ageing service (9); date picker and money formatter sweeps; phone renderers on the ledger, results and attendance; route-level loading and error states. Portal shells: back affordance, side nav above 900px, bell semantics, notice detail, "how to pay" sheet.

**Weeks 4 to 6, the layer that makes it a product.** A communication channel (SMS or WhatsApp) with the `schools` notification category, absence and fee and results notifications, delivered invites and password reset (10, 11). The head's term dashboard and the bursar's dashboard. The staff-portal result-sheet status and messaging start-thread and broadcast.

**Quarter, the roadmap's own next iterations plus what the benchmark says is missing.** In-portal payments and reconciliation (S-7.3, S-7.4); offline register and receipting (S-8.x); board pack (S-9.7); payment plans, discount and scholarship schemes, cash-up and bank reconciliation; behaviour and pastoral (un-park S-P.1); exam management; tenant branding; multi-campus or a change of copy.

**Documentation.** Refresh the roadmap rows named in each document (S-0.6, S-1.2, S-5.1, S-6.7, S-6.8, S-6.14, S-6.34, S-6.55 to S-6.58, S-9.1, S-9.6); retire the pack spec's role and state lists and the phase 2 to 5 specs; close the stale open-questions entries; resolve the two design-rule conflicts and write the decision into `docs/design-system/portals/README.md` and the canvas law; align the marketing bands with what is built or add the missing stories.

## Decisions the audit could not make

- Behaviour and discipline: parked, yet in every benchmark product and every teacher's day. Un-park or state why not.
- Communication channel: WhatsApp Business, SMS aggregator, or web push first. Cost per message decides the design of notices, reminders and invites.
- Payment provider for fees and who bears the fee.
- Register per day or per lesson; who publishes marks (office only, or teachers under rules); HOD moderation by department or by class.
- Welfare as a school feature, not a boarding one.
- Family or student as the billing unit.
- Multi-campus: build it or stop selling it. Branding: included or an add-on.
- Whether schools stay operator-provisioned or get a self-serve setup checklist.
