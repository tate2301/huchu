"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import { ButtonGroup } from "@/components/workspace/button-group";
import { Menu, MenuContent, MenuTrigger } from "@/components/workspace/menu";
import { CaretLeft, CaretRight, ChevronDown, ChevronUpIcon, DotsThree } from "@/lib/icons";

/**
 * Previous and next between the records of a list: two icon buttons joined as
 * one group, then where this one stands ("3 of 38"). On a page the buttons are
 * 32px and point left and right; in the details panel they are 28px and point
 * up and down, and Open follows (the panel adds it).
 */
export function RecordStepper({
  noun,
  onPrevious,
  onNext,
  position,
  total,
  direction = "across",
  size = "page",
}: {
  /** What is being stepped through, plural: "customers". */
  noun: string;
  /** Null at the first (or last) record: the button is drawn disabled. */
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  position?: number;
  total?: number;
  direction?: "across" | "down";
  size?: "page" | "panel";
}) {
  const Back = direction === "down" ? ChevronUpIcon : CaretLeft;
  const Forward = direction === "down" ? ChevronDown : CaretRight;
  return (
    <div className="cx-step" data-size={size}>
      <ButtonGroup aria-label={`Move between ${noun}`}>
        <Button iconOnly aria-label="Previous, K" disabled={!onPrevious} onClick={onPrevious ?? undefined}>
          <Back aria-hidden="true" />
        </Button>
        <Button iconOnly aria-label="Next, J" disabled={!onNext} onClick={onNext ?? undefined}>
          <Forward aria-hidden="true" />
        </Button>
      </ButtonGroup>
      {position && total ? (
        <span className="cx-step__pos">
          {position} of {total}
        </span>
      ) : null}
    </div>
  );
}

/** Previous and Next, named, for a list that has more pages than it shows. */
export function Pager({
  onPrevious,
  onNext,
  "aria-label": label = "Pages",
}: {
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  "aria-label"?: string;
}) {
  return (
    <ButtonGroup aria-label={label}>
      <Button icon={<CaretLeft aria-hidden="true" />} disabled={!onPrevious} onClick={onPrevious ?? undefined}>
        Previous
      </Button>
      <Button disabled={!onNext} onClick={onNext ?? undefined}>
        Next
        <CaretRight aria-hidden="true" />
      </Button>
    </ButtonGroup>
  );
}

/**
 * A page's actions: the one in demand beside More, joined as one group, and
 * the rest of the actions inside More. With none in demand, More stands
 * alone. The page's primary is a separate button after it.
 */
export function ActionsWithMore({
  label,
  visible,
  children,
  align = "end",
  menuClassName,
}: {
  /** What the group of actions is called, for assistive technology. */
  label: string;
  /** The second action, drawn as a button. */
  visible?: React.ReactNode;
  /** The menu items. */
  children: React.ReactNode;
  align?: "start" | "end";
  menuClassName?: string;
}) {
  return (
    <ButtonGroup aria-label={label}>
      {visible}
      <Menu>
        <MenuTrigger asChild>
          <Button iconOnly aria-label="More actions" aria-haspopup="menu">
            <DotsThree weight="bold" aria-hidden="true" />
          </Button>
        </MenuTrigger>
        <MenuContent align={align} className={menuClassName}>
          {children}
        </MenuContent>
      </Menu>
    </ButtonGroup>
  );
}
