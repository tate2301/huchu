# The payment seam

The code that already exists. Read this before reading anything about ToomaPay —
the gateway is fitted to this contract, not the other way around.

## Files

| File | Responsibility | Talks to |
|---|---|---|
| `lib/payments/types.ts` | The contract: status vocabulary, `PaymentProviderAdapter`, error classes | Nothing |
| `lib/payments/registry.ts` | Which adapter is live, per `PAYMENT_PROVIDER` | Adapters |
| `lib/payments/checkout.ts` | Outbound: claim the idempotency key, then initiate | Prisma, adapter |
| `lib/payments/webhook.ts` | Inbound: verify → record → deduplicate → apply | Prisma, adapter |
| `lib/payments/service.ts` | The state transition on `SubscriptionPayment` / `CompanySubscription` | Prisma |
| `lib/payments/http.ts` | Shared request helper (timeouts, JSON) | Network |
| `lib/payments/index.ts` | The public surface — import from here, never from an adapter | — |
| `app/api/webhooks/payments/[provider]/route.ts` | The one inbound URL | `webhook.ts` |

**Rule:** nothing outside `lib/payments/` imports `@/lib/payments/paynow` (or any
other named adapter). It imports `@/lib/payments`. That rule is what makes a
gateway swap a config change.

## The status vocabulary

Ours, not any gateway's. Every adapter maps the provider's strings onto these
five in one named place, so nothing above the seam knows what a given gateway
calls things.

| Status | Meaning |
|---|---|
| `INITIATED` | Handed to the gateway; the customer has not been anywhere yet |
| `PENDING` | In flight — on the redirect, or a mobile-money push awaiting a PIN. Not money |
| `PAID` | Settled. The only status that moves a subscription |
| `FAILED` | Declined, timed out, reversed, or partly paid |
| `CANCELLED` | Abandoned or closed |

`PAID` and `CANCELLED` are terminal (`TERMINAL_PAYMENT_STATUSES`). A later
delivery cannot move a payment off them — gateways do not promise delivery
order, so a stale `PENDING` can arrive after its own `PAID`.

## The adapter interface

```ts
interface PaymentProviderAdapter {
  readonly key: string;                       // matches PAYMENT_PROVIDER and the [provider] URL segment
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyWebhook(rawBody: string, headers: Record<string, string>):
    Promise<VerifyWebhookResult> | VerifyWebhookResult;
  pollStatus(providerReference: string, pollHandle?: string | null): Promise<PaymentStatus>;
}
```

Three details that are load-bearing:

- `verifyWebhook` receives the **raw body string**, not parsed JSON. Every
  signature scheme signs the bytes as sent; re-serialising a parsed object
  changes them.
- `verifyWebhook` **returns** a failure (`ok: false`, with a `reason`) rather
  than throwing. An unverified delivery is recorded and refused, not dropped —
  so a signing-key rotation shows up as a run of `signatureVerified: false` rows
  instead of as payments that silently never arrived.
- `pollStatus` exists because a callback is a claim and a poll is an answer. On
  gateways whose callback is not cryptographically authenticated, the poll is
  what actually establishes that money moved.

## Ordering, outbound

`checkout.ts` claims the idempotency key in our database **before** calling the
gateway. The other order loses a real transaction every time the write fails
after the money moved, recoverable only by reading a settlement report by hand.

A repeated idempotency key returns the first attempt's redirect (`reused: true`)
instead of starting a second transaction. That is why the redirect URL is stored
on the row.

## Ordering, inbound

`webhook.ts` is: **verify, record, deduplicate, only then apply.**

Recording before applying is what makes a delivery that dies halfway visible.
The `PaymentWebhookEvent` row exists whether or not the transition completed —
precisely the case a payment-table-only replay guard cannot see.

The unique index on `(provider, providerEventId)` is the arbiter, not a
read-then-write check, which would leave a window two simultaneous deliveries
both walk through. A row that exists but was never processed is handed back for
another attempt: that is the delivery that died mid-apply, and the gateway's
retry is the only thing that will finish it.

### Response codes the route returns

| Outcome | HTTP | Why |
|---|---|---|
| `UNKNOWN_PROVIDER` | 404 | Not a gateway we speak to. Nothing recorded — filing arbitrary strings on request lets strangers fill the table |
| `MISCONFIGURED` | 500 | Our deployment is broken. 500 so the gateway retries once the variable is set |
| `UNVERIFIED` | 401 | Recorded, stamped processed. The same unverifiable bytes will never verify |
| `UNREADABLE` | 400 | Verified but carried no usable reference or status |
| `DUPLICATE` | 200 | Observable no-op. 200 because a gateway told "error" retries forever over a message we already understood |
| `APPLY_FAILED` | 500 | Left unprocessed on purpose — the retry is the recovery path |
| applied | 200 | Including `UNKNOWN_PAYMENT`: an unknown reference will not become known by being retried |

## Schema

`SubscriptionPayment` — one attempt to pay, whichever gateway took the money.
`provider` is a string, not an enum, so a tenant that migrates between gateways
keeps its old rows readable. Unique on `(provider, providerReference)`, so a
replayed webhook collides instead of creating a second payment. `amount` is
`Decimal(14,2)`; a float subscription charge rounds someone's payment into a
mismatch with what the gateway settled.

`PaymentWebhookEvent` — every delivery, recorded before it is acted on. Unique on
`(provider, providerEventId)`.

## Adding a gateway

1. Write `lib/payments/<key>.ts` exporting `<KEY>_KEY`, a `configFromEnv`, and a
   `create<Key>Adapter(config)`.
2. Confine the provider's endpoints, field names and status vocabulary to one
   exported `WIRE` object (see `PESEPAY_WIRE`) so there is exactly one place that
   knows the gateway's words.
3. Add one line to `BUILT_IN_ADAPTERS` in `lib/payments/registry.ts`.
4. Add the env vars to `.env.example`.
5. Write `lib/payments/<key>.test.ts` covering the status map, a signature
   round-trip, and a replayed delivery.

No other file changes. If a sixth file needs touching, the seam is being broken.
