"use client";

import { useState } from "react";

import { Card } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { RichTextComposer } from "@/components/crm/collaboration/rich-text-composer";
import { RichTextRenderer } from "@corelithzw/module-records/components/rich-text-renderer";
import type { WidgetInstance } from "@/lib/crm/widgets";

/**
 * The widget somebody writes themselves.
 *
 * Every other tile answers a question the product decided was worth asking.
 * This one is for the question a particular team has — the standing note, the
 * three links everyone needs, who is covering the phone this week. It is the
 * simplest thing that makes an overview genuinely theirs, and because it is
 * written in the CRM's own text format, a note can reference the deal or the
 * person it is about and that reference is a link.
 *
 * Its content lives in the widget's `config`, which is saved with the layout —
 * so it needs no table of its own and nothing to clean up when it is removed.
 */

export type NoteConfig = { title?: string; body?: string };

export function readNoteConfig(instance: WidgetInstance): NoteConfig {
  const config = instance.config ?? {};
  return {
    title: typeof config.title === "string" ? config.title : "",
    body: typeof config.body === "string" ? config.body : "",
  };
}

export function CustomNoteWidget({
  instance,
  editing,
  onChange,
}: {
  instance: WidgetInstance;
  /** The page is in edit mode — the note can be written. */
  editing: boolean;
  onChange: (config: NoteConfig) => void;
}) {
  const saved = readNoteConfig(instance);
  const [draft, setDraft] = useState<NoteConfig>(saved);
  const [open, setOpen] = useState(false);

  if (!editing || !open) {
    return (
      <Card title={saved.title || "Note"}>
        {saved.body?.trim() ? (
          <RichTextRenderer body={saved.body} />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            {editing
              ? "Nothing written yet."
              : "This note is empty — edit the page to write in it."}
          </p>
        )}
        {editing ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => {
              setDraft(saved);
              setOpen(true);
            }}
          >
            {saved.body?.trim() ? "Edit note" : "Write a note"}
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card title="Note">
      <div className="space-y-2">
        <Input
          value={draft.title ?? ""}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          placeholder="What it is called"
          aria-label="Note title"
        />
        <RichTextComposer
          value={draft.body ?? ""}
          onChange={(body) => setDraft({ ...draft, body })}
          placeholder="Anything the team needs on this page. Type @ to link a record."
          rows={4}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Done
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
