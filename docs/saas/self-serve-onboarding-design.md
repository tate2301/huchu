# Self-serve SaaS: products, signup, onboarding, teams and billing

Design for the pivot from operator-provisioned tenants to self-serve B2B SaaS, starting with
the CRM. Written 2026-09-27 against the code on `main` and the rollout program in
`docs/rollout/`. This is the design; the story ledger for the work lives in
`docs/rollout/self-serve-billing-roadmap.md` (SS-) and gets new stories from §10.

## 0. The decisions, on one screen

| Question | Decision | Why |
|---|---|---|
| What is a product? | A registry entry: name, domains, template, plan ladder, always-on features, switchable integrations, onboarding definition, brand tokens. Stored on the workspace as `Company.productId`. | The code already has the pieces (`VerticalProductId`, `TEMPLATE_CRM`, tiers, bundles) but nothing binds them to a host or a signup. One registry does. |
| Where does a product live? | Its own domain: `flare.co.zw` marketing, `app.flare.co.zw` account and signup, `<slug>.flare.co.zw` workspace. One Next.js deployment serves every product; the host picks the product. | Trading names need their own front door. Separate deployments would fork the entitlement, auth and payment code. |
| One account or one per product? | One Corelith account, many workspaces, via a `WorkspaceMembership` table. `User.companyId` becomes the active workspace, not the only one. | Invites and a second product both break on today's one-user-one-company rule. The partner channel (PC-1) needs the same table. Build it once, now. |
| How do people sign in? | Email plus a six-digit code. No password at signup; one can be set later. Google sign-in second. | Removes the password field, the strength meter and the forgot-password flow that does not exist today. `otp` is already dark-launched in `lib/auth-core/strategy-registry.ts`. |
| What is the trial? | Reverse trial: 14 days on the product's top self-serve plan, no card, then the workspace drops to Free. Paid plans that lapse go read-only, never locked. | Verna's numbers: no-card trial converts ~15%, freemium keeps 25% using. Free single-seat is also the wedge against WanguCRM at US$15. |
| Which gateway? | Pesepay first. Contipay as the second adapter the moment a customer needs OneMoney or ZIPIT. Neither Paynow nor any merchant-of-record. | Pesepay is the only aggregator with published fees, an official TypeScript SDK and a self-serve sandbox, and its adapter already exists in `lib/payments/`. Its recurring-invoice API sends the renewal pay link each cycle for us. |
| Does anything auto-charge? | Cards, in principle, through tokenisation. Mobile money, no: EcoCash, OneMoney and InnBucks approve every charge by PIN. So renewal is a reminder, a push-to-phone or pay link at the due date, then read-only after grace. | Verified against the EcoCash, InnBucks, Pesepay and Zimswitch developer surfaces (§5.2). The only live merchant-initiated card charging is Paynow's, which is excluded; Zimswitch Online's is sandbox-only. |
| What is activation? | Setup: workspace exists and ≥20 contacts are in. Aha: the first deal changes stage, or the first activity is logged with a follow-up due. Team: two members touch a record within 14 days. | Reforge's setup/aha/habit, Verna's "activate teams, not users". Every event already has a home in `PlatformAuditEvent`. |

## 1. Products and names

The company stays Corelith. Products get plain, one-word trading names. Domain availability
at ZISPA is **unverified** — `.co.zw` whois returns nothing useful; check before printing anything.

| Product | Name | What it is | Template today | Home |
|---|---|---|---|---|
| CRM | **Flare** | Leads, pipeline, site visits, quotes, invoices, commissions | `TEMPLATE_CRM` | `/crm` |
| Schools | **Educo** | Admissions, fees, boarding, results, the three portals | `TEMPLATE_SCHOOLS` | `/schools` |
| Retail and fiscal invoicing | **Till** | POS, stock, shifts, ZIMRA fiscalisation; the Fiscal SKU is its entry plan | `TEMPLATE_RETAIL` (+ FISCAL tier) | `/retail` |
| Gold operations | **Assay** | Pours, dispatches, receipts, reconciliation, settlements | `TEMPLATE_GOLD_MINE` | `/gold` |
| People and payroll | **Crew** | Employees, attendance, leave, payroll, statutory returns | `TEMPLATE_PAYROLL_BUREAU` | `/hr` |

