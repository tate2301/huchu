"use client";

import { useState } from "react";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";

import { RecordMark, type RecordKind } from "./record-mark";
import { RecordMarkPicker } from "./record-mark-picker";

/**
 * A handful of marks that cover most of what a flooring business files.
 * Not a picker — a picker over the whole emoji set is a search problem, and
 * the field takes free text anyway for anyone who wants something else.
 */
/**
 * Sets a record's emoji or display picture.
 *
 * The two are one control because they answer the same question — what should
 * stand for this record — and only one of them can win. The preview shows what
 * the record will actually look like in a list, including the fallback, so
 * "leave it alone" is a visible choice rather than an empty box.
 */
export function RecordMarkField({
  kind,
  name,
  emoji,
  avatarUrl,
  accent,
  onChange,
}: {
  kind: RecordKind;
  name: string;
  emoji: string;
  avatarUrl: string;
  /** The record's chosen colour, or "" for the one derived from its name. */
  accent?: string;
  onChange: (next: { emoji: string; avatarUrl: string; accent?: string }) => void;
}) {
  const [showUrl, setShowUrl] = useState(Boolean(avatarUrl));

  return (
    <div className="space-y-2">
      <Label>Mark</Label>
      <div className="flex flex-wrap items-center gap-3">
        <RecordMark
          kind={kind}
          name={name}
          emoji={emoji || null}
          avatarUrl={avatarUrl || null}
          accent={accent || null}
          size="lg"
        />

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {/* Emoji and colour are two independent choices on one control,
              the way Notion has them — and both stay optional, because the
              fallbacks (the entity icon, the hue of the record's own name) are
              better than making somebody decide before they can save. */}
          <RecordMarkPicker
            emoji={emoji || null}
            accent={accent || null}
            name={name}
            onChange={(next) =>
              onChange({
                emoji: next.emoji ?? "",
                avatarUrl,
                accent: next.accent ?? "",
              })
            }
          />
          <p className="text-sm text-[var(--text-muted)]">
            Pick an emoji and a colour, or leave both and it takes the colour of
            its name.
          </p>
        </div>
      </div>

      {showUrl ? (
        <Input
          value={avatarUrl}
          onChange={(event) => onChange({ emoji, avatarUrl: event.target.value, accent })}
          placeholder="https://…"
          aria-label="Link to a display picture"
          className="h-9"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (showUrl) onChange({ emoji, avatarUrl: "", accent });
            setShowUrl((previous) => !previous);
          }}
        >
          {showUrl ? "Use an emoji instead" : "Use a picture"}
        </Button>
        {emoji || avatarUrl ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange({ emoji: "", avatarUrl: "", accent: "" });
              setShowUrl(false);
            }}
          >
            Clear
          </Button>
        ) : null}
        <p className="text-sm text-[var(--text-muted)]">
          {/* Saying what happens when it is left empty, since that is the
              state most records will be in. */}
          A picture wins over an emoji. With neither, the record shows its
          {kind === "person" || kind === "rep" ? " initials." : " entity icon."}
        </p>
      </div>
    </div>
  );
}
