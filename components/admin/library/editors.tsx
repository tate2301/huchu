"use client";

import { useState, type ComponentType } from "react";
import type { LibraryKind } from "@prisma/client";

import { BlockTemplatePayloadEditor, EnquiryFormPayloadEditor, LayoutPayloadEditor, VisitFormPayloadEditor } from "./build-editors";
import { LibraryExploreEditor, LibraryInsightEditor } from "./question-editors";
import { LibraryReportEditor } from "./report-editor";

/**
 * Each kind's builder inside the Library's editor. A kind without one yet is
 * edited as its payload, checked against the kind when it is saved.
 */

export type PayloadEditorProps = {
  value: unknown;
  onChange: (next: unknown) => void;
  /** The item's title as typed, for builders that print it at the top of their page. */
  title?: string;
};

export const LIBRARY_EDITORS: Partial<Record<LibraryKind, ComponentType<PayloadEditorProps>>> = {
  REPORT: LibraryReportEditor,
  EXPLORE: LibraryExploreEditor,
  INSIGHT: LibraryInsightEditor,
  VISIT_FORM: VisitFormPayloadEditor,
  ENQUIRY_FORM: EnquiryFormPayloadEditor,
  BLOCK_TEMPLATE: BlockTemplatePayloadEditor,
  LAYOUT: LayoutPayloadEditor,
};

export function JsonPayloadEditor({ value, onChange }: PayloadEditorProps) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <label className="block space-y-1.5">
      <span className="t-label text-[var(--ink)]">Its content, as JSON</span>
      <textarea
        value={text}
        spellCheck={false}
        rows={18}
        onChange={(event) => {
          setText(event.target.value);
          try {
            onChange(JSON.parse(event.target.value));
            setProblem(null);
          } catch {
            setProblem("This is not JSON yet.");
          }
        }}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 font-mono text-[13px] text-[var(--ink)] focus:border-[var(--action)] focus:outline-none"
      />
      {problem ? <span className="block text-sm text-[var(--bad)]">{problem}</span> : null}
    </label>
  );
}
