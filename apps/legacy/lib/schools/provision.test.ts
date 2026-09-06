/**
 * Opening a school.
 *
 * The promise is that a provisioned tenant can transact on the first morning,
 * so these check the two things that decide it: a term is current, and there is
 * something to enrol into and invoice against. Idempotency matters as much —
 * an operator who re-runs this against a school that has started work must not
 * undo any of it.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "./calendar";
import { provisionSchool } from "./provision";
import { SCHOOLS_REQUIRED_SOURCE_TYPES } from "@corelithzw/module-books/source-types";

let companyId: string;

const MID_TERM_TWO = new Date("2026-06-15T00:00:00.000Z");

beforeEach(async () => {
  const stamp = `${Date.now()}-${Math.floor(process.hrtime()[1] / 1000)}`;
  const company = await prisma.company.create({
    data: { name: `Provision School ${stamp}`, slug: `provision-${stamp}` },
  });
  companyId = company.id;
});

afterEach(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a freshly opened school", () => {
  it("has a current term, which is the one containing today", async () => {
    const result = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    const current = await getCurrentTerm(companyId);
    expect(current).not.toBeNull();
    expect(current?.code).toBe("T2");
    expect(current?.academicYear.code).toBe("2026");

    const opened = result.terms.filter((term) => term.isActive);
    expect(opened).toHaveLength(1);
  });

  it("opens the next term that has not finished when today falls in a holiday", async () => {
    // Late April: Term 1 has ended, Term 2 has not begun.
    await provisionSchool({ companyId, year: 2026 }, new Date("2026-04-25T00:00:00.000Z"));

    const current = await getCurrentTerm(companyId);
    expect(current?.code).toBe("T2");
  });

  it("lays down three terms inside the academic year", async () => {
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    const year = await prisma.schoolAcademicYear.findFirst({
      where: { companyId },
      select: { startDate: true, endDate: true, terms: true },
    });

    expect(year?.terms).toHaveLength(3);
    for (const term of year!.terms) {
      expect(term.startDate >= year!.startDate).toBe(true);
      expect(term.endDate <= year!.endDate).toBe(true);
      expect(term.startDate < term.endDate).toBe(true);
    }
  });

  it("has classes, subjects and something to invoice against", async () => {
    const result = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    expect(result.classesCreated).toBeGreaterThan(0);
    expect(result.subjectsCreated).toBeGreaterThan(0);
    expect(result.feeStructureCreated).toBe(true);

    const structure = await prisma.schoolFeeStructure.findFirst({
      where: { companyId },
      include: { lines: true },
    });
    expect(structure?.lines.length).toBeGreaterThan(0);
    expect(structure?.lines.some((line) => line.feeCode === "TUITION")).toBe(true);

    // Post S-2.1 Float→Decimal: the seeded prices are `Decimal(14,2)`. Asserted
    // by value so a scale regression is caught here rather than on a real
    // school's first invoice run.
    const tuition = structure?.lines.find((line) => line.feeCode === "TUITION");
    const levy = structure?.lines.find((line) => line.feeCode === "DEVLEVY");
    expect(tuition).toBeDefined();
    expect(levy).toBeDefined();
    expect(Number(tuition!.amount)).toBeGreaterThan(0);
    // The levy is a tenth of the tuition, exactly.
    expect(levy!.amount.toFixed(2)).toBe(
      tuition!.amount.dividedBy(10).toFixed(2),
    );
  });
});

describe("a freshly opened school can also take money", () => {
  it("has the chart of accounts and a posting rule for every fee document", async () => {
    // S-2.3. Without these the first receipt resolves no posting rule, returns
    // POSTING_RULE_MISSING — which is not a retryable code — and the bursar is
    // told the payment failed to post with no screen that can fix it. The
    // template provisioning path never seeded accounting at all; only
    // `pnpm provision:school` did.
    const result = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    expect(result.accounting.accountsCreated).toBeGreaterThan(0);
    expect(result.accounting.postingRulesCreated).toBeGreaterThan(0);

    const schoolAccounts = await prisma.chartOfAccount.findMany({
      where: { companyId, code: { in: ["1110", "2400", "4300", "5610"] } },
      select: { code: true },
    });
    expect(schoolAccounts).toHaveLength(4);

    const rules = await prisma.postingRule.findMany({
      where: { companyId, sourceType: { in: SCHOOLS_REQUIRED_SOURCE_TYPES }, isActive: true },
      select: { sourceType: true },
    });
    expect(new Set(rules.map((rule) => rule.sourceType)).size).toBe(
      SCHOOLS_REQUIRED_SOURCE_TYPES.length,
    );
  });

  it("creates no second set of accounts when it is run again", async () => {
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    const again = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    expect(again.accounting.accountsCreated).toBe(0);
    expect(again.accounting.postingRulesCreated).toBe(0);
  });
});

describe("the pupils already on the books", () => {
  /**
   * The gap this closes: a school switching the module on has pupils in classes
   * and no enrolments, because admissions only writes one for a child who arrives
   * *after* opening. Everything term-shaped — the roll-up, a result sheet, a fee
   * bill — reads enrolments, so those screens come up empty with nothing in the
   * logs to say why.
   */
  async function pupilInAClass(status: "ACTIVE" | "APPLICANT" | "WITHDRAWN" = "ACTIVE") {
    const klass = await prisma.schoolClass.findFirstOrThrow({
      where: { companyId },
      select: { id: true },
    });
    const stamp = `${Math.floor(process.hrtime()[1] / 1000)}-${status}`;
    return prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S-${stamp}`,
        firstName: "Tendai",
        lastName: `Moyo ${stamp}`,
        status,
        currentClassId: klass.id,
      },
      select: { id: true },
    });
  }

  it("enrols a pupil who has a class but no row for this term", async () => {
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    const student = await pupilInAClass();

    const again = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    expect(again.enrolmentsCreated).toBe(1);

    const enrolment = await prisma.schoolEnrollment.findFirstOrThrow({
      where: { companyId, studentId: student.id },
      include: { term: { select: { code: true } } },
    });
    // The current term, not the first one: a school opening mid-year bills and
    // reports against the term it is actually in.
    expect(enrolment.term.code).toBe("T2");
    expect(enrolment.status).toBe("ACTIVE");
  });

  it("writes nothing the second time", async () => {
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    await pupilInAClass();
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    const third = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    expect(third.enrolmentsCreated).toBe(0);
    expect(await prisma.schoolEnrollment.count({ where: { companyId } })).toBe(1);
  });

  it("leaves an applicant and a leaver out of it", async () => {
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    await pupilInAClass("APPLICANT");
    await pupilInAClass("WITHDRAWN");

    const again = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    // An applicant is not yet a pupil and a leaver is no longer one. Enrolling
    // either would put a child on a class list somebody then has to explain.
    expect(again.enrolmentsCreated).toBe(0);
  });

  it("does not move a child the school has already placed elsewhere this term", async () => {
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    const student = await pupilInAClass();
    const [term, other] = await Promise.all([
      prisma.schoolTerm.findFirstOrThrow({ where: { companyId, isActive: true } }),
      prisma.schoolClass.findFirstOrThrow({
        where: { companyId },
        orderBy: { code: "desc" },
        select: { id: true },
      }),
    ]);
    await prisma.schoolEnrollment.create({
      data: { companyId, studentId: student.id, termId: term.id, classId: other.id },
    });

    const again = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    expect(again.enrolmentsCreated).toBe(0);

    const enrolment = await prisma.schoolEnrollment.findFirstOrThrow({
      where: { companyId, studentId: student.id },
    });
    // The school's decision stands. Provisioning fills gaps; it does not correct
    // people.
    expect(enrolment.classId).toBe(other.id);
  });
});

describe("the ladder follows the school's level", () => {
  it("gives a primary school grades and no forms", async () => {
    await provisionSchool({ companyId, level: "PRIMARY", year: 2026 }, MID_TERM_TWO);

    const codes = (
      await prisma.schoolClass.findMany({ where: { companyId }, select: { code: true } })
    ).map((row) => row.code);

    expect(codes).toContain("G1");
    expect(codes).toContain("ECD-A");
    expect(codes).not.toContain("F1");
  });

  it("gives a secondary school forms and no grades", async () => {
    await provisionSchool({ companyId, level: "SECONDARY", year: 2026 }, MID_TERM_TWO);

    const codes = (
      await prisma.schoolClass.findMany({ where: { companyId }, select: { code: true } })
    ).map((row) => row.code);

    expect(codes).toContain("F1");
    expect(codes).toContain("F6");
    expect(codes).not.toContain("G1");
  });

  it("gives a combined school both, without duplicating shared subject codes", async () => {
    await provisionSchool({ companyId, level: "COMBINED", year: 2026 }, MID_TERM_TWO);

    const codes = (
      await prisma.schoolClass.findMany({ where: { companyId }, select: { code: true } })
    ).map((row) => row.code);
    expect(codes).toContain("G1");
    expect(codes).toContain("F6");

    // ENG, MAT, SHO and AGR appear in both ladders.
    const subjects = await prisma.schoolSubject.findMany({
      where: { companyId },
      select: { code: true },
    });
    expect(new Set(subjects.map((s) => s.code)).size).toBe(subjects.length);
  });
});

describe("running it again", () => {
  it("creates nothing the second time", async () => {
    const first = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    const second = await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    expect(first.classesCreated).toBeGreaterThan(0);
    expect(second.academicYear.created).toBe(false);
    expect(second.classesCreated).toBe(0);
    expect(second.subjectsCreated).toBe(0);
    expect(second.feeStructureCreated).toBe(false);
    expect(second.terms.every((term) => !term.created)).toBe(true);
  });

  it("does not move a term the school has already chosen", async () => {
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    // The school decides Term 3 is current — perhaps they are setting up late.
    const termThree = await prisma.schoolTerm.findFirst({
      where: { companyId, code: "T3" },
      select: { id: true },
    });
    await prisma.schoolTerm.updateMany({
      where: { companyId },
      data: { isActive: false },
    });
    await prisma.schoolTerm.update({
      where: { id: termThree!.id },
      data: { isActive: true },
    });

    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);

    const current = await getCurrentTerm(companyId);
    expect(current?.code).toBe("T3");
  });

  it("adds a second academic year without disturbing the first", async () => {
    await provisionSchool({ companyId, year: 2026 }, MID_TERM_TWO);
    const next = await provisionSchool({ companyId, year: 2027 }, MID_TERM_TWO);

    expect(next.academicYear.created).toBe(true);

    const years = await prisma.schoolAcademicYear.findMany({
      where: { companyId },
      select: { code: true },
    });
    expect(years.map((y) => y.code).sort()).toEqual(["2026", "2027"]);

    // The 2026 term stays current; opening next year is not the same as
    // starting it.
    const current = await getCurrentTerm(companyId);
    expect(current?.academicYear.code).toBe("2026");
  });
});
