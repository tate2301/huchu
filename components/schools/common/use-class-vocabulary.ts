"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import {
  NEUTRAL_CLASS_WORDS,
  classVocabulary,
  type ClassVocabulary,
} from "@/lib/schools/class-stage";

/**
 * The word this school uses for its classes — "form", "grade", or both.
 *
 * ## Why a hook and not a constant
 *
 * The right noun depends on the ladder the tenant actually runs, and a combined
 * school runs both. `lib/schools/class-stage.ts` derives it from the class
 * levels; this is the thing that has the levels to hand on a screen.
 *
 * ## Why this costs nothing
 *
 * The query key and options are `ClassFilter`'s, deliberately. Nearly every
 * screen that says the word also renders a class filter or a grade picker, so
 * the fetch is already in flight or already cached and this reads it. On the
 * few screens that say it without one — a dialog, a breadcrumb — it is one
 * cached request per five minutes for the whole session.
 *
 * ## Before the classes land
 *
 * The first render has no data, and `classVocabulary([])` answers "class" for
 * it. That is the intended fallback rather than a loading state: a label that
 * reads "Class" and becomes "Form" is fine, where a label that flashes empty is
 * a layout shift on every screen in the module.
 */
export function useClassVocabulary(): ClassVocabulary {
  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "filter"],
    queryFn: () => fetchSchoolsClasses({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const rows = classesQuery.data?.data;
    if (!rows || rows.length === 0) return NEUTRAL_CLASS_WORDS;
    return classVocabulary(rows.map((row) => row.level));
  }, [classesQuery.data]);
}

/**
 * The same word, when the caller already has the classes.
 *
 * A screen that has just fetched its own class list should not make the shared
 * query resolve a second copy of the same fact.
 */
export function classVocabularyOf(
  classes: ReadonlyArray<{ level: number | null }>,
): ClassVocabulary {
  if (classes.length === 0) return NEUTRAL_CLASS_WORDS;
  return classVocabulary(classes.map((row) => row.level));
}
