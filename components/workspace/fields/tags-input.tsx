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
};

export function addTag(tags: string[], typed: string): string[] {
  const tag = typed.trim();
  if (!tag) return tags;
  if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

export function TagsInput({ value, onValueChange, keepOne = false, disabled, className, id, ...props }: TagsInputProps) {
  const [draft, setDraft] = React.useState("");

  const removable = !disabled && !(keepOne && value.length <= 1);

  const commit = () => {
    const next = addTag(value, draft);
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
      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
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
