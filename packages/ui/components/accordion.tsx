"use client";

import * as React from "react";
import {
  Accordion as DsAccordion,
  AccordionItem as DsAccordionItem,
  AccordionTrigger as DsAccordionTrigger,
  AccordionContent as DsAccordionContent,
} from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Accordion — the design system's, behind the Radix prop names.
 *
 * Radix is gone here. The DS accordion is built on native `<details>` /
 * `<summary>`, and its CSS (`.accordion > details > summary`, `.acc-body`) is
 * written as a child-selector chain that Radix's div/button markup could never
 * satisfy — so restyling Radix in place would have left it unstyled.
 *
 * Nothing imported this file, so the swap is free. The shadcn-shaped `type`
 * prop is still accepted and mapped onto the DS `multiple` boolean, so code
 * pasted from that ecosystem keeps working.
 *
 * The chevron is deliberately not rendered: the DS draws it as a
 * `summary::after` pseudo-element, and keeping the icon would double it up.
 */
export type AccordionProps = Omit<
  React.ComponentProps<typeof DsAccordion>,
  "multiple"
> & {
  /** shadcn spelling. `"multiple"` maps to the DS `multiple` flag. */
  type?: "single" | "multiple";
  /** Accepted for source compatibility; the DS always allows collapsing. */
  collapsible?: boolean;
};

function Accordion({ type, collapsible, className, ...props }: AccordionProps) {
  void collapsible;

  return (
    <DsAccordion
      data-slot="accordion"
      multiple={type === "multiple"}
      className={cn(className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: React.ComponentProps<typeof DsAccordionItem>) {
  return <DsAccordionItem data-slot="accordion-item" className={cn(className)} {...props} />;
}

function AccordionTrigger({
  className,
  ...props
}: React.ComponentProps<typeof DsAccordionTrigger>) {
  return <DsAccordionTrigger data-slot="accordion-trigger" className={cn(className)} {...props} />;
}

function AccordionContent({
  className,
  ...props
}: React.ComponentProps<typeof DsAccordionContent>) {
  return <DsAccordionContent data-slot="accordion-content" className={cn(className)} {...props} />;
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
