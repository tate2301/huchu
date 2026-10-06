import type { CustomBlock, QueryBlock } from "@/lib/reports/custom/document";
import { resultColumns } from "@/lib/reports/sql/columns";
import type { RawResult, RunError } from "@/lib/reports/sql/engine";
import { checkSql, type CheckedSql, type SqlProblem } from "@/lib/reports/sql/guard";
import { blockTable, sqlName, type SqlTable } from "@/lib/reports/sql/schema";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";

/**
 * A custom report's blocks, checked and run together.
 *
 * Each block is one SQL query over the report sources its reader can open —
 * and over the other blocks on the page, read by name as tables. Checking is
 * synchronous, so the editor can underline a problem as it is typed; running
 * is not, because the query runs in the report database's own thread. Blocks
 * run in the order they read each other, not the order they sit in.
 */

export type BlockCheck =
  | { ok: true; checked: Extract<CheckedSql, { ok: true }>; /** Other blocks it reads, by block name. */ reads: string[] }
  | { ok: false; problem: SqlProblem };

export type BlockResult =
  | { ok: true; columns: ReportColumn[]; rows: ReportRow[]; truncated: boolean }
  | { ok: false; problem: SqlProblem; /** Found while running, rather than while checking. */ running: boolean };

/** What runs a checked query: the browser's worker, or a database in a test. */
export type BlockRunner = {
  load(table: SqlTable, rows: readonly ReportRow[], version: string): Promise<void>;
  loadResult(table: SqlTable, rows: ReadonlyArray<Record<string, ReportRow[string]>>, version: string): Promise<void>;
  run(body: string, period: { from?: string; to?: string }): Promise<{ ok: true; result: RawResult } | { ok: false; error: RunError }>;
};

function queryBlocks(blocks: readonly CustomBlock[]): QueryBlock[] {
  return blocks.filter((block): block is QueryBlock => block.type === "query");
}

/** Every query block checked, by block id. `sources` are the tables this reader can query. */
export function checkBlocks(blocks: readonly CustomBlock[], sources: readonly SqlTable[]): Map<string, BlockCheck> {
  const own = queryBlocks(blocks);
  const sourceNames = new Set(sources.map((table) => table.name));
  const blockByTable = new Map(own.map((block) => [sqlName(block.name), block]));
  const checks = new Map<string, BlockCheck>();

  for (const block of own) {
    const name = sqlName(block.name);
    if (sourceNames.has(name)) {
      checks.set(block.id, { ok: false, problem: { message: `@${block.name} has the same name as a source — rename the block`, from: 0, to: 0 } });
      continue;
    }
    const allowed = new Set([...sourceNames, ...[...blockByTable.keys()].filter((other) => other !== name)]);
    const checked = checkSql(block.query, allowed);
    if (!checked.ok) {
      checks.set(block.id, { ok: false, problem: checked.problem });
      continue;
    }
    checks.set(block.id, { ok: true, checked, reads: checked.tables.filter((table) => blockByTable.has(table)) });
  }

  // A block that ends up reading itself, through others, cannot run.
  const state = new Map<string, "visiting" | "done">();
  const visit = (block: QueryBlock): boolean => {
    const mark = state.get(block.id);
    if (mark === "done") return true;
    if (mark === "visiting") return false;
    state.set(block.id, "visiting");
    const check = checks.get(block.id);
    const fine = !check?.ok || check.reads.every((table) => visit(blockByTable.get(table)!));
    state.set(block.id, "done");
    if (!fine && check?.ok) {
      checks.set(block.id, { ok: false, problem: { message: `@${block.name} ends up reading itself`, from: 0, to: 0 } });
    }
    return fine;
  };
  for (const block of own) visit(block);
  return checks;
}

/** The source tables the checked blocks read: what has to be fetched. */
export function tablesRead(checks: ReadonlyMap<string, BlockCheck>, sources: readonly SqlTable[]): string[] {
  const names = new Set(sources.map((table) => table.name));
  const read = new Set<string>();
  for (const check of checks.values()) if (check.ok) for (const table of check.checked.tables) if (names.has(table)) read.add(table);
  return [...read].sort();
}

/** A short fingerprint of what a result holds, so an unchanged one is not reloaded. */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return `${text.length}:${hash >>> 0}`;
}

/**
 * Every query block run, by block id. `rows(table)` gives a source's rows and
 * `version(table)` what they are, so a table is loaded only when it changed.
 */
export async function runBlocks(
  blocks: readonly CustomBlock[],
  checks: ReadonlyMap<string, BlockCheck>,
  inputs: {
    runner: BlockRunner;
    sources: readonly SqlTable[];
    rows: (table: string) => readonly ReportRow[] | undefined;
    version: (table: string) => string;
    period: { from?: string; to?: string };
  },
): Promise<Map<string, BlockResult>> {
  const own = queryBlocks(blocks);
  const blockByTable = new Map(own.map((block) => [sqlName(block.name), block]));
  const sourceByName = new Map(inputs.sources.map((table) => [table.name, table]));
  const results = new Map<string, BlockResult>();
  const resultTables = new Map<string, { table: SqlTable; version: string; rows: Array<Record<string, ReportRow[string]>> }>();

  const run = async (block: QueryBlock): Promise<BlockResult> => {
    const done = results.get(block.id);
    if (done) return done;
    const check = checks.get(block.id);
    if (!check) return { ok: false, problem: { message: "Write a query", from: 0, to: 0 }, running: false };
    if (!check.ok) {
      const result: BlockResult = { ok: false, problem: check.problem, running: false };
      results.set(block.id, result);
      return result;
    }

    const used: SqlTable[] = [];
    for (const name of check.checked.tables) {
      const source = sourceByName.get(name);
      if (source) {
        await inputs.runner.load(source, inputs.rows(name) ?? [], inputs.version(name));
        used.push(source);
        continue;
      }
      const other = blockByTable.get(name);
      if (!other) continue;
      const read = await run(other);
      if (!read.ok) {
        const result: BlockResult = { ok: false, problem: { message: `@${other.name} has a problem of its own`, from: 0, to: 0 }, running: true };
        results.set(block.id, result);
        return result;
      }
      const loaded = resultTables.get(name)!;
      await inputs.runner.loadResult(loaded.table, loaded.rows, loaded.version);
      used.push(loaded.table);
    }

    const ran = await inputs.runner.run(check.checked.body, inputs.period);
    let result: BlockResult;
    if (!ran.ok) {
      const from = ran.error.position ?? 0;
      result = { ok: false, problem: { message: ran.error.message, from, to: from + 1 }, running: true };
    } else {
      const columns = resultColumns(check.checked.ast, ran.result.fields, used);
      const rows = ran.result.rows.map((row, index) => ({ ...row, id: String(index + 1) }) as ReportRow);
      result = { ok: true, columns, rows, truncated: ran.result.truncated };
      const name = sqlName(block.name);
      resultTables.set(name, {
        table: blockTable(block.name, columns),
        rows: ran.result.rows,
        version: fingerprint(
          `${block.query}\u0000${used.map((table) => resultTables.get(table.name)?.version ?? inputs.version(table.name)).join("|")}\u0000${ran.result.rows.length}`,
        ),
      });
    }
    results.set(block.id, result);
    return result;
  };

  for (const block of own) await run(block);
  return results;
}
