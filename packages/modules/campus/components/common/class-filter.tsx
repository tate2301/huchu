"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { FilterSelect } from "./filter-select";
import { fetchSchoolsClasses } from "../../admin-v2";

/**
 * "Which class?" — as a filter, not as a gate.
 *
 * A school is organised by year group and stream, so nearly every campus list
 * is one an administrator wants narrowed: the roll, the register board, mark
 * sheets, an invoice run, a welfare list. Two shapes serve that and they are
 * not interchangeable:
 *
 *  - `GradePicker` is a *route*. It is the right answer when the unnarrowed
 *    list is meaningless or ruinous to load — 800 mark sheets, an invoice run
 *    with no year group.
 *  - This is a *filter*. It is the right answer when the whole-school view is
 *    itself the thing somebody opens the page for, and the class is one way to
 *    cut it. An administrator asking "who has not paid?" wants the school, then
 *    Form 3, then back to the school.
 *
 * The mistake this exists to stop is the third shape: a picker used where a
 * filter was wanted, which turns "show me the school" into an unreachable view.
 * `students-list-content.tsx` carries the note about that — the roll used to be
 * a `GradePicker` and nothing else, so a school looking for one child by name
 * had no screen to look on.
 *
 * Streams are offered inline under their class rather than as a second
 * dropdown. A stream only means anything inside its class, and two chained
 * selects to reach "Form 2 Green" is one more decision than the question has.
 */

export type ClassFilterValue = {
  /** Class id, or "" for the whole school. */
  classId: string;
  /** Stream id, or "" for every stream in the chosen class. */
  streamId: string;
};

/** The value that means "no filter". Exported so callers share one empty. */
export const ALL_CLASSES: ClassFilterValue = { classId: "", streamId: "" };

const STREAM_PREFIX = "stream:";

export function ClassFilter({
  value,
  onChange,
  label = "Class",
  allLabel = "The whole school",
  includeStreams = true,
  className,
}: {
  value: ClassFilterValue;
  onChange: (value: ClassFilterValue) => void;
  label?: string;
  /** What the unfiltered choice is called. Name the population, not "All". */
  allLabel?: string;
  /** Offer each class's streams as indented options beneath it. */
  includeStreams?: boolean;
  className?: string;
}) {
  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "filter"],
    queryFn: () => fetchSchoolsClasses({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const classes = useMemo(
    () =>
      [...(classesQuery.data?.data ?? [])].sort(
        (a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name),
      ),
    [classesQuery.data],
  );

  const options = useMemo(
    () =>
      classes.flatMap((schoolClass) => [
        { value: schoolClass.id, label: schoolClass.name },
        ...(includeStreams
          ? (schoolClass.streams ?? []).map((stream) => ({
              value: `${STREAM_PREFIX}${schoolClass.id}:${stream.id}`,
              // The class is repeated because the closed select shows only the
              // chosen option, and "Green" alone does not say whose.
              label: `${schoolClass.name} ${stream.name}`,
            }))
          : []),
      ]),
    [classes, includeStreams],
  );

  const selected = value.streamId
    ? `${STREAM_PREFIX}${value.classId}:${value.streamId}`
    : value.classId;

  return (
    <FilterSelect
      label={label}
      value={selected}
      allLabel={allLabel}
      options={options}
      className={className}
      onChange={(next) => {
        if (!next) {
          onChange(ALL_CLASSES);
          return;
        }
        if (next.startsWith(STREAM_PREFIX)) {
          const [classId, streamId] = next.slice(STREAM_PREFIX.length).split(":");
          onChange({ classId, streamId });
          return;
        }
        onChange({ classId: next, streamId: "" });
      }}
    />
  );
}

/** The class filter as query params, for handing to an API. */
export function classFilterParams(value: ClassFilterValue) {
  return {
    ...(value.classId ? { classId: value.classId } : {}),
    ...(value.streamId ? { streamId: value.streamId } : {}),
  };
}
