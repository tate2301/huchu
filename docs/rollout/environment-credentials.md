# Environment Credentials — What the Platform Cannot Generate

Everything in the rollout program that is blocked is blocked on a credential, not on code. This
note says exactly what to obtain, from whom, and what unblocks once it lands. Part of the program
governed by `docs/rollout/master-rollout-plan.md`; the variables themselves are declared in
`.env.example`.

## Resume register

**The point of this table is that nobody has to re-derive the list later.** Work continues around
these; when a credential lands, this is what wakes up and in what order. Each row names the
verification that closes it — not "test the integration", but the specific observable thing.

| Credential | Status | What resumes, in order | The check that closes it |
|---|---|---|---|
| ZIMRA FDMS **test** taxpayer + per-device activation key | **Awaited** — confirmed coming, date unknown | FD-1.1 register a device → FD-1.2 certificate health → FD-2.1 open/close a day → FD-3.1 issue a signed invoice → FD-3.2 QR on the PDF → FD-4.1/4.2 credit and debit notes → FD-5.1/5.2 POS through a network cut → FD-7.1 the console against a real two-site tenant → FD-3.3 the timed under-30-minutes demo → FD-8 pilot cutover | A fiscal invoice showing **VALID** on the ZIMRA portal, and its `receiptGlobalNo` gap-free against the device's previous receipt |
| Paynow merchant account (`PAYNOW_INTEGRATION_ID` / `_KEY`) | **Provider decided**, account not yet open | SS-4.2 checkout on the billing page → SS-4.3 annual-first ordering → SS-5.3 dunning → PC-3 partner rev-share | A sandbox payment moving a tenant `TRIALING` → `ACTIVE`, and the same webhook replayed changing nothing |
| WhatsApp Business provider + approved templates | **Not started** — the longest lead time of the three | SS-5.1 the messaging service → SS-5.2 the onboarding sequence → SS-5.3 payment reminders → the WhatsApp funnel depth in MK | A template message delivered to a real handset, and a provider outage falling back to `lib/notifications.ts` rather than vanishing |

**Nothing below FD-8 in that first column can be demonstrated without the sandbox**, and the four
pilot tenants, the north-star metric and MK-5's case studies all sit below it. That is the single
longest pole in the program.

The FDMS stories are marked `wip` rather than `blocked` on purpose: `blocked` in the status legend
means *cannot start*, and they have not merely started — they are written, unit-tested and merged.
What is missing is the demonstration their acceptance signal names. Reading them as unbuilt would
be as wrong as reading them as done.

## 1. ZIMRA FDMS

**Blocks:** FD-1.1, FD-2.1, FD-3.1, FD-4.1 (all `wip` — code complete, sandbox unproven), FD-3.3
(the under-30-minutes activation demo, and the program's day-30 exit criterion), FD-8 (pilot
cutover).

The platform generates the RSA keypair and the PKCS#10 CSR and exchanges it for a certificate
(`lib/accounting/fdms-device.ts`). It cannot invent an activation key. What ZIMRA issues:

| What | Notes |
|---|---|
| Taxpayer on the FDMS **test** environment | TIN and VAT number. Separate from the production taxpayer record. |
| Device ID | Per virtual device. |
| Activation key | **Single-use** — spent by the first successful registration. A fresh one is needed per environment, not per deploy. Re-registering a device means asking for another. |
| Device serial number | Becomes the CN of the CSR. |
| API base URL and portal URL | Test and production differ. |

Two things worth knowing before you start:

- **Test and production are separate registrations with separate devices.** The certificate is
  issued for one gateway, and the receipt hash chain it signs belongs to that device. Pointing a
  production device at the test URL does not fail cleanly — it produces a chain against the wrong
  environment.
- **The chain is append-only and gap-free by design.** Registering, issuing a few receipts, then
  re-registering the same device leaves a numbering history you cannot rewrite. Do the first
  registration on the test environment deliberately, not exploratorily.

Once the test credentials exist, FD-3.3 is a runbook rather than a build: register the device,
open a fiscal day, issue an invoice, and check it validates on the portal. The code path for each
of those steps is written and unit-tested.

Secrets live on `FiscalisationProviderConfig` per tenant, which stores them by `env:NAME`
reference rather than inline; the `.env` values are the local development fallback and the names
those references point at.

## 2. Subscription payments

**Blocks:** SS-4 end-to-end proof, and therefore SS-5's dunning (you cannot chase a payment you
cannot take) and PC-3 partner revenue share.

**Decision (2026-08-20): Paynow.** `PAYMENT_PROVIDER="paynow"`. What remains is the merchant
account, not the choice.

The adapter is written against three providers behind one interface, so this is a config change
rather than a rewrite — and the two unchosen adapters stay in the codebase precisely so that
reversing this costs one line plus a key.

| Provider | Rails | Why you might pick it |
|---|---|---|
| **Paynow — chosen** | Visa/Mastercard, EcoCash, OneMoney, Telecash | Cards alongside mobile money in one integration |
| Pesepay | EcoCash-first | The better EcoCash experience; advertises recurring payments — the scarcest capability in this market |
| ContiPay | InnBucks, ZIPIT, ZimSwitch, Mukuru | The broadest rail set |

The reasoning, recorded because the alternative was close: the deciding feature is **rail coverage
and settlement time, not the headline rate**. Paynow wins on the first because the buyer and the
payer are frequently different people — a finance officer paying a Grow subscription by Visa and a
shop owner paying Fiscal by EcoCash are the same product, and one integration covering both is
worth more than Pesepay's better EcoCash experience alone.

**What was deliberately not bought:** Pesepay advertises recurring payments, which sounds like the
scarcest capability in this market. It is not a true recurring debit — Zimbabwe has no such rail,
mobile money is push-only — so it is a scheduled prompt, not a charge. Choosing a provider *for*
that would have been paying for a word. Annual prepay remains the answer to collections: it cuts
the collection count twelvefold and takes the problem off the table for a year, which is why
SS-4.3 presents it first at checkout.

The integration ID and key come from the Paynow merchant dashboard. The webhook is replay-protected
on `(provider, providerEventId)`, so a redelivered event is an observable no-op rather than a second
charge — but `PAYMENT_WEBHOOK_SECRET` must be set for signature verification to mean anything.

## 3. WhatsApp Business

**Blocks:** SS-5 lifecycle messaging (the Day 0/1/3/7/12 onboarding sequence and the T-7/T-3/T-0/T+3
payment reminders), and the depth of the WhatsApp funnel in MK.

Not yet started, and the credential lead time is the reason to start it early rather than late:
message templates require **provider approval before they can be sent**, and that approval is
measured in days. Decide between Meta's Cloud API directly and a BSP, then submit the template
drafts while the code is being written — not after.

## 4. Feature-gate policy

Not a credential, but an environment decision with the same blast radius.

`FEATURE_GATE_POLICY` now defaults to `deny`. While it defaulted to allow, every gate in the
platform was decorative unless the variable happened to be set — which is not a property you want
to discover by opening public signup. Set it explicitly per environment, and run
`pnpm platform:audit-feature-gates` before changing it: an unmapped route is not a gated surface
and stays reachable, but a route mapped to a feature key no bundle grants begins refusing the
moment this is `deny`.

`FEATURE_GATES_BYPASS` and `FEATURE_GATES_BYPASS_KEYS` exist for an incident. Anything that
relies on them in normal operation is a missing bundle, not a configuration.

## Changelog

| Date | Description |
|---|---|
| 2026-08-19 | Created. ZIMRA, payments, WhatsApp and gate-policy variables documented and added to `.env.example`; CCTV and scrap-scale variables removed with their modules. |
