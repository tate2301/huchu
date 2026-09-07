"use client";

import * as React from "react";
import { TextArea as DsTextArea } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Textarea — the design system's `TextArea`, under this repo's spelling.
 *
 * One behavioural note for call sites: the DS sets `resize: vertical` and
 * `minHeight: 80` as inline styles, and inline styles beat Tailwind classes.
 * A caller that wants to pin the size has to say `style={{ resize: "none" }}`
 * rather than `className="resize-none"`. The caller's `style` always wins.
 */
export type TextareaProps = React.ComponentProps<"textarea">;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <DsTextArea
      ref={ref}
      data-slot="textarea"
      className={cn(className)}
      {...(props as React.ComponentProps<typeof DsTextArea>)}
    />
  );
});

export { Textarea };
