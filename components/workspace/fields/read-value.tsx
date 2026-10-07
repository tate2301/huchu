import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ReadValue — a computed or fixed value in a form ("Tafara Nyathi, 12:31",
 * "25.4%"): 36px, `--tray`, 600. Not an input and never sent.
 */
export type ReadValueProps = React.ComponentProps<"div"> & {
  mono?: boolean;
  right?: boolean;
  tone?: "ok" | "warn";
};

export function ReadValue({ mono = false, right = false, tone, className, ...props }: ReadValueProps) {
  return (
    <div
      className={cn(
        "cx-read",
        mono && "cx-read--mono",
        right && "cx-read--right",
        tone && `cx-read--${tone}`,
        className,
      )}
      {...props}
    />
  );
}
