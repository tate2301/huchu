import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "./calendar";
import { getTeacherProfile } from "./governance-v2";
import {
  teacherClasses,
  teacherPeriods,
  teacherWorkload,
} from "./teacher-day";

/**
 * A teacher's day, loaded once and shared by the API route and the layout.
 *
 * The portal layout is a server component, so it reads this directly and hands
 * the result to the client provider as its starting point. That is why this is
 * a function and not only a route: a portal whose rail arrives one render late
 * is a portal that flashes "no classes" at somebody who has six.
 */
export async function loadTeacherDay(input: {
  companyId: string;
  userId: string;
  onDate?: Date;
  termId?: string;
}) {
  const profile = await getTeacherProfile(input.companyId, input.userId);
  if (!profile) {
    return { teacher: null, term: null, classes: [], periods: [] };
  }

  const [identity, term] = await Promise.all([
    prisma.schoolTeacherProfile.findFirst({
      where: { id: profile.id, companyId: input.companyId },
      select: {
        id: true,
        employeeCode: true,
        user: { select: { id: true, name: true, email: true, image: true } },
        employee: { select: { id: true, jobTitle: true } },
      },
    }),
    input.termId
      ? prisma.schoolTerm.findFirst({
          where: { id: input.termId, companyId: input.companyId },
          select: { id: true, code: true, name: true },
        })
      : getCurrentTerm(input.companyId),
  ]);

  if (!term) {
    return { teacher: identity, term: null, classes: [], periods: [] };
  }

  const onDate = input.onDate ?? new Date();

  const [classes, periods, workload] = await Promise.all([
    teacherClasses({
      companyId: input.companyId,
      teacherProfileId: profile.id,
      termId: term.id,
    }),
    teacherPeriods({
      companyId: input.companyId,
      teacherProfileId: profile.id,
      termId: term.id,
      onDate,
    }),
    teacherWorkload({
      companyId: input.companyId,
      teacherProfileId: profile.id,
      termId: term.id,
    }),
  ]);

  return {
    teacher: identity,
    term: { id: term.id, code: term.code, name: term.name },
    onDate: onDate.toISOString().slice(0, 10),
    classes,
    periods,
    workload,
  };
}
