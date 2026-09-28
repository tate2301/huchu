"use client";

import * as React from "react";

import { HeaderAction } from "@/components/management/ui";
import { Input } from "@/components/ui/input";
import { Upload, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import styles from "./branding.module.css";

export type AssetFieldProps = {
  /** "Logo", "Signature", "Stamp" — the stronger 13px label the boards draw. */
  label: string;
  /** The stored address. `CompanyBranding` holds a URL, not a file. */
  value: string;
  onChange: (next: string) => void;
  /** The glyph drawn in the empty 56px preview. */
  icon: React.ComponentType<{ className?: string }>;
  /** `aria-label` for the ✕ — "Remove the logo". */
  removeLabel: string;
  /** `aria-label` for the address field — "Logo address". */
  addressLabel: string;
};

function fileNameFrom(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutQuery = trimmed.split(/[?#]/)[0];
  const last = withoutQuery.split("/").filter(Boolean).pop();
  return last || trimmed;
}

/**
 * One brand asset: its preview, what it is, and the two things you can do to
 * it.
 *
 * `BrandingAssets.dc.html` draws a drop target — but the only upload route in
 * the repo (`/api/uploads`) takes a registered context from
 * `lib/uploads/policies.ts`, there is no branding context in it, and that file
 * belongs to another module. `CompanyBranding.logoUrl` is an address, so this
 * edits an address: the tile, the preview, the replace and the remove are the
 * board's, and the two strings that would have promised a file picker say what
 * the control actually does instead. Reported to the orchestrator.
 */
export function AssetField({
  label,
  value,
  onChange,
  icon: Icon,
  removeLabel,
  addressLabel,
}: AssetFieldProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const set = Boolean(value.trim());

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = React.useCallback(() => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onChange(next);
  }, [draft, onChange, value]);

  return (
    <div className={styles.asset}>
      <span className={styles.assetLabel}>{label}</span>

      <div className={styles.assetTile}>
        <span className={styles.assetPreview}>
          {set ? (
            // A brand asset is whatever the tenant pointed at; next/image
            // would need every one of those hosts in the config.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" />
          ) : (
            <Icon />
          )}
        </span>

        {editing ? (
          <Input
            autoFocus
            aria-label={addressLabel}
            className={cn(styles.assetBody, styles.mono)}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") {
                setDraft(value);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span className={styles.assetBody}>
            <span className={styles.assetName} data-empty={set ? "false" : "true"}>
              {set ? fileNameFrom(value) : "No image yet"}
            </span>
            <span className={styles.assetMeta}>{set ? value : "SVG or PNG"}</span>
          </span>
        )}

        {/* The shared 32px rung — the same button the record header draws, at
            the same size the board gives this one. */}
        <HeaderAction icon={Upload} onClick={() => setEditing(true)}>
          {set ? "Replace" : "Add"}
        </HeaderAction>

        {set ? (
          <button
            type="button"
            aria-label={removeLabel}
            className={styles.assetRemove}
            onClick={() => {
              setEditing(false);
              onChange("");
            }}
          >
            <X />
          </button>
        ) : null}
      </div>
    </div>
  );
}
