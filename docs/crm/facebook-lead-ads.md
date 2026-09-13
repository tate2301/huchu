# Facebook Lead Ads — deployment setup

One Meta app serves every workspace. You set it up once; after that a customer
connects their Page by pressing a button and choosing it from a list.

For the guide you hand a customer, see
[`facebook-lead-ads-customer-guide.md`](./facebook-lead-ads-customer-guide.md).

---

## Why one app and not one per customer

The first cut of this integration asked each tenant for a Meta app id, an app
secret and a long-lived Page access token. Getting the third means running three
Graph API calls by hand. That is a wall, not a learning curve, for the people
this feature is for — and it put an app secret in a form field, which is the
wrong place for one.

Facebook Login does those same three calls server-side, but only if one app
serves everyone: an OAuth client id is deployment config, not something a
customer types. It also moves Meta's app review from every customer to us,
once — `leads_retrieval` needs Advanced Access before an app may read a
stranger's lead, and no small business is going to film a screencast and wait a
week for Meta.

The cost is one constraint: a Meta app has exactly **one** webhook URL, so a
delivery is routed by the only id it carries — `entry[].id`, the Page. That is
why `CrmFacebookConnection.pageId` is globally unique. Two workspaces claiming
one Page would make a lead's owner a coin toss, so connecting a Page another
workspace holds is refused.

---

## One-time setup

### 1. Create the Meta app

**developers.facebook.com** → **My Apps** → **Create app** → business type.
Then **App settings → Basic** for the **App ID** and **App secret**.

### 2. Set four environment variables

```
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_WEBHOOK_VERIFY_TOKEN=...        # any random string you choose
CRM_INTEGRATION_ENCRYPTION_KEY=...       # openssl rand -base64 32
```

The last one encrypts stored Page tokens and the short-lived connect cookie.
Without it — or without the other three — the settings screen hides the Connect
button and says why, rather than offering one that 503s.

Rotating `CRM_INTEGRATION_ENCRYPTION_KEY` makes every stored token unreadable.
Customers reconnect in one click, but they do have to.

### 3. Add Facebook Login and register the redirect

**Products → Facebook Login → Settings.** Under **Valid OAuth Redirect URIs**:

```
https://<your-host>/api/v2/crm/integrations/facebook/callback
```

Meta compares this string to the one we send on both the dialog and the code
exchange, and refuses a mismatch. It must match exactly — scheme, host, path,
no trailing slash.

### 4. Point the webhook at the CRM

**Products → Webhooks → Page → Subscribe to this object.**

| Field | Value |
|---|---|
| Callback URL | `https://<your-host>/api/public/crm/webhook/facebook` |
| Verify Token | whatever you set `FACEBOOK_WEBHOOK_VERIFY_TOKEN` to |

Press **Verify and Save**, then tick the **`leadgen`** field.

There is no per-customer URL to configure. Every tenant's Pages deliver here.

### 5. Get Advanced Access for `leads_retrieval`

**App Review → Permissions and Features.** Request **Advanced Access** for
`leads_retrieval` and `pages_manage_metadata`, then switch the app to **Live**.

Until this is done the app can only read leads from people who have a role on
it. Your own test leads work; a real customer's lead comes back as a permissions
error. This is the single most common reason a setup looks finished and produces
nothing.

### 6. Run the migration

`20260913090000_crm_facebook_platform_app`. It drops the per-tenant credential
columns and deletes any connections made under the old flow — their tokens were
issued to a different Meta app and would fail signature verification on the
first delivery. Better a customer presses one button than a row that looks
connected and is not. The delivery ledger is kept.

---

## What a customer then does

1. **CRM → Settings → Facebook ads → Connect Facebook**
2. Approve Facebook's permission screen
3. Pick their Page from the list

That is the whole flow. Behind the button:

| Step | What happens |
|---|---|
| Connect | Signed `state` carrying the workspace; redirect to Facebook |
| Callback | Code → user token → long-lived user token → `/me/accounts` |
| Picker | Pages listed by name; already-connected ones marked |
| Pick | Page token encrypted and stored, Page subscribed to `leadgen` |

