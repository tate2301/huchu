"use client";

import * as React from "react";
import { Alert as DsAlert, type AlertTone } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Alert — the design system's, behind this repo's older shape.
 *
 * The local API was compound (`Alert` > `AlertTitle` + `AlertDescription`); the
 * DS takes `title` as a prop. Rather than rewrite every call site, the title
 * child is hoisted into the prop at render time and the rest becomes the body.
 */
const VARIANT_TO_TONE: Record<string, AlertTone> = {
  default: "info",
  info: "info",
  success: "success",
  warning: "warn",
  destructive: "danger",
};

export type AlertProps = Omit<React.ComponentProps<typeof DsAlert>, "tone" | "title"> & {
  variant?: keyof typeof VARIANT_TO_TONE;
  tone?: AlertTone;
  title?: React.ReactNode;
};

const AlertTitle = ({ children }: React.ComponentProps<"div">) => <>{children}</>;
AlertTitle.displayName = "AlertTitle";

const AlertDescription = ({ children }: React.ComponentProps<"div">) => <>{children}</>;
AlertDescription.displayName = "AlertDescription";

function isElementOfType(node: React.ReactNode, type: React.ElementType): boolean {
  return React.isValidElement(node) && node.type === type;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, variant, tone, title, children, ...props },
  ref,
) {
  // Pull an <AlertTitle> child up into the DS `title` prop; everything else is
  // the body. Anything already using `title=` passes straight through.
  const nodes = React.Children.toArray(children);
  const titleChild = nodes.find((node) => isElementOfType(node, AlertTitle));
  const body = nodes.filter((node) => node !== titleChild);

  return (
    <DsAlert
      ref={ref}
      tone={tone ?? VARIANT_TO_TONE[variant ?? "default"] ?? "info"}
      title={title ?? (titleChild as React.ReactElement<{ children?: React.ReactNode }> | undefined)?.props.children}
      className={cn(className)}
      {...props}
    >
      {body}
    </DsAlert>
  );
});

export { Alert, AlertTitle, AlertDescription };
