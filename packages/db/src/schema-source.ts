// The schema and migrations as text, for tests that assert on what the schema
// says (an enum's members, a comment that explains a retired value, the roles a
// migration created). Node only — it reads files — so it is its own entrypoint,
// `@corelithzw/db/schema`, and never part of `@corelithzw/db`.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(__dirname, "..");

export const PRISMA_SCHEMA_DIR = path.join(packageRoot, "prisma", "schema");
export const PRISMA_MIGRATIONS_DIR = path.join(packageRoot, "prisma", "migrations");

/** Every `.prisma` file in the schema folder, concatenated in name order. */
export function readPrismaSchemaSource(): string {
  return readdirSync(PRISMA_SCHEMA_DIR)
    .filter((name) => name.endsWith(".prisma"))
    .sort()
    .map((name) => readFileSync(path.join(PRISMA_SCHEMA_DIR, name), "utf8"))
    .join("\n");
}
