"use client";

import * as React from "react";
import { Progress as DsProgress } from "@corelithzw/react";

import { cn } from "@/lib/utils";

/** Progress — the design system's, under the local name. */
const Progress = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof DsProgress>
>(function Progress({ className, ...props }, ref) {
  return <DsProgress ref={ref} className={cn(className)} {...props} />;
});

export { Progress };
