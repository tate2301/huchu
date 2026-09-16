"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

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

/** A piece of homework that is still to hand in. */
export type StudentDueSoon = {
  id: string;
  title: string;
  subjectName: string;
  /** Whole days left, negative once the deadline has passed. Null: no date. */
  dueInDays: number | null;
  isOverdue: boolean;
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
  /** The tenant, and how a pupil reaches its office. */
  school: { name: string; email: string | null; phone: string | null } | null;
  term: { id: string; code: string; name: string } | null;
  onDate?: string;
  periods: StudentPeriod[];
  /** Messages the pupil has not opened. The bell badge is this number. */
  unread: number;
  homework: { due: number; overdue: number; soon: StudentDueSoon[] };
  latestMark: { subject: string; score: number; delta: number | null } | null;
  library: { out: number; overdue: number; fines: number };
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
    <StudentPortalContext.Provider value={day}>
      {children}
    </StudentPortalContext.Provider>
  );
}

export function useStudentPortal() {
  const value = useContext(StudentPortalContext);
  if (!value) {
    throw new Error(
      "useStudentPortal must be used inside the student portal layout",
    );
  }
  return value;
}

/** Where the shell keeps room in the app bar for whatever screen is open. */
export const STUDENT_BAR_ACTIONS_ID = "sp-bar-actions";

/**
 * A screen's own action, rendered into the one app bar the portal has.
 *
 * The prototype gives each screen its own bar buttons — mark all read on
 * Messages, download on Marks — and they belong in the bar rather than at the
 * top of the scroller, where they would cost a line of a phone screen on every
 * visit. The shell owns the bar, so the screen hands its button up through a
 * portal instead of the shell reaching down for state it does not have.
 */
export function StudentBarActions({ children }: { children: React.ReactNode }) {
  // Nothing to subscribe to: the only question is whether the DOM the portal
  // needs exists yet, which is false on the server and true ever after.
  const mounted = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
  const host = mounted ? document.getElementById(STUDENT_BAR_ACTIONS_ID) : null;
  return host ? createPortal(children, host) : null;
}

const NEVER_CHANGES = () => () => {};
