# Tenant Surface Domain Provisioning (Admin Portal)

Date: 2026-04-08

## Purpose

Provision deep tenant hostnames automatically during organization onboarding, while keeping host isolation for POS, school portals, and other vertical terminals.

This enables patterns like:
- `pos.<tenant>.apps.pagka.dev`
- `parents.<tenant>.apps.pagka.dev`
- `students.<tenant>.apps.pagka.dev`
- `staff.<tenant>.apps.pagka.dev`

## How It Works

Admin Portal organization provisioning (`org.provisionBundle`) now triggers tenant domain provisioning after the company and subdomain reservation are created.

For tenant subdomain `spar` and root domain `apps.pagka.dev`, the provisioner attempts to add:
- `spar.apps.pagka.dev`
- `*.spar.apps.pagka.dev`

The wildcard host is the key isolation enabler for all terminal surfaces under that tenant.

## Provisioning Flow

1. Admin runs org provisioning wizard.
2. Organization, admin user, tier, bundles, feature flags, and subdomain reservation are created.
3. Domain provisioner calls Vercel Project Domains API.
4. Subdomain reservation status is updated:
   - `ACTIVE` when wildcard provisioning succeeds.
   - `RESERVED` when provisioning is not completed.
5. Warnings are returned in provisioning result for operator visibility.

## Required Environment Variables

Set these in your deployment environment (admin API runtime):
- `PLATFORM_ROOT_DOMAIN` (example: `apps.pagka.dev`)
- `PLATFORM_VERCEL_TOKEN`
- `PLATFORM_VERCEL_PROJECT_ID`
- `PLATFORM_VERCEL_TEAM_ID`

Fallback behavior:
- If `PLATFORM_VERCEL_PROJECT_ID` and `PLATFORM_VERCEL_TEAM_ID` are not set, the system tries `.vercel/project.json`.
- If credentials/context are missing, org provisioning still succeeds, but domain provisioning is skipped with warnings.

## Operational Notes

- Domain provisioning is idempotent. Existing domains are treated as success.
- If Vercel rate limits uploads/deployments, provisioning can still attach domains to current production deployment once API access is available.
- Keep root domain DNS delegated to Vercel nameservers for automated cert issuance.

## Affected Modules

- `scripts/platform/domain/organization-advanced.ts`
- `scripts/platform/domain/tenant-surface-domain-provisioning.ts`
- `scripts/platform/types.ts`
