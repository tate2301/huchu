import * as React from "react";

/**
 * The root every kit part sits under: `components/core/kit.css` is scoped to
 * `.ck`, so nothing outside one is touched by it. A page built from the kit
 * puts one around itself; a portal (a drawer, a menu) puts one around what it
 * renders. `contents` keeps the wrapper out of the layout.
 */
export function Kit({
  children,
  className,
  contents = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { contents?: boolean }) {
  const cls = ["ck", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={contents ? { display: "contents" } : undefined} {...rest}>
      {children}
    </div>
  );
}
