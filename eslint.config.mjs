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
  ]),
  {
    // The type scale has a floor. Anything under `text-sm` was unreadable on a
    // phone in a yard, and the CRM had accumulated four sizes below it —
    // `text-xs` plus three hand-picked pixel values — none of which said
    // anything `text-sm` and a muted colour could not.
    //
    // Scoped to the surfaces that have been brought up to the scale. Widening
    // it to the rest of the app is a per-module job: raising type changes
    // layout, and doing it unseen across seventy pages is how you ship a
    // regression nobody asked for.
    files: [
      "components/crm/**/*.tsx",
      "components/layout/**/*.tsx",
      "components/stores/**/*.tsx",
      "components/inventory/**/*.tsx",
      "components/settings/**/*.tsx",
      "components/templates/**/*.tsx",
      "components/dashboard/**/*.tsx",
      "components/maintenance/**/*.tsx",
      "components/onboarding/**/*.tsx",
      "components/user-management/**/*.tsx",
      "components/ui/**/*.tsx",
      "app/crm/**/*.tsx",
      "app/stores/**/*.tsx",
      "app/templates/**/*.tsx",
      "app/management/**/*.tsx",
      "app/preferences/**/*.tsx",
      "app/compliance/**/*.tsx",
      // Still outside the fence: gold/, offline/, retail/, schools/ and the
      // admin portal — each is a per-module job, because
      // raising type changes layout and doing it unseen ships a regression
      // nobody asked for. Bring a tree up to the scale, then add it here.
    ],
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
