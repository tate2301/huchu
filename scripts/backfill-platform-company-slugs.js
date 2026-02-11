#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
require("dotenv").config();

const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn("DATABASE_URL not set. pg will use PG* env vars.");
}

const pool = connectionString ? new Pool({ connectionString }) : new Pool();

const SLUG_MAX_LENGTH = 48;

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, SLUG_MAX_LENGTH);
}

function ensureUniqueSlug(baseSlug, usedSlugs) {
  const base = baseSlug || "company";
  let candidate = base;
  let suffixCounter = 2;

  while (usedSlugs.has(candidate)) {
    const suffix = `-${suffixCounter}`;
    const prefixLimit = Math.max(1, SLUG_MAX_LENGTH - suffix.length);
    candidate = `${base.slice(0, prefixLimit)}${suffix}`;
    suffixCounter += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      SELECT to_regclass($1) AS relation_name
    `,
    [`public."${tableName}"`],
  );
  return Boolean(result.rows[0]?.relation_name);
}

async function ensureTenantColumns(client) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantStatus') THEN
        CREATE TYPE "TenantStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DISABLED');
      END IF;
    END
    $$;
  `);

  await client.query(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "slug" TEXT;`);
  await client.query(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "tenantStatus" "TenantStatus";`);
  await client.query(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "isProvisioned" BOOLEAN;`);
  await client.query(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);`);
  await client.query(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3);`);

  await client.query(
    `
      ALTER TABLE "Company"
      ALTER COLUMN "tenantStatus" SET DEFAULT 'PROVISIONING'
    `,
  );
  await client.query(
    `
      ALTER TABLE "Company"
      ALTER COLUMN "isProvisioned" SET DEFAULT false
    `,
  );
}

async function normalizeAndBackfillSlugs(client) {
  const rows = await client.query(
    `
      SELECT
        id,
        name,
        slug
      FROM "Company"
      ORDER BY "createdAt" ASC NULLS LAST, id ASC
    `,
  );

  const usedSlugs = new Set();
  const updates = [];

  for (const row of rows.rows) {
    const currentSlug = String(row.slug || "").trim();
    const base = slugify(currentSlug) || slugify(row.name) || "company";
    const uniqueSlug = ensureUniqueSlug(base, usedSlugs);

    if (currentSlug !== uniqueSlug) {
      updates.push({ id: row.id, slug: uniqueSlug });
    }
  }

  for (const update of updates) {
    await client.query(
      `
        UPDATE "Company"
        SET "slug" = $1
        WHERE id = $2
      `,
      [update.slug, update.id],
    );
  }

  return {
    totalCompanies: rows.rows.length,
    slugUpdates: updates.length,
  };
}

async function backfillTenantDefaults(client) {
  const tenantStatus = await client.query(
    `
      UPDATE "Company"
      SET "tenantStatus" = 'ACTIVE'::"TenantStatus"
      WHERE "tenantStatus" IS NULL
    `,
  );

  const isProvisioned = await client.query(
    `
      UPDATE "Company"
      SET "isProvisioned" = true
      WHERE "isProvisioned" IS NULL
    `,
  );

  await client.query(`ALTER TABLE "Company" ALTER COLUMN "slug" SET NOT NULL;`);
  await client.query(`ALTER TABLE "Company" ALTER COLUMN "tenantStatus" SET NOT NULL;`);
  await client.query(`ALTER TABLE "Company" ALTER COLUMN "isProvisioned" SET NOT NULL;`);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Company_slug_key'
          AND conrelid = '"Company"'::regclass
      ) THEN
        ALTER TABLE "Company"
        ADD CONSTRAINT "Company_slug_key" UNIQUE ("slug");
      END IF;
    END
    $$;
  `);

  return {
    tenantStatusUpdates: tenantStatus.rowCount || 0,
    isProvisionedUpdates: isProvisioned.rowCount || 0,
  };
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const exists = await tableExists(client, "Company");
    if (!exists) {
      await client.query("COMMIT");
      console.log('No "Company" table found. Skipping platform backfill step.');
      return;
    }

    await ensureTenantColumns(client);
    const slugSummary = await normalizeAndBackfillSlugs(client);
    const tenantSummary = await backfillTenantDefaults(client);

    await client.query("COMMIT");
    console.log("Platform tenancy backfill completed.");
    console.log(
      JSON.stringify(
        {
          ...slugSummary,
          ...tenantSummary,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Error running platform tenancy backfill:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
