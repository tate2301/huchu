"use client";

import * as React from "react";
import {
  Tooltip as DsTooltip,
  TooltipProvider as DsTooltipProvider,
  TooltipTrigger as DsTooltipTrigger,
  type TooltipAlign,
  type TooltipSide,
} from "@corelithzw/react";

/**
 * Tooltip — the design system's, behind this repo's compound Radix shape.
 *
 * The local API is `<Tooltip><TooltipTrigger asChild>…</TooltipTrigger>
 * <TooltipContent side="right">…</TooltipContent></Tooltip>`, but the DS takes
 * the body as a `content` **prop** and the trigger as its single element child.
 * So, exactly as `alert.tsx` does with `AlertTitle`, the `<TooltipContent>`
 * child is hoisted into `content` at render time — along with its `side`,
 * `align` and `sideOffset` — and whatever is left becomes the trigger.
 *
 * `TooltipContent` is therefore a marker component: rendering it on its own
 * just yields its children. Its `className`/`style` are **not** forwarded — the
 * DS owns the `.tooltip` surface and exposes no class hook for it. Nothing in
 * this repo styled it, and the local recipe it replaces (border, popover
 * background, `--shadow-popover`) is what `.tooltip` already draws.
 *
 * The DS `Tooltip` throws when `children` is not a single valid element, so the
 * hoist guards that case and falls back to rendering the trigger bare — a
 * missing hint is survivable, a thrown render is not.
 *
 * `TooltipProvider` now only carries `delayDuration`; Radix's
 * `skipDelayDuration` / `disableHoverableContent` have no DS equivalent and
 * were unused here.
 *
 * New code should import `Tooltip` from `@corelithzw/react` and pass `content`.
 */
const TooltipProvider = DsTooltipProvider;

const TooltipTrigger = DsTooltipTrigger;

export type TooltipContentProps = React.HTMLAttributes<HTMLDivElement> & {
  side?: TooltipSide;
  align?: TooltipAlign;
  sideOffset?: number;
};

const TooltipContent = ({ children }: TooltipContentProps) => <>{children}</>;
TooltipContent.displayName = "TooltipContent";

export type TooltipProps = Omit<
  React.ComponentProps<typeof DsTooltip>,
  "content" | "children"
> & {
  content?: React.ReactNode;
  children?: React.ReactNode;
};

function isTooltipContent(
  node: React.ReactNode,
): node is React.ReactElement<TooltipContentProps> {
  return React.isValidElement(node) && node.type === TooltipContent;
}

function Tooltip({ content, side, align, sideOffset, children, ...props }: TooltipProps) {
  // Pull the <TooltipContent> child up into the DS `content` prop; whatever
  // remains is the trigger. Anything already using `content=` passes through.
  const nodes = React.Children.toArray(children);
  const contentChild = nodes.find(isTooltipContent);
  const rest = nodes.filter((node) => node !== contentChild);

  const trigger = rest.length === 1 ? rest[0] : undefined;
  const body = content ?? contentChild?.props.children;

  if (!React.isValidElement(trigger) || body == null) {
    // The DS throws on a non-element child, so degrade to the bare trigger.
    return <>{rest}</>;
  }

  return (
    <DsTooltip
      content={body}
      side={side ?? contentChild?.props.side}
      align={align ?? contentChild?.props.align}
      sideOffset={sideOffset ?? contentChild?.props.sideOffset}
      {...props}
    >
      {trigger}
    </DsTooltip>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
