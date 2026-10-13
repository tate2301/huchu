# Shortcuts

Every primary action has a shortcut, shown inside its button. Single keys work when focus is not in a text box. On macOS, Ctrl reads as ⌘.

| Key | Action | Where |
|---|---|---|
| Ctrl K | Search everything | Every top bar |
| / | Search this panel, or add a block in the builder | Module panels, builder outline |
| N | New (invoice, report, job grade…) | Any page whose primary is New |
| E | Edit | A report |
| S | Send (the focused Vane card's send action) | Vane panel, For you |
| U | Upload a statement | Books, Bank |
| Ctrl ↵ | Upload (the statement chosen) | Books, Bank, Upload a statement |
| Ctrl ↵ | Publish | Builders |
| Esc | Clear the selection, close a panel | Tables, Vane panel |

Rules:

- A new screen with a primary button picks a key that isn't taken on that screen and adds it here.
- The key shows in the button (`kbd` slot) and in the button's `aria-keyshortcuts`.
- Shortcuts never fire while a dialog is open unless the dialog owns them.
