# Ledger: Corelith build and reporting

| Date | Screen | Proposed | His words | Lesson |
| --- | --- | --- | --- | --- |
| 7 Oct 2026 | whole | Forms builder, insights and a steps-over-SQL report | "All this coupled with existing reporting features, building your own. Inspired by Retool" | Reports are boards built in the same builder: blocks on a canvas, each reading a question; Corelith's own reports are the starting points ("Make it yours"). Marked ignores: T7 on SQL (code is not prose), D1 on the board table (the shell carries the footer), L3 on tables inside blocks |
| 11 Oct 2026 | builder, board, list | Palette, canvas, inspector and a bottom panel; cards for every block; blue spread across bars, tags and tints | "the ux is bad. its not intuitive and is cluttered. color usage is 4/10 and so is space usage"; reporting is a module in almost every vertical and must extend to document forms and the document designer, all on the same base | One base for forms, reports and documents: top bar, outline with one Add button, the thing in the middle, one panel on the right with the same three tabs (the selected item, Data, Settings). No palette, no bottom panel. Blue only for selection, the primary action and bound data. Verticals change the catalogue and the starters, never the base |
| 11 Oct 2026 | shell | — | "merged with the multi level sidebar design in corelith" | Rail of modules, then the module panel (title, search, items, saved views, groups, Help and Management at the foot). S3 ignored on brand-mark tiles: a real mark keeps its own white tile in dark |

## 11 Oct, Claude and management
- Claude sits in every module the same way: an Ask Claude button in every top bar (Ctrl J), one panel on the right. It reads through the same read-only SQL as Reports, lists what it read, shows the SQL it ran, and drafts. A person sends, saves or changes.
- Management follows the live app's tree (People, Operations, Shop, Compliance, Company, My account) drawn with the clean sidebar. A new Apps group holds Billing (your apps), Integrations, Marketplace and Claude.
- W1 ignored on "Inspections" in Management: it is the compliance module, not a site visit.
- Prices on Billing (CRM $59, Tender $37, Payroll $19, Stock $15, 2,000 Claude questions a month) are placeholders until Tatenda sets them.

## 11 Oct, Vane replaces Claude in the product
- Tatenda: "Its not claude, name our own internal AI... be proactive, suggesting actions... breaking down things... raising issues... a live assistant that is always working."
- Named Vane (a weather vane reads which way things are moving). Mark: ink tile, white vane arrow. Sits with Keel, Seal, Silo, Shift.
- Vane is always working: a live dot, what it is doing now, issues and suggestions it raised, plans it broke down, what it finished overnight. It speaks in "let's"; the button names the act. Sending, paying, saving and changing stay with a person.
- Vane has its own place in the rail, a button in every top bar with its count, and a panel that opens in any module. Claude is named once, in Management, as what Vane runs on.
- Every primary action carries a keyboard shortcut (Tatenda, 11 Oct): New N, Edit E, Publish Ctrl ↵, Send S, Upload U.

## 20 Oct, Books P5b: the engine is always on, the screens are the add-on (D1)
- `accounting.core` is the books engine: on in every workspace, never switched off by a flag or a template (`alwaysOn` in the catalogue). `books.screens` is the Books pages, sold as the add-on `ADDON_BOOKS_SCREENS`; every tier and template that carried the engine's bundle carries it, and the D1 migration granted it to every workspace that had accounting on 20 Oct (owner's default 1, books-final §9).
- The payroll-only seam is gone: `postPayrollRun` no longer checks `accounting.core` and posts every approved run through `postMoney`. `postingSkippedReason` stays for a run that really could not post (no lines, a missing rule or account). This reverses the deliberate seam in `feature-dependencies.ts` (books-final §1.1).
- The finer `accounting.*` keys do not depend on `books.screens`, though §1.2 says they would: Management's setup pages, the till's fiscal routes and the module screens call `/api/accounting/*` through them, and those must stay open without the screens. The screens are gated by address instead (`booksScreensKeyForPath`): every `/books/*` page (Takings keeps its retail gate) and every `/api/books/*` route except the core's undo routes, the accountant export, Management's setup reads and the panel's counts.