Notes on the names. Flare and Educo are the founder's picks and hold up: short, sayable, no
Shona or English double meaning. Educo is also the name of a Spanish child-welfare NGO; that
does not stop a Zimbabwean trademark but it will take the `.com` and the top search result.
Alternative if that matters: **Chalk**. Till is the strongest of the new three — it names the
thing on the counter and carries the fiscal story. Assay is the test of gold purity; a mine
manager knows the word. Crew reads warmer than Payroll and covers attendance and leave, which
Payroll does not.

Not products: accounting, stores, compliance, maintenance (frozen), the portals. They are
**integrations** inside a product: a grid in Settings where the admin installs or uninstalls
one, each with a detail page (summary, author, version, price, what it reads and writes,
support, configuration when needed, history). Installing grants its bundle through
`grantBundleToCompany` and adds its line to the invoice. The other products are sold into a
Flare workspace the same way: Crew's payroll and Till's stock appear as modules of the CRM,
offered during onboarding (§3, screen 6b) and in Settings.

Flare's integrations, with the bundle each one grants. Prices are the catalog's list prices
where one exists; Stock and Employees are free foundation bundles today, so theirs are
proposals.

| Integration | From | Bundle | Monthly | What it does to the CRM | Needs |
|---|---|---|---:|---|---|
| Employees | Crew | `ADDON_WORKFORCE_CORE` | Included | Reps become employees: contracts, leave, attendance | — |
| Payroll | Crew | `ADDON_ADVANCED_PAYROLL` | 49 | Pay runs; commissions earned in Flare flow into the run | Employees |
| Books | Corelith | ledger surfaces of `ADDON_ACCOUNTING_CORE` | 39 | Invoices and receipts post to a ledger you can read | — |
| Stock | Till | `ADDON_STORES_CORE` | 19 proposed | Quote from the catalogue; site visits and jobs draw stock | — |
| Customer portal | Corelith | `ADDON_PORTAL_SUITE` | 19 | Customers open quotes, sign off work, see what they owe | — |
| Point of sale | Till | `ADDON_RETAIL_SUITE` | 39 | Counter sales to the same customers | Stock |
| Fiscal invoices | Till | `ADDON_ZIMRA_FISCAL` | 19 | Flare invoices fiscalised through FDMS; listed as Coming until FD-8 is live | Books |

Books needs one catalog change. The CRM suite already depends on both accounting bundles,
because quotes and invoices are accounting documents, so a Flare workspace always has the
posting engine. What Books sells is the ledger's own screens (chart of accounts, journals,
statements, banking), which stay out of the nav until it is installed. Payroll's dependency
on Employees is not in `BUNDLE_DEPENDENCIES` yet and is added with it. The
existing Enterprise tier with everything switched on stays as the Corelith edition for the
pilots; it is not marketed.

Brand per product follows the persona rules: warm neutrals, one accent each, muted semantics.
Flare's accent is decided with its logo; until then it inherits Corelith blue.

## 2. Shape of the platform after the pivot

### 2.1 Product registry — `lib/platform/products.ts`

Replaces the descriptive `VERTICAL_PRODUCT_BUNDLES` in `lib/workspace-products.ts` with a
prescriptive one. One entry per product:

```ts
type ProductDefinition = {
  id: "flare" | "educo" | "till" | "assay" | "crew" | "corelith";
  name: string;                       // "Flare"
  rootDomain: string;                 // "flare.co.zw"  → app.flare.co.zw, <slug>.flare.co.zw
  templateCode: string;               // "TEMPLATE_CRM"
  plans: { free: string; trial: string; ladder: string[] };  // tier codes
  coreBundles: string[];              // always on, never shown as a choice
  integrations: IntegrationDefinition[];  // switchable bundles with copy and price
  hiddenModules: WorkspaceModuleId[]; // present for dependencies, absent from nav
  homeHref: string;                   // "/crm"
  onboarding: OnboardingDefinition;   // §3
  brand: { accent: string; logoUrl: string; supportWhatsApp: string };
  selfServe: boolean;                 // Educo and Assay stay operator-provisioned for now
};
```

`Company.productId` is written at provisioning and never inferred again. The
`resolveWorkspaceProduct` guesswork from profile + features goes; the sidebar, home route,
primary actions and copy read the registry.

### 2.2 Hosts

`PLATFORM_ROOT_DOMAIN` (one string) becomes the registry's `rootDomain` per product.
`getPlatformHostContext` in `lib/platform/tenant.ts` gains `product`: match the host suffix
against every product's root, then split off the slug. `app` and `www` are reserved
subdomains (extend `SubdomainReservation`). Central hosts (`PLATFORM_ROOT_HOSTS`) become
`app.<product root>`; marketing is the bare root. `apps.pagka.dev` stays as the Corelith
product's root so nothing existing moves.

