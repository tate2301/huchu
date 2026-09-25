"use client";

import { Badge } from "@corelithzw/react";

/**
 * A read-only chip row, for showing a template's custom properties on a list.
 *
 * What used to sit here as well was `AttributeHeader`: a Notion-style property
 * block above the page — a 20px title *input*, a description textarea and a
 * stack of 14px label/value rows. `TemplateBuilder.dc.html` draws none of it.
 * The template's title is plain 17/600 text with a pencil 5px after it (rule
 * 8, not an input wearing title type), there is no description anywhere (rule
 * 1), and the properties live in the 308px inspector on the right, which is
 * where `TemplateEditor` puts them now. The component had no callers left; it
 * is gone rather than kept as a second answer to a question the board has
 * already answered.
 */
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
