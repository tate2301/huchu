"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { EmojiPicker } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@corelithzw/ui/components/popover";
import { fetchJson } from "@corelithzw/platform/api-client";
import { offsetOf, placeCaret, renderBody, serialise } from "@/lib/crm/reference-dom";
import {
  activeReferenceQuery,
  insertReference,
  referenceKindFromSearchType,
  toggleMarker,
  togglePrefix,
  type Reference,
} from "@corelithzw/module-records/rich-text";
import { Eye, ListBullets, Smiley, type LucideIcon } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

import { referenceChipElement } from "./reference-chip";
import { RichTextRenderer } from "@corelithzw/module-records/components/rich-text-renderer";

type TeamResponse = { data: { id: string; name: string | null; email: string }[] };
type SearchResponse = {
  groups: Array<{
    type: string;
    label: string;
    results: Array<{
      id: string;
      title: string;
      reference: string | null;
      subtitle: string | null;
    }>;
  }>;
};

type Candidate = Reference & { hint: string | null; group: string };

/**
 * One composer for notes, comments and descriptions.
 *
 * The formatting is deliberately three buttons. Every marker you add is one
 * more thing somebody types by accident and then has to escape, and no CRM
 * note has ever needed a heading level.
 *
 * `@` searches people *and* records, which is the part that matters: half of
 * what somebody writes on a deal is about another deal, the site it is on, or
 * the company behind both, and a mention system that only knows colleagues
 * makes them paste a URL instead. Only people get notified — referring to a
 * deal is a link, not a summons.
 */

type Tool = {
  id: string;
  label: string;
  icon?: LucideIcon;
  glyph?: string;
  apply: (body: string, start: number, end: number) => {
    body: string;
    start: number;
    end: number;
  };
};

const TOOLS: Tool[] = [
  {
    id: "bold",
    label: "Bold",
    glyph: "B",
    apply: (body, start, end) => toggleMarker(body, start, end, "**"),
  },
  {
    id: "italic",
    label: "Italic",
    glyph: "I",
    apply: (body, start, end) => toggleMarker(body, start, end, "*"),
  },
  {
    id: "code",
    label: "Code",
    glyph: "‹›",
    apply: (body, start, end) => toggleMarker(body, start, end, "`"),
  },
  {
    id: "bullet",
    label: "Bulleted list",
    icon: ListBullets,
    apply: (body, start, end) => togglePrefix(body, start, end, "- "),
  },
  {
    id: "quote",
    label: "Quote",
    glyph: "❝",
    apply: (body, start, end) => togglePrefix(body, start, end, "> "),
  },
];

