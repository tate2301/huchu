"use client";

import { useEffect, useMemo, useRef } from "react";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { bracketMatching, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { functionCompletions, sqlNamespace } from "@/lib/reports/sql/completion";
import type { SqlProblem } from "@/lib/reports/sql/guard";
import type { SqlTable } from "@/lib/reports/sql/schema";

/**
 * A query, written in SQL: Postgres's own words coloured, the tables and
 * columns this person can query offered as it is typed, and the first thing
 * wrong underlined where it is.
 */

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--text-strong)", fontWeight: "600" },
  { tag: [tags.operator, tags.punctuation], color: "var(--text-muted)" },
  { tag: tags.string, color: "var(--tone-success-strong)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--tone-info)" },
  { tag: tags.comment, color: "var(--text-subtle)", fontStyle: "italic" },
  { tag: [tags.standard(tags.name), tags.function(tags.name)], color: "var(--tone-danger-strong)" },
  { tag: [tags.typeName], color: "var(--tone-info)" },
  { tag: [tags.name, tags.special(tags.name)], color: "var(--text)" },
]);

const theme = EditorView.theme({
  "&": {
    fontSize: "12.5px",
    backgroundColor: "var(--canvas)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text)",
  },
  "&.cm-focused": { outline: "2px solid var(--focus-ring)", outlineOffset: "1px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "8px 0", caretColor: "var(--text-strong)" },
  ".cm-line": { padding: "0 10px" },
  ".cm-placeholder": { color: "var(--text-subtle)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--accent-bg)" },
  ".cm-tooltip": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--shadow-popover)",
    color: "var(--text)",
  },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "12px", maxHeight: "16em" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-bg)", color: "var(--text-strong)" },
  ".cm-completionDetail": { marginLeft: "12px", fontStyle: "normal", color: "var(--text-muted)", fontFamily: "var(--font-sans, inherit)" },
  ".cm-completionInfo": { padding: "6px 8px", fontSize: "12px", maxWidth: "18rem" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--status-error-text)",
    textUnderlineOffset: "3px",
  },
  ".cm-diagnostic-error": { borderLeftColor: "var(--status-error-text)" },
});

const functions = PostgreSQL.language.data.of({ autocomplete: functionCompletions });

export function QueryEditor({
  value,
  onChange,
  tables,
  problem,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The tables this query can read, for what is offered as it is typed. */
  tables: readonly SqlTable[];
  problem: SqlProblem | null;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  // The editor is built once; what it reads changes under it.
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  // The table the query is from: its columns are offered without its name in front.
  const defaultTable = useMemo(() => {
    const named = /\bfrom\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(value)?.[1]?.toLowerCase();
    return tables.some((table) => table.name === named) ? named : undefined;
  }, [tables, value]);

  const schema = useMemo(
    () => sql({ dialect: PostgreSQL, schema: sqlNamespace(tables), defaultTable, upperCaseKeywords: false }),
    [defaultTable, tables],
  );

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          closeBrackets(),
          bracketMatching(),
          language.current.of(schema),
          functions,
          syntaxHighlighting(highlight),
          autocompletion({ icons: false }),
          placeholder("select * from crm_deals"),
          keymap.of([...closeBracketsKeymap, ...completionKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current(update.state.doc.toString());
          }),
          theme,
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Built once per mount; the value, schema and problem are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New tables to offer — another block ran, a source loaded.
  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(schema) });
  }, [schema]);

  // A change from outside — a discard, a reload — replaces what is typed.
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const length = editor.state.doc.length;
    const diagnostics = problem
      ? [
          (() => {
            const from = Math.min(problem.from, length);
            const to = Math.min(Math.max(problem.to, from + 1), length);
            // A point at the very end is underlined across the character before it.
            return { from: from === to ? Math.max(0, from - 1) : from, to, severity: "error" as const, message: problem.message };
          })(),
        ]
      : [];
    editor.dispatch(setDiagnostics(editor.state, diagnostics));
  }, [problem, value]);

  // Escape closes the list of suggestions; it should not also leave the block.
  // Whether the list was open is read before the editor closes it.
  const suggesting = useRef(false);
  return (
    <div
      ref={host}
      onKeyDownCapture={(event) => {
        suggesting.current = event.key === "Escape" && Boolean(host.current?.querySelector(".cm-tooltip-autocomplete"));
      }}
      onKeyDown={(event) => {
        if (suggesting.current) event.stopPropagation();
      }}
    />
  );
}
