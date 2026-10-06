import { checkQuery, DEFAULT_PARAMS, type QuerySchemas } from "@/lib/reports/query/compile";
import { AGGREGATE_FUNCTIONS, ROW_FUNCTIONS } from "@/lib/reports/query/functions";
import { tokenize, type Token } from "@/lib/reports/query/lexer";
import { STEP_WORDS } from "@/lib/reports/query/parser";
import type { ReportColumn } from "@/lib/reports/types";

/**
 * What could be typed next at a point in a query: the steps where a step can
 * start, the sources after `from` and `join`, and otherwise the columns the
 * table has by that step — worked out by checking the query up to it — with
 * the functions. Pure, so the editor only has to show it.
 */

export type CompletionKind = "step" | "source" | "block" | "column" | "function" | "aggregate" | "word" | "param";

export type QueryCompletion = {
  label: string;
  kind: CompletionKind;
  /** A short note beside it: a column's label and kind, a source's title. */
  detail?: string;
  /** A longer note: what a function does. */
  info?: string;
  /** What is inserted, when it differs from the label. */
  apply?: string;
};

export type CompletionContext = QuerySchemas & {
  /** Titles of report sources, by key, for the note beside each. */
  titles?: ReadonlyMap<string, string>;
};

const STEP_HELP: Record<string, string> = {
  from: "the source the rows come from",
  join: "bring in another source's columns, matching rows on =",
  where: "keep the rows that match",
  derive: "add a column worked out from each row",
  select: "keep only these columns, in this order",
  drop: "leave these columns out",
  aggregate: "total the rows, optionally by groups",
  sort: "order the rows",
  take: "keep the first rows",
};

const WORDS = ["and", "or", "not", "in", "like", "is null", "is not null", "by", "asc", "desc", "as", "on", "true", "false", "null"];

const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function columnName(column: ReportColumn): string {
  return PLAIN_NAME.test(column.key) ? column.key : `\`${column.key}\``;
}

/** Where the word being typed starts. Sources have hyphens, blocks `@`, values `$`. */
function wordStart(text: string, offset: number): number {
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_\-.@$]/.test(text[start - 1]!)) start -= 1;
  return start;
}

function insideTextOrComment(line: string): boolean {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "-" && line[index + 1] === "-") return true;
  }
  return quote !== null;
}

function safeTokens(text: string): Token[] | null {
  try {
    return tokenize(text).slice(0, -1);
  } catch {
    return null;
  }
}

const STEP_SET = new Set<string>([...STEP_WORDS, "inner"]);

function isStepToken(token: Token, previous: Token | undefined): boolean {
  if (token.type !== "ident" || !STEP_SET.has(token.value.toLowerCase())) return false;
  return token.lineStart || (previous?.type === "op" && previous.value === "|");
}

/** The columns the table has where a step starts, or the `from` source's if the query before it does not check. */
function columnsBefore(text: string, tokens: Token[], context: CompletionContext): ReportColumn[] {
  let stepIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (isStepToken(tokens[index]!, tokens[index - 1])) {
      stepIndex = index;
      break;
    }
  }
  if (stepIndex <= 0) {
    // In the from step itself: nothing to name yet.
    return [];
  }
  const before = text.slice(0, tokens[stepIndex]!.span.from);
  const checked = checkQuery(before, context);
  if (checked.ok) return checked.query.columns;
  const from = /^\s*(?:--.*\n\s*)*from\s+(@?[A-Za-z0-9_-]+)/i.exec(text);
  if (!from) return [];
  const name = from[1]!;
  return (name.startsWith("@") ? context.blocks?.get(name.slice(1)) : context.reports.get(name)) ?? [];
}

export function completionsAt(
  text: string,
  offset: number,
  context: CompletionContext,
): { from: number; options: QueryCompletion[] } | null {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  if (insideTextOrComment(text.slice(lineStart, offset))) return null;

  const start = wordStart(text, offset);
  const word = text.slice(start, offset);
  const tokens = safeTokens(text.slice(0, start));
  if (!tokens) return null;
  const previous = tokens[tokens.length - 1];
  const firstOnLine = !previous || text.slice(lineStart, start).trim() === "";

  if (word.startsWith("$")) {
    return {
      from: start,
      options: (context.params ?? DEFAULT_PARAMS).map((name) => ({
        label: `$${name}`,
        kind: "param" as const,
        detail: name === "from" ? "the report's first date" : name === "to" ? "the report's last date" : "a value",
      })),
    };
  }

  const prevWord = previous?.type === "ident" ? previous.value.toLowerCase() : null;
  if (prevWord === "from" || prevWord === "join") {
    return {
      from: start,
      options: [
        ...[...context.reports.keys()].map((key) => ({
          label: key,
          kind: "source" as const,
          detail: context.titles?.get(key),
        })),
        ...[...(context.blocks?.keys() ?? [])].map((name) => ({
          label: `@${name}`,
          kind: "block" as const,
          detail: "a block on this page",
        })),
      ],
    };
  }

  if (firstOnLine || (previous?.type === "op" && previous.value === "|")) {
    if (!previous) return { from: start, options: [{ label: "from", kind: "step", info: STEP_HELP.from }] };
    // A line that starts a step, or one that carries on the step above it.
    const steps: QueryCompletion[] = [
      ...STEP_WORDS.filter((step) => step !== "from").map((step) => ({ label: step, kind: "step" as const, info: STEP_HELP[step] })),
      { label: "inner join", kind: "step", info: "join, keeping only rows that match" },
    ];
    if (previous.type === "op" && previous.value === "|") return { from: start, options: steps };
    return { from: start, options: [...steps, ...valueOptions(text, tokens, context)] };
  }

  return { from: start, options: valueOptions(text, tokens, context) };
}

function valueOptions(text: string, tokens: Token[], context: CompletionContext): QueryCompletion[] {
  const columns = columnsBefore(text, tokens, context);
  return [
    ...columns.map((column) => ({
      label: columnName(column),
      kind: "column" as const,
      detail: `${column.label} · ${column.kind}`,
    })),
    ...Object.entries(AGGREGATE_FUNCTIONS).map(([name, spec]) => ({
      label: name,
      kind: "aggregate" as const,
      detail: spec.signature,
      info: spec.help,
      apply: `${name}(`,
    })),
    ...Object.entries(ROW_FUNCTIONS).map(([name, spec]) => ({
      label: name,
      kind: "function" as const,
      detail: spec.signature,
      info: spec.help,
      apply: `${name}(`,
    })),
    ...WORDS.map((word) => ({ label: word, kind: "word" as const })),
  ];
}
