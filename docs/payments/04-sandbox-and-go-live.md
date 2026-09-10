# Sandbox and go-live

Test credentials from the vendor docs, the verification script to run against
them, and the switch to live.

## Sandbox

Fully isolated from live: separate keys, separate customers, separate webhook
endpoint, mock providers, no money. Use a `sk_sandbox_...` key with
`X-Environment: sandbox` — a mismatch between key prefix and header is rejected.

### Test cards

| Outcome | Number |
|---|---|
| Success | `4111 1111 1111 1111` |
| Decline | `4000 0000 0000 2222` |
| Delayed success | `4000 0000 0000 3333` |

Any future expiry (`12/30`), any 3-digit CVV (`123`).

### Mobile money

| Outcome | Number |
|---|---|
| Success | `+263 771 000 111` |
| Failure | `+263 771 000 222` |
| Delayed success | `+263 771 000 333` |
| Pending / timeout — never answers | `+263 771 000 444` |

### OTP

Sandbox OTP is `123456`.

## What must be proven before this ships

Each of these exercises a specific failure the seam is built to survive. A green
happy path proves almost nothing.

| # | Scenario | Passes when |
|---|---|---|
| 1 | Card success | `SubscriptionPayment` reaches `PAID`; subscription period extends by `periodMonths` |
| 2 | Card decline | Row is `FAILED` with a reason; subscription untouched |
| 3 | Delayed success (`4000...3333`) | Row sits `PENDING`, then moves to `PAID` on the later webhook — **not** on the browser redirect |
| 4 | Mobile money success | `PAID` via `+263 771 000 111` |
| 5 | Mobile money failure | `FAILED` via `+263 771 000 222` |
| 6 | **Timeout — never answers** (`+263 771 000 444`) | Row stays `PENDING` indefinitely; nothing above the seam treats it as paid; `pollStatus` returns the same |
| 7 | **Replayed webhook** | Re-post an identical delivery: answered `200`, `outcome: DUPLICATE`, first `processedAt` untouched, no second transition |
| 8 | **Forged signature** | Post a body with a wrong `X-ToomaPay-Signature`: `401`, `signatureVerified: false` row exists, no payment moved |
| 9 | **Out-of-order delivery** | Post `payment.succeeded`, then a stale earlier event: the `PAID` row does not move (`TERMINAL_PAYMENT_STATUSES`) |
| 10 | **Double submit** | Same `idempotencyKey` twice: one `SubscriptionPayment`, `reused: true`, the first redirect returned |
| 11 | Redirect return | `successUrl` and `cancelUrl` land correctly — and neither one fulfils anything on its own |
| 12 | Unknown provider | `POST /api/webhooks/payments/nonsense` → `404`, nothing recorded |

7, 8 and 9 are the ones worth the effort. They are also the three the vendor's
own go-live checklist does not ask for.

### Running 7 and 8 without the gateway

Both are local. Capture a real sandbox delivery body, then re-post it:

```sh
# 7 — replay: identical body and signature, twice
curl -X POST localhost:3000/api/webhooks/payments/toomapay \
  -H "Content-Type: application/json" \
  -H "X-ToomaPay-Signature: <captured>" \
  --data-binary @fixture.json
# second call must answer 200 with outcome DUPLICATE

# 8 — forgery: same body, wrong signature
curl -X POST localhost:3000/api/webhooks/payments/toomapay \
  -H "Content-Type: application/json" \
  -H "X-ToomaPay-Signature: deadbeef" \
  --data-binary @fixture.json
# must answer 401 and leave a signatureVerified:false row
```

`--data-binary`, not `-d`: the signature is over the bytes as sent, and `-d`
strips newlines.

The Dashboard also has a "Test Webhook" trigger for verifying the endpoint is
reachable at all.

### Local webhook delivery

ToomaPay only posts to public HTTPS. Tunnel to the dev server, and register the
tunnel URL as the **sandbox** endpoint — one endpoint per environment, so this
never collides with live.

## Go-live

### Prerequisites (external, and slow)

- **Organisation KYC approved.** Live payments are locked until it is. Start
  this early; it is the long pole.
- **Settlement accounts** configured for USD *and* ZWG, each reading
  `validationStatus: VALIDATED`.
- **Account-holder name** as returned by the bank matches business registration.
- Support email, business name, and notification recipients set in the
  Dashboard — these appear on customer receipts and statements.

### The switch

1. Confirm all twelve scenarios above passed in sandbox.
2. Generate live keys; store them as `TOOMAPAY_SECRET_KEY` in the deployment
   secret store. Never in the repo — `.env` is gitignored and `.env.example`
   carries names only.
3. Register the **live** webhook endpoint (a separate URL from sandbox) and
   capture `signingSecret` at creation — it is shown once — into
   `TOOMAPAY_WEBHOOK_SECRET`.
4. Set `TOOMAPAY_ENVIRONMENT=live`.
5. Set `PAYMENT_PROVIDER=toomapay`.
6. Make one small real transaction and confirm end to end: `PAID` row,
   subscription extended, and the money visible in the ToomaPay Dashboard.

Steps 4 and 5 are separate deploys' worth of care but one config change. The
seam means nothing else moves.

### Rollback

Set `PAYMENT_PROVIDER` back to the previous adapter key. Rows already written
with `provider: "toomapay"` stay readable — that is why the column is a string
rather than an enum. In-flight ToomaPay payments will still receive webhooks and
still apply correctly, because the route resolves the adapter from the
`[provider]` URL segment and not from `PAYMENT_PROVIDER`.

### Key rotation

Create the new key, deploy, then revoke the old one — in that order. Reversing
it takes payments down for the length of the deploy. Same for the webhook
signing secret: rotate, capture the new secret, deploy, and expect a brief
window where in-flight deliveries signed with the old secret are recorded
`signatureVerified: false`. Those rows are the reason the seam records refused
deliveries rather than dropping them: a rotation done wrong is visible as a run
of false rows, and the gateway's retries will land once the new secret is live.
