import * as React from "react";

import { cn } from "@/lib/utils";

import "./teams.css";

/**
 * The root every teams part sits under: `teams.css` is scoped to `.tm`. A part that renders on its own
 * wraps itself in one; `contents` keeps the wrapper out of the layout.
 */
export function Teams({ className, children, ...rest }: React.ComponentProps<"div">) {
  return (
    <div className={cn("tm", className)} style={{ display: "contents" }} {...rest}>
      {children}
    </div>
  );
}
