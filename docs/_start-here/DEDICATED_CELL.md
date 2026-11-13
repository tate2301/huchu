# Standing up a dedicated cell

A dedicated cell is one enterprise client on their own infrastructure:
- their own Vercel project
- their own Neon database
- their own file store and domain

It runs core's `stable`, or an industry fork's `stable` (see
[RELEASES_AND_FORKS.md](./RELEASES_AND_FORKS.md)). The code is identical to the
shared cell, and the cell holds one tenant.

Work through the steps in order. Each one names what proves it worked.

## 1. Database (Neon)

- Create a Neon project in the region nearest the client, with point-in-time
  restore on.
- Take a nightly logical backup (`pg_dump`) to object storage.
- Create a `staging` branch. Only Preview deploys use it, never production.
- Create the read-only reader roles that Vane and Explore use, as for the
  shared cell (`scripts/explore-reader-sql.ts`). Set
  `VANE_READER_DATABASE_URL`, `VANE_READER_PRIVATE_DATABASE_URL` and
  `EXPLORE_READER_DATABASE_URL`.

**Proof:** `DATABASE_URL=<production> node scripts/check-schema-drift.mjs` passes after step 3.

## 2. Vercel project

1. Create a new project on our team from the repository the cell runs (core or the fork).
2. Set **Production Branch** to `stable`.
3. Connect a Vercel Blob store to the project; OIDC sets `BLOB_STORE_ID`.
4. Set the **Production** environment variables.

   **Fresh secrets** (never copied from another cell):
   - `NEXTAUTH_SECRET`
   - `OPERATOR_SECRET_KEY`
   - `CRON_SECRET`
   - `CRM_INTEGRATION_ENCRYPTION_KEY`
   - `PAYMENT_WEBHOOK_SECRET` (if payments are on)

   **Database:**
   - `DATABASE_URL`, the pooled Neon URL. `scripts/migrate-deploy-production.mjs` derives the direct host itself.

   **Hosts:**
   - `PLATFORM_ROOT_DOMAIN`, a subdomain of the client's domain, e.g. `erp.client.co.zw`
   - `PLATFORM_ROOT_HOSTS`
   - `ADMIN_ROOT_DOMAIN`
   - `NEXTAUTH_URL`

   **Email:**
   - `RESEND_API_KEY`
   - `EMAIL_FROM_ADDRESS`, on a Resend sending domain verified on the client's domain

   **Fiscalisation:** the client's own device values:
   - `ZIMRA_FDMS_API_BASE_URL`
   - `ZIMRA_FDMS_PORTAL_URL`
   - `ZIMRA_FDMS_DEVICE_ID`
   - `ZIMRA_FDMS_DEVICE_SERIAL`
   - `ZIMRA_FDMS_ACTIVATION_KEY`
   - `ZIMRA_FDMS_CERTIFICATE`
   - `ZIMRA_FDMS_PRIVATE_KEY`

   **Gates:**
   - `FEATURE_GATE_POLICY=deny`
   - `NEXT_PUBLIC_FEATURE_GATE_POLICY=deny`

   **Only if used:**
   - `ANTHROPIC_API_KEY` and `VANE_MODEL`
   - the payment provider keys
   - the `META_WHATSAPP_*` values
5. Set the **Preview** environment's `DATABASE_URL` to the Neon `staging` branch.
   Previews skip migrations (`migrate-deploy-production.mjs`), but they read
   and write whatever this points at.

**Proof:** a deploy of `stable` goes green and its build log shows `prisma migrate deploy` applying every migration.

## 3. Domains

- Add the tenant host and its portals to the Vercel project:
  - `<slug>.<PLATFORM_ROOT_DOMAIN>`
  - `pos.<slug>.<PLATFORM_ROOT_DOMAIN>` for the gate tills
  - any other portal host the client uses
- The client adds the DNS records Vercel shows; we confirm the domain verifies.

**Proof:** the tenant host serves the sign-in page over HTTPS.

## 4. Operator and tenant

1. Add the first platform operator to the cell's database:

   ```bash
   DATABASE_URL=<production> pnpm operator:add
   ```
2. Provision the client's tenant from the admin portal, or with `pnpm platform`, using its client template on the ENTERPRISE tier.
3. Create the tenant owner.

**Proof:** the owner signs in on the tenant host and sees only the modules in the template.

## 5. Scheduled jobs

Create a cron-job.org job that calls `GET https://<tenant host>/api/cron/tick`
every minute, with the cell's `CRON_SECRET` (`docs/scheduled-jobs.md`).

**Proof:** a report scheduled for "now" arrives by email.

## 6. Release channel

- The cell deploys only when `stable` moves, through `pnpm release:promote` in
  its repository.
- For a fork cell, set the fork's `NEON_PROJECT_ID` and `NEON_PARENT_BRANCH`
  to this cell's project and production branch, so every PR rehearses its
  migrations against a copy of this cell's data.

**Proof:**
- Promote a release.
- The cell redeploys and applies its migrations.
- The shared cell is untouched.

## 7. Restore drill (before go-live, then every quarter)

1. Restore production to a point in time on a new Neon branch.
2. Point a preview at it.
3. Check yesterday's records are there.
4. Delete the branch.

**Proof:** written down in the cell's run log with the date and the restore point.
