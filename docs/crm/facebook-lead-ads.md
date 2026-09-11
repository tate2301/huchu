# Facebook Lead Ads → CRM

How a lead someone fills in on a Facebook or Instagram ad becomes a lead in the
CRM pipeline, and how to set that up end to end.

---

## Why the API key you already made will not work

The CRM already has a generic lead webhook — `POST /api/public/crm/webhook/leads`
with an `x-api-key` header — and its API keys even offer "Facebook Lead Ads" as
an example source label. That endpoint is for a system you control: your own
website form, a Zapier step, an n8n flow.

Meta is not that system. Three things make Lead Ads its own integration:

1. **No custom headers.** Meta posts its own envelope to one callback URL per
   app. There is nowhere to put `x-api-key`.
2. **Signatures, not tokens.** A delivery authenticates with
   `X-Hub-Signature-256`: an HMAC-SHA256 of the exact bytes delivered, keyed by
   your Meta **app secret**. So the credential is a signing key that has to be
   stored and replayed, not a token that can be stored as a hash and compared.
3. **The payload has no lead in it.** A delivery carries a `leadgen_id` and the
   ids around it. The name, email, phone and every answer come back out of the
   Graph API afterwards, authenticated with a **Page access token**.

So there is a dedicated endpoint, `/api/public/crm/webhook/facebook/{token}`,
and a dedicated settings section: **CRM → Settings → Facebook ads**.

> If you would rather not manage a Meta app at all, Zapier or Make can sit in
> between: have them watch the lead form and POST to the generic
> `/api/public/crm/webhook/leads` endpoint with the API key you already
> generated. You lose the ad, ad set and campaign attribution that the native
> path captures, and you gain a monthly bill and a second thing that can break.

---

## What you need before you start

| Thing | Where it comes from |
|---|---|
| A Facebook **Page** | The Page the ads run from. You need an admin role on it. |
| A Meta **app** | developers.facebook.com → My Apps → Create App → **Business** |
| **App ID** and **App secret** | App dashboard → App settings → Basic |
| A long-lived **Page access token** | Graph API Explorer, then extended — see below |
| `leads_retrieval` and `pages_manage_metadata` permissions | Requested on the app |
| `CRM_INTEGRATION_ENCRYPTION_KEY` set on the deployment | `openssl rand -base64 32` |

The last one is ours, not Meta's. The app secret and Page access token are
stored encrypted (AES-256-GCM), and without that key the deployment refuses to
save a connection rather than storing a token it cannot protect. The settings
panel says so before you type anything.

---

## Step 1 — Get a long-lived Page access token

A token from the Graph API Explorer lasts about an hour, which is long enough to
pass the setup and short enough to fail silently the next morning. Extend it.

1. **Graph API Explorer** (developers.facebook.com/tools/explorer), pick your
   app, then **Get Token → Get User Access Token**. Tick `leads_retrieval`,
   `pages_show_list`, `pages_read_engagement` and `pages_manage_metadata`.
2. Exchange the short-lived user token for a long-lived one:

   ```
   GET https://graph.facebook.com/v23.0/oauth/access_token
       ?grant_type=fb_exchange_token
       &client_id={app-id}
       &client_secret={app-secret}
       &fb_exchange_token={short-lived-user-token}
   ```

3. Use that long-lived **user** token to fetch the **Page** token, which does
   not expire as long as the user token was long-lived:

   ```
   GET https://graph.facebook.com/v23.0/me/accounts
       ?access_token={long-lived-user-token}
   ```

   The response lists your Pages. Take the `access_token` of the right one, and
   note its `id` — that is the Page ID you will need.

4. Sanity check what you have:

   ```
   GET https://graph.facebook.com/v23.0/debug_token
       ?input_token={page-token}
       &access_token={app-id}|{app-secret}
   ```

   `expires_at: 0` means it does not expire. Anything else, go back to step 2 —
   you extended the wrong token.

---

## Step 2 — Connect the Page in the CRM

**CRM → Settings → Facebook ads → Connect Page.** Fill in the Page ID, app ID,
app secret and the Page access token from step 1, and pick the channel these
leads should be attributed to (**Paid ads** is the default).

Saving generates two values, shown at the top of the panel with copy buttons:

- a **callback URL** — `https://your-workspace/api/public/crm/webhook/facebook/{token}`
- a **verify token**

Both go into Meta next. Nothing is verified yet, and the panel says
*Awaiting Meta* until it is.

---

## Step 3 — Point the Meta app at the callback URL

In the app dashboard: **Products → + Add product → Webhooks → Page → Subscribe
to this object.**

- **Callback URL** — paste the callback URL from step 2.
- **Verify Token** — paste the verify token from step 2.
- **Verify and Save.**

Meta immediately sends a `GET` with `hub.mode=subscribe`, `hub.verify_token` and
`hub.challenge`. The endpoint compares the token and echoes the challenge back
as plain text. If it fails, see *When it does not work* below.

Then, in the Page webhook's field list, **subscribe to `leadgen`**. This is a
separate tick from saving the callback URL, and it is the one people miss.

---

## Step 4 — Subscribe the Page, and prove it works

Back in **CRM → Settings → Facebook ads**, press **Check** on the connection.

