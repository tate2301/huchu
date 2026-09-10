# ToomaPay integration plan

Fitting ToomaPay to the seam in [`01-payment-seam.md`](./01-payment-seam.md).

## Verdict

ToomaPay fits the existing adapter contract more cleanly than the three gateways
already implemented. It is the only one of the four that gives us:

- a **numbered event id** (`evt_...`) — a real dedupe key, where Pesepay forces
  us to synthesise `reference:status` and others fall back to a body digest;
- an **authenticated callback** (HMAC-SHA256) rather than Pesepay's AES-CBC
  envelope, which is encryption without a MAC and cannot prove authorship;
- **first-class idempotency** on the initiate call, matching what
  `checkout.ts` already does with `idempotencyKey`;
- **USD and ZWG** natively, which is what tenants actually pay in.

It is not ready to build. Four contract details are unpublished, and one is
self-contradictory in the vendor's own docs. Those are below.

## Shape of the work

| Step | File | Size |
|---|---|---|
| 1 | `lib/payments/toomapay.ts` — new adapter | ~200 lines, modelled on `pesepay.ts` |
| 2 | `lib/payments/registry.ts` — one line in `BUILT_IN_ADAPTERS` | 1 line |
| 3 | `.env.example` — five variables | 5 lines |
| 4 | `lib/payments/toomapay.test.ts` — status map, signature, replay | new |

Nothing else. No schema change: `SubscriptionPayment.provider` is a string, and
`PaymentWebhookEvent` already holds an arbitrary `providerEventId`.

## Field mapping

### `initiatePayment`

| Seam (`InitiatePaymentInput`) | ToomaPay request |
|---|---|
| `idempotencyKey` | `idempotencyKey` — passes straight through, unlike every other adapter |
| `amount` (decimal string) | `amount` |
| `currency` | `currency` (`USD` \| `ZWG`) |
| `returnUrl` | `successUrl` |
| — | `cancelUrl` — needs its own value; the seam has no field for it |
| `payerEmail` | `customerEmail` |
| `payerPhone` | `customerPhone` |
| `periodMonths` | `metadata.periodMonths` (and a `description`) |
| `companyId` | `metadata.companyId` — for reconciliation from their Dashboard |
| `resultUrl` | *not a request field* — the webhook URL is registered per project |

| ToomaPay response | Seam (`InitiatePaymentResult`) |
|---|---|
| `id` | `providerReference` |
| `paymentUrl` | `redirectUrl` |
| `status` | `status`, via the map below |
| — | `pollHandle: null` — `GET /payments/requests/{id}` needs only the id |
| whole body | `rawResponse` |

`cancelUrl` is the one genuine gap. Cleanest fix: set the project-level default
cancel URL in the ToomaPay Dashboard and send nothing per request. That keeps
`InitiatePaymentInput` unchanged for three adapters that have no use for it.

### Status map

`TOOMAPAY_WIRE.statusMap`, the only place that knows ToomaPay's words:

| ToomaPay | Ours | Note |
|---|---|---|
| `OPEN` | `PENDING` | Checkout live, customer not finished |
| `PAID` | `PAID` | |
| `EXPIRED` | `CANCELLED` | Terminal — the window closed, no money |
| `FAILED` | `FAILED` | *Assumed; not documented* |
| `CANCELLED` | `CANCELLED` | *Assumed; not documented* |

The docs give `OPEN`, `PAID`, `EXPIRED` prefixed with "e.g." — an open list. The
adapter must map an unrecognised status to `null` and let the caller record it
as `UNREADABLE` rather than defaulting to anything. Guessing here is how a failed
payment silently extends a subscription.

### `verifyWebhook`

```
providerEventId  ← payload.id            (evt_...) — a real delivery id
providerReference ← payload.payment.id or paymentRequest.id   ← UNRESOLVED
status           ← payload.event, mapped:
                     payment.succeeded|completed → PAID
                     payment.failed              → FAILED
amount           ← payload.payment.amount        ← shape UNRESOLVED
ok               ← timingSafeEqual(hmac_sha256(rawBody, signingSecret), header)
```

`settlement.succeeded` / `settlement.failed` are about ToomaPay paying **us**,
not a tenant paying a subscription. They have no `SubscriptionPayment` to move.
Return `ok: true` with `status: null` so the delivery is recorded and answered
`200` rather than retried forever — the seam already treats that as `UNREADABLE`,
which is honest: readable, but not ours to act on.