Infrastructure: one Vercel project, one wildcard domain per product. Wildcards need the
domain's nameservers at Vercel, which `.co.zw` registrars allow. Resend gets a sending domain
per product so a Flare invite is from `@flare.co.zw`.

The JWT's `allowedHosts` already exists; it is filled from memberships (§4) instead of the
one company.

### 2.3 Identity

New model:

```prisma
model WorkspaceMembership {
  id         String   @id @default(uuid())
  userId     String
  companyId  String
  role       UserRole
  status     MembershipStatus @default(ACTIVE)   // ACTIVE | SUSPENDED
  invitedById String?
  createdAt  DateTime @default(now())
  @@unique([userId, companyId])
  @@index([companyId, status])
}
```

`User.companyId` stays as the **active workspace** and `User.role` as the role in it, so the
281 `companyId`-scoped models and every `session.user.companyId` read keep working. Sign-in on
a tenant host looks the user up by email, then requires a membership for that host's company
and copies its role into the token. The central host shows a workspace picker when there is
more than one membership. Backfill: one membership per existing user. Then, and only then,
the "email already belongs to another tenant" refusals in `provisionTenant` and the invite
path are deleted.

### 2.4 Entitlements

Nothing changes in the mechanism (`lib/platform/entitlements.ts`, `feature-catalog.ts`).
What changes is the catalog: Flare gets its own ladder rather than riding the retail one,
because today CRM is included only on SCALE and ENTERPRISE, and `ADDON_CRM_SUITE` depends on
both accounting bundles.

Proposed Flare ladder, USD, to be confirmed by the founder (§11):

| Tier code | Name | Monthly | Seats | Contacts | Notes |
|---|---|---:|---:|---:|---|
| `FLARE_FREE` | Free | 0 | 1 | 250 | One pipeline. Where a reverse trial lands. |
| `FLARE_TEAM` | Team | 29 | 5 | 5,000 | The trial tier for solo signups. |
| `FLARE_BUSINESS` | Business | 79 | 20 | unlimited | Insights, commissions, automations. The trial tier. |
| extra seat | — | 5 | | | On Team and Business. |

Annual at 20% off is the default ask (PR-2.1). The accounting dependency stays satisfied by
granting `ADDON_ACCOUNTING_CORE`/`ADVANCED` as **core bundles** of Flare with their price
zeroed inside the Flare tiers; the modules are in `hiddenModules` so quoting and invoicing
work and no ledger appears in the nav until the Accounting integration is switched on.

## 3. The Flare signup and onboarding flow

Principles applied, each with its source in §12: strip every field that is not needed
before value (Bush, Hulick); account before organisation (Linear, Notion, Slack); the strike
is the import, not the account (Attio); two questions at most in-flow (Appcues, Chameleon);
a four-item checklist on the home page, not a modal (Userpilot); pricing never before the
strike (growth.design, Verna); invite once with skip, then again in context (Reforge,
Slack); WhatsApp-shareable everything (the market).

Eight screens. Two are mandatory. Every screen fits a phone. No tour, no video.

| # | Screen | Fields | Skippable | Writes |
|---|---|---|---:|---|
| 1 | **Start** on `app.flare.co.zw/signup` | Name, work email. `?plan=`, UTM and referrer captured. | No | `User` (no password), `MarketingLead` attribution |
| 2 | **Code** | Six digits from the email. "Resend" after 30 s. | No | `emailVerified` |
| 2a | **Join instead?** | Shown only if the email domain matches a workspace with auto-join on. "Join Acme" or "Create a new workspace". | — | `WorkspaceMembership` if joining; flow ends at 7 |
| 3 | **Workspace** | Business name (pre-filled from the domain), URL slug shown live under it, WhatsApp number (E.164, one field, "setup link and reminders go here"). | No | `provisionTenant` → `Company`, `CompanySubscription` TRIALING on `FLARE_BUSINESS`, 14 days, membership as SUPERADMIN, sample pack |
| 4 | **Two questions** | "What do you want to sort out first?" pipeline / customers / follow-ups. "Where are your contacts today?" spreadsheet / phone / another CRM / nowhere yet. | Yes → pipeline + spreadsheet | `Company.onboardingAnswers` json; picks pipeline template and checklist order |
| 5 | **Bring your contacts** — the strike | CSV upload or paste (existing `/crm/import`), vCard from the phone, or "use the sample data for now". Progress shown; sample rows fade as real rows land. | Yes, stays as checklist item 1 | `CrmPerson`, `CrmClient` |
| 6 | **Invite your team** | Up to five emails with role, plus an invite link with "Share on WhatsApp". | Yes | `WorkspaceInvite` ×n |
| 6b | **Bring the rest of the business in** — the upsell | Multi-select cards for the integrations above: three suggested from the screen 4 answer, the rest listed. Nothing pre-selected; a pick adds what it depends on and says why. Free until the trial ends. Owner only. | Yes | `grantBundleToCompany` per pick; `integration.installed` |
| 7 | **Home** `/crm` on `<slug>.flare.co.zw` | Pipeline with the imported or sample deals. Checklist card: Import contacts · Create your first deal · Log an activity with a follow-up · Invite a teammate. A quiet chip: "Business plan · 14 days left". | — | Checklist state derived, not stored |

