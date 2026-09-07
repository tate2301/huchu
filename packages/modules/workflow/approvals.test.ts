/**
 * `ApprovalTargetType` may gain values. It may never lose one.
 *
 * `ApprovalAction` is an append-only audit trail: it records who approved what and
 * when, and nothing rewrites it. That makes removing an enum value a different kind
 * of change from removing a column. Postgres refuses to drop a value any row still
 * holds, so on a database with history the push fails outright:
 *
 *   invalid input value for enum "ApprovalTargetType_new": "IRREGULAR_PAYOUT_BATCH"
 *
 * and the two ways round that are both worse than the dead value. Rewriting the
 * rows to a surviving type makes the trail assert something that did not happen —
 * an irregular payout batch was approved, not a settlement batch. Deleting them
 * destroys the only record that an approval took place.
 *
 * P-1 replaced `IrregularPayoutBatch` with the settlement tables and dropped the
 * value from the schema. Nothing wrote it after that, so every test passed and CI
 * was green — the failure only appears on a database that predates the change, and
 * there was none in development. It reached a merged branch that no existing
 * environment could migrate.
 *
 * So this file pins both halves of the rule: the retired value is still declared,
 * and no code writes it.
 */

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { readPrismaSchemaSource } from "@corelithzw/db/schema";

import { $Enums } from "@corelithzw/db";

/**
 * Values that exist only to keep old rows readable.
 *
 * Add to this list when something is retired; never delete from it, and never
 * delete the value from `enum ApprovalTargetType` in the schema.
 */
const RETIRED_BUT_DECLARED = ["IRREGULAR_PAYOUT_BATCH"] as const;

/** Every host and every module: the rule is product-wide, wherever the code lives. */
const WORKSPACE_ROOT = resolve(__dirname, "../../..");

describe("ApprovalTargetType", () => {
  it.each(RETIRED_BUT_DECLARED)("still declares the retired value %s", (value) => {
    // Read from the generated client, which is the schema as the app sees it.
    expect(Object.values($Enums.ApprovalTargetType)).toContain(value);
  });

  it.each(RETIRED_BUT_DECLARED)("has the schema explain why %s is kept", (value) => {
    // A bare value with no comment is one somebody deletes while tidying. The
    // explanation is the guard that outlives whoever reads this test.
    const schema = readPrismaSchemaSource();
    const enumBlock = schema.slice(
      schema.indexOf("enum ApprovalTargetType {"),
      schema.indexOf("enum ApprovalActionType {"),
    );
    expect(enumBlock).toContain(value);
    expect(enumBlock.toLowerCase()).toContain("retired");
  });

  it.each(RETIRED_BUT_DECLARED)("is never written by application code (%s)", (value) => {
    // The value is inert, not merely unused: keeping it must not quietly license
    // writing it again. Types and comments are excluded — `lib/api.ts` names it on
    // purpose so the history screen can display old rows, and the schema and this
    // file both mention it.
    const hits = execSync(
      `grep -rn "${value}" --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next apps packages || true`,
      { cwd: WORKSPACE_ROOT, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.startsWith("packages/modules/workflow/approvals.test.ts"))
      // A quoted member of a union type, not an argument being passed.
      .filter((line) => !/^\S+:\d+:\s*\|\s*"/.test(line))
      .filter((line) => !/^\S+:\d+:\s*(\/\/|\*|\/\*)/.test(line));

    expect(hits, `something writes ${value}:\n${hits.join("\n")}`).toEqual([]);
  });
});
