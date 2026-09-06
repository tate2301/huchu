"use client";

import { useState, type ReactNode } from "react";

import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";

export type SubSection = {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
};

/**
 * Two or three views of one idea, inside a single section.
 *
 * Documents and Files were separate sections, and so were History and Field
 * history — four rows in the rail for two questions. They are not the same
 * thing (a quotation has a total and a status; an uploaded contract does not),
 * which is why they were split in the first place, but "what paperwork is on
 * this record" is one question and it should be one place to go and ask it.
 *
 * The segmented control is the right grammar for this and the wrong one for
 * the rail: a fixed track of equal-width columns holds three peers of one kind
 * beautifully and thirteen sections not at all. So it lives here, one level
 * down, where the choices are few — the same control the composer uses to pick
 * between a comment and a logged call.
 */
export function SubSections({
  label,
  sections,
}: {
  /** Accessible name for the control, e.g. "Paperwork". */
  label: string;
  sections: SubSection[];
}) {
  const [value, setValue] = useState(sections[0]?.value ?? "");
  const current = sections.find((section) => section.value === value) ?? sections[0];

  if (sections.length === 0) return null;
  if (sections.length === 1) return <>{sections[0].content}</>;

  return (
    <div className="space-y-4">
      <SegmentedControl
        value={current?.value ?? ""}
        onValueChange={setValue}
        options={sections.map((section) => ({
          value: section.value,
          label: section.label,
          // The DS renders this right-aligned inside the segment. A zero is
          // not a count anywhere else in the product and is not one here.
          count: section.count && section.count > 0 ? section.count : undefined,
        }))}
        size="sm"
        ariaLabel={label}
      />
      <div className="min-w-0">{current?.content}</div>
    </div>
  );
}
