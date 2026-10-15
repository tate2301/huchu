import { Parser } from "node-sql-parser/build/postgresql";

/**
 * A question's SQL read back as steps (the ExploreStudio board's left pane:
 * "Start from site_visits", "Bring in the customer, the fitter and the
 * quote", "Keep visits with no quote…").
 *
 * The SQL is the one thing stored; the steps are a reading of it, so the two
 * can never disagree. Each clause becomes one step in the order the database
 * applies it. A statement Explore refuses reads as what it would have done
 * and the step Explore does not have.
 */

export type Step = { icon: "step" | "x"; text: string };

const parser = new Parser();
const OPTIONS = { database: "postgresql" } as const;

const CLAUSES = ["from", "where", "group by", "having", "order by", "limit", "offset", "window"] as const;
type Clause = (typeof CLAUSES)[number];

/** Where each top-level clause starts, outside brackets, strings and comments. */
function clauses(sql: string): Map<Clause, { at: number; body: number }> {
  const found = new Map<Clause, { at: number; body: number }>();
  const lower = sql.toLowerCase();
  let depth = 0;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]!;
    if (char === "'" || char === '"') {
      const close = sql.indexOf(char, i + 1);
      i = close === -1 ? sql.length : close;
      continue;
    }
    if (char === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth !== 0 || (i > 0 && /[a-z0-9_]/i.test(sql[i - 1]!))) continue;
    for (const clause of CLAUSES) {
      if (found.has(clause)) continue;
      const pattern = clause.replace(" ", "\\s+");
      const match = new RegExp(`^${pattern}\\b`).exec(lower.slice(i));
      if (match) {
        found.set(clause, { at: i, body: i + match[0].length });
        break;
      }
    }
  }
  return found;
}

/** The text of one clause, up to the next, on one line. */
function clauseText(sql: string, all: Map<Clause, { at: number; body: number }>, clause: Clause): string | null {
  const own = all.get(clause);
  if (!own) return null;
  const next = [...all.values()].map((entry) => entry.at).filter((at) => at > own.at).sort((a, b) => a - b)[0] ?? sql.length;
  const text = sql.slice(own.body, next).replace(/;\s*$/, "").replace(/\s+/g, " ").trim();
  return text || null;
}

function short(text: string, max = 96): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type FromEntry = { table?: string; join?: string; expr?: unknown };
type Column = { expr?: { type?: string; name?: string }; as?: string | null };
type Ast = { type?: string; from?: FromEntry[] | null; columns?: Column[] | "*"; with?: Array<{ name?: { value?: string } | string }> | null };

const CHANGE_VERBS: Record<string, string> = {
  update: "Change",
  insert: "Add",
  delete: "Delete",
  replace: "Replace",
  drop: "Drop",
  alter: "Alter",
  create: "Create",
  truncate: "Empty",
};

/** A question as steps. Empty when there is nothing to read yet. */
export function describeSteps(sql: string): Step[] {
  const text = sql.trim();
  if (!text) return [];
  let ast: Ast | null = null;
  try {
    const parsed = parser.astify(text, OPTIONS) as Ast | Ast[];
    ast = Array.isArray(parsed) ? (parsed.length === 1 ? parsed[0]! : null) : parsed;
    if (Array.isArray(parsed) && parsed.length > 1) {
      return [
        ...describeSteps(text.slice(0, text.indexOf(";") + 1)),
        { icon: "x", text: "A second statement is not a step Explore has" },
      ];
    }
  } catch {
    ast = null;
  }

  const verb = (ast?.type ?? /^\s*([a-z]+)/i.exec(text)?.[1] ?? "").toLowerCase();
  if (ast && ast.type !== "select") {
    const table =
      (ast as { table?: Array<{ table?: string }> }).table?.[0]?.table ?? ast.from?.[0]?.table ?? null;
    const name = CHANGE_VERBS[verb] ?? "Change";
    return [
      ...(table ? [{ icon: "step" as const, text: `Start from ${table}` }] : []),
      { icon: "x", text: `${name} is not a step Explore has` },
    ];
  }
  if (!ast) {
    if (CHANGE_VERBS[verb]) return [{ icon: "x", text: `${CHANGE_VERBS[verb]} is not a step Explore has` }];
    return [{ icon: "x", text: "This does not read as SQL yet" }];
  }

  const steps: Step[] = [];
  for (const entry of ast.with ?? []) {
    const name = typeof entry.name === "string" ? entry.name : entry.name?.value;
    if (name) steps.push({ icon: "step", text: `First work out ${name}` });
  }
  const parts = clauses(text);
  const from = (ast.from ?? []).filter((entry) => entry.table);
  if (from[0]) steps.push({ icon: "step", text: `Start from ${from[0].table}` });
  const joined = from.slice(1).map((entry) => entry.table!);
  if (joined.length) steps.push({ icon: "step", text: `Bring in ${list([...new Set(joined)])}` });

  const where = clauseText(text, parts, "where");
  if (where) steps.push({ icon: "step", text: `Keep rows where ${short(where)}` });

  const group = clauseText(text, parts, "group by");
  const totals = Array.isArray(ast.columns)
    ? ast.columns.filter((column) => column.expr?.type === "aggr_func").map((column) => column.as ?? String(column.expr?.name ?? "").toLowerCase())
    : [];
  if (group) steps.push({ icon: "step", text: `Group by ${short(group)}${totals.length ? `, and work out ${list(totals)}` : ""}` });
  else if (totals.length) steps.push({ icon: "step", text: `Work out ${list(totals)}` });

  const having = clauseText(text, parts, "having");
  if (having) steps.push({ icon: "step", text: `Keep groups where ${short(having)}` });

  const order = clauseText(text, parts, "order by");
  if (order) {
    const one = /^([A-Za-z_][A-Za-z0-9_.]*)\s+(desc|asc)?(?:\s+nulls\s+(?:first|last))?$/i.exec(order);
    const way = one?.[2]?.toLowerCase() === "desc" ? ", biggest first" : one ? ", smallest first" : "";
    steps.push({ icon: "step", text: `Sort by ${one ? one[1] : short(order)}${way}` });
  }
  const limit = clauseText(text, parts, "limit");
  if (limit) steps.push({ icon: "step", text: `Keep the first ${limit}` });
  return steps;
}
