# Ledger

Every correction from the owner, newest first. Where his words were written down they are quoted; where only the session record kept the gist, the row says "summarised".

| Date | Screen or component | Proposed | His words | Lesson |
|---|---|---|---|---|
| 15 Oct | People and payroll | Build section 2 of routes.md next: Everyone, a person, Time off, the pay run, disbursements, returns, the phone payslip, Pay and statutory | Summarised: skip People and payroll for now. | Not built; its boards, routes and shortcuts wait, and the checks leave out Management's Pay and statutory. It heads the next steps in the handover. |
| 15 Oct | `/vane` Plans and Muted | Our own screens: a plan that waits for Start, then runs step by step, and Muted asking to stop a kind of card (with a `VaneCardChoice` table and `VanePlanStatus.WAITING`) | Summarised: discard ours; keep main's Vane work (`claude/vane-modules`). | Where main already has the feature, ours goes, schema and all: Muted's Stop it for me is `VaneTopicStop`, Vane's steps move by `update_plan_step`, a person ticks their own. One engine per feature. |
| 14 Oct | Top bar Vane button | The boards' Vane button and Pause Vane in every top bar, beside Vane's mark in the rail | "no need for two triggers" (summarised: the top bar was crowded) | Vane is in the rail only: its mark opens the panel, Ctrl J opens it at the box, Pause is in the panel's head and Management → Vane. The checks leave the top-bar button out. |
| 14 Oct | Vane panel | The board's panel: cards only, in the kit's neutral look | Summarised: the panel's conversation should follow Claude's (plain answers beside the mark, the person's words in a bubble, one rounded composer), with a chat below the cards; each product takes its own hue. | The panel has a chat and the conversation look; Books, CRM and Tender each take a categorical hue on cards, actions and suggestions. Issues keep the warning tone. |
| 14 Oct | Build | Forms and Documents in Reports' panel, as ReportsAll draws them | Summarised: Build is a module of its own. | Build is its own rail module after Reports; the Reports boards' Build group is left out of their checks. |
| 14 Oct | Monday board (a custom report) | Its SQL counted every won visit as accepted, a $0.00 one too, and showed the deal's outcome as the state | Summarised: go ahead and fix the workspace's report. | Saved through the custom report API as James: accepted is a drafted quote whose deal was won; State reads No quote, Drafted or Accepted. A change to someone's saved data waits for a yes. |
| 14 Oct | Payroll | Disciplinary penalties kept on HR's record only | Summarised: a penalty HR marked deducted comes off that period's net pay. | Taken after every statutory deduction, capped at the net pay left, never in a statutory return; no migration. |
| 14 Oct | Notifications (bell, /activity, settings) | The NotifyBell and NotifyActivity boards: cards with badges, a worksheet table | "Please redesign the Notifications UI. I need something more compact, minimalistic and gets the idea across easy. I want the notifications to also be rich, showing clearly what they concern. Yet they must follow the idea of Claude UI components. They have only what's needed; everything else you drill down." | One quiet row per notification (who, one sentence, a small concern chip, the time); detail one level deeper in a drawer. This replaces NotifyBell and NotifyActivity as the target. |
| 12 Oct | Vane migration | Tables and reader roles, waiting for a yes | "yes with vane. yes you can merge" | Model and permission changes wait for an explicit yes; then ship with a witness test. |
| 12 Oct | Older boards | Restyled only (colours, type, icons) | "Build them all" | Restyling is not done; every board uses the reference markup. |
| 11 Oct | Explore, Reports, Insights, builders | Explore inside Reports; fixed panels | "the explore destination becomes the studio for power users and gives them controlled and guarded access to their workspace data through sql. it lives in its separate explore sidebar destination, then reports are their own, and then insights. if possible we could combine reports and insights. the panels in builder pages must be resizable." | Explore is its own place on the rail; Reports & Insights is one destination; every builder panel resizes. |
| 11 Oct | Whole canvas | Earlier canvas styles | "Use the design in that artifact, replace everywhere possible on our Huchu Core Modules" (the reference canvas) | One reference design everywhere; no second style. |
| 11 Oct | Vane build | Building Vane end to end | "pause. carry out only the basic integration of anthropic api" | Ship the smallest piece asked for, then stop. |
| 11 Oct | Headline figure cards | Plain cards | "does not follow the design system established in retail. The cards with headline figures need color and typographic structure" | Figure tiles follow the retail data tables system. |
| 11 Oct | Module panel | Management link on the panel's foot | Summarised: take Management off the panel foot; the gear opens it. | Management lives behind the gear only. |
| 11 Oct | Right-hand panes | Tinted panes | Summarised: right-hand panes are white. | Side panes sit on the surface colour. |
| 11 Oct | Boards | Captions and tags on boards | Summarised: remove captions and tags. | Boards carry no decoration a screen would not. |
| 11 Oct | Tables | Mixed table styles | Summarised: use the retail data table. | One table component. |
| 11 Oct | Headlines, Vane cards | Busy headlines; dense cards | Summarised: headlines were cluttered; Vane cards too dense. | One fact per headline; a card is kind, headline, one or two sentences, one button. |

## Standing rules from the owner

- Vane is never called AI or an assistant; Claude is named once, on Management → Vane.
- Propose the tables and the `vane_reader` role as a migration and wait for a yes (done: yes given 12 Oct). Keep the Anthropic key on the server; read the model from `VANE_MODEL`.
- British English, sentence case. Every primary button shows its shortcut.
- Never put a model identifier in commits or pull requests.
- 13 Oct, on a slug column for custom reports and a column for Send it's "Only when something changed": "no to both". Custom reports keep their id in the address; the switch is not built.

## Deliberate breaks

| Where | Rule broken | Reason |
|---|---|---|
| Tender theme (retail) | One accent | Retail workspaces take the Tender look; colours come from the theme. |

## Switches turned on in rules.json

| Switch | Reason |
|---|---|
| None | |

## Lint findings silenced in the markup

| Where | Rule | Reason |
|---|---|---|
| The workspace tile in the rail (`components/layout/account-menu.tsx`) | T5 | One letter in a square tile; the lint reads the tile's height as a wrapped label. |
| Management's Inspections row (`lintIgnore` in `lib/settings/management-nav.ts`) | W1 | Safety inspections under Compliance, not a visit to a customer's place: renaming them "site visits" would be wrong. 15 Oct. |
| The paper in Branding's preview and Where it shows (`components/management/branding/quote-preview.tsx`, `where-view.tsx`) | T2, T3, W3 | The document drawn as the renderer prints it, in the paper's own sizes and weights, on the sample quote every template preview uses. The app's scale does not apply to the paper. 15 Oct. |
