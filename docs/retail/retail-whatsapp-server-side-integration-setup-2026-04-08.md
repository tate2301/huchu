# WhatsApp Server-Side Integration Setup (Retail)

Date: 2026-04-08

## Goal

Move from client-side `wa.me` links to server-side WhatsApp delivery so receipts can be sent from backend workflows, audited, and retried.

## Recommended Provider Pattern

Use a provider abstraction with one active provider per company:

- `TWILIO_WHATSAPP` (fastest to launch)
- `META_WHATSAPP_CLOUD` (direct Meta Cloud API)

Store tenant-level provider settings in `FiscalisationProviderConfig` (same pattern used for retail tender policy) or a dedicated messaging config model.

## Environment Variables (Baseline)

### Twilio
- `WHATSAPP_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (or your approved sender)

### Meta Cloud API
- `WHATSAPP_PROVIDER=meta`
- `META_WHATSAPP_TOKEN=...`
- `META_WHATSAPP_PHONE_NUMBER_ID=...`
- `META_WHATSAPP_API_VERSION=v20.0`

## Server Flow (Receipt Send)

1. POS posts sale as normal (`/api/v2/retail/pos/sales`).
2. Backend receives send request (recommended endpoint: `POST /api/v2/retail/pos/sales/{id}/whatsapp`).
3. API validates:
   - authenticated retail session
   - sale belongs to tenant
   - sale has customer phone
4. API formats E.164 phone and message/template payload.
5. API sends through active provider SDK/HTTP call.
6. API stores outbound event log:
   - tenant, saleId, provider, phone, status, providerMessageId, error
7. API returns delivery enqueue/accepted response.

## Data and Audit Recommendation

Track outbound messages in a table like `OutboundMessageLog`:

- `companyId`, `channel` (`WHATSAPP`), `providerKey`
- `entityType` (`RETAIL_SALE`), `entityId` (sale id)
- `destination`
- `payloadJson`
- `providerMessageId`
- `status` (`QUEUED|SENT|FAILED|DELIVERED`)
- `errorMessage`
- timestamps

This enables retries, delivery history, and compliance auditing.

## Webhooks (Delivery Status)

Configure provider webhook endpoint (example):

- `POST /api/v2/messaging/webhooks/whatsapp`

Webhook should:

- verify signature/token
- map provider status to internal status
- update `OutboundMessageLog`
- remain idempotent by provider message id

## POS UX Change (Recommended)

Replace direct `wa.me` open with:

- `Send WhatsApp receipt` button calls server endpoint
- show statuses: `Sending...`, `Sent`, `Failed`
- allow retry from POS history or sale detail

## Security Checklist

- Keep tokens in `.env` / Vercel env only
- Never expose provider secrets to client
- Rate-limit send endpoint per user + tenant
- Validate phone numbers server-side
- Add idempotency key (`saleId + phone + templateVersion`) to avoid duplicate sends

## Rollout Plan

1. Add messaging provider abstraction and tenant config.
2. Add server send endpoint for sale receipts.
3. Add outbound log model + webhook handler.
4. Switch POS button from `wa.me` link to API call.
5. Add admin setup page for tenant provider credentials and sender validation.

## Quick Start (Twilio)

1. Create Twilio account and enable WhatsApp sender/sandbox.
2. Set env vars in Vercel project settings.
3. Deploy.
4. Test send with one posted sale and known WhatsApp number.
5. Confirm outbound log + webhook status updates.