export function RichTextComposer({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  onSubmit,
  /** Turn off the record half of the picker where only people make sense. */
  peopleOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  onSubmit?: () => void;
  peopleOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [preview, setPreview] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // What the editor's DOM currently serialises to, or null when the editor
  // holds nothing yet — freshly mounted, or just returned from Preview, which
  // unmounts the contenteditable. Redrawing on every value change would move
  // the caret to the start on every keystroke, so a redraw only happens when
  // the DOM has nothing (null) or the value arrived from somewhere other than
  // typing. Initialising this to `value` was the review's blank-editor bug:
  // the first draw was skipped and an existing note mounted empty, one
  // keystroke away from being overwritten.
  const shown = useRef<string | null>(null);

  const draw = useCallback((body: string) => {
    const element = ref.current;
    if (!element) return;
    renderBody(element, body, referenceChipElement);
    shown.current = body;
  }, []);

  useEffect(() => {
    if (preview) {
      // The editor is out of the DOM; whatever it showed is gone with it.
      shown.current = null;
      return;
    }
    if (value === shown.current) return;
    draw(value);
  }, [draw, preview, value]);

  /** The caret, as a position in the body. */
  function caretOffset(): number {
    const element = ref.current;
    const selection = window.getSelection();
    const length = (shown.current ?? value).length;
    if (!element || !selection?.anchorNode) return length;
    return offsetOf(element, selection.anchorNode, selection.anchorOffset) ?? length;
  }

  /** Replace the body and put the caret back where it belongs. */
  function rewrite(body: string, caret: number) {
    onChange(body);
    draw(body);
    requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) return;
      element.focus();
      placeCaret(element, caret);
    });
  }

  const { data: team } = useQuery({
    queryKey: ["crm-team"],
    queryFn: () => fetchJson<TeamResponse>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
  });

  // Records are searched on the server because there are too many to cache;
  // people are not, because a request per keystroke would make picking a
  // colleague slower than typing their name.
  const { data: records } = useQuery({
    queryKey: ["crm-reference-search", query],
    queryFn: () =>
      fetchJson<SearchResponse>(`/api/v2/records/search?q=${encodeURIComponent(query ?? "")}&limit=4`),
    enabled: !peopleOnly && query !== null && query.trim().length >= 2,
    staleTime: 30_000,
  });

  const people: Candidate[] = (team?.data ?? [])
    .filter((user) => {
      if (query === null) return false;
      if (!query) return true;
      const needle = query.toLowerCase();
      return (
        (user.name ?? "").toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle)
      );
    })
    .slice(0, 5)
    .map((user) => ({
      kind: "user" as const,
      id: user.id,
      label: user.name ?? user.email,
      hint: user.email,
      group: "People",
    }));

  const recordCandidates: Candidate[] = (records?.groups ?? []).flatMap((group) => {
    const kind = referenceKindFromSearchType(group.type);
    if (!kind) return [];
    return group.results.slice(0, 3).map((result) => ({
      kind,
      id: result.id,
      label: result.title,
      hint: result.reference ?? result.subtitle,
      group: group.label,
    }));
  });

  const visible = [...people, ...recordCandidates].slice(0, 10);

  /** Typing: read the DOM back out, without redrawing it underneath. */
  function sync() {
    const element = ref.current;
    if (!element) return;
    const next = serialise(element);
    shown.current = next;
    onChange(next);
    setQuery(activeReferenceQuery(next, caretOffset()));
    setHighlighted(0);
  }

  function pick(candidate: Candidate) {
    const body = shown.current ?? value;
    const result = insertReference(body, caretOffset(), query ?? "", candidate);
    setQuery(null);
    rewrite(result.body, result.caret);
  }

  function runTool(tool: Tool) {
    const element = ref.current;
    const selection = window.getSelection();
    const body = shown.current ?? value;

    let start = body.length;
    let end = start;
    if (element && selection?.anchorNode && selection.focusNode) {
      const anchor = offsetOf(element, selection.anchorNode, selection.anchorOffset);
      const focus = offsetOf(element, selection.focusNode, selection.focusOffset);
      if (anchor !== null && focus !== null) {
        start = Math.min(anchor, focus);
        end = Math.max(anchor, focus);
      }
    }

    const result = tool.apply(body, start, end);
    rewrite(result.body, result.end);
  }

  /** Drop a glyph in at the caret — the same path a reference chip takes. */
  function insertEmoji(glyph: string) {
    const body = shown.current ?? value;
    const caret = Math.min(caretOffset(), body.length);
    rewrite(`${body.slice(0, caret)}${glyph}${body.slice(caret)}`, caret + glyph.length);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-0.5">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Button
              key={tool.id}
              type="button"
              variant="ghost"
              size="sm"
              aria-label={tool.label}
              title={tool.label}
              disabled={preview}
              onClick={() => runTool(tool)}
            >
              {Icon ? (
                <Icon className="size-4" aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "text-sm",
                    tool.id === "bold" && "font-bold",
                    tool.id === "italic" && "italic",
                  )}
                >
                  {tool.glyph}
                </span>
              )}
            </Button>
          );
        })}

        {/* An emoji is punctuation in a work note — "done 👍" is a whole
            reply — and asking somebody to find their OS picker inside a
            contenteditable is how they stop bothering. */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Insert an emoji"
              title="Insert an emoji"
              disabled={preview}
            >
              <Smiley className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <EmojiPicker
              onSelect={(glyph) => {
                insertEmoji(glyph);
                setEmojiOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <span className="flex-1" />

        <Button
          type="button"
          variant={preview ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setPreview((current) => !current)}
        >
          <Eye className="mr-1.5 size-4" aria-hidden="true" />
          {preview ? "Edit" : "Preview"}
        </Button>
      </div>

      {preview ? (
        <div className="min-h-20 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
          {value.trim() ? (
            <RichTextRenderer body={value} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <div className="relative">
          <div
            ref={ref}
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder ?? "Write a note"}
            contentEditable
            suppressContentEditableWarning
            data-placeholder={
              placeholder ?? "Write a note. Type @ to mention someone or link a record."
            }
            className={cn(
              // 16px on a phone, because iOS zooms the whole page in when a
              // field smaller than that takes focus and never zooms back
              // out. The global rule in globals.css cannot reach this: it
              // lives in `@layer app`, and utilities are a later layer, so
              // a `text-sm` written here would win. It has to be said here.
              "w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base sm:text-sm",
              "whitespace-pre-wrap break-words",
              "focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]",
              // A contenteditable has no placeholder of its own, and `:empty`
              // misses the stray text node a browser leaves behind — so
              // emptiness is decided here rather than in CSS.
              !value.trim() &&
                "before:pointer-events-none before:absolute before:text-[var(--text-subtle)] before:content-[attr(data-placeholder)]",
              className,
            )}
            style={{ minHeight: `${rows * 1.5 + 1}rem` }}
            onInput={sync}
            onClick={() => setQuery(activeReferenceQuery(shown.current ?? value, caretOffset()))}
            // Plain text only: a paste from a browser brings a stylesheet's
            // worth of markup with it, and none of it survives serialising.
            onPaste={(event) => {
              event.preventDefault();
              const text = event.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }}
            onBlur={() => setQuery(null)}
            onKeyDown={(event) => {
              if (query !== null && visible.length) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlighted((index) => (index + 1) % visible.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlighted((index) => (index - 1 + visible.length) % visible.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  pick(visible[highlighted]);
                  return;
                }
                if (event.key === "Escape") {
                  setQuery(null);
                  return;
                }
              }
              if (onSubmit && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />

          {query !== null && visible.length ? (
            <ul
              // Full composer width on a phone; 320px pinned to the left
              // edge from `sm` up, which is where it started.
              className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-lg sm:right-auto sm:w-80"
              role="listbox"
            >
              {visible.map((candidate, index) => {
                const newGroup = index === 0 || visible[index - 1].group !== candidate.group;
                return (
                  <li key={`${candidate.kind}-${candidate.id}`}>
                    {newGroup ? (
                      <p className="px-3 pb-0.5 pt-2 text-sm font-medium text-[var(--text-subtle)]">
                        {candidate.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlighted}
                      // Mouse-down beats the textarea's blur, so the click is
                      // not swallowed by the picker closing.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(candidate);
                      }}
                      onMouseEnter={() => setHighlighted(index)}
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm",
                        index === highlighted ? "bg-[var(--surface-hover)]" : "",
                      )}
                    >
                      <span className="truncate font-medium">{candidate.label}</span>
                      {candidate.hint ? (
                        <span className="truncate text-sm text-[var(--text-muted)]">
                          {candidate.hint}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
