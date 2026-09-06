/**
 * Academic calendar invariants.
 *
 * The single-active-year and single-active-term rules are enforced by partial
 * unique indexes (migration 20260804120000_school_calendar_single_active), not
 * by application code, so the tests that assert them are migration witnesses:
 * they fail if someone drops the index and leaves the service alone.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migration applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  NoActiveTermError,
  activateAcademicYear,
  activateTerm,
  findOverlappingAcademicYear,
  findOverlappingTerm,
  getCurrentTerm,
  getSchoolDay,
  getTermForDate,
  isDateRangeValid,
  listSchoolDays,
  rangesOverlap,
  requireCurrentTerm,
} from "./calendar";

let companyId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function makeYear(input: {
  code: string;
  start: string;
  end: string;
  isActive?: boolean;
}) {
  return prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: input.code,
      name: `Year ${input.code}`,
      startDate: date(input.start),
      endDate: date(input.end),
      isActive: input.isActive ?? false,
    },
  });
}

async function makeTerm(input: {
  academicYearId: string;
  code: string;
  start: string;
  end: string;
  isActive?: boolean;
}) {
  return prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: input.academicYearId,
      code: input.code,
      name: `Term ${input.code}`,
      startDate: date(input.start),
      endDate: date(input.end),
      isActive: input.isActive ?? false,
    },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Calendar Test School ${stamp}`, slug: `calendar-test-${stamp}` },
  });
  companyId = company.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.schoolCalendarEvent.deleteMany({ where: { companyId } });
  await prisma.schoolTerm.deleteMany({ where: { companyId } });
  await prisma.schoolAcademicYear.deleteMany({ where: { companyId } });
});

describe("date helpers", () => {
  it("rejects a range that ends before it starts", () => {
    expect(isDateRangeValid(date("2026-05-01"), date("2026-01-01"))).toBe(false);
    expect(isDateRangeValid(date("2026-01-01"), date("2026-05-01"))).toBe(true);
  });

  it("treats a shared boundary day as an overlap", () => {
    expect(
      rangesOverlap(
        date("2026-01-01"),
        date("2026-04-30"),
        date("2026-04-30"),
        date("2026-08-31"),
      ),
    ).toBe(true);
    expect(
      rangesOverlap(
        date("2026-01-01"),
        date("2026-04-29"),
        date("2026-04-30"),
        date("2026-08-31"),
      ),
    ).toBe(false);
  });
});

describe("single active year — MIGRATION WITNESS", () => {
  it("refuses a second active academic year at the database level", async () => {
    await makeYear({ code: "2026", start: "2026-01-01", end: "2026-12-31", isActive: true });

    await expect(
      makeYear({ code: "2027", start: "2027-01-01", end: "2027-12-31", isActive: true }),
    ).rejects.toThrow();
  });

  it("stands the previous year down when another is activated", async () => {
    const first = await makeYear({
      code: "2026",
      start: "2026-01-01",
      end: "2026-12-31",
      isActive: true,
    });
    const second = await makeYear({
      code: "2027",
      start: "2027-01-01",
      end: "2027-12-31",
    });

    await activateAcademicYear({ companyId, academicYearId: second.id });

    const rows = await prisma.schoolAcademicYear.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(second.id);
    expect(rows[0].id).not.toBe(first.id);
  });
});

describe("single active term — MIGRATION WITNESS", () => {
  it("refuses a second active term in the same academic year", async () => {
    const year = await makeYear({ code: "2026", start: "2026-01-01", end: "2026-12-31" });
    await makeTerm({
      academicYearId: year.id,
      code: "T1",
      start: "2026-01-10",
      end: "2026-04-10",
      isActive: true,
    });

    await expect(
      makeTerm({
        academicYearId: year.id,
        code: "T2",
        start: "2026-05-10",
        end: "2026-08-10",
        isActive: true,
      }),
    ).rejects.toThrow();
  });

  it("activating a term activates its year and stands the others down", async () => {
    const year2026 = await makeYear({
      code: "2026",
      start: "2026-01-01",
      end: "2026-12-31",
      isActive: true,
    });
    const term1 = await makeTerm({
      academicYearId: year2026.id,
      code: "T1",
      start: "2026-01-10",
      end: "2026-04-10",
      isActive: true,
    });

    const year2027 = await makeYear({ code: "2027", start: "2027-01-01", end: "2027-12-31" });
    const term2027 = await makeTerm({
      academicYearId: year2027.id,
      code: "T1",
      start: "2027-01-10",
      end: "2027-04-10",
    });

    await activateTerm({ companyId, termId: term2027.id });

    const activeTerms = await prisma.schoolTerm.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
    });
    expect(activeTerms).toHaveLength(1);
    expect(activeTerms[0].id).toBe(term2027.id);

    const activeYears = await prisma.schoolAcademicYear.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
    });
    expect(activeYears).toHaveLength(1);
    expect(activeYears[0].id).toBe(year2027.id);

    const previous = await prisma.schoolTerm.findUnique({ where: { id: term1.id } });
    expect(previous?.isActive).toBe(false);
  });
});

describe("ordered dates — MIGRATION WITNESS", () => {
  it("refuses a term that ends before it starts", async () => {
    const year = await makeYear({ code: "2026", start: "2026-01-01", end: "2026-12-31" });
    await expect(
      makeTerm({
        academicYearId: year.id,
        code: "BAD",
        start: "2026-08-01",
        end: "2026-04-01",
      }),
    ).rejects.toThrow();
  });
});

describe("overlap detection", () => {
  it("finds an overlapping term in the same year and ignores other years", async () => {
    const year = await makeYear({ code: "2026", start: "2026-01-01", end: "2026-12-31" });
    const other = await makeYear({ code: "2027", start: "2027-01-01", end: "2027-12-31" });
    await makeTerm({
      academicYearId: year.id,
      code: "T1",
      start: "2026-01-10",
      end: "2026-04-10",
    });

    const clash = await findOverlappingTerm({
      companyId,
      academicYearId: year.id,
      startDate: date("2026-04-01"),
      endDate: date("2026-07-01"),
    });
    expect(clash?.code).toBe("T1");

    const clear = await findOverlappingTerm({
      companyId,
      academicYearId: other.id,
      startDate: date("2027-01-10"),
      endDate: date("2027-04-10"),
    });
    expect(clear).toBeNull();
  });

  it("excludes the term being edited from its own overlap check", async () => {
    const year = await makeYear({ code: "2026", start: "2026-01-01", end: "2026-12-31" });
    const term = await makeTerm({
      academicYearId: year.id,
      code: "T1",
      start: "2026-01-10",
      end: "2026-04-10",
    });

    const clash = await findOverlappingTerm({
      companyId,
      academicYearId: year.id,
      startDate: date("2026-01-15"),
      endDate: date("2026-04-15"),
      excludeTermId: term.id,
    });
    expect(clash).toBeNull();
  });

  it("finds overlapping academic years", async () => {
    await makeYear({ code: "2026", start: "2026-01-01", end: "2026-12-31" });

    const clash = await findOverlappingAcademicYear({
      companyId,
      startDate: date("2026-09-01"),
      endDate: date("2027-06-30"),
    });
    expect(clash?.code).toBe("2026");
  });
});

describe("current term resolution", () => {
  it("returns null and throws a setup-shaped error when no term is active", async () => {
    expect(await getCurrentTerm(companyId)).toBeNull();
    await expect(requireCurrentTerm(companyId)).rejects.toBeInstanceOf(NoActiveTermError);
  });

  it("returns the active term with its academic year", async () => {
    const year = await makeYear({
      code: "2026",
      start: "2026-01-01",
      end: "2026-12-31",
      isActive: true,
    });
    const term = await makeTerm({
      academicYearId: year.id,
      code: "T2",
      start: "2026-05-10",
      end: "2026-08-10",
      isActive: true,
    });

    const current = await getCurrentTerm(companyId);
    expect(current?.id).toBe(term.id);
    expect(current?.academicYear.code).toBe("2026");
  });

  it("does not leak another company's active term", async () => {
    const stamp = Date.now();
    const otherCompany = await prisma.company.create({
      data: { name: `Other School ${stamp}`, slug: `other-school-${stamp}` },
    });
    const otherYear = await prisma.schoolAcademicYear.create({
      data: {
        companyId: otherCompany.id,
        code: "2026",
        name: "Year 2026",
        startDate: date("2026-01-01"),
        endDate: date("2026-12-31"),
        isActive: true,
      },
    });
    await prisma.schoolTerm.create({
      data: {
        companyId: otherCompany.id,
        academicYearId: otherYear.id,
        code: "T1",
        name: "Term T1",
        startDate: date("2026-01-10"),
        endDate: date("2026-04-10"),
        isActive: true,
      },
    });

    expect(await getCurrentTerm(companyId)).toBeNull();

    await prisma.company.delete({ where: { id: otherCompany.id } });
  });

  it("resolves a date to the term containing it", async () => {
    const year = await makeYear({ code: "2026", start: "2026-01-01", end: "2026-12-31" });
    await makeTerm({
      academicYearId: year.id,
      code: "T1",
      start: "2026-01-10",
      end: "2026-04-10",
    });
    const t2 = await makeTerm({
      academicYearId: year.id,
      code: "T2",
      start: "2026-05-10",
      end: "2026-08-10",
    });

    const found = await getTermForDate(companyId, date("2026-06-01"));
    expect(found?.id).toBe(t2.id);

    const holiday = await getTermForDate(companyId, date("2026-04-20"));
    expect(holiday).toBeNull();
  });
});

describe("school days — S-1.2", () => {
  async function openTerm() {
    const year = await makeYear({
      code: "2026",
      start: "2026-01-01",
      end: "2026-12-31",
      isActive: true,
    });
    // 2026-05-04 is a Monday; 2026-05-09 a Saturday, 2026-05-10 a Sunday.
    return makeTerm({
      academicYearId: year.id,
      code: "T2",
      start: "2026-05-04",
      end: "2026-08-07",
      isActive: true,
    });
  }

  it("a weekday inside term is a school day", async () => {
    await openTerm();
    const verdict = await getSchoolDay(companyId, date("2026-05-05"));
    expect(verdict.isSchoolDay).toBe(true);
  });

  it("a weekend inside term is not, and says so", async () => {
    await openTerm();
    const verdict = await getSchoolDay(companyId, date("2026-05-09"));
    expect(verdict.isSchoolDay).toBe(false);
    expect(verdict.reason).toBe("Weekend");
  });

  it("outside term time is not a school day", async () => {
    await openTerm();
    const verdict = await getSchoolDay(companyId, date("2026-04-20"));
    expect(verdict.isSchoolDay).toBe(false);
    expect(verdict.reason).toBe("Outside term time");
    expect(verdict.termId).toBeNull();
  });

  it("a holiday closes the school and names itself", async () => {
    const term = await openTerm();
    await prisma.schoolCalendarEvent.create({
      data: {
        companyId,
        termId: term.id,
        title: "Workers Day",
        kind: "PUBLIC_HOLIDAY",
        startDate: date("2026-05-05"),
        endDate: date("2026-05-05"),
        isTeachingDay: false,
      },
    });

    const verdict = await getSchoolDay(companyId, date("2026-05-05"));
    expect(verdict.isSchoolDay).toBe(false);
    // The reason a report shows, rather than "no register".
    expect(verdict.reason).toBe("Workers Day");
  });

  it("a teaching event opens the school on a Saturday", async () => {
    const term = await openTerm();
    await prisma.schoolCalendarEvent.create({
      data: {
        companyId,
        termId: term.id,
        title: "Mock exams",
        kind: "EXAM",
        startDate: date("2026-05-09"),
        endDate: date("2026-05-09"),
        isTeachingDay: true,
      },
    });

    const verdict = await getSchoolDay(companyId, date("2026-05-09"));
    expect(verdict.isSchoolDay).toBe(true);
    expect(verdict.reason).toBe("Mock exams");
  });

  it("a closure wins over a teaching event on the same day", async () => {
    // Both on one day is a data conflict a school can create, and closed is
    // the safe reading: nobody is marked absent for a day nobody attended.
    const term = await openTerm();
    await prisma.schoolCalendarEvent.createMany({
      data: [
        {
          companyId,
          termId: term.id,
          title: "Sports day",
          kind: "EVENT",
          startDate: date("2026-05-06"),
          endDate: date("2026-05-06"),
          isTeachingDay: true,
        },
        {
          companyId,
          termId: term.id,
          title: "Burst water main",
          kind: "HOLIDAY",
          startDate: date("2026-05-06"),
          endDate: date("2026-05-06"),
          isTeachingDay: false,
        },
      ],
    });

    const verdict = await getSchoolDay(companyId, date("2026-05-06"));
    expect(verdict.isSchoolDay).toBe(false);
    expect(verdict.reason).toBe("Burst water main");
  });

  it("a multi-day half term closes every day it spans", async () => {
    const term = await openTerm();
    await prisma.schoolCalendarEvent.create({
      data: {
        companyId,
        termId: term.id,
        title: "Half term",
        kind: "HALF_TERM",
        startDate: date("2026-06-01"),
        endDate: date("2026-06-05"),
        isTeachingDay: false,
      },
    });

    for (const day of ["2026-06-01", "2026-06-03", "2026-06-05"]) {
      const verdict = await getSchoolDay(companyId, date(day));
      expect(verdict.isSchoolDay, day).toBe(false);
    }
    // The day after it ends is open again.
    expect((await getSchoolDay(companyId, date("2026-06-08"))).isSchoolDay).toBe(true);
  });

  it("lists the school days in a week, skipping the weekend", async () => {
    await openTerm();
    const days = await listSchoolDays(
      companyId,
      date("2026-05-04"),
      date("2026-05-10"),
    );
    expect(days).toHaveLength(5);
  });

  it("refuses a calendar event that ends before it starts — MIGRATION WITNESS", async () => {
    const term = await openTerm();
    await expect(
      prisma.schoolCalendarEvent.create({
        data: {
          companyId,
          termId: term.id,
          title: "Backwards",
          startDate: date("2026-06-10"),
          endDate: date("2026-06-01"),
        },
      }),
    ).rejects.toThrow();
  });
});
