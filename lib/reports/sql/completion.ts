import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { SQLNamespace } from "@codemirror/lang-sql";

import { SQL_FUNCTIONS } from "@/lib/reports/sql/guard";
import type { SqlTable } from "@/lib/reports/sql/schema";

/**
 * What the query editor offers as it is typed, from the tables this person
 * can query: each table with what it is called, each column with its label
 * and kind, and the functions a report can call. CodeMirror's SQL support
 * works out from the cursor which of them belong there.
 */

export function sqlNamespace(tables: readonly SqlTable[]): SQLNamespace {
  const namespace: Record<string, SQLNamespace> = {};
  for (const table of tables) {
    namespace[table.name] = {
      self: { label: table.name, type: "type", detail: table.title, boost: 2 },
      children: table.columns.map(
        (column): Completion => ({
          label: column.sql,
          type: "property",
          detail: `${column.label} · ${column.kind}`,
          boost: 1,
        }),
      ),
    };
  }
  return namespace;
}

const FUNCTIONS: Completion[] = Object.entries(SQL_FUNCTIONS).map(([name, help]) => ({
  label: name,
  type: "function",
  detail: help.split(":")[0],
  info: help.includes(":") ? help.slice(help.indexOf(":") + 1).trim() : undefined,
  apply: `${name}(`,
}));

/** Functions, offered wherever a word is being typed outside a string or comment. */
export function functionCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  // After a dot the word is a column of a table, which the schema offers.
  if (context.state.sliceDoc(word.from - 1, word.from) === ".") return null;
  return { from: word.from, options: FUNCTIONS, validFor: /^[A-Za-z0-9_]*$/ };
}