Copy is one line per screen, outcome not feature: "Never lose a follow-up again" on screen 1,
"Your contacts, in one place" on screen 5. Buttons are verbs: Continue, Import, Invite, Skip.

Sample pack (SS-2.2): three companies, five people, three deals spread across the default
stages, two tasks due this week, every row `isSample: true`, one button in Settings and on the
checklist removes them. Sample data is what makes screen 7 look like day 30 rather than day 0.

Empty states replace the tour. Each of People, Companies, Deals, Tasks, Forms gets a designed
empty state: what the page is for, one primary action, a link to import. Today
`crm-overview.tsx` shows "Nothing in the pipeline yet" with no action; that is the first fix.

The existing sites-and-departments `OnboardingDialog` does not run for Flare workspaces; it is
the Corelith product's onboarding and is keyed off `productId`.

The upsell comes last on purpose. It follows the strike and the invite, so nothing stands
between a stranger and their pipeline, and it is framed by what each module does to the CRM,
not by what it is. An integration picked here behaves exactly as one installed from Settings.

Pricing surfaces in exactly four places and nowhere else: the trial chip; a seat beyond the
plan; a gated feature (insights, commissions on Free); trial expiry. Each opens the same
billing page (§5).

## 4. Teams: invites, links, domain join, roles

`WorkspaceInvite` is `SchoolPortalInvite` generalised: `companyId`, `email`, `role`,
`tokenHash` (sha256), `invitedById`, `expiresAt` (14 days), `acceptedAt`. Three ways in:

- **Email invite.** Resend, from the product's domain, one button: "Join Acme on Flare".
- **Invite link.** Same token, shown once, with a "Share on WhatsApp" button (`wa.me` with
  prefilled text). Slack's precedent: links expire in 30 days or 400 uses.
- **Domain auto-join.** A `WorkspaceDomain` list per workspace (domain, join role, verified
  at), not a single column. The admin's own email domain is added and verified at signup; more
  are added from Settings → Members and verified by a DNS record or a code sent to an address
  at that domain. Never a free-mail domain. Surfaces as screen 2a.

Accepting: `/invite/[token]` on the central host. Not signed in → screen 1 with the email
locked to the invite. Signed in → membership created, token spent, land on the tenant host.
An accepted invite for an existing user on another workspace just adds a membership — the
whole point of §2.3.

Roles shown in Flare: Owner (`SUPERADMIN`), Manager (`MANAGER`), Rep (`SALES_REP`). The enum
does not grow; the registry maps product labels onto it. Settings → Members lists members
and pending invites in one table with a status column; resend and revoke are row actions.

The invite is asked twice more, in context: when a deal is assigned and there is nobody to
assign it to, and in the day-3 message if the workspace is still one person.

## 5. Plans, trial and billing

### 5.1 Trial mechanics

Provisioning writes `TRIALING` on `FLARE_BUSINESS` with `trialEndsAt` +14 days. A scheduled
job (the worker precedent from gold imports) runs hourly:

- T-4 days: in-app banner and a message (§6).
- T-0: if no `PAID` payment, `planId` → `FLARE_FREE`, status `ACTIVE`, a
  `PlatformAuditEvent`. Nothing is deleted; over-limit seats become read-only members and the
  admin is told which. Paid integrations are paused (`CompanySubscriptionAddon.isEnabled`
  false, reason `trial-ended`): their data stays and their nav returns the moment they are
  paid for. Included ones, such as Employees, keep running.
