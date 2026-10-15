"use client";

import * as React from "react";

import { Button, Icon, Kbd, Segmented, useShortcut, type IconName } from "@/components/core";

import type { BuilderMode } from "./builder-grid";

export type SavedState = { state: "saved"; at: string | null } | { state: "dirty" } | { state: "saving" };

/**
 * The builder's bar: Build or Preview (P), whether it is saved, the builder's
 * own buttons, and Publish (Ctrl ↵). `lead` comes first — the way back and the
 * name, when the bar runs across the window.
 */
export function BuilderBar({
  name,
  lead,
  mode,
  onMode,
  saved,
  actions,
  publish,
}: {
  /** Shown in the bar when the outline that carries it is hidden (a phone). */
  name?: string;
  lead?: React.ReactNode;
  mode: BuilderMode;
  onMode: (mode: BuilderMode) => void;
  /** Left out where the page around the builder saves it (the admin portal's library). */
  saved?: SavedState;
  actions?: React.ReactNode;
  /** The bar's primary: Publish, or what stands for it where nothing can be published (Use this template). Left out, the bar has none. */
  publish?: { label?: string; icon?: IconName; onPublish: () => void; disabled?: boolean; busy?: boolean };
}) {
  useShortcut("P", () => onMode(mode === "build" ? "preview" : "build"));
  return (
    <>
      {lead}
      {name ? <span className="rb-name">{name}</span> : null}
      <Segmented<BuilderMode>
        label="Mode"
        value={mode}
        onChange={onMode}
        items={[
          {
            value: "build",
            label: (
              <>
                <Icon name="edit" />
                Build
              </>
            ),
          },
          {
            value: "preview",
            label: (
              <>
                <Icon name="eye" />
                Preview
                <Kbd>P</Kbd>
              </>
            ),
          },
        ]}
      />
      <div className="tb-r">
        {!saved ? null : saved.state === "saved" ? (
          <span className="saved">
            <Icon name="check" />
            {saved.at ? `Saved ${saved.at}` : "Saved"}
          </span>
        ) : (
          <span className="saved is-dirty" role="status">
            <Icon name={saved.state === "saving" ? "working" : "clock"} />
            {saved.state === "saving" ? "Saving" : "Not saved"}
          </span>
        )}
        {actions}
        {publish ? (
          <Button
            variant="primary"
            icon={publish.icon ?? "publish"}
            shortcut="Ctrl ↵"
            onClick={publish.onPublish}
            disabled={publish.disabled}
            busy={publish.busy}
          >
            {publish.label ?? "Publish"}
          </Button>
        ) : null}
      </div>
    </>
  );
}
