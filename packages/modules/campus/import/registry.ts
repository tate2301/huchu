/**
 * What each kind of import row means, and what writing one actually does.
 *
 * Five entity types, in the order a school has to load them: a student cannot
 * name a class that does not exist, a guardian cannot be linked to a child who
 * is not on the roll, and a balance cannot be brought forward for a family the
 * system has never heard of. The order is declared here rather than left to
 * whoever writes the API, because getting it wrong produces a half-loaded
 * school that looks fine until somebody opens a register.
 */
import { Prisma, type PrismaClient, type SchoolImportEntity } from "@corelithzw/db";

import type { ImportField, ImportRowIssue } from "@corelithzw/platform/import-core/plan";
import { money, toBaseAmount } from "../money";

import { closestMatch, normalizeName, normalizePhone, parseDateCell, parseMoneyCell } from "./cells";
import { feeStructureKey, type ImportLookup } from "./lookup";

type Tx = Prisma.TransactionClient | PrismaClient;

/** One thing a committed row created, so rollback can take it back out. */
export type ImportArtifact = { type: string; id: string };

export type HandlerContext = {
  companyId: string;
  lookup: ImportLookup;
  /** The term this import is aimed at. Null when the school has no active term. */
  termId: string | null;
  actorId: string;
  /**
   * What to do about a row that matches a record already on the system.
   *
   * It governs whether the EXISTING record's details get overwritten, and
   * nothing else. A link the row implies — a pupil's enrolment, a parent's
   * connection to their child — is always ensured either way, because "this
   * parent is already on file" is not a reason to leave their second child
   * without a contact.
   */
  onDuplicate: "SKIP" | "UPDATE";
};

export type ApplyResult = {
  artifacts: ImportArtifact[];
  /** ANOMALY means written, but worth a second look. */
  status: "CREATED" | "UPDATED" | "SKIPPED" | "ANOMALY";
  warning?: string;
};

