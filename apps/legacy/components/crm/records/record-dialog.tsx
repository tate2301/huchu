"use client";

import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import type { ResponsiveSurfaceSize } from "@corelithzw/ui/lib/ui/responsive-surface";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The modal every CRM form opens in.
 *
 * These were drawers sliding in from the right, which is the wrong shape for
 * them: a drawer says "here is more of the thing you were looking at", and
 * creating a task is not more of anything — it is a short, self-contained
 * question that wants your whole attention and then gets out of the way.
 *
 * Three regions, so a long form behaves. The header and the footer are fixed
 * and the body is the only part that scrolls, which is what stops the buttons
 * being pushed off the bottom of the viewport — the reason these forms looked
 * cut off. `inset={false}` hands the padding to the regions rather than the
 * card, because a card that pads itself cannot have a header rule that reaches
 * its own edges.
 */
export function RecordDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "lg",
  footer,
  onSubmit,
  errors,
  children,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Says what the form is for. Screen-reader only unless you show it. */
  description?: string;
  size?: ResponsiveSurfaceSize;
  /** Buttons, pinned to the bottom. */
  footer?: ReactNode;
  /**
   * Makes the whole card a form, so a submit button in the pinned footer still
   * belongs to the fields in the scrolling body — and Enter in a text field
   * submits, which is what people expect of a short form.
   */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** What went wrong, shown above the fields rather than beside the button. */
  errors?: string[];
  children: ReactNode;
  bodyClassName?: string;
}) {
  const regions = (
    <>
      <DialogHeader className="flex-none gap-1 border-b border-[var(--border-subtle)] px-5 py-4 pr-12">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>

      <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4", bodyClassName)}>
        {errors && errors.length > 0 ? (
          <Alert variant="destructive">
            <AlertTitle>Please fix this before saving</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-5">
                {errors.map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        {children}
      </div>

      {footer ? (
        <div className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
          {footer}
        </div>
      ) : null}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={size}
        inset={false}
        // The card is the flex column; only the body inside it scrolls.
        className="flex max-h-[min(44rem,calc(100dvh-3rem))] flex-col gap-0 overflow-hidden"
      >
        {onSubmit ? (
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            {regions}
          </form>
        ) : (
          regions
        )}
      </DialogContent>
    </Dialog>
  );
}
