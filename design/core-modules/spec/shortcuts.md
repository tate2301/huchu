# Shortcuts

Every primary action has a shortcut, shown inside its button. Single keys work when focus is not in a text box. On macOS, Ctrl reads as ⌘.

| Key | Action | Where |
|---|---|---|
| Ctrl K | Search everything | Every top bar |
| Ctrl J | Give Vane a job (opens the Vane panel on its box) | Every page |
| / | Search this panel, or add a block in the builder | Module panels, builder outline |
| N | New (invoice, report, job grade…) | Any page whose primary is New |
| E | Edit | A report |
| E | Export | A report from Corelith |
| M | Make it yours, or Make a copy | A report from Corelith, or one you cannot edit |
| I | Issue | Books, a draft invoice |
| S | Send (the focused Vane card's send action) | Vane panel, For you, a Vane card, a quote's Vane rail |
| K | Keep (a change Vane proposes) | Build, a form's Vane tab |
| U | Upload a statement | Books, Bank |
| Ctrl ↵ | Upload (the statement chosen) | Books, Bank, Upload a statement |
| R | Retry all | Books, Needs posting |
| E | Add or revise the opening balances | Books, Settings, Opening balances |
| Ctrl ↵ | Map and retry, or Post in this month (the chosen posting's fix) | Books, Needs posting |
| Ctrl ↵ | Publish | Builders |
| Ctrl ↵ | The drawer's primary (Post, Prepare, Send, Save) | Drawers and sheets |
| P | Preview, and back to Build | Builders |
| Ctrl S | Save | Report builder, Build's builders, Branding, an Explore question |
| J, K | Next and previous | Activity |
| E | Mark as read | Activity |
| ↵ | Open what it is about | Activity, a notification |
| Esc | Clear the selection, close a panel | Tables, Vane panel |

Rules:

- A new screen with a primary button picks a key that isn't taken on that screen and adds it here.
- The key shows in the button (`kbd` slot) and in the button's `aria-keyshortcuts`.
- Shortcuts never fire while a dialog is open unless the dialog owns them.
- `components/core/shortcuts.test.ts` checks that every row here has its binding. A new row needs its binding there too.
- People and payroll are not built yet (skipped for now, 15 Oct). Their keys join this table when they are.
