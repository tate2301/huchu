import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // `.claude/worktrees/**`, not `.worktrees/**`. Agent worktrees have always
    // been created under `.claude/`, so the old pattern matched nothing and
    // every worktree's copy of every test was collected alongside the real one.
    // That is not a harmless duplicate run: the copy is a *snapshot*, so a test
    // you have just fixed keeps failing from a stale checkout and the failure
    // names the right file at the wrong path. Both spellings are kept — the
    // bare one costs nothing and stops this regressing if the layout changes.
    exclude: [
      "node_modules",
      "dist",
      ".next",
      "e2e/**",
      ".worktrees/**",
      ".claude/worktrees/**",
      "**/.claude/worktrees/**",
    ],
  },
});
