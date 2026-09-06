import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

const here = path.dirname(fileURLToPath(import.meta.url));

// One `.env` at the repository root serves every workspace package; a `.env`
// beside this file wins when both exist. Nothing already in the environment
// (CI, Vercel, a shell export) is overridden.
loadEnv({ path: [path.join(here, ".env"), path.join(here, "../../.env")], quiet: true });

export default defineConfig({
  // One schema, one file per module: prisma/schema/<module>.prisma.
  schema: path.join(here, "prisma/schema"),
  migrations: {
    path: path.join(here, "prisma/migrations"),
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