### `pollStatus`

`GET /api/v1/payments/requests/{providerReference}`, read `data.status`, map it.
Given an unauthenticated-callback gateway this would be mandatory; with HMAC it
is the reconciliation path for a delivery that never arrived.

## Open questions blocking a correct adapter

Answers needed from ToomaPay support before writing code. Numbers 1–3 are
correctness blockers; a wrong guess on 2 rejects every legitimate webhook or,
worse, accepts a forged one.

1. **API base URL.** Never stated in the docs. Every path is documented relative
   (`/api/v1/...`). Candidates: `https://api.toomapay.co.zw`, or
   `https://www.toomapay.co.zw`. The SDK takes a `baseUrl` option but documents
   no default. → `TOOMAPAY_API_BASE_URL`, required, no fallback.

2. **Signature construction.** We know HMAC-SHA256, signing secret, header
   `X-ToomaPay-Signature`. We do not know: hex or base64; bare body or a
   `t=<ts>,v1=<sig>` style scheme; whether a timestamp is signed and a replay
   window enforced. Compare with `timingSafeEqual` regardless.

3. **The success event name.** The Webhooks page says `payment.succeeded`; the
   Node SDK page registers `payment.completed`. One is wrong.

4. **Payment reference shape.** The payload has `payment` and `paymentRequest`
   objects but their fields are not documented. We need to know which id
   corresponds to the `id` returned from checkout creation, because that is what
   `providerReference` was written with and what the unique index joins on.

5. **409 semantics on a repeated idempotency key.** Does it return the original
   checkout, or only an error? `checkout.ts` already handles the repeat on our
   side, so this is about not turning a benign retry into a failed row.

6. **`lineItems` and `description`** appear in the SDK example but not the field
   reference. Confirm they are supported on the raw API.

## SDK or direct HTTP

**Direct HTTP**, via the existing `lib/payments/http.ts`.

The three existing adapters use it, it carries our timeout and error handling,
and the SDK would add a dependency to use roughly one method
(`checkoutRequests.create`). The SDK's other surfaces — `projects`, `keys`,
`webhooks`, `settlementAccounts` — are one-off Dashboard operations, not runtime
paths. Signature verification, the part that actually matters, is ours either
way: the SDK documents no verification helper.

Revisit only if question 2 resolves into a scheme with enough moving parts that
a vendor-maintained verifier is worth the dependency.

## Environment variables

```sh
PAYMENT_PROVIDER=toomapay
TOOMAPAY_API_BASE_URL=          # blocked on Q1
TOOMAPAY_SECRET_KEY=            # sk_sandbox_... / sk_live_...
TOOMAPAY_ENVIRONMENT=sandbox    # sent as X-Environment; must match the key prefix
TOOMAPAY_WEBHOOK_SECRET=        # shown once, at webhook creation or rotation
TOOMAPAY_CANCEL_URL=            # only if Q on project-level defaults goes the other way
```

`TOOMAPAY_ENVIRONMENT` is deliberately separate from `NODE_ENV`. A staging
deployment running production code against sandbox keys is a normal thing to
want, and coupling them makes it impossible.

Follow the house pattern in `pesepay.ts`: `requireEnv` for anything without a
safe default, so a half-configured deployment refuses at the first call instead
of failing as a payer's declined transaction.

## Build order

1. Get sandbox credentials; answer Q1–Q6 with support or by observation against
   the sandbox.
2. `lib/payments/toomapay.ts` with `TOOMAPAY_WIRE` — endpoints, event names,
   status map — as the single place holding vendor vocabulary.
3. `lib/payments/toomapay.test.ts`: every status-map entry; unrecognised status
   → `null`; a signature round-trip using a fixture body; a replayed `evt_` id
   answered `200` with no second transition.
4. Register in `registry.ts`; add env vars to `.env.example`.
5. Run the sandbox script in
   [`04-sandbox-and-go-live.md`](./04-sandbox-and-go-live.md).
6. Do not set `PAYMENT_PROVIDER=toomapay` in production until organisation KYC
   is approved and both settlement accounts read `VALIDATED`.

## What does not change

The billing page, `SubscriptionPayment`, `CompanySubscription`,
`app/api/webhooks/payments/[provider]/route.ts`, and `lib/payments/service.ts`.
If any of them needs editing to land ToomaPay, the adapter is leaking and the
change belongs back inside `toomapay.ts`.
