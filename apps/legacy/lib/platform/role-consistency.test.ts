import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PRISMA_MIGRATIONS_DIR, readPrismaSchemaSource } from "@corelithzw/db/schema";
import { ROLES } from "@/lib/roles";
import {
  FEATURE_ROLE_REGISTRY,
  USER_ROLE_LABELS,
  VERTICAL_ROLE_REGISTRY,
} from "@/lib/platform/vertical-role-registry";
import { USER_MANAGEMENT_ROLES, USER_ROLES } from "@/scripts/platform/types";

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function readPrismaUserRoles(): string[] {
  const schema = readPrismaSchemaSource();
  const match = schema.match(/enum UserRole\s*\{([^}]*)\}/);
  if (!match) throw new Error("UserRole enum not found in packages/db/prisma/schema");

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\/\/.*$/, ""))
    .filter(Boolean);
}

function readMigratedUserRoles(): string[] {
  const migrationsDir = PRISMA_MIGRATIONS_DIR;
  const values = new Set<string>();

  for (const dirent of fs.readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const migrationPath = path.join(migrationsDir, dirent.name, "migration.sql");
    if (!fs.existsSync(migrationPath)) continue;

    const sql = fs.readFileSync(migrationPath, "utf8");
    for (const createMatch of sql.matchAll(/CREATE TYPE "UserRole" AS ENUM \(([^)]*)\)/g)) {
      for (const valueMatch of createMatch[1].matchAll(/'([^']+)'/g)) {
        values.add(valueMatch[1]);
      }
    }
    for (const alterMatch of sql.matchAll(/ALTER TYPE "UserRole" ADD VALUE(?: IF NOT EXISTS)? '([^']+)'/g)) {
      values.add(alterMatch[1]);
    }
  }

  return sorted(values);
}

describe("role source consistency", () => {
  it("keeps app and platform user roles aligned with Prisma", () => {
    const prismaRoles = sorted(readPrismaUserRoles());

    expect(sorted(ROLES)).toEqual(prismaRoles);
    expect(sorted(USER_ROLES)).toEqual(prismaRoles);
    // Widened deliberately: `USER_MANAGEMENT_ROLES` excludes SUPERADMIN at the
    // type level, so `Set<T>.has` refuses the argument — and the assertion is
    // guarding the runtime value against drift, which is exactly the case the
    // type cannot cover.
    expect(new Set<string>(USER_MANAGEMENT_ROLES).has("SUPERADMIN")).toBe(false);
    expect(sorted(USER_MANAGEMENT_ROLES)).toEqual(
      prismaRoles.filter((role) => role !== "SUPERADMIN"),
    );
  });

  it("records every Prisma UserRole value in migration SQL", () => {
    expect(readMigratedUserRoles()).toEqual(sorted(readPrismaUserRoles()));
  });

  it("keeps registered and labelled roles inside the Prisma enum", () => {
    const prismaRoleSet = new Set(readPrismaUserRoles());
    const registeredRoles = new Set<string>();

    for (const registration of Object.values(VERTICAL_ROLE_REGISTRY)) {
      for (const role of registration.roles) registeredRoles.add(role);
    }
    for (const registration of FEATURE_ROLE_REGISTRY) {
      for (const role of registration.roles) registeredRoles.add(role);
    }
    for (const role of Object.keys(USER_ROLE_LABELS)) registeredRoles.add(role);

    expect([...registeredRoles].filter((role) => !prismaRoleSet.has(role))).toEqual([]);
  });

  it("only offers Sales Rep when CRM features are enabled", () => {
    expect(VERTICAL_ROLE_REGISTRY.GENERAL.roles).not.toContain("SALES_REP");
    expect(
      FEATURE_ROLE_REGISTRY.find((registration) => registration.id === "crm")?.roles,
    ).toContain("SALES_REP");
  });
});
