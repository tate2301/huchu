"use client";

import * as React from "react";

import { PhotoCamera } from "@/lib/icons";
import type { Grant, RailEdit, RailGroup, RailTop } from "@/lib/retail/record-kinds/types";

import { DetailRow } from "./detail-row";

/**
 * The details rail (5.6.6): an optional meter or photo card, then the kind's
 * groups. The first group with a row this role may change carries the hint
 * "click any value to change it"; rows the role may not change are plain
 * text with no pen. One row edits at a time.
 */
export function DetailsRail({
  top,
  groups,
  can,
  locked,
  onSave,
}: {
  top: RailTop | null;
  groups: RailGroup[];
  can: (grant: Grant) => boolean;
  /** A binned record: nothing changes until it is restored. */
  locked: boolean;
  onSave: (edit: RailEdit, value: unknown) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const editable = (edit: RailEdit | undefined) => Boolean(edit) && !locked && can(edit!.requires);
  const shown = groups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => !row.visible || can(row.visible)) }))
    .filter((group) => group.rows.length > 0);
  const hinted = shown.findIndex((group) => group.rows.some((row) => editable(row.edit)));

  return (
    <aside aria-label="Details" className="cx-rf-rail">
      {top ? <RailTopCard top={top} canEdit={(grant) => !locked && can(grant)} onSave={onSave} /> : null}
      {shown.map((group, index) => (
        <section key={group.title} className="cx-rf-group" aria-label={group.title}>
          <h3 className="cx-rf-group__title">
            {group.title}
            {index === hinted ? <span className="cx-rf-group__hint">click any value to change it</span> : null}
          </h3>
          {group.rows.map((row) => {
            const id = `${group.title}:${row.key}`;
            return (
              <DetailRow
                key={row.key}
                row={row}
                editable={editable(row.edit)}
                editing={editing === id}
                saved={saved === id}
                onEdit={() => {
                  setEditing(id);
                  setSaved(null);
                }}
                onCancel={() => setEditing(null)}
                onSave={async (edit, value) => {
                  await onSave(edit, value);
                  setEditing(null);
                  setSaved(id);
                }}
              />
            );
          })}
        </section>
      ))}
    </aside>
  );
}

function RailTopCard({
  top,
  canEdit,
  onSave,
}: {
  top: RailTop;
  canEdit: (grant: Grant) => boolean;
  onSave: (edit: RailEdit, value: unknown) => Promise<void>;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if ("meter" in top) {
    const { meter } = top;
    return (
      <div className="cx-rf-meter">
        <span className="cx-rf-meter__label">{meter.label}</span>
        <span className="cx-rf-meter__value">{meter.value}</span>
        <span className="cx-rf-meter__track" aria-hidden="true">
          <span className="cx-rf-meter__fill" style={{ display: "block", width: `${Math.max(0, Math.min(100, meter.pct))}%` }} />
        </span>
        <span className="cx-rf-meter__note">{meter.note}</span>
      </div>
    );
  }

  const { photo } = top;
  const edit = photo.edit && canEdit(photo.edit.requires) ? photo.edit : null;
  const take = async (file: File | undefined) => {
    if (!file || !edit) return;
    setBusy(true);
    setError(null);
    try {
      const url = await edit.upload(file);
      await onSave({ field: edit.field, type: "text", initial: "", requires: edit.requires }, url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That picture did not upload. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const body = (
    <>
      {photo.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- an uploaded url of any origin
        <img src={photo.url} alt="" />
      ) : (
        <PhotoCamera aria-hidden="true" />
      )}
      <span className="cx-rf-photo__prompt">{busy ? "Uploading…" : photo.url ? (edit ? "Change the photo" : "") : photo.prompt}</span>
      <span className="cx-rf-photo__sub" style={error ? { color: "var(--bad)" } : undefined}>
        {error ?? photo.sub}
      </span>
    </>
  );
  if (!edit) return <div className="cx-rf-photo">{body}</div>;
  return (
    <>
      <button type="button" className="cx-rf-photo" onClick={() => inputRef.current?.click()} disabled={busy}>
        {body}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </>
  );
}
