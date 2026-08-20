# Environment Credentials — What the Platform Cannot Generate

Everything in the rollout program that is blocked is blocked on a credential, not on code. This
note says exactly what to obtain, from whom, and what unblocks once it lands. Part of the program
governed by `docs/rollout/master-rollout-plan.md`; the variables themselves are declared in
`.env.example`.

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

The adapter is written against three providers behind one interface, so the choice is a config
change rather than a rewrite. Set `PAYMENT_PROVIDER` and fill in that provider's block.

| Provider | Rails | Why you might pick it |
|---|---|---|
| Paynow | Visa/Mastercard, EcoCash, OneMoney, Telecash | Cards alongside mobile money in one integration |
| Pesepay | EcoCash-first | The better EcoCash experience; advertises recurring payments — the scarcest capability in this market |
| ContiPay | InnBucks, ZIPIT, ZimSwitch, Mukuru | The broadest rail set |

The deciding feature is **recurring support and settlement time, not the headline rate**.
Zimbabwe has no true recurring-debit rail — mobile money is push-only — which is why annual prepay
is the default ask in the pricing structure rather than an alternative: it cuts the collection
count twelvefold and takes the collections problem off the table for a year.

Each provider needs a merchant account with them; the integration keys come from that account's
dashboard. The webhook is replay-protected on `(provider, providerEventId)`, so a redelivered
event is an observable no-op rather than a second charge — but the webhook secret must be set for
signature verification to mean anything.

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
