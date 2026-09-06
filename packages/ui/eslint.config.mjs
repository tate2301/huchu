import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The same rules as the hosts, so a component reads the same wherever it lives.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["node_modules/**"]),
  {
    // The type scale has a floor (see apps/legacy/eslint.config.mjs for why).
    // The fence is the same one the host drew: what was components/ui. The
    // charts and the person avatar arrived from outside it and join it when
    // they are brought up to the scale.
    files: ["components/**/*.tsx"],
    ignores: ["components/employee-avatar.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\s)text-(xs|\\[(?:9|10|11|12)px\\])(\\s|$)/]",
          message: "Below the type scale's floor. Use text-sm, and a muted colour if it needs to recede.",
        },
        {
          selector: "TemplateElement[value.raw=/(^|\\s)text-(xs|\\[(?:9|10|11|12)px\\])(\\s|$)/]",
          message: "Below the type scale's floor. Use text-sm, and a muted colour if it needs to recede.",
        },
      ],
    },
  },
]);

export default eslintConfig;
