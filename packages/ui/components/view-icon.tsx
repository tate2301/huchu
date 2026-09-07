"use client";

import { createElement } from "react";

import { resolveViewIcon } from "../lib/ui/view-icons";

/**
 * The icon for a view, rendered rather than resolved.
 *
 * `const Icon = resolveViewIcon(...)` inside a component body is a component
 * created during render — React's compiler lint flags it, and it is right to:
 * a fresh component identity every render remounts the subtree. Doing the
 * lookup through `createElement` binds no capitalised identifier and produces
 * a stable element, so callers get one line and no rule to remember.
 */
export function ViewIcon({
  id,
  label,
  className = "size-4",
}: {
  id: string;
  label?: string;
  className?: string;
}) {
  return createElement(resolveViewIcon(id, label), {
    className,
    "aria-hidden": "true",
  });
}
