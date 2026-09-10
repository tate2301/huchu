# ToomaPay gateway reference

What the vendor's documentation says, transcribed. Read as of **2026-08-29** from
<https://www.toomapay.co.zw/docs/docs>.

> The vendor labels their own docs "docs are rough on purpose." Everything in
> this file is quoted or paraphrased from them; nothing is inferred. What they
> leave unstated is collected in
> [`03-toomapay-integration-plan.md`](./03-toomapay-integration-plan.md#open-questions-blocking-a-correct-adapter)
> rather than guessed at here.

## What it is

A Zimbabwean payment gateway. Unified API over mobile money and cards — EcoCash,
Visa, ZimSwitch — in **USD and ZWG**. Relevant to us because those are the rails
and currencies Corelith's tenants actually pay in.

## Core concepts

| Concept | Meaning |
|---|---|
| **Organisation** | The top-level account. Owns projects and management keys |
| **Project** | Transactions and configuration are scoped to a project |
| **Environment** | Each project has `SANDBOX` and `LIVE`, completely isolated |

## Authentication

Bearer token in `Authorization`, plus an environment header.

```http
Authorization: Bearer <key>
X-Environment: sandbox        # or: live
```

| Key type | Prefix | Used for |
|---|---|---|
| Secret | `sk_...` (e.g. `sk_sandbox_...`) | Backend payment operations — creating checkouts. Server only |
| Publishable | `pk_...` | Client-side identification of the project |
| Management | `mk_org_...` | Organisation admin — projects, members, keys |

The key must match the environment header (`sk_sandbox_...` with
`X-Environment: sandbox`).

## Endpoints

Only three are documented as a URL. Everything else the docs describe as
"managed through the Dashboard."

| Purpose | Method and path |
|---|---|
| Create hosted checkout | `POST /api/v1/payments/requests/checkouts` |
| Read payment status | `GET /api/v1/payments/requests/{requestId}` |
| Update settlement account | `PUT /api/v1/projects/{projectId}/settlement-accounts/{currency}` |
| Validate settlement account | `POST /api/v1/projects/{projectId}/settlement-accounts/{currency}/validate` |

Management routes live under `/api/v1/management/`. Webhook endpoint
registration is available via the Management API and the Dashboard; the docs
describe its fields but publish no path.

**The API host is never stated in the documentation.** See the open questions.

## Create a checkout

`POST /api/v1/payments/requests/checkouts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `idempotencyKey` | UUID | Yes | Prevents duplicate payments on retry |
| `currency` | string | Yes | `USD` or `ZWG` |
| `amount` | Decimal | No | Omittable when `lineItems` are given — computed from them |
| `lineItems` | array | No | `{ label, quantity, unitAmount }` (from the SDK example; not in the field table) |
| `description` | string | No | SDK example only; not in the field table |
| `customerName` | string | No | |
| `customerEmail` | string | No | For receipts |
| `customerPhone` | string | No | For payment push notifications |
| `successUrl` | string | No | Falls back to the project-level default |
| `cancelUrl` | string | No | Falls back to the project-level default |
| `expiresAt` | ISO8601 | No | |
| `metadata` | object | No | Free key-value pairs for your own tracking |

Response:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | The payment request id |
| `reference` | string | Human-readable transaction reference |
| `paymentUrl` | string | Where to send the customer |
| `status` | string | `OPEN`, `PAID`, `EXPIRED` — "e.g.", so the list is not closed |
| `amount` | Decimal | |
| `currency` | string | |

The hosted page handles PCI, method selection by currency and project config,
OTPs, push approvals, and 3-D Secure. Branding (logo, accent colour, statement
descriptor) and default redirect URLs are configured per project in the
Dashboard, not per request.

## Webhooks

### Payload

| Field | Type | Notes |
|---|---|---|
| `id` | string | Event id, `evt_...` — the dedupe key |
| `event` | string | Event type |
| `createdAt` | ISO8601 | |
| `environment` | string | `SANDBOX` or `LIVE` |
| `project` | object | Owning project metadata |
| `payment` | object | On payment events |
| `paymentRequest` | object | Original request, including metadata and line items |
| `settlement` | object | On settlement events |

### Events

- `payment.succeeded`
- `payment.failed`
- `settlement.succeeded`
- `settlement.failed`

> **Contradiction in the vendor docs.** The Webhooks page lists
> `payment.succeeded` / `payment.failed`. The Node SDK page registers
> `["payment.completed", "payment.failed"]`. These cannot both be the wire value
> for a successful payment. Must be resolved before an adapter is written.

### Signature

HMAC-SHA256 over the raw body using the signing secret, delivered in
`X-ToomaPay-Signature`. The signing secret is returned **only** at webhook
creation or secret rotation — captured then or not at all.

The docs say "verify the signature" but do not publish the signature's encoding
(hex or base64), whether the signed string is the bare body or a timestamped
construction, or whether a replay window is enforced. See the open questions.

### Configuration and delivery

One endpoint per environment, HTTPS, registered in Dashboard → Developers →
Webhooks or via the Management API (`url`, `events[]`; response adds `id`,
`active`, `signingSecret`). ToomaPay retries on non-2xx. Their guidance: answer
`200` quickly, dedupe on event `id`, and never fulfil on the browser redirect —
only on a verified webhook.

## Errors

Envelope: `{ success: false, status, message, errors[] }`. Success responses use
the same envelope with `data`.

| Code | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Missing a required parameter |
| 401 | No valid API key |
| 403 | Key lacks permission |
| 404 | No such resource |
| 409 | Conflict — **including a duplicate idempotency key** |
| 422 | Well-formed but semantically rejected |
| 5xx | Their side; safe to retry with backoff |

Do not retry 4xx.

## Node SDK

`@toomapay/sdk` on npm. Requires Node 18+ (uses built-in `fetch`).

Two clients:

- `ToomaPayClient` — authenticated server calls: `projects`, `checkoutRequests`,
  `keys`, `webhooks`, `settlementAccounts`. Constructor takes `apiKey`,
  `environment`, and optionally `baseUrl` and a custom `fetch`.
- `ToomaPayCheckoutClient` — unauthenticated, drives the hosted checkout UI from
  a server-side BFF: `load`, `startAttempt`, `retrieveAttempt`, `confirmAttempt`,
  `providerReturn`.

Failures throw `ToomaPayApiError` carrying `status` (`0` = never reached the
server), `message`, `errors[]`, and `requestId` (the `x-request-id` header).

Corelith would use `checkoutRequests.create` and nothing else. The checkout
client drives a payment UI we are not building — we redirect to the hosted page.

## Settlement accounts

Per project, per currency (`USD`, `ZWG`). Request: `bankName`, `bankCode`,
`branchCode`, `accountName`, `accountNumber`, `accountType`
(`CURRENT` / `SAVINGS`) — all required. Response returns
`maskedAccountNumber` and a `validationStatus` of `PENDING`, `VALIDATED`, or
`FAILED`. Validate before saving; validation returns provider metadata including
the bank's registered account-holder name, which must match business
registration.

## Other surfaces

- **Invoices** — Dashboard-created payment links with line items and templates.
  Retrievable by id via the API. Not needed: Corelith bills its own
  subscriptions.
- **Donations** — multi-currency campaigns. Not applicable.
- **Customers** — read-only ledger built from payment activity, per environment.
  **Dashboard only; no public API endpoint.**
- **Audit trail** — immutable per-project record of user, system, payment and
  configuration events.
- **Plugins** — WooCommerce is shipping; Shopify is documented as *planned*, with
  placeholder pages. Neither applies to us.

## Getting an account

Registration and login are web-only, not API. Register at
`/register`, create a project, then generate keys under Dashboard → Developers.
**Organisation KYC must be completed before live payments are unlocked.**