export type SchoolImportHandler = {
  key: SchoolImportEntity;
  label: string;
  /** Lower loads first. */
  order: number;
  dependsOn: SchoolImportEntity[];
  /** How a re-run recognises a row it has already loaded. Shown in the UI. */
  naturalKey: string;
  fields: ImportField[];
  /** Row checks. Everything here is refusable without touching the database. */
  validate: (values: Record<string, string>, context: HandlerContext) => ImportRowIssue[];
  /** A key two rows in the same file would share. */
  rowKey: (values: Record<string, string>) => string | null;
  findMatch: (
    values: Record<string, string>,
    context: HandlerContext,
  ) => { id: string; label: string } | null;
  apply: (
    tx: Tx,
    values: Record<string, string>,
    context: HandlerContext,
    matchId: string | null,
  ) => Promise<ApplyResult>;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function required(
  values: Record<string, string>,
  fields: ImportField[],
  issues: ImportRowIssue[],
): void {
  for (const field of fields) {
    if (field.required && !values[field.key]?.trim()) {
      issues.push({ field: field.key, message: `${field.label} is required` });
    }
  }
}

/**
 * Resolve a named reference, or say what to do about it.
 *
 * The suggestion is the whole point: "no class called 'Frm 1 Blue'" sends a
 * registrar back to the spreadsheet to compare nine hundred rows by eye,
 * whereas naming the near-miss usually ends the investigation.
 */
function resolveNamed<T>(
  raw: string,
  index: Map<string, T>,
  candidates: string[],
  field: string,
  noun: string,
): { value: T } | { issue: ImportRowIssue } {
  const found = index.get(normalizeName(raw));
  if (found) return { value: found };

  const suggestion = closestMatch(raw, candidates);
  return {
    issue: {
      field,
      message: suggestion
        ? `No ${noun} called "${raw}" — did you mean "${suggestion}"?`
        : `No ${noun} called "${raw}"`,
    },
  };
}

function pad(sequence: number, width = 4): string {
  return String(sequence).padStart(width, "0");
}

/**
 * Sequence numbers are read off the lookup and bumped on it, so a run of rows
 * inside one commit does not collide with itself. The lookup is rebuilt per
 * job, and the unique index is the real guard.
 */
function nextStudentNo(lookup: ImportLookup): string {
  lookup.nextStudentSeq += 1;
  return `S${pad(lookup.nextStudentSeq)}`;
}

function nextGuardianNo(lookup: ImportLookup): string {
  lookup.nextGuardianSeq += 1;
  return `G${pad(lookup.nextGuardianSeq)}`;
}

function nextInvoiceNo(lookup: ImportLookup): string {
  lookup.nextInvoiceSeq += 1;
  return `INV-${pad(lookup.nextInvoiceSeq, 6)}`;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

const CLASS_FIELDS: ImportField[] = [
  { key: "code", label: "Class code", required: true, aliases: ["classcode", "code", "shortname"] },
  { key: "name", label: "Class name", required: true, aliases: ["class", "classname", "form", "grade"] },
  { key: "level", label: "Level", aliases: ["year", "yeargroup", "formlevel"] },
  { key: "capacity", label: "Capacity", aliases: ["places", "size", "maxstudents"] },
];

const classHandler: SchoolImportHandler = {
  key: "CLASS",
  label: "Classes",
  order: 1,
  dependsOn: [],
  naturalKey: "Class code",
  fields: CLASS_FIELDS,
  validate(values) {
    const issues: ImportRowIssue[] = [];
    required(values, CLASS_FIELDS, issues);

    for (const key of ["level", "capacity"] as const) {
      const raw = values[key]?.trim();
      if (raw && !/^\d+$/.test(raw)) {
        issues.push({ field: key, message: `"${raw}" isn't a whole number` });
      }
    }
    return issues;
  },
  rowKey: (values) => (values.code ? `code:${normalizeName(values.code)}` : null),
  findMatch(values, context) {
    const found = context.lookup.classesByName.get(normalizeName(values.code ?? ""));
    return found ? { id: found.id, label: found.name } : null;
  },
  async apply(tx, values, context, matchId) {
    const data = {
      name: values.name.trim(),
      level: values.level ? Number(values.level) : null,
      capacity: values.capacity ? Number(values.capacity) : null,
    };

    if (matchId) {
      if (context.onDuplicate === "UPDATE") {
        await tx.schoolClass.update({ where: { id: matchId }, data });
        return { artifacts: [], status: "UPDATED" };
      }
      return { artifacts: [], status: "SKIPPED" };
    }

    const created = await tx.schoolClass.create({
      data: {
        companyId: context.companyId,
        code: values.code.trim(),
        academicYearId: context.lookup.activeYearId,
        termId: context.termId,
        ...data,
      },
    });

    context.lookup.classesByName.set(normalizeName(created.code), {
      id: created.id,
      name: created.name,
      code: created.code,
    });
    context.lookup.classesByName.set(normalizeName(created.name), {
      id: created.id,
      name: created.name,
      code: created.code,
    });
    context.lookup.classNames.push(created.name);

    return { artifacts: [{ type: "SchoolClass", id: created.id }], status: "CREATED" };
  },
};

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

const STUDENT_FIELDS: ImportField[] = [
  {
    key: "studentNo",
    label: "Student number",
    required: true,
    aliases: ["studentno", "studentnumber", "admissionnumber", "regno", "registrationnumber"],
  },
  { key: "firstName", label: "First name", required: true, aliases: ["first", "givenname", "forename"] },
  { key: "lastName", label: "Surname", required: true, aliases: ["last", "surname", "familyname"] },
  { key: "className", label: "Class", required: true, aliases: ["class", "form", "grade", "classname"] },
  { key: "dateOfBirth", label: "Date of birth", aliases: ["dob", "birthdate", "dateofbirth"] },
  { key: "gender", label: "Gender", aliases: ["sex"] },
  { key: "isBoarding", label: "Boarder", aliases: ["boarding", "boarder", "residential"] },
  { key: "admissionDate", label: "Admission date", aliases: ["dateadmitted", "joined", "enrolled"] },
];

function parseBoolean(raw: string): boolean {
  return ["yes", "y", "true", "1", "boarder", "boarding"].includes(raw.trim().toLowerCase());
}

const studentHandler: SchoolImportHandler = {
  key: "STUDENT",
  label: "Students",
  order: 2,
  dependsOn: ["CLASS"],
  naturalKey: "Student number",
  fields: STUDENT_FIELDS,
  validate(values, context) {
    const issues: ImportRowIssue[] = [];
    required(values, STUDENT_FIELDS, issues);

    if (values.className) {
      const resolved = resolveNamed(
        values.className,
        context.lookup.classesByName,
        context.lookup.classNames,
        "className",
        "class",
      );
      if ("issue" in resolved) issues.push(resolved.issue);
    }

    for (const key of ["dateOfBirth", "admissionDate"] as const) {
      const raw = values[key]?.trim();
      if (!raw) continue;
      const parsed = parseDateCell(raw);
      if (!parsed.ok) {
        issues.push({ field: key, message: parsed.message });
      }
    }

    // A school with no term cannot record an enrolment, and a student without
    // one is exactly the hole provisionSchool left behind.
    if (!context.termId) {
      issues.push({
        field: "_row",
        message: "This school has no active term, so a student cannot be enrolled. Open a term first.",
      });
    }

    return issues;
  },
  rowKey: (values) => (values.studentNo ? `no:${normalizeName(values.studentNo)}` : null),
  findMatch(values, context) {
    const found = context.lookup.studentsByNo.get(normalizeName(values.studentNo ?? ""));
    return found ? { id: found.id, label: found.name } : null;
  },
  async apply(tx, values, context, matchId) {
    const klass = context.lookup.classesByName.get(normalizeName(values.className));
    if (!klass) {
      throw new Error(`No class called "${values.className}"`);
    }
    if (!context.termId) {
      throw new Error("This school has no active term, so a student cannot be enrolled");
    }

    const dateOfBirth = values.dateOfBirth ? parseDateCell(values.dateOfBirth) : null;
    const admissionDate = values.admissionDate ? parseDateCell(values.admissionDate) : null;

    const data = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      currentClassId: klass.id,
      dateOfBirth: dateOfBirth?.ok ? dateOfBirth.value : null,
      gender: values.gender?.trim() || null,
      isBoarding: values.isBoarding ? parseBoolean(values.isBoarding) : false,
      admissionDate: admissionDate?.ok ? admissionDate.value : null,
      status: "ACTIVE" as const,
    };

    const artifacts: ImportArtifact[] = [];
    let studentId = matchId;

    if (studentId) {
      if (context.onDuplicate === "UPDATE") {
        await tx.schoolStudent.update({ where: { id: studentId }, data });
      }
    } else {
      const created = await tx.schoolStudent.create({
        data: {
          companyId: context.companyId,
          studentNo: values.studentNo.trim() || nextStudentNo(context.lookup),
          ...data,
        },
      });
      studentId = created.id;
      artifacts.push({ type: "SchoolStudent", id: created.id });
      context.lookup.studentsByNo.set(normalizeName(created.studentNo), {
        id: created.id,
        name: `${created.firstName} ${created.lastName}`,
      });
    }

    // THE POINT OF THIS BLOCK. `provisionSchool` writes `currentClassId` and
    // stops, so a school provisioned that way has no record of who was in which
    // class — and the year roll-up, which reads enrolments, has nothing to roll.
    // An importer that repeated it would ship the same hole nine hundred times.
    const existing = await tx.schoolEnrollment.findUnique({
      where: {
        companyId_studentId_termId: {
          companyId: context.companyId,
          studentId,
          termId: context.termId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await tx.schoolEnrollment.update({
        where: { id: existing.id },
        data: { classId: klass.id, status: "ACTIVE" },
      });
    } else {
      const enrollment = await tx.schoolEnrollment.create({
        data: {
          companyId: context.companyId,
          studentId,
          termId: context.termId,
          classId: klass.id,
          status: "ACTIVE",
        },
      });
      artifacts.push({ type: "SchoolEnrollment", id: enrollment.id });
    }

    return { artifacts, status: matchId ? "UPDATED" : "CREATED" };
  },
};

// ---------------------------------------------------------------------------
// Guardians
// ---------------------------------------------------------------------------

const GUARDIAN_FIELDS: ImportField[] = [
  {
    key: "studentNo",
    label: "Student number",
    required: true,
    aliases: ["studentno", "studentnumber", "childnumber", "pupilnumber"],
  },
  { key: "firstName", label: "First name", required: true, aliases: ["first", "givenname", "parentfirstname"] },
  { key: "lastName", label: "Surname", required: true, aliases: ["last", "surname", "parentsurname"] },
  { key: "phone", label: "Phone", required: true, aliases: ["mobile", "cell", "telephone", "contact"] },
  { key: "relationship", label: "Relationship", required: true, aliases: ["relation", "relationtostudent"] },
  { key: "email", label: "Email", aliases: ["emailaddress"] },
  { key: "address", label: "Address", aliases: ["homeaddress", "residentialaddress"] },
  { key: "nationalId", label: "National ID", aliases: ["idnumber", "nationalidnumber", "id"] },
  { key: "isPrimary", label: "Primary contact", aliases: ["primary", "maincontact"] },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const guardianHandler: SchoolImportHandler = {
  key: "GUARDIAN",
  label: "Parents and guardians",
  order: 3,
  dependsOn: ["STUDENT"],
  naturalKey: "Phone number, or email when there is no phone",
  fields: GUARDIAN_FIELDS,
  validate(values, context) {
    const issues: ImportRowIssue[] = [];
    required(values, GUARDIAN_FIELDS, issues);

    if (values.studentNo) {
      const resolved = resolveNamed(
        values.studentNo,
        context.lookup.studentsByNo,
        context.lookup.studentNumbers,
        "studentNo",
        "student with number",
      );
      if ("issue" in resolved) issues.push(resolved.issue);
    }

    if (values.phone && normalizePhone(values.phone).length < 9) {
      issues.push({ field: "phone", message: `"${values.phone}" is too short to be a phone number` });
    }

    if (values.email && !EMAIL_PATTERN.test(values.email.trim())) {
      issues.push({ field: "email", message: `"${values.email}" doesn't look like an email address` });
    }

    return issues;
  },
  rowKey(values) {
    // Two guardians of two different children legitimately share a phone —
    // parents of siblings. The key is the pairing, not the parent.
    const phone = normalizePhone(values.phone ?? "");
    const student = normalizeName(values.studentNo ?? "");
    if (!phone || !student) return null;
    return `link:${student}:${phone}`;
  },
  findMatch(values, context) {
    const phone = normalizePhone(values.phone ?? "");
    if (phone) {
      const byPhone = context.lookup.guardiansByPhone.get(phone);
      if (byPhone) return { id: byPhone.id, label: byPhone.name };
    }
    const email = values.email?.trim().toLowerCase();
    if (email) {
      const byEmail = context.lookup.guardiansByEmail.get(email);
      if (byEmail) return { id: byEmail.id, label: byEmail.name };
    }
    return null;
  },
  async apply(tx, values, context, matchId) {
    const student = context.lookup.studentsByNo.get(normalizeName(values.studentNo));
    if (!student) throw new Error(`No student with number "${values.studentNo}"`);

    const artifacts: ImportArtifact[] = [];
    let guardianId = matchId;

    const data = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phone: values.phone.trim(),
      email: values.email?.trim() || null,
      address: values.address?.trim() || null,
      nationalId: values.nationalId?.trim() || null,
    };

    if (guardianId) {
      if (context.onDuplicate === "UPDATE") {
        await tx.schoolGuardian.update({ where: { id: guardianId }, data });
      }
    } else {
      const created = await tx.schoolGuardian.create({
        data: {
          companyId: context.companyId,
          guardianNo: nextGuardianNo(context.lookup),
          ...data,
        },
      });
      guardianId = created.id;
      artifacts.push({ type: "SchoolGuardian", id: created.id });

      const entry = { id: created.id, name: `${created.firstName} ${created.lastName}` };
      const phone = normalizePhone(created.phone);
      if (phone) context.lookup.guardiansByPhone.set(phone, entry);
      if (created.email) context.lookup.guardiansByEmail.set(created.email.toLowerCase(), entry);
    }

    // The link is what actually matters — a guardian nobody is the guardian OF
    // is a contact card. Idempotent on (student, guardian).
    const existingLink = await tx.schoolStudentGuardian.findUnique({
      where: {
        companyId_studentId_guardianId: {
          companyId: context.companyId,
          studentId: student.id,
          guardianId,
        },
      },
      select: { id: true },
    });

    const isPrimary = values.isPrimary ? parseBoolean(values.isPrimary) : false;

    if (existingLink) {
      await tx.schoolStudentGuardian.update({
        where: { id: existingLink.id },
        data: { relationship: values.relationship.trim(), isPrimary },
      });
    } else {
      const link = await tx.schoolStudentGuardian.create({
        data: {
          companyId: context.companyId,
          studentId: student.id,
          guardianId,
          relationship: values.relationship.trim(),
          isPrimary,
        },
      });
      artifacts.push({ type: "SchoolStudentGuardian", id: link.id });
    }

    return { artifacts, status: matchId ? "UPDATED" : "CREATED" };
  },
};

// ---------------------------------------------------------------------------
// Fee structures
// ---------------------------------------------------------------------------

const FEE_STRUCTURE_FIELDS: ImportField[] = [
  { key: "className", label: "Class", required: true, aliases: ["class", "form", "grade"] },
  { key: "structureName", label: "Fee structure", required: true, aliases: ["structure", "feestructure", "billname"] },
  { key: "feeCode", label: "Fee code", required: true, aliases: ["code", "itemcode", "feeitem"] },
  { key: "description", label: "Description", required: true, aliases: ["item", "particulars", "feedescription"] },
  { key: "amount", label: "Amount", required: true, aliases: ["fee", "charge", "cost", "price"] },
  { key: "termName", label: "Term", aliases: ["term", "period"] },
  { key: "currency", label: "Currency", aliases: ["ccy"] },
  { key: "isMandatory", label: "Compulsory", aliases: ["mandatory", "compulsory", "required"] },
];

const feeStructureHandler: SchoolImportHandler = {
  key: "FEE_STRUCTURE",
  label: "Fee structures",
  order: 4,
  dependsOn: ["CLASS"],
  naturalKey: "Term, class, fee structure name and fee code — one row is one line of the bill",
  fields: FEE_STRUCTURE_FIELDS,
  validate(values, context) {
    const issues: ImportRowIssue[] = [];
    required(values, FEE_STRUCTURE_FIELDS, issues);

    if (values.className) {
      const resolved = resolveNamed(
        values.className,
        context.lookup.classesByName,
        context.lookup.classNames,
        "className",
        "class",
      );
      if ("issue" in resolved) issues.push(resolved.issue);
    }

    if (values.termName) {
      const resolved = resolveNamed(
        values.termName,
        context.lookup.termsByName,
        context.lookup.termNames,
        "termName",
        "term",
      );
      if ("issue" in resolved) issues.push(resolved.issue);
    } else if (!context.termId) {
      issues.push({
        field: "termName",
        message: "No term given and this school has no active term — name the term in a column",
      });
    }

    if (values.amount) {
      const parsed = parseMoneyCell(values.amount);
      if (!parsed.ok) {
        issues.push({ field: "amount", message: parsed.message });
      } else if (parsed.value.isNegative()) {
        issues.push({ field: "amount", message: "A fee cannot be negative" });
      }
    }

    return issues;
  },
  rowKey(values) {
    const parts = [values.termName, values.className, values.structureName, values.feeCode];
    if (parts.some((part) => !part)) return null;
    return `line:${parts.map((part) => normalizeName(part!)).join("|")}`;
  },
  findMatch(values, context) {
    const klass = context.lookup.classesByName.get(normalizeName(values.className ?? ""));
    const termId = values.termName
      ? context.lookup.termsByName.get(normalizeName(values.termName))?.id
      : context.termId;
    if (!klass || !termId || !values.structureName) return null;

    const found = context.lookup.feeStructuresByKey.get(
      feeStructureKey(termId, klass.id, values.structureName),
    );
    // The STRUCTURE existing is not the same as this LINE existing, so this is
    // reported as a match but `apply` still upserts the line beneath it.
    return found ? { id: found.id, label: found.name } : null;
  },
  async apply(tx, values, context) {
    const klass = context.lookup.classesByName.get(normalizeName(values.className));
    if (!klass) throw new Error(`No class called "${values.className}"`);

    const termId = values.termName
      ? context.lookup.termsByName.get(normalizeName(values.termName))?.id
      : context.termId;
    if (!termId) throw new Error("No term to attach this fee structure to");

    const amount = parseMoneyCell(values.amount);
    if (!amount.ok) throw new Error(amount.message);

    const currency = values.currency?.trim().toUpperCase() || context.lookup.baseCurrency;
    const structureName = values.structureName.trim();
    const key = feeStructureKey(termId, klass.id, structureName);

    const artifacts: ImportArtifact[] = [];
    let structure = context.lookup.feeStructuresByKey.get(key);

    if (!structure) {
      const created = await tx.schoolFeeStructure.create({
        data: {
          companyId: context.companyId,
          termId,
          classId: klass.id,
          name: structureName,
          currency,
          status: "ACTIVE",
        },
      });
      structure = { id: created.id, name: created.name, currency: created.currency };
      context.lookup.feeStructuresByKey.set(key, structure);
      artifacts.push({ type: "SchoolFeeStructure", id: created.id });
    }

    const feeCode = values.feeCode.trim();
    const existingLine = await tx.schoolFeeStructureLine.findUnique({
      where: {
        companyId_feeStructureId_feeCode: {
          companyId: context.companyId,
          feeStructureId: structure.id,
          feeCode,
        },
      },
      select: { id: true },
    });

    const lineData = {
      description: values.description.trim(),
      amount: amount.value,
      isMandatory: values.isMandatory ? parseBoolean(values.isMandatory) : true,
    };

    if (existingLine) {
      await tx.schoolFeeStructureLine.update({ where: { id: existingLine.id }, data: lineData });
      return { artifacts, status: artifacts.length ? "CREATED" : "UPDATED" };
    }

    const line = await tx.schoolFeeStructureLine.create({
      data: {
        companyId: context.companyId,
        feeStructureId: structure.id,
        feeCode,
        ...lineData,
      },
    });
    artifacts.push({ type: "SchoolFeeStructureLine", id: line.id });

    // A structure whose currency differs from the one this row asked for is
    // worth saying out loud rather than silently re-pricing the line.
    if (structure.currency !== currency) {
      return {
        artifacts,
        status: "ANOMALY",
        warning: `Priced in ${structure.currency}, the currency the "${structure.name}" structure was created with, not the ${currency} this row asked for.`,
      };
    }

    return { artifacts, status: "CREATED" };
  },
};

// ---------------------------------------------------------------------------
// Opening balances
// ---------------------------------------------------------------------------

const OPENING_BALANCE_FIELDS: ImportField[] = [
  {
    key: "studentNo",
    label: "Student number",
    required: true,
    aliases: ["studentno", "studentnumber", "account", "accountnumber"],
  },
  { key: "amount", label: "Amount owing", required: true, aliases: ["balance", "owing", "arrears", "openingbalance"] },
  { key: "asAtDate", label: "As at", aliases: ["date", "asat", "balancedate", "statementdate"] },
  { key: "currency", label: "Currency", aliases: ["ccy"] },
  { key: "reference", label: "Reference", aliases: ["ref", "note", "narration", "description"] },
];

/** The fee code every brought-forward balance carries, so they can be found. */
export const OPENING_BALANCE_FEE_CODE = "OPENING_BALANCE";

const openingBalanceHandler: SchoolImportHandler = {
  key: "OPENING_BALANCE",
  label: "Opening balances",
  order: 5,
  dependsOn: ["STUDENT"],
  naturalKey: "Student number — one brought-forward balance per pupil",
  fields: OPENING_BALANCE_FIELDS,
  validate(values, context) {
    const issues: ImportRowIssue[] = [];
    required(values, OPENING_BALANCE_FIELDS, issues);

    if (values.studentNo) {
      const resolved = resolveNamed(
        values.studentNo,
        context.lookup.studentsByNo,
        context.lookup.studentNumbers,
        "studentNo",
        "student with number",
      );
      if ("issue" in resolved) issues.push(resolved.issue);
    }

    if (values.amount) {
      const parsed = parseMoneyCell(values.amount);
      if (!parsed.ok) {
        issues.push({ field: "amount", message: parsed.message });
      } else if (parsed.value.isNegative()) {
        // A credit balance is a real thing, but it is a refund or a credit
        // note, not an opening bill, and quietly billing a family for a
        // negative number is the worst available outcome.
        issues.push({
          field: "amount",
          message:
            "This is a credit, not an amount owing. Bring credits over as receipts rather than opening balances.",
        });
      }
    }

    if (values.asAtDate) {
      const parsed = parseDateCell(values.asAtDate);
      if (!parsed.ok) issues.push({ field: "asAtDate", message: parsed.message });
    }

    if (!context.termId) {
      issues.push({
        field: "_row",
        message: "This school has no active term to bill the balance against. Open a term first.",
      });
    }

    return issues;
  },
  rowKey: (values) => (values.studentNo ? `bal:${normalizeName(values.studentNo)}` : null),
  findMatch() {
    // Deliberately never matches. An opening balance is matched by looking for
    // an existing brought-forward invoice inside `apply`, because the check is
    // "has this student already had one?" and that is a query, not a name.
    return null;
  },
  async apply(tx, values, context) {
    const student = context.lookup.studentsByNo.get(normalizeName(values.studentNo));
    if (!student) throw new Error(`No student with number "${values.studentNo}"`);
    if (!context.termId) throw new Error("This school has no active term");

    const amount = parseMoneyCell(values.amount);
    if (!amount.ok) throw new Error(amount.message);

    // Re-running an import must not bill a family twice. A brought-forward
    // invoice is recognised by its fee code, not by a name somebody typed.
    const existing = await tx.schoolFeeInvoice.findFirst({
      where: {
        companyId: context.companyId,
        studentId: student.id,
        termId: context.termId,
        status: { not: "VOIDED" },
        lines: { some: { feeCode: OPENING_BALANCE_FEE_CODE } },
      },
      select: { id: true, invoiceNo: true },
    });

    if (existing) {
      return {
        artifacts: [],
        status: "SKIPPED",
        warning: `${student.name} already has a brought-forward balance on ${existing.invoiceNo}.`,
      };
    }

    const currency = values.currency?.trim().toUpperCase() || context.lookup.baseCurrency;
    const asAt = values.asAtDate ? parseDateCell(values.asAtDate) : null;
    const issueDate = asAt?.ok ? asAt.value : new Date();

    // The rate is not looked up. A balance brought over from another system is
    // a figure the school states, and restating it at today's rate would change
    // what the family owes. Same-currency balances are the ordinary case; a
    // cross-currency one is flagged rather than converted behind their back.
    const exchangeRate = new Prisma.Decimal(1);
    const baseAmount = toBaseAmount(amount.value, exchangeRate);

    const invoice = await tx.schoolFeeInvoice.create({
      data: {
        companyId: context.companyId,
        invoiceNo: nextInvoiceNo(context.lookup),
        studentId: student.id,
        termId: context.termId,
        // Null on purpose: this is not a bill raised from a fee structure, and
        // leaving it null keeps the balance outside the "one live invoice per
        // student, per term, per structure" partial index, so it cannot block
        // the school's first real invoice of the term.
        feeStructureId: null,
        issueDate,
        dueDate: issueDate,
        status: "ISSUED",
        subTotal: amount.value,
        taxTotal: money(0),
        totalAmount: amount.value,
        balanceAmount: amount.value,
        currency,
        exchangeRate,
        baseAmount,
        notes: values.reference?.trim() || "Balance brought forward at migration",
        issuedById: context.actorId,
        issuedAt: new Date(),
        createdById: context.actorId,
        lines: {
          create: {
            companyId: context.companyId,
            feeCode: OPENING_BALANCE_FEE_CODE,
            description: values.reference?.trim() || "Balance brought forward",
            quantity: new Prisma.Decimal(1),
            unitAmount: amount.value,
            lineTotal: amount.value,
          },
        },
      },
      select: { id: true, invoiceNo: true },
    });

    const artifacts: ImportArtifact[] = [{ type: "SchoolFeeInvoice", id: invoice.id }];

    const warning =
      currency !== context.lookup.baseCurrency
        ? `Brought over as ${currency} at a rate of 1. The ledger figure is the same number — check it against your ${context.lookup.baseCurrency} books.`
        : undefined;

    return { artifacts, status: warning ? "ANOMALY" : "CREATED", warning };
  },
};

// ---------------------------------------------------------------------------

export const SCHOOL_IMPORT_HANDLERS: Record<SchoolImportEntity, SchoolImportHandler> = {
  CLASS: classHandler,
  STUDENT: studentHandler,
  GUARDIAN: guardianHandler,
  FEE_STRUCTURE: feeStructureHandler,
  OPENING_BALANCE: openingBalanceHandler,
};

/** The order a school has to be loaded in. */
export const SCHOOL_IMPORT_ORDER = Object.values(SCHOOL_IMPORT_HANDLERS)
  .sort((a, b) => a.order - b.order)
  .map((handler) => handler.key);

export function handlerFor(entity: SchoolImportEntity): SchoolImportHandler {
  return SCHOOL_IMPORT_HANDLERS[entity];
}
