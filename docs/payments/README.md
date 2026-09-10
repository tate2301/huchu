# Payments

How money reaches Corelith, and how a gateway is added without touching anything
above the seam.

| Document | What it answers |
|---|---|
| [`01-payment-seam.md`](./01-payment-seam.md) | The seam that already exists in `lib/payments/` — the contract every gateway implements |
| [`02-toomapay-gateway-reference.md`](./02-toomapay-gateway-reference.md) | What ToomaPay's published documentation actually says, and what it does not say |
| [`03-toomapay-integration-plan.md`](./03-toomapay-integration-plan.md) | Mapping ToomaPay onto the seam: the adapter, the open questions, the build order |
| [`04-sandbox-and-go-live.md`](./04-sandbox-and-go-live.md) | Test credentials, the verification script, and the switch to live |

## The short version

Corelith does not integrate a payment gateway. It implements
`PaymentProviderAdapter` (`lib/payments/types.ts`) and chooses one at deploy time
with `PAYMENT_PROVIDER`. Three adapters exist today — `paynow`, `pesepay`,
`contipay`. ToomaPay would be a fourth, and adding it is one new file plus one
line in `lib/payments/registry.ts`.

Nothing above the seam — the billing page, `SubscriptionPayment`,
`app/api/webhooks/payments/[provider]/route.ts` — learns the gateway's name.

## Status

ToomaPay is **evaluated, not built.** No adapter exists in the tree. The
integration plan is written against ToomaPay's public documentation as read on
2026-08-29, and that documentation is explicitly labelled "docs are rough on
purpose" by the vendor. Four contract details needed to write a correct adapter
are not published; they are listed in
[`03-toomapay-integration-plan.md`](./03-toomapay-integration-plan.md#open-questions-blocking-a-correct-adapter)
and need answers from ToomaPay before the webhook path can be trusted with
money.

## Source

Vendor documentation: <https://www.toomapay.co.zw/docs/docs>
