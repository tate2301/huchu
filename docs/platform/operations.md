# Operations: what Corelith can do

An operation is one named thing a Corelith product can do, published so that Vane and integrations can do it too: "Create a quote", "Record a payment against an invoice", "Change what a person may do". It is the only way anything outside a product's own screens changes that product's records.

Every operation:

- **runs as a person**, with their role, their permissions and the parts of Corelith their workspace has. Nothing runs as "the system";
- **makes the checks the app's own screen makes**, and the product's further ones (who owns the record, the CRM capability, the retail permission);
- **runs the product's own code**, the same function its route calls. Never raw SQL, and never a second copy of the logic;
- **says what happened in a line a person reads**, and links to the record it made or changed.

The code is in `lib/operations/` (the type, the route gate, the registry) and in each product's `lib/<product>/operations.ts`.

## The catalogue

| Product | Operations |
| --- | --- |
| Books | `books.invoice.due_date`, `books.invoice.reminders`, `books.bank.accept`, `books.invoice.from_quote`, `books.invoice.issue`, `books.invoice.discard` |
| CRM | `crm.task.create`, `crm.deal.stage`, `crm.lead.stage`, `crm.owner.assign`, `crm.note.log`, `crm.quote.create`, `crm.invoice.create`, `crm.receipt.record`, `crm.lead.create`, `crm.email.send`, `crm.document.email` |
| Retail | `retail.shift.look_into`, `retail.order.draft`, `retail.order.send`, `retail.order.chase`, `retail.promotion.create` |
| Assets | `assets.work_order.raise`, `assets.work_order.discard` |
| Reports | `reports.template.save` |
| Schools | `schools.fees.remind` |
| People | `people.permission.set` |
| Vane | `vane.plan.tick_step` |

`lib/operations/registry.test.ts` checks every one of them: a unique key under its product, a name, a risk, inputs that read as JSON Schema, and fields among those inputs.

## Anatomy

```ts
// lib/crm/operations.ts
const quote = {
  key: "crm.quote.create",            // product.record.verb, unique
  name: "Create a quote",             // for lists, permission screens and the marketplace
  risk: "change",                     // change | send | money | access
  product: "crm",                     // the product it acts in: its colour and icon in Vane
  description: "Write a quote on a deal or lead, line by line…", // when to use it and what it does
  input: z.object({ … }).refine(…),   // checked when proposed, and again just before it runs
  fields: [                           // what a person may change before it runs
    { name: "validUntil", label: "Holds until", type: "date" },
    { name: "notes", label: "Notes for the client", type: "text", multiline: true },
  ],
  verb: () => "Create the quote",                         // the button
  title: (p) => `Quote ${p.record}: … ${money(total)}`,  // what it will do, in a line
  target: (p) => `/crm/deals/${p.dealId}`,               // the page it acts on
  authorize: (actor, p) => recordGate(actor, p, "documents.issue"),
  async run(actor, p) {
    const made = await asCrm(() => createQuotationForLead({ companyId: actor.companyId, userId: actor.userId, … }));
    return { said: `${made.quotationNumber} is ready for ${p.record}…`, record: { id: made.leadDocumentId, href: `/crm/quotes/${made.leadDocumentId}` } };
  },
} satisfies Operation<…>;
```

### key, name, product

`product.record.verb`, lowercase, with underscores inside a word: `books.invoice.due_date`. The key never changes once published: integrations name it, and proposals keep it.

### risk

What it risks decides how much a person must see before it runs, and which integrations may be trusted with it.

| Risk | It… | Examples |
| --- | --- | --- |
| `change` | changes records inside the workspace | a stage, a task, a draft, a quote not yet sent |
| `send` | reaches someone outside the business | an email, a WhatsApp, an order sent to a supplier |
| `money` | records or moves money | an issued invoice, a receipt, a bank match |
| `access` | changes who may do what | an owner, a permission |

### description

Written for two readers: a developer deciding whether to use it, and Vane deciding when to propose it. Say when to use it, what it does, what it refuses, and what to do first ("Look for the person first: one already there is not added twice"). Name the ids it needs and where they come from ("invoiceDocumentId, the invoice's CrmLeadDocument id").

### input

A zod object, top-level (an integration's tool takes only an object). Name the records by id, and carry the words a person needs to read the line: `record: "Pomona Offices, fit-out"` beside `dealId`. Validate as the route validates: the operation is checked before it runs, and a refusal is a sentence.

### fields and pageFields

What a person may change before it runs, drawn on Vane's card: `date`, `text` (with `multiline`), `number`, `select`. Everything else stays as proposed. Which invoice, which customer: never a field. `pageFields` are changed only on the operation's own page (`target` with its id): the families a fee reminder goes to.

### authorize

Returns why this person may not, or null. Make every check the app's own route makes, in two parts:

1. `routeGate(actor, path, method)`: their role may use the route, and the workspace (and this person) has the part of Corelith it belongs to. Name the app route the screen itself calls.
2. The route's own further checks, which `routeGate` does not make:
   - CRM: `canEditRecord(actor.session, record.assignedToId)` and `canUser(actor.session, capability)`, as `recordGate` in `lib/crm/operations.ts` does;
   - Retail: `canRetailSessionDo(actor.session, resource, action)`;
   - Schools: `schoolPermissionDenial(...)`;
   - People: the rules in `lib/platform/change-permission.ts`.

It may be async. The engine calls it just before `run`, after the inputs are checked again.

### run

Calls the product's own function, the one its route calls. When that logic is still written inline in a route handler, move it into `lib/<product>/` first, and have the route call it too (`lib/crm/create-lead.ts`, `lib/platform/change-permission.ts` were moved this way). Two copies drift.

Throw `OperationRefused` with a sentence a person can act on ("That deal is someone else's, and you can change only your own."). Map the product's own refusals to it (`asCrm`, `asRetail`). Anything else is a fault: it is logged, and the person reads "It did not work".

Return what happened, as a string or `{ said, record: { id, href } }` when it made or changed one record. Integrations use the record.

### actor

```ts
type OperationActor = {
  companyId: string; userId: string; role: string;
  session: AuthenticatedSession;    // features and permissions
  requestUrl: string;               // for links module code builds
  via: { kind: "person" } | { kind: "integration"; integration: string };
};
```

`via` says how it reached the person: through Vane (`{ kind: "integration", integration: "vane" }`), or later through a partner's integration.

## Adding one

1. Find the product function the screen calls. If the logic is inline in a route, move it into `lib/<product>/` and point the route at it.
2. Write the operation in `lib/<product>/operations.ts` and add it to the product's `…_OPERATIONS` list. A new product's list goes in `lib/operations/registry.ts`.
3. Test it against the test database, run as a person would (`lib/operations/new-operations.db.test.ts` shows how): the inputs parsed, `authorize`, then `run`. Test the happy path, the product's own refusal, and a person who may not (a rep on someone else's deal).
4. Run `lib/operations/registry.test.ts`. It fails on a key out of shape, a field that is not an input, or inputs that do not read as JSON Schema.
5. Vane can now propose it: it is shown every operation its integration names, with its description and inputs. Say in the description when Vane should propose it.

## Rules that never bend

- An operation runs as a person, and refuses what they could not do on the screen.
- It runs the product's own code. No raw SQL, no second copy of the logic.
- A `send`, `money` or `access` operation never runs without a person seeing it first. Today every operation waits for a person (Vane's `on-approval`).
- It never reads or writes credentials: passwords, API keys, tokens, webhook secrets.
