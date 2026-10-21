"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import { ActionsWithMore } from "@/components/workspace/button-group-parts";
import { MenuItem, MenuSeparator } from "@/components/workspace/menu";
import { Trash } from "@/lib/icons";
import type { RecordAction } from "@/lib/retail/record-kinds/types";

/**
 * The record's actions in the shell's header (5.6.2): the first action beside
 * ⋯ as one group (`ActionsWithMore`), and inside ⋯ the other actions, the
 * kind's `more` items and, for binnable kinds, "Move to the bin" under a rule
 * with "Managers and owners only" under it. Only what the role may do is drawn.
 */
export function RecordActions({
  actions,
  more,
  bin,
  onAction,
}: {
  actions: RecordAction[];
  more: RecordAction[];
  /** Drawn when the role holds the kind's delete right. */
  bin: (() => void) | null;
  onAction: (action: RecordAction) => void;
}) {
  const [first, ...rest] = actions;
  const items = [...rest, ...more];
  if (!first && items.length === 0 && !bin) return null;
  const item = (action: RecordAction) => (
    <MenuItem
      key={action.key}
      danger={action.tone === "bad"}
      sub={action.sub}
      disabled={Boolean(action.disabled)}
      title={action.disabled}
      onSelect={() => onAction(action)}
    >
      {action.label}
    </MenuItem>
  );
  return (
    <ActionsWithMore
      label="Actions"
      menuClassName="cx-rf-menu"
      visible={
        first ? (
          <Button disabled={Boolean(first.disabled)} title={first.disabled} onClick={() => onAction(first)}>
            {first.label}
          </Button>
        ) : null
      }
    >
      {items.map(item)}
      {bin ? (
        <>
          {items.length ? <MenuSeparator /> : null}
          <MenuItem danger icon={<Trash aria-hidden="true" />} onSelect={bin}>
            Move to the bin
          </MenuItem>
          <span className="cx-rf-menu__bin-sub">Managers and owners only</span>
        </>
      ) : null}
    </ActionsWithMore>
  );
}
