"use client";

import * as React from "react";
import { Kbd as DsKbd } from "@corelithzw/react";

import { cn } from "../lib/utils";

/** Kbd — the design system's, re-exported under the local name. */
function Kbd({ className, ...props }: React.ComponentProps<typeof DsKbd>) {
  return <DsKbd className={cn(className)} {...props} />;
}

function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

export { Kbd, KbdGroup };
