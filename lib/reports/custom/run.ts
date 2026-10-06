import type { CustomBlock, QueryBlock } from "@/lib/reports/custom/document";
import { checkQuery, type CompiledQuery, type QueryProblem, type QuerySchemas } from "@/lib/reports/query/compile";
import { QueryError } from "@/lib/reports/query/lexer";
import { parseQuery } from "@/lib/reports/query/parser";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";

/**
 * A custom report's blocks, checked and run together.
 *
 * Blocks can read each other (`from @won`), so they are taken in the order
 * they depend on one another rather than the order they sit on the page, and
 * a block that reads one with a problem is told so instead of guessing. Pure:
 * the editor runs it on every keystroke, and anything else that needs the
 * tables gets the very same ones.
 */

export type BlockCheck = { ok: true; query: CompiledQuery } | { ok: false; problem: QueryProblem };

export type BlockResult =
  | { ok: true; columns: ReportColumn[]; rows: ReportRow[] }
  | { ok: false; problem: QueryProblem; /** Found while running, rather than while checking. */ running: boolean };

/** The blocks a query reads with `@`, as written. Nothing when it does not parse. */
function blockRefs(text: string): string[] {
  try {
    return parseQuery(text).steps.flatMap((step) =>
      (step.type === "from" || step.type === "join") && step.source.kind === "block" ? [step.source.name] : [],
    );
  } catch {
    return [];
  }
}

function queryBlocks(blocks: readonly CustomBlock[]): Map<string, QueryBlock> {
  return new Map(
    blocks.filter((block): block is QueryBlock => block.type === "query").map((block) => [block.name.toLowerCase(), block]),
  );
}

/** Every query block checked, by block id. */
export function checkBlocks(
  blocks: readonly CustomBlock[],
  schemas: Omit<QuerySchemas, "blocks">,
): Map<string, BlockCheck> {
  const byName = queryBlocks(blocks);
  const checks = new Map<string, BlockCheck>();
  const visiting = new Set<string>();

  const check = (block: QueryBlock): BlockCheck => {
    const done = checks.get(block.id);
    if (done) return done;
    if (visiting.has(block.id)) {
      return { ok: false, problem: { message: `@${block.name} ends up reading itself`, span: { from: 0, to: 0 } } };
    }
    visiting.add(block.id);
    const columns = new Map<string, ReportColumn[]>();
    for (const ref of blockRefs(block.query)) {
      const target = byName.get(ref.toLowerCase());
      if (!target || target.id === block.id) continue;
      const result = check(target);
      if (result.ok) columns.set(ref, result.query.columns);
    }
    visiting.delete(block.id);
    const result = block.query.trim() ? checkQuery(block.query, { ...schemas, blocks: columns }) : empty();
    checks.set(block.id, result);
    return result;
  };

  for (const block of byName.values()) check(block);
  return checks;
}

const EMPTY: QueryProblem = { message: "Write a query, starting with from and a source", span: { from: 0, to: 0 } };

function empty(): BlockCheck {
  return { ok: false, problem: EMPTY };
}

/** Every report key the checked blocks read: what has to be fetched. */
export function sourcesRead(checks: ReadonlyMap<string, BlockCheck>): string[] {
  const keys = new Set<string>();
  for (const check of checks.values()) if (check.ok) for (const key of check.query.reports) keys.add(key);
  return [...keys].sort();
}

/** Every query block run over the rows given, by block id. */
export function runBlocks(
  blocks: readonly CustomBlock[],
  checks: ReadonlyMap<string, BlockCheck>,
  inputs: { report: (key: string) => readonly ReportRow[]; params: Record<string, string> },
): Map<string, BlockResult> {
  const byName = queryBlocks(blocks);
  const results = new Map<string, BlockResult>();

  const run = (block: QueryBlock): BlockResult => {
    const done = results.get(block.id);
    if (done) return done;
    const check = checks.get(block.id);
    if (!check) return { ok: false, problem: EMPTY, running: false };
    if (!check.ok) {
      const result: BlockResult = { ok: false, problem: check.problem, running: false };
      results.set(block.id, result);
      return result;
    }
    let result: BlockResult;
    try {
      const table = check.query.run({
        report: inputs.report,
        params: inputs.params,
        block: (name) => {
          const target = byName.get(name.toLowerCase());
          const read = target ? run(target) : null;
          if (!read?.ok) throw new QueryError(`@${name} has a problem of its own`, { from: 0, to: 0 });
          return read.rows;
        },
      });
      result = { ok: true, ...table };
    } catch (error) {
      if (!(error instanceof QueryError)) throw error;
      result = { ok: false, problem: { message: error.message, span: error.span }, running: true };
    }
    results.set(block.id, result);
    return result;
  };

  for (const block of byName.values()) run(block);
  return results;
}
