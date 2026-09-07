import { prisma } from "@corelithzw/db/client";

/**
 * A class register, built from the roll rather than from what was recorded.
 *
 * Every pupil on the class list is a row whether or not anybody has marked
 * them, so an unmarked child is visible as unmarked instead of missing. The
 * same reasoning as the bed board and the homework board: an absence of a
 * record is the thing worth seeing.
 */

export type RegisterMark = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export type RegisterRow = {
  studentId: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  isBoarding: boolean;
  /** Null when nobody has marked this pupil for this date. */
  status: RegisterMark | null;
  remarks: string | null;
};

export class RegisterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterError";
  }
}

/** Y-M-D midnight in UTC, matching how attendance dates are stored. */
export function attendanceDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function registerCounts(rows: RegisterRow[]) {
  return {
    present: rows.filter((row) => row.status === "PRESENT").length,
    absent: rows.filter((row) => row.status === "ABSENT").length,
    late: rows.filter((row) => row.status === "LATE").length,
    excused: rows.filter((row) => row.status === "EXCUSED").length,
    unmarked: rows.filter((row) => row.status === null).length,
  };
}

/**
 * The register for one lesson on one day.
 *
 * Keyed by the class-subject rather than by the class, because that is what a
 * teacher holds: the row in the timetable that says this teacher teaches this
 * subject to this class. It also carries the stream, so a subject taught to
 * one stream registers that stream and not the whole form.
 */
export async function classRegister(input: {
  companyId: string;
  classSubjectId: string;
  onDate: Date;
}) {
  const classSubject = await prisma.schoolClassSubject.findFirst({
    where: { id: input.classSubjectId, companyId: input.companyId },
    select: {
      id: true,
      termId: true,
      classId: true,
      streamId: true,
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
      term: { select: { id: true, name: true } },
    },
  });
  if (!classSubject) throw new RegisterError("That class is not one of yours");

  const attendanceDate = attendanceDay(input.onDate);

  const [students, session] = await Promise.all([
    prisma.schoolStudent.findMany({
      where: {
        companyId: input.companyId,
        status: "ACTIVE",
        currentClassId: classSubject.classId,
        ...(classSubject.streamId ? { currentStreamId: classSubject.streamId } : {}),
      },
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
        isBoarding: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.schoolAttendanceSession.findFirst({
      where: {
        companyId: input.companyId,
        termId: classSubject.termId,
        classId: classSubject.classId,
        streamId: classSubject.streamId,
        attendanceDate,
      },
      select: {
        id: true,
        status: true,
        notes: true,
        lines: { select: { studentId: true, status: true, remarks: true } },
      },
    }),
  ]);

  const marks = new Map(session?.lines.map((line) => [line.studentId, line]) ?? []);

  const rows: RegisterRow[] = students.map((student) => {
    const mark = marks.get(student.id);
    return {
      studentId: student.id,
      studentNo: student.studentNo,
      firstName: student.firstName,
      lastName: student.lastName,
      isBoarding: student.isBoarding,
      status: (mark?.status as RegisterMark | undefined) ?? null,
      remarks: mark?.remarks ?? null,
    };
  });

  return {
    classSubject: {
      id: classSubject.id,
      termId: classSubject.termId,
      classId: classSubject.classId,
      className: classSubject.class.name,
      classCode: classSubject.class.code,
      streamId: classSubject.streamId,
      streamName: classSubject.stream?.name ?? null,
      subjectName: classSubject.subject.name,
      subjectCode: classSubject.subject.code,
      termName: classSubject.term.name,
    },
    onDate: attendanceDate.toISOString().slice(0, 10),
    // A locked register is read-only: the office has closed the day.
    session: session
      ? { id: session.id, status: session.status, notes: session.notes }
      : null,
    rows,
    counts: registerCounts(rows),
  };
}
