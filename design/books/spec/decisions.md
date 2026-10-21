# Decisions, with the owner's words

Read before arguing with the design. Newest last.

| Date | Owner's words | What it decided |
|---|---|---|
| 6 Oct 2026 | Books is designed "for the web", not as a phone app | Desktop first at 1440; phones get the owner's glance and approvals only |
| 6 Oct 2026 | Books is never on its own; it is the finance dashboard for Corelith customers, turned on as an add-on, integrated with retail and CRM | Books pieces live inside CRM, Retail, Payroll and Reports (`integrations.md`) |
| 6 Oct 2026 | "solid direction. keep it" | The integrated web direction carried into the full design |
| 18 Oct 2026 | Move the whole Accounting master into Books. Books core handles all money across CRM, retail, stock, maintenance, HR and payroll even when the module isn't enabled, free. Customers pay only for the Books screens. No accounting degree needed, yet fit to hand to an accountant. Voids, rollbacks, permanent delete and editing posted records for owners and superusers | Core and screens split (`books.md`, Tiers); void, revise and delete posted (`books.md`, Lifecycle) |
| 19 Oct 2026 | "Move it into its own artifact and we will design it fully. Including its integrated components that show up in other modules like CRM, Retail, Payroll, Reports etc." "The direction you are going is good. I need you to optimize on density." | The Corelith Books canvas; the density rules (`books.md`, Density) |
| 19 Oct 2026 | "screens is $10 per month and Accounting advanced is only available on the $99 plan." | Three tiers. Advanced read as Tax, Close the month and Ledger (to confirm, `open.md`) |
| 19 Oct 2026 | "an accountant is given the same rights as owner if they are an outside user. we need this for auditors. however internal accountants cannot void." | Outside accountant as a kind of user with the owner's rights and an end date. Staff accountants never void, revise or delete posted documents. The per-person void grant is gone |
| 19 Oct 2026 | "ui must be always edge to edge", "dont leave this gaps", "why is the main content centred?" | Edge to edge everywhere: no inset cards, no gutters, nothing centred (`books.md`, Density) |
| 19 Oct 2026 | "your designs lack icons... create an icon pack, similar to nucleo icons... for every sidebar item, every primary actions and anything that is a noun" | Corelith UI icons v1, 188 icons (`icons.md`) |
| 19 Oct 2026 | "I prefer filled icons, or duotone ones... over 500 icons... efficient. They are good to reduce information density" | v2 of the pack covers the whole platform, fill duo by default. Not built yet |
| 20 Oct 2026 | "All your tables when it just come to 2 rows, the UI gets broken." | One line per row; second facts inline and muted |
| 20 Oct 2026 | "Why are you explaining all of this to the user. The UI and UX must always speak for itself unless its impractical" | No explanatory notes on app screens; only warnings and refusals with their action |

Standing rules from earlier Corelith work that apply here: British English, sentence case, no uppercase except allowed codes; every table is the worksheet; every primary action has a key; the assistant is Vane, never "AI"; Vane proposes, a person presses the button, enforced on the server.
