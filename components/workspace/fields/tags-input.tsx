"use client";

import * as React from "react";

import { X } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * TagsInput — words typed into a wrapping box: 26px tags (`--tray`) each with
 * a × "Remove <tag>", then an input. Enter (or a comma) adds what is typed;
 * Backspace in an empty input takes the last tag off. Duplicates are ignored.
 * With `keepOne`, the last tag left has no × and stays (a site keeps a place).
 */
export type TagsInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string[];
  onValueChange: (value: string[]) => void;
  keepOne?: boolean;
  /**
   * Only these may be added: offered as the person types, and what is typed
   * is taken as the one it names ("borr" → "Borrowdale" when it is the only
   * match). Anything else is not added.
   */
  suggestions?: string[];
};

/** The suggestion a typed word names: the exact one, else the only one starting with it. */
export function matchSuggestion(suggestions: string[], typed: string): string | null {
  const word = typed.trim().toLowerCase();
  if (!word) return null;
  const exact = suggestions.find((option) => option.toLowerCase() === word);
  if (exact) return exact;
  const starts = suggestions.filter((option) => option.toLowerCase().startsWith(word));
  return starts.length === 1 ? starts[0]! : null;
}

export function addTag(tags: string[], typed: string): string[] {
  const tag = typed.trim();
  if (!tag) return tags;
  if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

export function TagsInput({
  value,
  onValueChange,
  keepOne = false,
  suggestions,
  disabled,
  className,
  id,
  ...props
}: TagsInputProps) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId();

  const removable = !disabled && !(keepOne && value.length <= 1);

  const commit = () => {
    const typed = suggestions ? matchSuggestion(suggestions, draft) : draft;
    const next = typed ? addTag(value, typed) : value;
    if (next !== value) onValueChange(next);
    setDraft("");
  };

  return (
    <div className={cn("cx-tags", className)}>
      {value.map((tag) => (
        <span key={tag} className="cx-tag">
          {tag}
          {removable ? (
            <button
              type="button"
              className="cx-tag__remove"
              aria-label={`Remove ${tag}`}
              onClick={() => onValueChange(value.filter((existing) => existing !== tag))}
            >
              <X aria-hidden />
            </button>
          ) : null}
        </span>
      ))}
      {suggestions ? (
        <datalist id={listId}>
          {suggestions
            .filter((option) => !value.includes(option))
            .map((option) => (
              <option key={option} value={option} />
            ))}
        </datalist>
      ) : null}
      <input
        id={id}
        list={suggestions ? listId : undefined}
        value={draft}
        onChange={(event) => {
          const typed = event.target.value;
          // A suggestion picked from the list is added at once.
          if (suggestions?.includes(typed)) {
            const next = addTag(value, typed);
            if (next !== value) onValueChange(next);
            setDraft("");
            return;
          }
          setDraft(typed);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
          } else if (event.key === "Backspace" && draft === "" && value.length > 0 && removable) {
            onValueChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        disabled={disabled}
        {...props}
      />
    </div>
  );
}
