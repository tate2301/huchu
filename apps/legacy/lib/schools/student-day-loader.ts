import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { formatMinute } from "@/lib/schools/timetable-format";
import { isoDayOfWeek } from "@/lib/schools/teacher-day";

/**
 * A pupil's day, loaded on the server for the student portal's shell.
 *
 * The same shape of answer as `teacher-day-loader.ts` and for the same
 * reasons: the portal's chrome cannot paint until it knows whose portal it is,
 * and a shell that fetches its own identity flashes a stranger's empty state
 * at whoever is holding the phone.
 *
 * Everything is resolved from the signed-in user's own student record. A pupil
 * naming somebody else gets nothing — that rule lives in `portal-identity.ts`
 * and this module never takes an id from the caller at all.
 */
export async function loadStudentDay(input: {
  companyId: string;
  userId: string;
  onDate?: Date;
}) {
  const student = await prisma.schoolStudent.findFirst({
    where: { companyId: input.companyId, userId: input.userId },
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      isBoarding: true,
      currentClassId: true,
      currentStreamId: true,
      currentClass: { select: { id: true, code: true, name: true } },
      currentStream: { select: { id: true, name: true } },
      user: { select: { name: true, email: true, image: true } },
    },
  });

  if (!student) return { student: null, term: null, periods: [] };

  const term = await getCurrentTerm(input.companyId);
  if (!term || !student.currentClassId) {
    return { student, term: term ?? null, periods: [] };
  }

  const onDate = input.onDate ?? new Date();
  const dayOfWeek = isoDayOfWeek(onDate);

  const [periods, slots] = await Promise.all([
    prisma.schoolPeriod.findMany({
      where: {
        companyId: input.companyId,
        OR: [{ termId: term.id }, { termId: null }],
        isTeaching: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        startMinute: true,
        endMinute: true,
      },
      orderBy: { sequence: "asc" },
    }),
    prisma.schoolTimetableSlot.findMany({
      where: {
        companyId: input.companyId,
        termId: term.id,
        classId: student.currentClassId,
        dayOfWeek,
        ...(student.currentStreamId
          ? { OR: [{ streamId: student.currentStreamId }, { streamId: null }] }
          : {}),
      },
      select: {
        periodId: true,
        room: { select: { name: true } },
        classSubject: {
          select: {
            subject: { select: { id: true, code: true, name: true } },
            teacherProfile: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const byPeriod = new Map(slots.map((slot) => [slot.periodId, slot]));

  return {
    student,
    term: { id: term.id, code: term.code, name: term.name },
    onDate: onDate.toISOString().slice(0, 10),
    // Free periods are rows here too: a pupil's day is the school's day, and
    // one that only listed lessons would read as a shorter day than it is.
    periods: periods.map((period) => {
      const slot = byPeriod.get(period.id) ?? null;
      return {
        periodId: period.id,
        code: period.code,
        name: period.name,
        startMinute: period.startMinute,
        endMinute: period.endMinute,
        startsAt: formatMinute(period.startMinute),
        endsAt: formatMinute(period.endMinute),
        lesson: slot
          ? {
              subjectId: slot.classSubject.subject.id,
              subjectName: slot.classSubject.subject.name,
              subjectCode: slot.classSubject.subject.code,
              roomName: slot.room?.name ?? null,
              teacherName: slot.classSubject.teacherProfile?.user?.name ?? null,
            }
          : null,
      };
    }),
  };
}
