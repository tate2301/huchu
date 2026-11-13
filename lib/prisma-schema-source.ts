import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The Prisma schema is a folder: core's models are in `core.prisma`, and an
 * industry fork adds its own `<flavour>.prisma` beside it (see
 * docs/_start-here/RELEASES_AND_FORKS.md). Anything that reads the schema as
 * text — the reader-role SQL, and the tests that hold enums and access rules
 * to it — must read every file, or a fork's tables go unseen.
 */
export const PRISMA_SCHEMA_DIR = "prisma/schema";

/** Every `.prisma` file in the schema folder, in name order, as one text. */
export function readPrismaSchema(root: string = process.cwd()): string {
  const dir = path.join(root, PRISMA_SCHEMA_DIR);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".prisma"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n");
}