The subscribe happens while the customer is still watching. A connection that
reports success and quietly receives nothing is the failure this flow exists to
prevent — an app can have a verified webhook and a perfectly good token and
still receive nothing, because a Page delivers no leads until it is subscribed.

---

## What arrives

| Facebook form field | CRM lead |
|---|---|
| `full_name`, or `first_name` + `last_name` | Contact name |
| `email` | Contact email — also the dedupe key against existing clients |
| `phone_number` | Contact phone — the dedupe key when there is no email |
| `company_name`, `job_title`, address parts | Lead details |
| Any custom question | Lead details, and the activity body, as "Question — answer" |

| CRM field | Value |
|---|---|
| Source | the connection's source label, default "Facebook Lead Ads" |
| Channel | **Paid ads**, or **Social media** when the lead is organic |
| UTM source | `facebook`, or `instagram` when filled on Instagram |
| UTM medium | `paid_social`, or `social` for an organic lead |
| UTM campaign / content / term | campaign name, ad name, lead form id |

---

## How a delivery is handled

**Verify, route, record, deduplicate, only then fetch and apply.**

Verifying is first: the URL is public, so an unsigned POST costs one hash and
never reaches the database. Routing is by Page. Recording precedes the Graph
call so a fetch that fails leaves a retryable row rather than a lead nobody ever
saw. The unique key on `(pageId, leadgenId)` makes Meta's retries a no-op.

Everything past a verified signature answers `200`, including a lead we failed
to fetch — Meta disables a webhook that keeps erroring, and losing the
subscription would cost every later lead too.

| Status | Meaning |
|---|---|
| `INGESTED` | A lead was created. |
| `DUPLICATE` | Meta re-sent a submission already handled. |
| `IGNORED` | Unconnected Page, paused connection, or a form outside the allow-list. |
| `FAILED` | Graph fetch or lead creation failed. **Retry** is available. |

**Retry within 90 days.** Meta stops serving a lead's answers after that.

---

## When it does not work

**"The URL couldn't be validated" when saving the webhook.**
`FACEBOOK_WEBHOOK_VERIFY_TOKEN` is unset or does not match what you typed in
Meta. The endpoint answers 500 for unset and 403 for mismatched — check which.

**"URL blocked" on the permission screen.**
The redirect URI is not registered on the app, or does not match exactly.

**Everything green, no leads.**
Almost always Advanced Access (step 5). Confirm the app is Live and that
`leads_retrieval` shows Advanced Access, not Standard.

**Deliveries all `failed` with an auth error.**
The customer's Page token expired or was revoked — a password change, or the app
removed from the Page. They reconnect, then **Retry** the failed deliveries.

**A customer cannot connect their Page: "already connected to another workspace".**
Working as designed — `pageId` is globally unique. Whoever holds it disconnects
first.

---

## Where the code lives

| File | Does |
|---|---|
| `lib/crm/facebook/app.ts` | The deployment's Meta app config and OAuth scopes. |
| `lib/crm/facebook/oauth.ts` | Signed state, code exchange, token extension, Page listing. |
| `lib/crm/facebook/connect-session.ts` | The encrypted cookie holding the user token between callback and pick. |
| `lib/crm/facebook/webhook.ts` | Verify, route, record, deduplicate, fetch, apply. Plus retry. |
| `lib/crm/facebook/signature.ts` | `X-Hub-Signature-256` and the `hub.verify_token` handshake. |
| `lib/crm/facebook/graph.ts` | Read a leadgen, read a Page, list forms, subscribe. |
| `lib/crm/facebook/field-mapping.ts` | Meta's `field_data` → a CRM lead. |
| `lib/crm/facebook/secrets.ts` | AES-256-GCM at rest. |
| `app/api/public/crm/webhook/facebook/route.ts` | The one public callback. |
| `app/api/v2/crm/integrations/facebook/**` | Connect, callback, page picker, settings. |
| `components/crm/settings/facebook-panel.tsx` | The settings section. |

Two notes for anyone changing this:

- The webhook route reads `request.text()`, never `request.json()`. The
  signature is over the bytes as delivered, and re-serialising a parsed body
  changes them — which fails every real delivery while still passing for
  nothing.
- The `GET` handshake answers `text/plain`, not the JSON envelope every other
  route here uses. Meta compares the body to `hub.challenge` byte for byte.
