# Integrations: doing work in Corelith

An integration is anything that does work in Corelith from outside a product's own screens. It does that work through [operations](operations.md) and nothing else: no database access, no private routes, no second copy of a product's rules. Vane is the first integration, and the pattern every later one follows.

## The definition

```ts
// lib/integrations/types.ts
type Integration = {
  key: string;        // "vane"; recorded on everything it runs
  name: string;       // "Vane"
  maker: string;      // "Corelith", or the partner who publishes it
  summary: string;    // what it does for a workspace, in a sentence
  uses: readonly string[];  // the operations it may use: keys, a product's ("crm.*"), or "*"
  runs: "on-approval";      // when its operations run
};
```

- **`uses`** is the whole of what an integration can do. `operationsFor(integration)` gives it exactly those operations, and nothing outside them is shown to it or runs for it. Name the fewest that do the job: `["crm.quote.create", "crm.lead.*"]`, not `"*"`.
- **`runs: "on-approval"`**: each operation the integration wants waits for a person in the workspace. They see what it will do, may change its `fields`, and approve or deny it. Approved, it runs as them, through the integration. This is the only mode today, and the one any operation of risk `send`, `money` or `access` will always need.

Integrations are listed in `lib/integrations/registry.ts`.

## Vane, the worked example

Vane is Corelith's own integration (`lib/vane/integration.ts`): `uses: ["*"]`, `runs: "on-approval"`.

1. **What it is shown.** Its `propose_actions` tool lists `vaneOperations()`: every operation its definition names, each with its key, name, description and its inputs as JSON Schema (`lib/vane/tools.ts`, `actionCatalogue`). Adding an operation to a product makes it available to Vane with no change to Vane.
2. **Proposing.** Vane proposes an operation on a card (a `VaneItem`) or in a chat answer. The inputs are checked against the operation's schema, and kept as a `VaneAction`, waiting (`proposeActions` in `lib/vane/actions/engine.ts`). A proposal that does not fit goes back to Vane with why, for it to correct.
3. **Showing it.** The panel draws each waiting action with the operation's `title`, its `fields` to change, its `verb` on the button, and an Open link to its `target` (`components/vane/vane-action-list.tsx`).
4. **Deciding.** `POST /api/vane/actions/[id]` with `{ approve }`. Approved (`decideAction`), the engine:
   - takes only the changes the operation allows (`fields`, `pageFields`);
   - checks the inputs again;
   - runs `authorize` as the approver, with `via: { kind: "integration", integration: "vane" }`;
   - runs the operation.
   Done keeps what happened. Failed keeps why, and can be approved again. Denied stays denied, so Vane does not ask again.
5. **On record.** The action keeps who decided and when; the product's own activity log records the change as the approver's.

Vane's other tools read the workspace through its own read-only database roles (`docs/vane.md`, "What Vane may read"). Reading is not an operation: no other integration is given that.

## Building a Corelith integration

For an integration Corelith ships (in this repository):

1. Write its `Integration` in `lib/<integration>/integration.ts`, naming the operations it uses, and list it in `lib/integrations/registry.ts`.
2. Propose operations the way Vane's engine does: check the inputs with `operation.input`, keep the proposal with who it is for, and show `title`, `fields` and `verb` to a person.
3. Run an approved one only through the operation: `input` again, then `authorize`, then `run`, with `via: { kind: "integration", integration: <its key> }`. The approver is the actor.
4. Missing an operation? Add it to the product ([operations.md](operations.md), "Adding one"). Never reach past it.

Vane's engine is the reference for steps 2 and 3. When a second integration needs the same workflow, move the proposal store out of Vane into `lib/integrations/` rather than copying it.

## Partners' integrations

*Not built yet. This is the design for the next layer, written so the first partner integration and the work to support it agree.*

A partner's app reaches a workspace's operations over HTTPS, with a token the workspace grants when it installs the app.

**Install.** A workspace admin installs a published integration from Management → Marketplace (see [marketplace.md](marketplace.md)). They see the operations it asks for, grouped by risk, and grant them (all, or fewer). The install is kept per workspace: the integration, the operations granted, who installed it, and a token. Only the token's hash is stored, and it is shown once. Management → Integrations lists installs beside the built-in connections, and revokes them.

**Calling.** With `Authorization: Bearer <token>`:

| Call | Does |
| --- | --- |
| `GET /api/integrations/v1/operations` | The operations this install may use: key, name, risk, description, inputs as JSON Schema. |
| `POST /api/integrations/v1/operations/{key}` `{ input }` | Proposes the operation. It is checked against the schema and kept, waiting for a person in the workspace, exactly as Vane's are. Answers `202` with the proposal's id. |
| `GET /api/integrations/v1/proposals/{id}` | Where it stands: waiting, done (with what happened and the record's id and link), failed (with why), denied. |

A person approves a partner's proposals where they approve Vane's, marked with the integration's name. It runs as them, with `via: { kind: "integration", integration: <key> }`. A partner never acts as a person on its own.

**Running without asking** (later, if ever): an install might allow some `change` operations to run without approval, as the person who installed it. `send`, `money` and `access` operations always wait for a person.

**Hearing back.** Events out to the partner's URL, signed with a secret per install, retried with backoff. Examples: an operation it proposed was decided, a quote was accepted. This is built on the outbox shape `AccountingIntegrationEvent` already uses (an event key, attempts, next try).

**Reading.** Partners read through read operations (a quote, a deal, an invoice's balance), added as operations are. They are never given SQL.

**Build order**, each step working before the next:

1. Move the proposal store out of Vane into `lib/integrations/` (a proposal names its integration; Vane's become the first rows).
2. Partners' `Integration` definitions in the database, and installs with granted operations and a hashed token. Revoke in Management → Integrations.
3. `GET /api/integrations/v1/operations`, `POST …/{key}`, `GET …/proposals/{id}`: a token auth strategy beside the session one, scoped to the install's operations, rate-limited per install.
4. Partners' proposals in the panel and its pages, under the integration's name.
5. Signed events out, with retries.

## Rules that never bend

- An integration does work only through operations, and only the ones it names.
- Every operation runs as a person in the workspace. `send`, `money` and `access` never run without one approving.
- An integration never sees credentials, and never reads the database except, for Vane, through its read-only roles.
- Everything an integration runs records its key (`via`), so a workspace can see what each integration did.
