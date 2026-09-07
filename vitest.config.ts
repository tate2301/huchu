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

    /**
     * Four workers, not one per core.
     *
     * Most of this suite talks to one local Postgres. Vitest defaults to a
     * worker per core — twelve here — and each builds its own Prisma pool, so
     * the database is the contended resource and more workers make it slower,
     * not faster.
     *
     * It also makes the suite *lie*. At twelve workers a full run reported 31
     * failures across 27 files; at four it reported 15; run serially, 13. The
     * difference was `Hook timed out in 10000ms` in `afterAll` blocks doing a
     * handful of deletes — failures with nothing to say about the code, and
     * they move between runs, so the same commit is green or red depending on
     * what else the machine was doing. A suite that answers differently each
     * time cannot be used to decide anything.
     *
     * Four is where the timeouts stopped and the thirteen real failures stood
     * out. `vitest.setup.ts` caps each worker's pool at five for the same
     * reason, from the other end.
     */
    maxWorkers: 4,
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
