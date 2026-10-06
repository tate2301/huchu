"use client";

import { useEffect, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext as EditorCompletionContext,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { setDiagnostics } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { completionsAt, type CompletionContext, type CompletionKind } from "@/lib/reports/query/complete";
import type { QueryProblem } from "@/lib/reports/query/compile";
import { STEP_WORDS } from "@/lib/reports/query/parser";

/**
 * A query, written in a code editor: its words coloured, the columns and
 * functions offered as it is typed, and the first thing wrong underlined
 * where it is.
 */

const STEPS = new Set<string>([...STEP_WORDS, "inner"]);
const WORDS = new Set(["and", "or", "not", "in", "like", "is", "null", "true", "false", "by", "asc", "desc", "as", "on"]);

/** Colours a query the way the language reads it: a step word only where a step can start. */
const queryLanguage = StreamLanguage.define<Record<string, never>>({
  name: "report-query",
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("--")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) return "string";
    if (stream.match(/^`[^`]*`?/)) return "variable-2";
    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^[$@][A-Za-z0-9_]+/)) return "atom";
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current().toLowerCase();
      const before = stream.string.slice(0, stream.start).trimEnd();
      if (STEPS.has(word) && (before === "" || before.endsWith("|"))) return "keyword";
      if (word === "join" && before.toLowerCase().endsWith("inner")) return "keyword";
      if (WORDS.has(word)) return "operator";
      if (stream.peek() === "(") return "builtin";
      return "variable";
    }
    stream.next();
    return "operator";
  },
  languageData: { commentTokens: { line: "--" } },
});

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--text-strong)", fontWeight: "600" },
  { tag: tags.operator, color: "var(--text-muted)" },
  { tag: tags.string, color: "var(--tone-success-strong)" },
  { tag: tags.number, color: "var(--tone-info)" },
  { tag: tags.atom, color: "var(--tone-info)", fontWeight: "500" },
  { tag: tags.comment, color: "var(--text-subtle)", fontStyle: "italic" },
  { tag: tags.standard(tags.variableName), color: "var(--tone-danger-strong)" },
  { tag: tags.special(tags.variableName), color: "var(--text)" },
  { tag: tags.variableName, color: "var(--text)" },
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

const COMPLETION_TYPE: Record<CompletionKind, string> = {
  step: "keyword",
  source: "namespace",
  block: "variable",
  column: "property",
  function: "function",
  aggregate: "function",
  word: "keyword",
  param: "constant",
};

export function QueryEditor({
  value,
  onChange,
  context,
  problem,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The sources and blocks it can name, for what is offered as it is typed. */
  context: CompletionContext;
  problem: QueryProblem | null;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The editor is built once; what it reads changes under it.
  const latest = useRef({ onChange, context });
  useEffect(() => {
    latest.current = { onChange, context };
  });

  useEffect(() => {
    if (!host.current) return;
    const complete = (editor: EditorCompletionContext) => {
      const found = completionsAt(editor.state.doc.toString(), editor.pos, latest.current.context);
      if (!found || (found.from === editor.pos && !editor.explicit)) return null;
      return {
        from: found.from,
        options: found.options.map(
          (option): Completion => ({
            label: option.label,
            type: COMPLETION_TYPE[option.kind],
            ...(option.detail ? { detail: option.detail } : {}),
            ...(option.info ? { info: option.info } : {}),
            ...(option.apply ? { apply: option.apply } : {}),
            boost: option.kind === "column" || option.kind === "source" || option.kind === "step" ? 2 : 0,
          }),
        ),
        validFor: /^[A-Za-z0-9_\-.@$]*$/,
      };
    };

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          closeBrackets(),
          bracketMatching(),
          queryLanguage,
          syntaxHighlighting(highlight),
          autocompletion({ override: [complete], icons: false }),
          placeholder("from crm-deals"),
          keymap.of([...closeBracketsKeymap, ...completionKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString());
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
    // Built once per mount; `value` is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          {
            from: Math.min(problem.span.from, length),
            // A point is underlined across the character after it, or the one before at the end.
            to: Math.min(Math.max(problem.span.to, problem.span.from + 1), length),
            severity: "error" as const,
            message: problem.message,
          },
        ].map((entry) => (entry.from === entry.to ? { ...entry, from: Math.max(0, entry.from - 1) } : entry))
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
