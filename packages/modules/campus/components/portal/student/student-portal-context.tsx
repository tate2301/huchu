"use client";

import { createContext, useContext } from "react";

export type StudentPeriod = {
  periodId: string;
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  startsAt: string;
  endsAt: string;
  lesson: {
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    roomName: string | null;
    teacherName: string | null;
  } | null;
};

export type StudentDay = {
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    isBoarding: boolean;
    currentClassId: string | null;
    currentStreamId: string | null;
    currentClass: { id: string; code: string; name: string } | null;
    currentStream: { id: string; name: string } | null;
    user: { name: string | null; email: string; image: string | null } | null;
  } | null;
  term: { id: string; code: string; name: string } | null;
  onDate?: string;
  periods: StudentPeriod[];
};

const StudentPortalContext = createContext<StudentDay | null>(null);

/**
 * Who this portal belongs to, resolved on the server before anything paints.
 *
 * No query and no loading state: the layout has already read the pupil's own
 * record — never an id from the URL — and hands it down. A shell that fetched
 * its own identity would flash a stranger's empty state at whoever is holding
 * the phone.
 */
export function StudentPortalProvider({
  day,
  children,
}: {
  day: StudentDay;
  children: React.ReactNode;
}) {
  return (
    <StudentPortalContext.Provider value={day}>{children}</StudentPortalContext.Provider>
  );
}

export function useStudentPortal() {
  const value = useContext(StudentPortalContext);
  if (!value) {
    throw new Error("useStudentPortal must be used inside the student portal layout");
  }
  return value;
}
