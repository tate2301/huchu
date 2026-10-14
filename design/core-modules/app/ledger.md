# Ledger

Every correction from the owner, newest first. Where his words were written down they are quoted; where only the session record kept the gist, the row says "summarised".

| Date | Screen or component | Proposed | His words | Lesson |
|---|---|---|---|---|
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