That one button does three things, in order: reads the Page with the saved
token (proving the token works and that it belongs to that Page), checks whether
the Page is subscribed to your app's `leadgen` field, and subscribes it if not.
It reports exactly what Meta said.

This step exists because the failure it prevents is invisible otherwise. An app
webhook pointed at a verified callback URL shows a green tick in the Meta
dashboard whether or not any Page is subscribed to it — so the dashboard looks
finished, the test button works, and no real lead ever arrives.

---

## Step 5 — Send a test lead

Use Meta's **Lead Ads Testing Tool**
(developers.facebook.com/tools/lead-ads-testing): pick the Page and the form,
press **Create lead**.

Within a second or two the lead should appear in **CRM → Leads**, stage **New**.
The delivery shows in **Settings → Facebook ads → Deliveries** as `ingested`.

> Leads created by the testing tool are real rows in your CRM. Archive them when
> you are done, or they will sit in the pipeline as enquiries nobody can call.

---

## What arrives, and where it lands

| Facebook form field | CRM lead |
|---|---|
| `full_name`, or `first_name` + `last_name` | Contact name |
| `email` | Contact email — also the dedupe key against existing clients |
| `phone_number` | Contact phone — the dedupe key when there is no email |
| `company_name`, `job_title`, address parts | Lead details |
| Any custom question | Lead details, and the activity body, as "Question — answer" |

Attribution is captured from the ad, not guessed:

| CRM field | Value |
|---|---|
| Source | the connection's source label, default "Facebook Lead Ads" |
| Channel | **Paid ads**, or **Social media** when the lead is organic (`is_organic`) |
| UTM source | `facebook`, or `instagram` when the form was filled on Instagram |
| UTM medium | `paid_social`, or `social` for an organic lead |
| UTM campaign | The campaign name, falling back to its id |
| UTM content | The ad name, falling back to its id |
| UTM term | The lead form id |

A lead whose email or phone already belongs to a client is attached to that
client rather than creating a second one. The assignee, if the connection sets
a default, is notified; otherwise every CRM manager is.

---

## What happens to a delivery

Every delivery is recorded before it is acted on, and the ledger is in
**Settings → Facebook ads → Deliveries**.

| Status | Meaning |
|---|---|
| `ingested` | A lead was created. |
| `duplicate` | Meta re-sent a submission that was already handled. Nothing changed. |
| `ignored` | The delivery was for a Page or a form this connection does not accept. |
| `failed` | The answers could not be fetched or the lead could not be created. **Retry** is available. |

The order matters and it is deliberate: **route, verify, record, deduplicate,
only then fetch and apply.** A delivery whose Graph call fails leaves a `failed`
row with the reason, which can be retried once the cause is fixed — rather than
being a lead a customer filled in that nobody ever saw.

**Retry within 90 days.** Meta stops serving a lead's answers after that, and a
retry then returns nothing.

---

## When it does not work

**"The URL couldn't be validated" when saving the webhook in Meta.**
Meta could not reach the callback URL, or the verify token did not match. The
URL has to be publicly reachable over HTTPS with a valid certificate — a
localhost or preview URL behind auth will not do. Copy both values again from
the panel rather than retyping them.

**The callback verified, but no leads arrive.**
Almost always the Page is not subscribed to `leadgen`. Press **Check**. If it
reports the Page is subscribed and leads still do not arrive, confirm the ad is
actually running and that the lead form belongs to the Page you connected.

**Deliveries show, but every one is `failed` with an auth error.**
The Page access token expired or was revoked — someone changed their password,
removed the app, or the token was never extended in the first place. Redo step 1
and use **Connect Page**'s edit to paste the new token, then **Retry** the failed
deliveries.

**The connection shows a signature error.**
The app secret saved in the CRM is not the one the app is signing with. This is
what a rotated app secret looks like. Paste the current secret and the error
clears.

**Leads arrive with the name "Facebook lead".**
The form does not ask for a name. The lead still has the email or phone, and the
answers are on the record — but the form is worth fixing.

---

## How it is built

| File | Does |
|---|---|
| `app/api/public/crm/webhook/facebook/[token]/route.ts` | The public endpoint. Raw bytes, headers, status codes — nothing else. |
| `lib/crm/facebook/webhook.ts` | Route, verify, record, deduplicate, fetch, apply. Plus retry. |
| `lib/crm/facebook/signature.ts` | `X-Hub-Signature-256` and the `hub.verify_token` handshake. |
| `lib/crm/facebook/graph.ts` | The four Graph calls: read a leadgen, read a Page, list forms, subscribe. |
| `lib/crm/facebook/field-mapping.ts` | Meta's `field_data` → a CRM lead. |
| `lib/crm/facebook/secrets.ts` | AES-256-GCM at rest for the app secret and Page token. |
| `lib/crm/facebook/connections.ts` | The settings-screen side: callback URLs, the credential check. |
| `components/crm/settings/facebook-panel.tsx` | The settings section. |

Two notes for anyone changing this:

- The route reads `request.text()`, never `request.json()`. The signature is
  over the bytes as delivered, and re-serialising a parsed body changes them —
  which fails every real delivery while still passing for nothing.
- The `GET` handshake answers `text/plain`, not the JSON envelope every other
  route here uses. Meta compares the body to `hub.challenge` byte for byte, so a
  JSON wrapper fails the handshake with a `200`.
