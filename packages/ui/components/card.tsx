"use client";

import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Card — the design system's markup contract, kept compound.
 *
 * The DS ships a `Card` React component that takes `title`/`subtitle`/`footer`
 * as props, but 57 files here compose `<Card><CardHeader><CardTitle>…`. Rather
 * than rewrite all of them, these render the DS's own class names
 * (`.card`, `.card-head`, `.card-title`, `.card-sub`, `.card-body`, `.card-foot`)
 * so the visuals are the design system's while the composition stays local.
 *
 * New code should import `Card` from `@corelithzw/react` and use its props.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("card", className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("card-head", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("card-title", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("card-sub", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("ml-auto flex items-center gap-2", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("card-body", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("card-foot", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
