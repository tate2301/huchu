import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The same rules as the hosts, so a module reads the same wherever it lives.
export default defineConfig([...nextVitals, ...nextTs, globalIgnores(["node_modules/**"])]);
