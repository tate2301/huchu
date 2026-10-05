"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import { ButtonGroup } from "@/components/workspace/button-group";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { DotsThree, Trash } from "@/lib/icons";
import type { RecordAction } from "@/lib/retail/record-kinds/types";

/**
 * The record's actions in the shell's header (5.6.2): up to three outline
 * buttons joined as one group, then ⋯ (240px, right-aligned) with the kind's
 * `more` items, and for binnable kinds "Move to the bin" under a rule, with
 * "Managers and owners only" under it. Only what the role may do is drawn.
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
  if (actions.length === 0 && more.length === 0 && !bin) return null;
  return (
    <ButtonGroup aria-label="Actions" className="cx-rf-actions">
      {actions.slice(0, 3).map((action) => (
        <Button key={action.key} onClick={() => onAction(action)}>
          {action.label}
        </Button>
      ))}
      {more.length || bin ? (
        <Menu>
          <MenuTrigger asChild>
            <Button aria-label="More actions" className="cx-rf-more">
              <DotsThree weight="bold" aria-hidden="true" />
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="cx-rf-menu">
            {more.map((action) => (
              <MenuItem key={action.key} danger={action.tone === "bad"} sub={action.sub} onSelect={() => onAction(action)}>
                {action.label}
              </MenuItem>
            ))}
            {bin ? (
              <>
                {more.length ? <MenuSeparator /> : null}
                <MenuItem danger icon={<Trash aria-hidden="true" />} onSelect={bin}>
                  Move to the bin
                </MenuItem>
                <span className="cx-rf-menu__bin-sub">Managers and owners only</span>
              </>
            ) : null}
          </MenuContent>
        </Menu>
      ) : null}
    </ButtonGroup>
  );
}
