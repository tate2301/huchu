import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * CountPill — a count on a grey badge (`--tray`, mono 12; 18px and mono 11 in
 * a tab). OnBadge — how many filters are on: an 18px solid-ink circle.
 */
export function CountPill({
  inTab = false,
  className,
  ...props
}: React.ComponentProps<"span"> & { inTab?: boolean }) {
  return <span className={cn("cx-count", inTab && "cx-count--tab", className)} {...props} />;
}

export function OnBadge({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("cx-badge-on", className)} {...props} />;
}
