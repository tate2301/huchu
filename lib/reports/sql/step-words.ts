import type { SqlTable } from "./schema";
import { FILTER_OPS, type QuerySteps, type TotalFn } from "./steps";

/**
 * A query's steps as the builder's shelf reads them out, one sentence each:
 * "Start from Site visit forms", "Keep where outcome is Won", "Group by rep",
 * "Sort newest first". The steps themselves are edited under the list.
 */
export function stepSentences(steps: QuerySteps, tables: readonly SqlTable[]): string[] {
  const table = tables.find((candidate) => candidate.name === steps.from);
  const column = (name: string) => table?.columns.find((candidate) => candidate.sql === name);
  const label = (name: string) => (column(name)?.label ?? name.replace(/_/g, " ")).toLowerCase();
  const sentences = [`Start from ${table?.title ?? steps.from.replace(/_/g, " ")}`];

  for (const filter of steps.keep) {
    const value = filter.op === "isEmpty" || filter.op === "isNotEmpty" ? "" : ` ${filter.value ?? ""}`;
    sentences.push(`Keep where ${label(filter.column)} ${FILTER_OPS[filter.op]}${value}`);
  }
  if (steps.groups.length) {
    const groups = steps.groups.map((group) => (group.by ? `${group.by} of ${label(group.column)}` : label(group.column)));
    sentences.push(`Group by ${groups.join(", then ")}`);
  }
  for (const total of steps.totals) {
    const as = total.as.replace(/_/g, " ");
    const of = total.column ? label(total.column) : null;
    const verb: Record<TotalFn, string> = {
      count: of ? `Count ${of}` : "Count the rows",
      sum: `Add up ${of}`,
      avg: `Average ${of}`,
      min: `Take the lowest ${of}`,
      max: `Take the highest ${of}`,
    };
    sentences.push(`${verb[total.fn]} as ${as}`);
  }
  if (!steps.groups.length && !steps.totals.length && steps.columns.length) {
    sentences.push(`Show ${steps.columns.map(label).join(", ")}`);
  }
  if (steps.sort) {
    const kind = column(steps.sort.column)?.kind;
    const dated = kind === "date";
    sentences.push(
      dated
        ? `Sort ${steps.sort.dir === "desc" ? "newest" : "oldest"} first`
        : `Sort by ${label(steps.sort.column)}, ${steps.sort.dir === "desc" ? "highest" : "lowest"} first`,
    );
  }
  if (steps.limit) sentences.push(`Keep the first ${steps.limit} rows`);
  return sentences;
}
