// Load this app's .env, then the repository-root .env for anything it did not
// set, so DATABASE_URL_TEST is available; then override DATABASE_URL with the
// test database before Prisma creates its pool.
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
// What this host composes, on every side — a test that asks the record registry
// or the template catalogue a question gets the same answer as the app. Data
// only (lib/host/manifests.test.ts keeps it that way), so no mock is bypassed.
import "@/manifests";

loadEnv({ path: [path.join(__dirname, ".env"), path.join(__dirname, "../../.env")], quiet: true });

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

// Boot the host's auth the way modules.ts does: the kernel asks the host for
// NextAuth's options through a registry, and a test that reaches a guard needs
// an answer. The import is deferred to first use, so a test's own mocks of
// `@/lib/auth` and its graph still apply. The rest of the composition is not
// registered here; a test that reads a registry imports `@/modules` itself.
registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);
