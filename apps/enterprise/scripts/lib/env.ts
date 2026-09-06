// Scripts run from apps/enterprise. The app's own `.env` wins, the repository-root
// `.env` fills in what it did not set, and nothing already in the environment
// is overridden. Imported for its side effect, in place of `dotenv/config`.
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../../../../.env"),
  ],
  quiet: true,
});
