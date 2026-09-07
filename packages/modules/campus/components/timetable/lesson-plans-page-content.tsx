"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchClassSubjects } from "../../assessments-v2";
import { LessonPlansContent } from "./lesson-plans-content";

/**
 * The admin side's lesson planner.
 *
 * Every assignment in the school rather than one teacher's, because the office
 * opens this to arrange cover — which is the half of the story a teacher cannot
 * do for herself.
 */
export function LessonPlansPageContent() {
  const subjectsQuery = useQuery({
    queryKey: ["schools", "lesson-plans", "assignments"],
    queryFn: () => fetchClassSubjects({}),
  });

  const subjects = useMemo(
    () => subjectsQuery.data?.data ?? [],
    [subjectsQuery.data],
  );

  return <LessonPlansContent subjects={subjects} />;
}
