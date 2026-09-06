import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local multi-agent worktrees used during parallel implementation.
    ".worktrees/**",
    // Generated Prisma client (prisma-client generator output).
    "lib/generated/**",
  ]),
  {
    // The type scale has a floor: nothing under `text-sm`. This host's own
    // components are the surfaces that have been brought up to it; the composed
    // trees are the modules' and are linted in their packages.
    files: ["components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(^|\\s)text-(xs|\\[(?:9|10|11|12)px\\])(\\s|$)/]",
          message:
            "Below the type scale's floor. Use text-sm, and a muted colour if it needs to recede.",
        },
        {
          selector:
            "TemplateElement[value.raw=/(^|\\s)text-(xs|\\[(?:9|10|11|12)px\\])(\\s|$)/]",
          message:
            "Below the type scale's floor. Use text-sm, and a muted colour if it needs to recede.",
        },
      ],
    },
  },
]);

export default eslintConfig;
