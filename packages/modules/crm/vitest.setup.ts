// The repository-root .env, as the hosts read it (a .env beside this package
// wins), then the test database before Prisma creates its pool.
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [path.join(__dirname, ".env"), path.join(__dirname, "../../../.env")], quiet: true });

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

// The module's own manifest, so a test that asks the record registry about a
// lead or a deal gets the answer the host would give.
import { registerModules } from "@corelithzw/platform/manifest";
import { manifest } from "./manifest";

registerModules([manifest]);
