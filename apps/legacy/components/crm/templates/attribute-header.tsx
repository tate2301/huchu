"use client";

import { useState } from "react";

import { Badge } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { Plus, Trash2, type LucideIcon } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The properties above a page, the way Notion does them.
 *
 * The alternative is a settings dialog, and a settings dialog is where
 * properties go to rot: they are out of sight while somebody works, so nobody
 * notices that the owner left in March or the description still describes what
 * the template did two rewrites ago. Putting them at the top of the page means
 * they are read every time the page is opened, which is the only maintenance
 * mechanism that has ever worked.
 *
 * Built-in rows are fixed because they mean something to the system. Custom
 * rows are free text on both sides, because the moment you make somebody
 * declare a schema for "Reviewed by" they stop recording it.
 */

export type AttributeRow = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Rendered instead of an input for rows the system owns. */
  display?: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
};

export function AttributeHeader({
  emoji,
  onEmojiChange,
  title,
  onTitleChange,
  titlePlaceholder = "Untitled",
  description,
  onDescriptionChange,
  rows,
  custom,
  onCustomChange,
  readOnly,
}: {
  emoji: string | null;
  onEmojiChange?: (value: string | null) => void;
  title: string;
  onTitleChange?: (value: string) => void;
  titlePlaceholder?: string;
  description: string;
  onDescriptionChange?: (value: string) => void;
  /** The properties the system owns. */
  rows: AttributeRow[];
  /** The ones the team invented. */
  custom: Record<string, string>;
  onCustomChange?: (next: Record<string, string>) => void;
  readOnly?: boolean;
}) {
  const [addingCustom, setAddingCustom] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");

  const customEntries = Object.entries(custom);

  function commitCustom() {
    const key = draftKey.trim();
    if (!key) {
      setAddingCustom(false);
      return;
    }
    onCustomChange?.({ ...custom, [key]: draftValue.trim() });
    setDraftKey("");
    setDraftValue("");
    setAddingCustom(false);
  }

  return (
    <header className="space-y-3">
      <div className="flex items-start gap-3">
        {/* An emoji is a one-character input, not an emoji picker. A picker is
            a dependency and a modal for something people paste. */}
        <Input
          aria-label="Icon"
          value={emoji ?? ""}
          disabled={readOnly}
          placeholder="📄"
          maxLength={4}
          className="h-10 w-12 shrink-0 text-center text-xl"
          onChange={(event) => onEmojiChange?.(event.target.value || null)}
        />

        <Input
          aria-label="Title"
          value={title}
          disabled={readOnly}
          placeholder={titlePlaceholder}
          className="h-10 flex-1 border-transparent bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:border-[var(--border)] focus-visible:px-2"
          onChange={(event) => onTitleChange?.(event.target.value)}
        />
      </div>

      <Textarea
        aria-label="Description"
        value={description}
        disabled={readOnly}
        rows={2}
        placeholder="What this is for, and when to use it."
        className="border-transparent bg-transparent px-0 shadow-none focus-visible:border-[var(--border)] focus-visible:px-2"
        onChange={(event) => onDescriptionChange?.(event.target.value)}
      />

      <dl className="space-y-1">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.id} className="flex items-center gap-3">
              <dt className="flex w-28 shrink-0 items-center gap-1.5 text-sm text-[var(--text-muted)] sm:w-40">
                {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
                {row.label}
              </dt>
              <dd className="min-w-0 flex-1 text-sm">
                {row.display ?? (
                  <Input
                    aria-label={row.label}
                    value={row.value ?? ""}
                    disabled={readOnly || !row.onChange}
                    placeholder={row.placeholder ?? "Empty"}
                    className="h-8 border-transparent bg-transparent px-0 shadow-none focus-visible:border-[var(--border)] focus-visible:px-2"
                    onChange={(event) => row.onChange?.(event.target.value)}
                  />
                )}
              </dd>
            </div>
          );
        })}

        {customEntries.map(([key, value]) => (
          <div key={key} className="group flex items-center gap-3">
            <dt className="w-28 shrink-0 truncate text-sm text-[var(--text-muted)] sm:w-40">{key}</dt>
            <dd className="flex min-w-0 flex-1 items-center gap-1">
              <Input
                aria-label={key}
                value={value}
                disabled={readOnly}
                className="h-8 border-transparent bg-transparent px-0 shadow-none focus-visible:border-[var(--border)] focus-visible:px-2"
                onChange={(event) =>
                  onCustomChange?.({ ...custom, [key]: event.target.value })
                }
              />
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${key}`}
                  className="opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
                  onClick={() => {
                    const next = { ...custom };
                    delete next[key];
                    onCustomChange?.(next);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </dd>
          </div>
        ))}

        {addingCustom ? (
          <div className="flex items-center gap-3">
            <Input
              autoFocus
              aria-label="Property name"
              value={draftKey}
              placeholder="Property"
              className="h-8 w-28 shrink-0 sm:w-40"
              onChange={(event) => setDraftKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitCustom();
                if (event.key === "Escape") setAddingCustom(false);
              }}
            />
            <Input
              aria-label="Property value"
              value={draftValue}
              placeholder="Value"
              className="h-8 flex-1"
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitCustom();
                if (event.key === "Escape") setAddingCustom(false);
              }}
              onBlur={commitCustom}
            />
          </div>
        ) : null}
      </dl>

      {readOnly || !onCustomChange ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("text-[var(--text-muted)]", addingCustom && "invisible")}
          onClick={() => setAddingCustom(true)}
        >
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          Add a property
        </Button>
      )}
    </header>
  );
}

/** A read-only chip row, for showing a template's properties on a list. */
export function AttributeChips({ custom }: { custom: Record<string, string> }) {
  const entries = Object.entries(custom).filter(([, value]) => value.trim());
  if (entries.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <li key={key}>
          <Badge tone="neutral">
            {key}: {value}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
