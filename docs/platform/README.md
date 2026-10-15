# Building on Corelith

How work gets done in Corelith by anything other than a person clicking through a screen: Vane today, partners' integrations next, and what the marketplace offers a workspace to install. Read this first, then the page for what you are building.

| Page | Read it when you are |
| --- | --- |
| [operations.md](operations.md) | adding something Corelith can do, to a product, so Vane and integrations can use it |
| [integrations.md](integrations.md) | building something that does work in Corelith: Vane, or a partner's app |
| [marketplace.md](marketplace.md) | publishing an integration, an add-on or a template (a form, a report, a document layout) for workspaces to install |

## The three layers

Corelith grows in layers, each working end to end before the next starts (`AGENTS.md`).

1. **Operations** (built). Each product publishes what it can do as operations: "Create a quote", "Record a payment against an invoice", "Create a promotion". An operation names its inputs, makes the same checks the app's own screen makes, and runs the product's own code as a person. It is the one way anything outside a product's screens changes that product's records.
2. **Integrations** (built for Corelith's own; partners' next). An integration is anything that does work through operations. Vane is the first: it proposes operations on its cards and in its answers, and each waits for a person to approve it. The definition is shared: an integration names the operations it uses, and nothing else is offered to it. Partners' integrations, reaching operations over an API with a token a workspace grants, are the next layer ([integrations.md](integrations.md), "Partners' integrations").
3. **Marketplace** (Corelith's own listings built; publishing next). Management → Marketplace lists what a workspace can add: Corelith's report templates, document layouts and add-ons. Partners publishing integrations, add-ons and templates there is the third layer ([marketplace.md](marketplace.md)).

## What exists now

- `lib/operations/`: the `Operation` type, `routeGate`, the registry (`OPERATIONS`).
- `lib/<product>/operations.ts`: each product's operations. 28 today: Books 6, CRM 11, Retail 5, Assets 2, Reports 1, Schools 1, People 1, and Vane's own 1.
- `lib/integrations/`: the `Integration` type, `operationsFor`, the registry (`INTEGRATIONS`, Vane only).
- `lib/vane/integration.ts` and `lib/vane/actions/engine.ts`: Vane as an integration, proposing operations and running them once a person approves.

## What does not exist yet

Said plainly, so nobody builds against it:

- **No partner can call Corelith.** There is no API token for operations, no install record, and no webhook out. The only key Corelith issues today feeds leads into the CRM (`app/api/public/crm/webhook/leads`).
- **No partner can publish to the marketplace.** Every listing is made by Corelith, and add-ons are switched on by Corelith's operators.
- **No template moves between workspaces** except Corelith's own starting points, which are kept in code.

[integrations.md](integrations.md) and [marketplace.md](marketplace.md) each end with the design for their next layer and the order to build it in.