- Paid plans past `currentPeriodEnd`: `PAST_DUE`, 7-day grace, then the existing read-only
  degradation from `proxy.ts` (SS-1.2). Never a lock-out.

Every transition is idempotent and audited, as the SS standing instructions require.

### 5.2 Gateway, and what "recurring" means in Zimbabwe

Criteria, in the order the master plan fixed them: recurring support, settlement time, then
rate. Checked against primary developer surfaces on 2026-09-27; the full evidence table with
quotes and URLs is in §12.

**What exists, rail by rail.**

| Rail | Merchant can charge again without the customer approving? | What actually happens at renewal |
|---|---|---|
| EcoCash | No. The Open API has charge, refund and lookup; every charge is a USSD PIN prompt on the customer's phone. EcoCash Bill Manager mandates exist for a closed list of big billers (ZESA, councils, Cimas) with no API. | We push a charge to their number; they enter a PIN. |
| OneMoney | No. No developer programme at all; reachable only through aggregators, as a push. | Same, through Contipay or Paynow. |
| InnBucks | No. Merchant API generates a pay code the customer redeems in the app or on `*569#`; polling only. | We generate a code and send it. |
| Zimswitch cards | Not yet. Zimswitch Online runs ACI COPYandPAY, whose tokenisation and scheduled subscriptions are marked "available in sandbox" and "requires enablement". Interbank debit orders (ZEEPAY) are "work underway". | Card redirect each cycle for now. |
| Visa / Mastercard | Yes, via Paynow only: verified merchants can tokenise a card and charge it server-side; tokens expire within six months. Excluded by decision. Smatpay claims card tokenisation on a feature page but not in its API docs. | Card redirect each cycle on Pesepay. |

**What the aggregators offer on top.**

- **Pesepay**: EcoCash (USD and ZiG), InnBucks, Omari, Zimswitch cards, Visa/MC. No OneMoney,
  no ZIPIT. Published fees: 2% mobile money and Zimswitch, 3% cards, T+2, no setup. Official
  TypeScript SDK, self-serve sandbox. Its "direct debit" page is marketing; the API has no
  mandate or token. What it does have is `initiateInvoice` with `recurring: true` and a
  frequency: Pesepay emails the payer a pay link every cycle and collects on our behalf. That is
  a renewal reminder we do not have to build. The callback is a plain key header with no retries,
  so the adapter treats it as a hint and confirms with `pollStatus`.
- **Contipay**: the only aggregator carrying EcoCash + OneMoney + InnBucks + Zimswitch + ZIPIT +
  Visa/MC. Docs behind a login, fees by contract, no official Node SDK. Cannot be evaluated
  without an account.
- **Direct rails**: EcoCash has a real developer portal; InnBucks is polling-only after
  onboarding; OneMoney has none; Zimswitch only through an acquiring bank. Going direct saves
  roughly 0.6 points on EcoCash volume and costs three onboarding tracks and three
  reconciliation feeds. Not now.
- Every merchant of record (Stripe, Paddle, Lemon Squeezy, Paystack, Flutterwave) is closed to a
  Harare company. DPO left Zimbabwe in 2024.

