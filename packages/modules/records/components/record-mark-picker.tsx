"use client";

import { Emoji, EmojiPicker, IconTile } from "@corelithzw/react";

import { Button } from "@corelithzw/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@corelithzw/ui/components/popover";
import { ACCENTS, ACCENT_LABELS } from "@corelithzw/ui/lib/ui/accents";
import { recordAccent } from "@corelithzw/ui/lib/ui/record-accent";
import { Check } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The emoji and colour a record is drawn in.
 *
 * Notion's model, and the right one: a record's mark is two independent
 * choices — a glyph and a hue — and both are optional. Leaving the emoji off
 * falls back to the entity's icon; leaving the colour off derives one from the
 * record's own name, which is what stops a list of two hundred companies being
 * a column of identical grey squares without anybody having to colour them.
 *
 * Both controls are the design system's: `EmojiPicker` for the glyph — search,
 * categories, skin tones, iOS artwork — and the accent channel for the hue, so
 * a colour chosen here is the same colour a DS `Avatar` or `IconTile` would
 * derive on its own.
 */
export function RecordMarkPicker({
  emoji,
  accent,
  name,
  onChange,
  disabled,
}: {
  emoji: string | null;
  accent: string | null;
  /** What the colour is derived from when none is chosen. */
  name: string;
  onChange: (next: { emoji: string | null; accent: string | null }) => void;
  disabled?: boolean;
}) {
  const resolved = recordAccent(accent, name);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Icon and colour"
          className={cn(
            "flex-none rounded-[var(--radius-md)]",
            disabled ? "opacity-60" : "hover:brightness-95",
          )}
        >
          <IconTile accent={resolved} size="lg">
            {emoji ? <Emoji emoji={emoji} label="" size={22} /> : "🙂"}
          </IconTile>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <div className="border-b border-[var(--border-subtle)] p-2">
          <p className="pb-1.5 text-sm font-medium text-[var(--text-subtle)]">
            Colour
          </p>
          <div className="flex flex-wrap gap-1">
            {ACCENTS.map((entry) => (
              <button
                key={entry}
                type="button"
                data-accent={entry}
                aria-label={ACCENT_LABELS[entry]}
                aria-pressed={accent === entry}
                title={ACCENT_LABELS[entry]}
                onClick={() => onChange({ emoji, accent: entry })}
                className="flex size-6 items-center justify-center rounded-full bg-[var(--accent-solid)]"
              >
                {accent === entry ? (
                  <Check
                    className="size-3.5 text-[var(--accent-on)]"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            ))}
          </div>
          {accent ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 text-[var(--text-muted)]"
              onClick={() => onChange({ emoji, accent: null })}
            >
              Use the colour from its name
            </Button>
          ) : null}
        </div>

        <EmojiPicker
          onSelect={(glyph) => onChange({ emoji: glyph, accent })}
          footer={
            emoji ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-[var(--text-muted)]"
                onClick={() => onChange({ emoji: null, accent })}
              >
                Remove the emoji
              </Button>
            ) : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
