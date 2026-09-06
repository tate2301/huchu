import { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import { activateTerm } from "@/lib/schools/calendar";
import { money } from "@/lib/schools/money";
import { grantBundleToCompany } from "@corelithzw/platform/entitlements";
import { ensureAccountingDefaults } from "@corelithzw/module-books/bootstrap";

/**
 * Opening a school.
 *
 * Provisioning a tenant used to create a company, an administrator, a tier, a
 * bundle and a subdomain — and no school. The operator handed over a workspace
 * where the first screen a registrar opened could not be used, because every
 * term-scoped record needs a term and nothing created one.
 *
 * This is the smallest set of records that makes the pack usable on the first
 * morning: the current year and its three terms, the class ladder, a subject
 * catalogue, and one fee structure to invoice against. Everything is a
 * defensible default a school will edit, not a guess it has to unpick — the
 * ladder and the subject list are Zimbabwean, matching who the pack is sold to.
 *
 * Idempotent by code. Re-running adds what is missing and leaves the rest
 * alone, so an operator who runs it twice, or runs it after a school has
 * started editing, does no damage.
 */

/** The paid bundle that carries every `schools.*` feature. */
const SCHOOLS_BUNDLE_CODE = "ADDON_SCHOOLS_SUITE";

export type SchoolLevel = "PRIMARY" | "SECONDARY" | "COMBINED";

export type ProvisionSchoolOptions = {
  companyId: string;
  /** Which class ladder to lay down. Combined covers Grade 1 to Form 6. */
  level?: SchoolLevel;
  /** The calendar year to open. Defaults to the year `now` falls in. */
  year?: number;
  /** Termly tuition on the starter fee structure, in the tenant's currency. */
  tuitionPerTerm?: number;
  createdById?: string | null;
};

export type ProvisionSchoolResult = {
  academicYear: { id: string; code: string; created: boolean };
  terms: Array<{ id: string; code: string; created: boolean; isActive: boolean }>;
  classesCreated: number;
  subjectsCreated: number;
  feeStructureCreated: boolean;
  /** How many `schools.*` features the tenant is now entitled to and has on. */
  featuresEnabled: number;
  /**
   * S-2.3. The accounting foundation the bursar needs before the first receipt:
   * the school chart of accounts and one posting rule per `SCHOOL_FEE_*` source
   * type. Counts are what this run *created*, so a re-run reports zeroes.
   */
  accounting: { accountsCreated: number; postingRulesCreated: number };
  /**
   * Enrolments written for pupils who were already in a class but had no row for
   * the current term. See `ensureCurrentTermEnrolments` for why this belongs to
   * provisioning rather than to admissions.
   */
  enrolmentsCreated: number;
};

/**
 * Zimbabwean school terms. Roughly January–April, May–August, September–December,
 * which is what `TERMS_PER_YEAR` in the pricing model already assumes.
 */
const TERM_TEMPLATE = [
  { code: "T1", name: "Term 1", startMonth: 1, startDay: 8, endMonth: 4, endDay: 10 },
  { code: "T2", name: "Term 2", startMonth: 5, startDay: 6, endMonth: 8, endDay: 8 },
  { code: "T3", name: "Term 3", startMonth: 9, startDay: 9, endMonth: 12, endDay: 5 },
] as const;

const PRIMARY_CLASSES = [
  { code: "ECD-A", name: "ECD A", level: 0 },
  { code: "ECD-B", name: "ECD B", level: 0 },
  ...Array.from({ length: 7 }, (_, index) => ({
    code: `G${index + 1}`,
    name: `Grade ${index + 1}`,
    level: index + 1,
  })),
];

const SECONDARY_CLASSES = Array.from({ length: 6 }, (_, index) => ({
  code: `F${index + 1}`,
  name: `Form ${index + 1}`,
  level: index + 8,
}));

const PRIMARY_SUBJECTS = [
  { code: "ENG", name: "English", isCore: true },
  { code: "SHO", name: "Shona", isCore: true },
  { code: "MAT", name: "Mathematics", isCore: true },
  { code: "SCI", name: "Science and Technology", isCore: true },
  { code: "AGR", name: "Agriculture", isCore: false },
  { code: "HSO", name: "Heritage Social Studies", isCore: true },
  { code: "PED", name: "Physical Education", isCore: false },
  { code: "ICT", name: "ICT", isCore: false },
];

const SECONDARY_SUBJECTS = [
  { code: "ENG", name: "English Language", isCore: true },
  { code: "SHO", name: "Shona", isCore: false },
  { code: "MAT", name: "Mathematics", isCore: true },
  { code: "COM", name: "Combined Science", isCore: true },
  { code: "BIO", name: "Biology", isCore: false },
  { code: "CHE", name: "Chemistry", isCore: false },
  { code: "PHY", name: "Physics", isCore: false },
  { code: "GEO", name: "Geography", isCore: false },
  { code: "HIS", name: "History", isCore: false },
  { code: "ACC", name: "Principles of Accounts", isCore: false },
  { code: "BST", name: "Business Studies", isCore: false },
  { code: "CSC", name: "Computer Science", isCore: false },
  { code: "AGR", name: "Agriculture", isCore: false },
];

function classesFor(level: SchoolLevel) {
  if (level === "PRIMARY") return PRIMARY_CLASSES;
  if (level === "SECONDARY") return SECONDARY_CLASSES;
  return [...PRIMARY_CLASSES, ...SECONDARY_CLASSES];
}

function subjectsFor(level: SchoolLevel) {
  if (level === "PRIMARY") return PRIMARY_SUBJECTS;
  if (level === "SECONDARY") return SECONDARY_SUBJECTS;
  // Combined schools teach both ladders; the codes overlap deliberately, so
  // dedupe rather than creating ENG twice and failing the unique constraint.
  const merged = new Map<string, (typeof PRIMARY_SUBJECTS)[number]>();
  for (const subject of [...PRIMARY_SUBJECTS, ...SECONDARY_SUBJECTS]) {
    merged.set(subject.code, subject);
  }
  return [...merged.values()];
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

/** The term containing `at`, else the first that has not finished, else the last. */
function pickCurrentTerm(
  terms: Array<{ id: string; code: string; startDate: Date; endDate: Date }>,
  at: Date,
) {
  return (
    terms.find((term) => term.startDate <= at && at <= term.endDate) ??
    terms.find((term) => term.endDate >= at) ??
    terms[terms.length - 1]
  );
}

export async function provisionSchool(
  options: ProvisionSchoolOptions,
  at = new Date(),
): Promise<ProvisionSchoolResult> {
  const { companyId } = options;
  const level = options.level ?? "COMBINED";
  const year = options.year ?? at.getUTCFullYear();
  const tuition = options.tuitionPerTerm ?? 250;

  const yearCode = String(year);
  const existingYear = await prisma.schoolAcademicYear.findFirst({
    where: { companyId, code: yearCode },
    select: { id: true, code: true },
  });

  const academicYear =
    existingYear ??
    (await prisma.schoolAcademicYear.create({
      data: {
        companyId,
        code: yearCode,
        name: `${year} Academic Year`,
        startDate: utcDate(year, 1, 1),
        endDate: utcDate(year, 12, 31),
        isActive: false,
      },
      select: { id: true, code: true },
    }));

  const terms: ProvisionSchoolResult["terms"] = [];
  const termRows: Array<{ id: string; code: string; startDate: Date; endDate: Date }> = [];

  for (const template of TERM_TEMPLATE) {
    const existing = await prisma.schoolTerm.findFirst({
      where: { companyId, academicYearId: academicYear.id, code: template.code },
      select: { id: true, code: true, startDate: true, endDate: true },
    });

    const row =
      existing ??
      (await prisma.schoolTerm.create({
        data: {
          companyId,
          academicYearId: academicYear.id,
          code: template.code,
          name: template.name,
          startDate: utcDate(year, template.startMonth, template.startDay),
          endDate: utcDate(year, template.endMonth, template.endDay),
          isActive: false,
        },
        select: { id: true, code: true, startDate: true, endDate: true },
      }));

    termRows.push(row);
    terms.push({
      id: row.id,
      code: row.code,
      created: !existing,
      isActive: false,
    });
  }

  // Only open a term if the school has none. A school that has already chosen
  // its current term must not have that decision overwritten by a re-run.
  const alreadyActive = await prisma.schoolTerm.findFirst({
    where: { companyId, isActive: true },
    select: { id: true },
  });

  if (alreadyActive) {
    // Report the term the school is actually in, not a blank. A re-run that
    // leaves an existing choice alone was previously indistinguishable from a
    // school with no term open — the same "current not set" line for the
    // healthy case and the broken one.
    const opened = terms.find((term) => term.id === alreadyActive.id);
    if (opened) opened.isActive = true;
  } else {
    const current = pickCurrentTerm(termRows, at);
    await activateTerm({ companyId, termId: current.id });
    const opened = terms.find((term) => term.id === current.id);
    if (opened) opened.isActive = true;
  }

  const classTemplates = classesFor(level);
  const existingClassCodes = new Set(
    (
      await prisma.schoolClass.findMany({
        where: { companyId },
        select: { code: true },
      })
    ).map((row) => row.code),
  );
  const newClasses = classTemplates.filter(
    (template) => !existingClassCodes.has(template.code),
  );
  if (newClasses.length > 0) {
    await prisma.schoolClass.createMany({
      data: newClasses.map((template) => ({
        companyId,
        code: template.code,
        name: template.name,
        level: template.level,
        academicYearId: academicYear.id,
      })),
    });
  }

  const subjectTemplates = subjectsFor(level);
  const existingSubjectCodes = new Set(
    (
      await prisma.schoolSubject.findMany({
        where: { companyId },
        select: { code: true },
      })
    ).map((row) => row.code),
  );
  const newSubjects = subjectTemplates.filter(
    (template) => !existingSubjectCodes.has(template.code),
  );
  if (newSubjects.length > 0) {
    await prisma.schoolSubject.createMany({
      data: newSubjects.map((template) => ({
        companyId,
        code: template.code,
        name: template.name,
        isCore: template.isCore,
      })),
    });
  }

  // A fee structure belongs to one class, so the starter attaches to the first
  // rung of the ladder. The school clones it up the years.
  const firstClass = await prisma.schoolClass.findFirst({
    where: { companyId },
    orderBy: [{ level: "asc" }, { code: "asc" }],
    select: { id: true },
  });

  const feeStructureCreated = firstClass
    ? await ensureStarterFeeStructure({
        companyId,
        termId: termRows[0].id,
        classId: firstClass.id,
        tuition,
      })
    : false;

  // Data alone does not open a school. Every `schools.*` feature is billable,
  // and `getCompanyFeatureMap` keeps a billable feature off unless the tenant is
  // entitled to it, so without the addon the registrar's own pages answer
  // `403 FEATURE_DISABLED` over a perfectly good calendar.
  const entitlement = await grantBundleToCompany({
    companyId,
    bundleCode: SCHOOLS_BUNDLE_CODE,
    reason: "School provisioned",
  });

  // S-2.3. A school with no posting rules cannot take money: the first receipt
  // resolves no rule, comes back POSTING_RULE_MISSING — which is not a
  // retryable code — and the bursar is told the payment failed to post with no
  // way to fix it from any screen. Seeding here rather than only in
  // `pnpm provision:school` closes the gap the template path had: it called
  // `provisionSchool` and never seeded accounting at all, and the only thing
  // hiding that was `ensureAccountingDefaults` running inside every posting
  // attempt as a safety net.
  //
  // It must come after the bundle grant. The pack decides whether to seed the
  // school chart from the tenant's enabled features, and until the grant lands
  // there are none.
  const accounting = await ensureAccountingDefaults(companyId);

  // A class on a pupil's record is not an enrolment. See the helper for what
  // that costs; doing it here means every path that opens or re-opens a school
  // closes the gap, including the template path that never calls the CLI.
  // `terms` rather than `termRows`: the reported array is the one that knows
  // which term is open, including the case where a re-run left the school's own
  // choice alone.
  const currentTerm = terms.find((term) => term.isActive) ?? terms[0];
  const enrolmentsCreated = currentTerm
    ? await ensureCurrentTermEnrolments({ companyId, termId: currentTerm.id })
    : 0;

  return {
    academicYear: {
      id: academicYear.id,
      code: academicYear.code,
      created: !existingYear,
    },
    terms,
    classesCreated: newClasses.length,
    subjectsCreated: newSubjects.length,
    feeStructureCreated,
    featuresEnabled: entitlement.featuresEnabled,
    accounting: {
      accountsCreated: accounting.createdAccounts,
      postingRulesCreated: accounting.createdPostingRules,
    },
    enrolmentsCreated,
  };
}

/**
 * Enrol the pupils who are already in a class but have no row for this term.
 *
 * **A class on a pupil's record is not an enrolment.** `SchoolStudent.currentClassId`
 * says where a child sits today; `SchoolEnrollment` says which class they were in
 * for a given term, and it is the second that the rest of the module reads. The
 * year roll-up walks enrolments to decide who is promoted (S-1.5), a result sheet
 * is built per class per term from them (S-1.3), and a fee structure is billed
 * against the enrolled class (S-2.4).
 *
 * So a tenant with 1,200 pupils and 5 enrolment rows — which is what the demo
 * school was — has a register that works, a roll-up that finds nobody to promote
 * and a term's results that cannot be assembled. Nothing errors; the screens are
 * simply empty, which is the worst way for this to be wrong.
 *
 * Written here rather than in admissions because admissions covers the pupils who
 * arrive *after* the school opens (`lib/schools/admissions.ts` creates the
 * enrolment when an application is accepted, and the importer creates one per row
 * — S-3.3). Neither covers the ones already on the books when the module is
 * switched on, and that is exactly who a school has on day one.
 *
 * Idempotent, like the rest of provisioning: the unique key is
 * `(companyId, studentId, termId)`, so a re-run inserts nothing and reports zero.
 * Existing rows are left alone — a school that has moved a child into another
 * class for this term has made a decision, and this is not the place to overrule
 * it.
 */
export async function ensureCurrentTermEnrolments(input: {
  companyId: string;
  termId: string;
}): Promise<number> {
  const { companyId, termId } = input;

  const enrolled = new Set(
    (
      await prisma.schoolEnrollment.findMany({
        where: { companyId, termId },
        select: { studentId: true },
      })
    ).map((row) => row.studentId),
  );

  const candidates = await prisma.schoolStudent.findMany({
    where: {
      companyId,
      // A class is required: without one there is nothing to enrol them into,
      // and inventing one would put a child in a room somebody has to find out
      // about later.
      currentClassId: { not: null },
      // APPLICANT is not yet a pupil and WITHDRAWN is no longer one. GRADUATED
      // and SUSPENDED both stay on the roll — a suspended child is still in the
      // class they will come back to, and a graduate's last term is a fact.
      status: { in: ["ACTIVE", "SUSPENDED"] },
    },
    select: { id: true, currentClassId: true, currentStreamId: true },
  });

  const missing = candidates.filter((student) => !enrolled.has(student.id));
  if (missing.length === 0) return 0;

  const created = await prisma.schoolEnrollment.createMany({
    data: missing.map((student) => ({
      companyId,
      studentId: student.id,
      termId,
      classId: student.currentClassId as string,
      streamId: student.currentStreamId,
      status: "ACTIVE" as const,
    })),
    // Belt and braces against two operators running this at once. The unique key
    // makes the second insert a no-op rather than a crashed provision run.
    skipDuplicates: true,
  });

  return created.count;
}

/**
 * One fee structure so the bursar has something to invoice against on day one.
 *
 * Deliberately thin — tuition and a development levy — because a school's real
 * fee sheet is theirs to write and a long invented one is more to delete than
 * to fill in.
 */
async function ensureStarterFeeStructure(input: {
  companyId: string;
  termId: string;
  classId: string;
  tuition: number;
}) {
  const existing = await prisma.schoolFeeStructure.findFirst({
    where: { companyId: input.companyId },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.schoolFeeStructure.create({
    data: {
      companyId: input.companyId,
      termId: input.termId,
      classId: input.classId,
      name: "Standard Tuition",
      status: "DRAFT",
      lines: {
        create: [
          {
            companyId: input.companyId,
            feeCode: "TUITION",
            description: "Tuition",
            // Post S-2.1 Float→Decimal: `amount` is Decimal(14,2). A plain
            // number is still accepted on write; rounded here so the seeded
            // figures are the ones a bursar sees rather than the ones the
            // column chose for them.
            amount: money(input.tuition),
          },
          {
            companyId: input.companyId,
            feeCode: "DEVLEVY",
            description: "Development levy",
            amount: money(new Prisma.Decimal(input.tuition).times("0.1")),
          },
        ],
      },
    } as Prisma.SchoolFeeStructureUncheckedCreateInput,
  });

  return true;
}