**So the renewal model is the founder's, stated plainly.** A subscription has a period end.
Ahead of it the admin is told, in-app and on WhatsApp, that the workspace renews on that date;
at the due date we either push a charge to their wallet (EcoCash, InnBucks) or send the pay
link (everything else, and Pesepay's recurring invoice does this unprompted). Paid, the period
extends. Not paid by the end of grace, the workspace goes read-only with a banner and a pay
button; it is never locked and nothing is deleted. Annual prepay is the default ask because it
cuts the number of these moments from twelve to one.

Card auto-renew is designed for, not built: when Zimswitch Online's tokenisation leaves
sandbox, or a second card gateway with tokenisation is chosen, `initiatePayment` gains a
`storeInstrument` flag and the renewal job charges the stored token before falling back to the
push-or-link path. Nothing above the seam changes.

Decision: **open merchant accounts with Pesepay and Contipay this week** — the lead time is
the constraint, not the code — and go live on Pesepay. Both adapters exist in
`lib/payments/`. If a customer asks for OneMoney, the seam's single `PAYMENT_PROVIDER` becomes
a list and `initiateSubscriptionCheckout` takes a `method` and routes OneMoney to Contipay.
That is a registry change, not a rewrite, and it is not built until it is asked for.

Currency: price in USD, show the ZiG equivalent at the day's rate on the pay page, store
currency on every payment. IMTT is the payer's and differs by currency; say so on the page.

### 5.3 The billing page

`components/preferences/organization/billing-preferences.tsx` stops being read-only. One
page: current plan and seats, the annual-first plan cards, a Pay button that calls
`initiateSubscriptionCheckout` and redirects to the hosted page, and the payment history from
`SubscriptionPayment`. Payment marks are real logos (persona rule). The webhook route already
flips `TRIALING` → `ACTIVE`; a receipt email follows.

**Proof of payment.** EcoCash and InnBucks customers may also pay from their side, to
Corelith's merchant number, quoting a per-workspace reference, and upload the confirmation
screenshot with the transaction ID and the number paid from. That writes a
`SubscriptionPayment` with provider `manual`, status `PENDING`, and the proof attached. The
workspace keeps whatever it had while the proof is pending: a trial stays on Business, a
renewal stays out of grace. An operator confirms it in the admin control plane against the
merchant statement (automatic where the statement can be read, by eye where it cannot), which
applies the same `PAID` transition as a webhook and sends the receipt. A rejection carries a
reason that becomes the customer's message and a link back to the upload. This is the path
for the director who pays from their own phone, the shop that pays from the till, and anyone
whose push never arrived; it is deliberately a row on the same pay page, not a separate flow.

Renewals: 7 days before `currentPeriodEnd` the job sends the reminder; at T-0 it pushes a
wallet charge or sends the pay link (or lets Pesepay's recurring invoice do it); at T+3 it
reminds again; after grace the read-only degradation applies. Paying extends the period. There
is no renewal invoice model; the payment row is the record.

## 6. Lifecycle messaging

Two channels, one service: `lib/messaging/` with `sendEmail` (Resend, exists in
`lib/email/send.ts`) and `sendWhatsApp` (provider still to be chosen, master-plan risk #9;
templates drafted and submitted the week the provider is picked). Email ships first; every
WhatsApp message has an email twin so nothing waits on approval.

| When | Message | Trigger |
|---|---|---|
| Day 0 | Your workspace link, the WhatsApp support line | `workspace.created` |
| Day 1 | If no contacts: "Import from a spreadsheet in two minutes" | `import.completed` absent |
| Day 3 | "N deals have no next step" or, if solo, "Invite a teammate" | Derived |
| Day 7 | The second job: forms, site visits or quotes, chosen by the two answers | Derived |
| T-4 | Trial ends in four days; annual offer first | Job |
| T-0 | You are on Free; what changed | Job |
| Renewal T-7, T-3, T-0, T+3 | Pay link | Job |

Every message is one paragraph and one link. No digests.

## 7. Instrumentation

Events, all through `writePlatformAuditEvent`: `signup.started`, `account.verified`,
`workspace.created`, `onboarding.answered`, `import.completed` (with row count),
`deal.stage_changed` (first per workspace), `activity.logged` (first with a due date),
`invite.sent`, `invite.accepted`, `integration.installed` (with where: onboarding or settings), `checklist.completed`, `trial.converted`,
`trial.downgraded`.

Funnel in the admin portal (SS-6.1): signup → verified → workspace → setup → aha → team →
paid, per week, with time-to-setup and time-to-aha medians. Targets: ≥35% workspace→aha in
seven days, checklist completion >25% (median is 10%), trial→paid ~15%.

## 8. Marketing sites

Marketing stays in this repo, host-switched by product, because the pricing page must render
from the live catalog and signup lives in the same app. `app/home/*` becomes
`app/(marketing)/[product]` reading a per-product `site-data`. Attio lane: dark canvas,
product screenshot floated as a window, three-word headline, one primary CTA "Start free",
WhatsApp as the assisted path. Flare ships first; the Corelith site keeps its fiscal
positioning until Till's site replaces it.

## 9. What changes in the code

| Area | Change | Existing anchor |
|---|---|---|
| Schema | `Company.productId`, `Company.onboardingAnswers`; `WorkspaceDomain`; `WorkspaceMembership`; `WorkspaceInvite`; `isSample` on the CRM seed models | `SchoolPortalInvite`, `SubdomainReservation` |
| Registry | `lib/platform/products.ts`; delete `resolveWorkspaceProduct` inference | `lib/workspace-products.ts`, `client-templates.ts` |
| Hosts | Multi-root host context; `app`/`www` reserved | `lib/platform/tenant.ts`, `portal-hosts.ts`, `proxy.ts` |
| Auth | `otp` strategy live for tenant users; membership-aware credentials lookup; workspace picker on the central host; Google later | `lib/auth.ts`, `lib/auth-core/strategy-registry.ts`, `session-claims.ts` |
| Signup | `app/(central)/signup/*` (screens 1–6), `POST /api/signup/{start,verify,workspace,answers,invite}` | `lib/platform/provision.ts` (gets its first caller) |
| Catalog | `FLARE_*` tiers, Flare core bundles, integration definitions | `lib/platform/feature-catalog.ts`, 13-step checklist |
| CRM | Empty states with actions; checklist card on `/crm`; sample pack and its removal; import step reused from `/crm/import` | `components/crm/crm-overview.tsx`, `lib/crm/starter-templates.ts` |
| Members | Settings → Members and Invites; `/invite/[token]` | `lib/schools/portal-invites.ts` as the pattern |
| Billing | Checkout on the billing page; trial and renewal job; receipt email | `lib/payments/checkout.ts`, `webhook.ts`, `service.ts` |
| Proof of payment | `manual` adapter in the seam; proof upload on the pay page; `PaymentProof` attachment; operator confirm/reject in `components/admin-portal/` | `lib/payments/registry.ts`, `service.ts`, `PlatformAuditEvent` |
| Messaging | `lib/messaging/` over Resend now, WhatsApp when approved | `lib/email/send.ts`, `lib/notifications.ts` |
| Marketing | Per-product site data; Flare pages | `app/home/*`, `lib/marketing/pricing.ts` |

Deleted, not kept behind a flag: the one-company-per-email refusals, the profile-and-features
product inference, the read-only billing page, the `console.error` lead path if any remains.

## 10. Build order

Each layer leaves a working product. Nothing in a later layer is started before the earlier
one is demonstrable in a browser.

| Layer | Delivers | Demonstration |
|---|---|---|
| 0 — procurement, week 1 | Names confirmed; domains registered; Pesepay and Contipay merchant applications filed; WhatsApp provider chosen and templates submitted; Resend domain for Flare | Confirmations in hand |
| 1 — product and host | Registry; `Company.productId`; multi-root hosts; Flare ladder in the catalog; hidden accounting; brand by product | `hurudza-creative.flare.co.zw` opens the existing CRM tenant under the Flare brand with the Flare plan showing |
| 2 — a stranger gets a workspace | OTP sign-in; screens 1–3; `provisionTenant` called from the API; lands on `/crm` | Incognito browser: email → code → workspace → pipeline, nobody in the loop |
| 3 — onboarding | Screens 4–5 and 6b; sample pack; empty states; checklist; two-answer personalisation; the integration catalogue | Same run ends on a pipeline with real or sample deals and a live checklist |
| 4 — teams | Membership backfill; invites by email, link and domain; Members page; workspace picker | Second person accepts on a phone via WhatsApp and appears in the pipeline |
| 5 — billing | Trial job; billing page checkout; Pesepay sandbox → `ACTIVE`; receipts; renewals | Sandbox EcoCash payment flips the trial to Business; expiry drops a test tenant to Free |
| 6 — lifecycle and funnel | Messaging service; the eight messages; admin funnel | Clock-advanced tenant receives the sequence; funnel shows it |
| 7 — second product | Till or Crew as a registry entry, template and site | New product with no new auth, billing or invite code |

**Built so far (2026-09-28).** Layer 2 works end to end: `/signup/flare`, the emailed code,
workspace creation through `provisionTenant`, the handoff onto the workspace host, and sign-in
by emailed code on every workspace's login page. Three differences from the plan above, all
deliberate:

- **Product in the path, not the host.** Multi-domain hosting (layer 1) is its own change to
  `lib/platform/tenant.ts` and `proxy.ts`; until it lands, the signup URL names the product and
  workspaces live under the one `PLATFORM_ROOT_DOMAIN`. `Company.product` is recorded from day
  one, so nothing has to be backfilled when hosts move.
- **The trial runs on the CRM template's recommended tier (Grow), not a Flare ladder.** The
  ladder in §2.4 waits on the founder's pricing decision (§11); inventing tiers first would put
  unconfirmed prices in the catalog.
- **Three steps, not seven.** Screens 4–6b are layer 3; the step count on the pages says 3
  because that is what exists.

Layers 1–3 are the ones that decide whether the pivot is real. Layers 4 and 5 can be built by
different people once 3 is demonstrable, since neither touches the other's files.

## 11. Decisions the founder owns

1. Names and domains in §1, and whether Educo survives the NGO clash.
2. The Flare ladder in §2.4: three tiers, seat caps, whether extra seats are sold.
3. Whether Free is permanent or a 12-month lever. The trial design assumes permanent.
4. WhatsApp number required at workspace creation (recommended) or deferred to the first
   message that needs it.
5. Whether OneMoney absence is acceptable at launch. The recommendation says yes; the
   customer list should confirm it.
6. Which product is second: Till follows the existing fiscal wedge; Crew is the smallest build.

## 12. Sources

Onboarding: Hulick (Intercom interview; Heavybit); Bush, *Product-Led Onboarding* via
Productboard and ProductLed; Reforge setup/aha/habit guides; Verna, "Hey B2B, you are measuring
activation wrong", "Reverse trials", "Don't reinvent user profiling"; Rachitsky, "How to
determine your activation" and "What is a good activation rate"; Userpilot 2024 checklist
benchmarks; Appcues on surveys and empty states; Chameleon on personalisation; Candu teardowns
of Linear and Notion; UserGuiding on Slack; Attio help on mailbox sync; ChartMogul 2026 SaaS
conversion report; LaunchPad on African SaaS pricing; MISA on Zimbabwean data costs.

Gateways: pesepay.com pricing and codevirtus/pesepay-node; contipay.co.zw; doc.smatpay.africa;
docs.payonify.com; developers.ecocash.co.zw and 67even's EcoCash and InnBucks guides;
zimswitch.co.zw (ZEEPAY, Zimswitch Online), zimswitchonline.co.zw/features ("Tokenisation —
Available in Sandbox", "Recurring Billing (Requires Tokenisation)"), zimswitch.docs.oppwa.com
subscriptions; developers.paynow.co.zw status_update and express_checkout_transactions
("Tokens are valid for up to six (6) months") and forums.paynow.co.zw thread 8314; EcoCash Bill
Manager coverage in NewsDay and Techzim, 2022; Techzim's 2023 Zimswitch explainer; Techzim on ZB Smile & Pay; The Anchor on DPO's
exit; Stripe, Paddle, Lemon Squeezy and Paystack country lists; nyuchi.com 2026 gateway
review. Full URLs are in the research transcript of 2026-09-27 and belong in
`docs/payments/` when the memo for SS-4.1 is written from this section.

## 13. Screens

The screens for every workflow in this document, drawn on the shipped Corelith tokens and
the B2B screen rules, are published as a canvas:
<https://claude.ai/artifact/2kESZodY49YN85HnZPwMDS> (private; share from the page).

| Part | Contents |
|---|---|
| 1 Primitives P-01 to P-12 | Colour and type tokens, spacing, buttons, inputs, the one-time code, selection controls, status, chips and avatars, progress and steps, empty/alert/toast, menu and list row |
| 2 Components C-01 to C-17 | Auth card, option card, payment method row, plan card, setup checklist, invite composer, import drop zone, column mapping, sidebar rail, top bar with trial chip, deal card (sample variant), integration card, workspace row, banners, confirm dialog, proof of payment, integration pick |
| 3 Screens S-01 to S-18 (with S-12b, S-13b, S-16b) | Start, Code, Join instead, Workspace, Two questions, Bring your contacts (choose, map, importing), Invite your team, Bring the rest of the business in, Home, Sign in and picker, Accept an invite, Members, Billing, Pay, Send the payment yourself (proof), Approve on your phone / Paid / Failed, Proof received / confirmed / rejected, Trial ending and Free, Renewal due and read-only, Integrations grid and integration detail, Empty states, Payments to confirm (operator) |
| 4 Workflows W-01 to W-06 | Sign up to home, Team invites (email, link, domain, again in context), Trial to paid or Free, Renewal, Switch on an integration, Returning sign-in |

The Members and Billing settings surfaces (S-10, S-11, S-16) set the pattern the management surface adopts: one settings breadcrumb rail with counts, one-line header with one verb, tables with a badge only for exceptions.

Records, stage names, nav groups and routes are the codebase's. Payment marks are placeholders
for the rails' real logos. Prices are the proposed Flare ladder from §2.4; the worked example pays for Business and Payroll, US$ 1,228.80 a year.
