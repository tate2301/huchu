import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * TextInput — 36px, 1px `--line-strong`, radius 8, 14px. `mono` for codes and
 * numbers typed as text; `right` aligns a mono figure to the right.
 */
export type TextInputProps = React.ComponentProps<"input"> & {
  mono?: boolean;
  right?: boolean;
};

export function TextInput({ mono = false, right = false, className, type, ...props }: TextInputProps) {
  return (
    <input
      type={type ?? "text"}
      className={cn("cx-input", mono && "cx-input--mono", mono && right && "cx-input--right", className)}
      {...props}
    />
  );
}
