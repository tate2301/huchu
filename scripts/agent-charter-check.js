#!/usr/bin/env node
/**
 * PostToolUse hook — charter boundary check.
 *
 * Reads the file path from stdin (Claude tool-use JSON) and the
 * (Paths are matched as substrings, so `app/` also matches `apps/enterprise/app/`
 * and `prisma/schema/` matches `packages/db/prisma/schema/gold.prisma`.)
 * GOLD_AGENT_ROLE env var set in each agent definition's frontmatter.
 * Emits a systemMessage warning if the agent is editing outside its charter.
 *
 * Exit 0 always — this is a warning hook, not a blocker.
 * Promote to exit 2 for any charter entry to make it blocking.
 */

const CHARTERS = {
  "data-foundation": {
    owns: ["prisma/", "scripts/backfill", "lib/gold/inventory.test"],
    forbidden: ["app/", "components/", "lib/gold/fifo", "lib/gold/import", "lib/gold/inventory.ts", "lib/gold/valuation"],
  },
  "domain-backend": {
    // `lib/gold/payouts` is excluded — it lives under lib/gold/ but is
    // OWNED by gold-integration per the HR-seam clause in AGENTS.md.
    owns: ["lib/gold/", "lib/accounting/", "app/api/gold/"],
    forbidden: ["prisma/schema/", "app/gold/", "components/gold/", "lib/gold/payouts"],
  },
  "import-workflow": {
    owns: ["app/api/gold/imports/", "lib/gold/import", "lib/gold/locks", "lib/gold/reconcile"],
    forbidden: ["app/gold/", "components/gold/", "prisma/schema/"],
  },
  frontend: {
    owns: ["app/gold/", "components/gold/"],
    forbidden: ["app/api/", "lib/", "prisma/"],
  },
  integration: {
    owns: ["lib/gold/payouts", "lib/notifications", "lib/accounting/integration", "lib/accounting/posting", "lib/commodity-billing", "lib/audit/gold", "components/ui/searchable-select", "app/api/disbursements/batches"],
    forbidden: ["prisma/schema/", "app/gold/", "lib/gold/fifo", "lib/gold/inventory"],
  },
  reviewer: {
    owns: [],
    forbidden: ["app/", "components/", "lib/", "prisma/", "scripts/"],
  },
};

const chunks = [];
process.stdin.on("data", (d) => chunks.push(d));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    const filePath = (input?.tool_input?.file_path || "").replace(/\\/g, "/");
    const role = process.env.GOLD_AGENT_ROLE || "";

    if (!role || !CHARTERS[role] || !filePath) process.exit(0);

    const { forbidden } = CHARTERS[role];
    const violation = forbidden.find((f) => filePath.includes(f));

    if (violation) {
      process.stdout.write(
        JSON.stringify({
          systemMessage: `⚠️  Charter warning [${role}]: editing "${filePath}" which matches forbidden pattern "${violation}". Check AGENTS.md for ownership rules before proceeding.`,
        }) + "\n",
      );
    }
  } catch {
    // Malformed input — silently exit
  }
  process.exit(0);
});
