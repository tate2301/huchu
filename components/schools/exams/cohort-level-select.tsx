"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import { rungName } from "@/lib/schools/class-stage";

/**
 * Which cohort sits a series — picked off the school's own ladder.
 *
 * ## The bug this replaces
 *
 * Both series dialogs asked for the cohort as a bare number between 1 and 13,
 * under the hint *"Form 4 is 4; Upper Six is 6."* That hint was wrong. The
 * number is written to `SchoolExamSeries.cohortLevel` and `registerCohort`
 * matches it straight against `SchoolClass.level`, where the school-wide ladder
 * puts **Form 4 at 11** — Grade 4 is the class at level 4.
 *
 * So a secondary school following the hint registered nobody and was told there
 * was nobody on the roll. A combined school following the hint registered its
 * **Grade 4 pupils as O-Level candidates**: nine-year-olds given candidate
 * numbers against a ZIMSEC series, on the list the school hands the board.
 *
 * A number that has to be translated from what the school says into an internal
 * ordering is a question nobody can answer correctly, so it is not asked. The
 * school picks the class it means and the rung comes off that class.
 *
 * Classes are grouped by rung because a school with Form 4 Blue and Form 4 Gold
 * has two classes at one rung and the cohort is the rung, not the room.
 */
export function CohortLevelSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  /** The stored `cohortLevel` as a string, or "" for none yet. */
  value: string;
  onChange: (next: string) => void;
}) {
  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "filter"],
    queryFn: () => fetchSchoolsClasses({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const rungs = useMemo(() => {
    const byLevel = new Map<number, Set<string>>();
    for (const row of classesQuery.data?.data ?? []) {
      if (row.level == null) continue;
      const names = byLevel.get(row.level) ?? new Set<string>();
      names.add(row.name);
      byLevel.set(row.level, names);
    }
    return [...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, names]) => ({
        level,
        // The school's own names lead, because a school that renamed Form 6 to
        // Upper Sixth should see Upper Sixth. `rungName` covers the gap where a
        // rung somehow has no class on it.
        label: [...names].sort().join(" / ") || rungName(level) || `Rung ${level}`,
      }));
  }, [classesQuery.data]);

  return (
    <Select value={value} onValueChange={(next) => onChange(next === "none" ? "" : next)}>
      <SelectTrigger id={id}>
        <SelectValue
          placeholder={classesQuery.isPending ? "Reading the ladder…" : "Choose the cohort"}
        />
      </SelectTrigger>
      <SelectContent>
        {/* A series can be opened before the school has decided who sits it;
            registering then asks for the class instead. */}
        <SelectItem value="none">Decide when registering</SelectItem>
        {rungs.map((rung) => (
          <SelectItem key={rung.level} value={String(rung.level)}>
            {rung.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
