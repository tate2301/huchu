"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { FilterSelect } from "@/components/schools/common/filter-select";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import { classVocabulary } from "@/lib/schools/class-stage";

/**
 * "Which class?" — as a filter, not as a gate.
 *
 * A school is organised by class and stream, so nearly every campus list
 * is one an administrator wants narrowed: the roll, the register board, mark
 * sheets, an invoice run, a welfare list. Two shapes serve that and they are
 * not interchangeable:
 *
 *  - A *route* — the fees screen's own grade table is one. It is the right
 *    answer when the unnarrowed list is meaningless or ruinous to load: 800
 *    mark sheets, an invoice run with no class chosen.
 *  - This is a *filter*. It is the right answer when the whole-school view is
 *    itself the thing somebody opens the page for, and the class is one way to
 *    cut it. An administrator asking "who has not paid?" wants the school, then
 *    Form 3, then back to the school.
 *
 * The mistake this exists to stop is the third shape: a picker used where a
 * filter was wanted, which turns "show me the school" into an unreachable view.
 * `students-list-content.tsx` carries the note about that — the roll used to be
 * a picker and nothing else, so a school looking for one child by name had no
 * screen to look on.
 *
 * ## The label names itself
 *
 * `label` and `allLabel` default to the school's own word — "Form" to a
 * secondary, "Grade" to a primary, "Form or grade" to a combined school — off
 * the class list this already fetches. Thirteen callers used to pass
 * `label="Class"`, a British import that is wrong for every Zimbabwean
 * school and was the module's most-repeated string. A caller still overrides
 * where the filter means something narrower than the ladder.
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
  label,
  allLabel,
  includeStreams = true,
  className,
}: {
  value: ClassFilterValue;
  onChange: (value: ClassFilterValue) => void;
  /** Defaults to what this school calls a class. */
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

  // From the rungs this school actually runs, so a primary is never asked
  // which form a Grade 4 is.
  const words = useMemo(() => classVocabulary(classes.map((row) => row.level)), [classes]);

  const selected = value.streamId
    ? `${STREAM_PREFIX}${value.classId}:${value.streamId}`
    : value.classId;

  return (
    <FilterSelect
      label={label ?? words.One}
      value={selected}
      allLabel={allLabel ?? "The whole school"}
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
