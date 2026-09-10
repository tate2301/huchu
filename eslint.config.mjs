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
    /*
      Local multi-agent worktrees used during parallel implementation.

      Both spellings, and `.claude/worktrees/**` is the one that matters:
      agent worktrees have always been created under `.claude/`, so the bare
      pattern matched nothing and eslint walked every worktree's `.next/`
      output — hundreds of generated chunks, and Babel complaining about
      500KB icon bundles from a checkout nobody is editing.

      Worse than slow: a worktree is a *snapshot*, so a lint error fixed on
      `main` keeps being reported from a stale copy, naming the right rule at
      the wrong path. `vitest.config.ts` carries the same pair of patterns for
      the same reason, with the same story behind it.
    */
    ".worktrees/**",
    ".claude/worktrees/**",
    "**/.claude/worktrees/**",
    // `.next/**` above is relative to the root; a nested build output needs
    // saying separately.
    "**/.next/**",
    // Generated Prisma client (prisma-client generator output).
    "lib/generated/**",
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
  {
    /*
      Playwright specs are not React.

      `react-hooks/rules-of-hooks` reported three errors in
      `e2e/_support/fixtures.ts` for calling "the `use` hook" outside a
      component. That `use` is Playwright's fixture callback — the second
      argument every fixture takes, and the only way to hand a value to a test:

        context: async ({ browser }, use) => { ...; await use(context) }

      It shares a name with React's `use` and nothing else. Renaming it is not
      an option: the shape is Playwright's.

      Scoped to the React hook rules rather than switching linting off — a
      typo or an unused import in a spec is still worth hearing about.
    */
    files: ["e2e/**/*.ts", "e2e/**/*.tsx", "playwright.config.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    /*
      The agent hook scripts are CommonJS.

      `scripts/agent-*.js` run under Node directly, outside the bundler and
      outside the TypeScript project — `require()` is how they load anything,
      and there is no build step to turn an `import` into one. Six errors for
      writing the only thing that works.
    */
    files: ["scripts/**/*.js", "scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
