/**
 * Running an import: stage, plan, commit, undo.
 *
 * Four verbs, deliberately separate. A registrar uploads a file, looks at what
 * the system thinks each column is, asks what would happen, fixes what needs
 * fixing, and only then writes. The alternative — parse and apply in one call —
 * is how a school ends up with four hundred pupils in the wrong form and no
 * record of what the file said before somebody started editing it.
 */
import { Prisma, type PrismaClient, type SchoolImportEntity } from "@corelithzw/db";

import { guessMapping, parseCsv } from "@/lib/import-core/csv";
import {
  buildImportPlan,
  type ImportRowIssue,
  type ImportRowPlan,
} from "@/lib/import-core/plan";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";

import { buildImportLookup } from "./lookup";
import { handlerFor, type HandlerContext, type ImportArtifact } from "./registry";

type Db = PrismaClient;

/**
 * Imports are capped so one paste cannot hold a transaction open across a whole
 * school's afternoon. A file above this is a sign the school wants splitting by
 * year group anyway, which is how they check it.
 */
export const MAX_IMPORT_ROWS = 5000;
/** Roughly 5 MB of CSV. Larger is a spreadsheet with images pasted into it. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export class ImportTooLargeError extends Error {}

export type StageInput = {
  companyId: string;
  entityType: SchoolImportEntity;
  fileName: string;
  csvText: string;
  uploadedById: string;
};

/** Read the file, guess the mapping, and put every row in the staging table. */
export async function stageImportJob(db: Db, input: StageInput) {
  if (Buffer.byteLength(input.csvText, "utf8") > MAX_IMPORT_BYTES) {
    throw new ImportTooLargeError("That file is over 5 MB. Split it by year group and try again.");
  }

  const table = parseCsv(input.csvText);
  if (table.rows.length > MAX_IMPORT_ROWS) {
    throw new ImportTooLargeError(
      `That file has ${table.rows.length} rows and the limit is ${MAX_IMPORT_ROWS}. Split it and try again.`,
    );
  }

  const handler = handlerFor(input.entityType);
  const mapping = guessMapping(table.headers, handler.fields);

  return db.$transaction(async (tx) => {
    const job = await tx.schoolImportJob.create({
      data: {
        companyId: input.companyId,
        entityType: input.entityType,
        fileName: input.fileName,
        headers: table.headers,
        mapping,
        rowsTotal: table.rows.length,
        uploadedById: input.uploadedById,
      },
    });

    if (table.rows.length > 0) {
      await tx.schoolImportRow.createMany({
        data: table.rows.map((cells, index) => ({
          companyId: input.companyId,
          jobId: job.id,
          lineNo: index + 2, // header is line 1, so this is the spreadsheet's own number
          rawJson: Object.fromEntries(
            table.headers.map((header, position) => [header, cells[position] ?? ""]),
          ),
        })),
      });
    }

    return job;
  });
}

export type PlanSummary = {
  jobId: string;
  entityType: SchoolImportEntity;
  totals: { create: number; update: number; skip: number };
  /** Rows that cannot be written, newest problem first — the point of a dry run. */
  rejected: {
    lineNo: number;
    issues: ImportRowIssue[];
    values: Record<string, string>;
  }[];
  unmappedHeaders: string[];
  /** Blocks a commit outright. */
  blockers: string[];
};

function rowsToTable(
  headers: string[],
  rows: { lineNo: number; rawJson: Prisma.JsonValue }[],
): { headers: string[]; rows: string[][] } {
  return {
    headers,
    rows: rows.map((row) => {
      const raw = (row.rawJson ?? {}) as Record<string, string>;
      return headers.map((header) => raw[header] ?? "");
    }),
  };
}

/**
 * Work out what would happen, and write the findings onto the staged rows.
 *
 * Touches the import tables and nothing else. A dry run that writes to a domain
 * table is not a dry run, and this is the property the tests assert by counting
 * every affected table either side of a call.
 */
export async function planImportJob(db: Db, jobId: string, companyId: string): Promise<PlanSummary> {
  const job = await db.schoolImportJob.findFirstOrThrow({
    where: { id: jobId, companyId },
    include: { rows: { orderBy: { lineNo: "asc" } } },
  });

  const handler = handlerFor(job.entityType);
  const lookup = await buildImportLookup(db, companyId);
  const context: HandlerContext = {
    companyId,
    lookup,
    termId: lookup.activeTermId,
    actorId: job.uploadedById ?? "",
    onDuplicate: job.onDuplicate === "UPDATE" ? "UPDATE" : "SKIP",
  };

  const headers = (job.headers ?? []) as string[];
  const mapping = (job.mapping ?? {}) as Record<string, string>;
  const table = rowsToTable(headers, job.rows);

  const plan = buildImportPlan(table, {
    mapping,
    onDuplicate: job.onDuplicate === "UPDATE" ? "UPDATE" : "SKIP",
    validate: (values) => handler.validate(values, context),
    rowKey: handler.rowKey,
    findMatch: (values) => handler.findMatch(values, context),
    duplicateMessage: (firstLine) => `The same record is already on row ${firstLine} of this file`,
  });

  // buildImportPlan drops blank rows, so line numbers are the join, not order.
  const planByLine = new Map<number, ImportRowPlan>();
  for (const row of plan.rows) planByLine.set(row.line, row);

  await db.$transaction(
    job.rows.map((row) => {
      const planned = planByLine.get(row.lineNo);
      return db.schoolImportRow.update({
        where: { id: row.id },
        data: {
          valuesJson: planned?.values ?? {},
          issuesJson: (planned?.issues ?? []) as unknown as Prisma.InputJsonValue,
          matchId: planned?.matchId ?? null,
          matchLabel: planned?.matchLabel ?? null,
          // Sticky: this is a fact about the file, and it survives a reset.
          parserWarning: planned
            ? (planned.issues[0]?.message ?? null)
            : "Every mapped column is blank on this row",
          // Transient: last attempt's failure is not this attempt's.
          errorMessage: null,
          status: "PENDING",
        },
      });
    }),
  );

  const missingRequired = handler.fields
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => `${field.label} is not mapped to a column`);

  await db.schoolImportJob.update({
    where: { id: job.id },
    data: { status: "PREVIEW" },
  });

  return {
    jobId: job.id,
    entityType: job.entityType,
    totals: plan.totals,
    rejected: plan.rows
      .filter((row) => row.issues.length > 0)
      .map((row) => ({ lineNo: row.line, issues: row.issues, values: row.values })),
    unmappedHeaders: plan.unmappedHeaders,
    blockers: missingRequired,
  };
}

export type CommitSummary = {
  jobId: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  anomalies: number;
};

/**
 * Write the rows.
 *
 * One transaction per row rather than one for the file. A single bad row —
 * a class that was deleted between the dry run and the commit, a unique index
 * catching something the plan could not see — must not strand the other eight
 * hundred and ninety-nine. This is Gold's rule and it is the right one; what is
 * different here is that the artifacts are recorded inside the same transaction
 * as the writes they describe, so a crash cannot leave a row the rollback
 * cannot find.
 */
export async function commitImportJob(
  db: Db,
  input: { jobId: string; companyId: string; actorId: string },
): Promise<CommitSummary> {
  const job = await db.schoolImportJob.findFirstOrThrow({
    where: { id: input.jobId, companyId: input.companyId },
    include: { rows: { orderBy: { lineNo: "asc" } } },
  });

  if (job.status === "COMMITTED") {
    return {
      jobId: job.id,
      created: job.rowsCreated,
      updated: job.rowsUpdated,
      skipped: job.rowsSkipped,
      failed: job.rowsFailed,
      anomalies: 0,
    };
  }

  const handler = handlerFor(job.entityType);
  const lookup = await buildImportLookup(db, input.companyId);
  const context: HandlerContext = {
    companyId: input.companyId,
    lookup,
    termId: lookup.activeTermId,
    actorId: input.actorId,
    onDuplicate: job.onDuplicate === "UPDATE" ? "UPDATE" : "SKIP",
  };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let anomalies = 0;

  for (const row of job.rows) {
    // Already written by an earlier run of this same job. Idempotency at the
    // row level, so a commit interrupted halfway can simply be repeated.
    if (row.status === "CREATED" || row.status === "UPDATED" || row.status === "ANOMALY") {
      if (row.status === "CREATED") created += 1;
      else if (row.status === "UPDATED") updated += 1;
      else anomalies += 1;
      continue;
    }

    const issues = (row.issuesJson ?? []) as unknown as ImportRowIssue[];
    const values = (row.valuesJson ?? {}) as Record<string, string>;

    if (issues.length > 0 || Object.keys(values).length === 0) {
      skipped += 1;
      await db.schoolImportRow.update({
        where: { id: row.id },
        data: { status: "SKIPPED" },
      });
      continue;
    }

    // Resolved again here rather than trusting the plan's answer. The lookup is
    // rebuilt at the top of this commit and mutated by each row as it lands, so
    // this is what sees two siblings in one file share a mother: the second
    // row's plan was drawn before the first row existed. It also catches a
    // record deleted between the dry run and the commit.
    const liveMatch = handler.findMatch(values, context);
    const matchId = liveMatch?.id ?? null;

    try {
      const result = await db.$transaction(async (tx) => {
        const applied = await handler.apply(tx, values, context, matchId);

        if (applied.artifacts.length > 0) {
          await tx.schoolImportArtifact.createMany({
            data: applied.artifacts.map((artifact: ImportArtifact, index: number) => ({
              companyId: input.companyId,
              rowId: row.id,
              artifactType: artifact.type,
              artifactId: artifact.id,
              sequence: index,
            })),
          });
        }

        await tx.schoolImportRow.update({
          where: { id: row.id },
          data: {
            status: applied.status,
            errorMessage: applied.warning ?? null,
          },
        });

        return applied;
      });

      if (result.status === "CREATED") created += 1;
      else if (result.status === "UPDATED") updated += 1;
      else if (result.status === "ANOMALY") anomalies += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      await db.schoolImportRow.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  await db.$transaction(async (tx) => {
    await tx.schoolImportJob.update({
      where: { id: job.id },
      data: {
        status: "COMMITTED",
        committedAt: new Date(),
        rowsCreated: created,
        rowsUpdated: updated,
        rowsSkipped: skipped,
        rowsFailed: failed,
      },
    });

    await writeSchoolAuditEvent(tx, {
      companyId: input.companyId,
      actorId: input.actorId,
      eventType: "schools.import.committed",
      entityType: "SchoolImportJob",
      entityId: job.id,
      payload: {
        entityType: job.entityType,
        fileName: job.fileName,
        created,
        updated,
        skipped,
        failed,
        anomalies,
      },
    });
  });

  return { jobId: job.id, created, updated, skipped, failed, anomalies };
}

/**
 * The order artifacts must be deleted in.
 *
 * Reverse of creation within a row, and reverse dependency across them: a
 * guardian link before the guardian, an invoice before the student it bills.
 * Lower runs first.
 */
const ARTIFACT_TEARDOWN_ORDER: Record<string, number> = {
  SchoolFeeInvoice: 1,
  SchoolFeeStructureLine: 2,
  SchoolFeeStructure: 3,
  SchoolStudentGuardian: 4,
  SchoolGuardian: 5,
  SchoolEnrollment: 6,
  SchoolStudent: 7,
  SchoolClass: 8,
};

const ARTIFACT_DELETERS: Record<string, (tx: Prisma.TransactionClient, id: string) => Promise<unknown>> = {
  SchoolFeeInvoice: (tx, id) => tx.schoolFeeInvoice.delete({ where: { id } }),
  SchoolFeeStructureLine: (tx, id) => tx.schoolFeeStructureLine.delete({ where: { id } }),
  SchoolFeeStructure: (tx, id) => tx.schoolFeeStructure.delete({ where: { id } }),
  SchoolStudentGuardian: (tx, id) => tx.schoolStudentGuardian.delete({ where: { id } }),
  SchoolGuardian: (tx, id) => tx.schoolGuardian.delete({ where: { id } }),
  SchoolEnrollment: (tx, id) => tx.schoolEnrollment.delete({ where: { id } }),
  SchoolStudent: (tx, id) => tx.schoolStudent.delete({ where: { id } }),
  SchoolClass: (tx, id) => tx.schoolClass.delete({ where: { id } }),
};

export type RollbackSummary = {
  jobId: string;
  removed: Record<string, number>;
  total: number;
};

/**
 * Take a committed import back out.
 *
 * A loop over what was recorded, not a function that names nine tables — which
 * is the whole reason the artifact table exists. Gold's rollback has to be
 * edited every time its importer learns to write something new; this one does
 * not, and the only thing a new entity type has to add is a deleter.
 */
export async function rollbackImportJob(
  db: Db,
  input: { jobId: string; companyId: string; actorId: string },
): Promise<RollbackSummary> {
  const job = await db.schoolImportJob.findFirstOrThrow({
    where: { id: input.jobId, companyId: input.companyId },
  });

  const artifacts = await db.schoolImportArtifact.findMany({
    where: { companyId: input.companyId, row: { jobId: job.id } },
    orderBy: [{ createdAt: "desc" }, { sequence: "desc" }],
  });

  const ordered = [...artifacts].sort((a, b) => {
    const byType =
      (ARTIFACT_TEARDOWN_ORDER[a.artifactType] ?? 99) -
      (ARTIFACT_TEARDOWN_ORDER[b.artifactType] ?? 99);
    if (byType !== 0) return byType;
    return b.sequence - a.sequence;
  });

  const removed: Record<string, number> = {};

  await db.$transaction(async (tx) => {
    for (const artifact of ordered) {
      const deleter = ARTIFACT_DELETERS[artifact.artifactType];
      if (!deleter) {
        throw new Error(
          `Nothing knows how to undo a ${artifact.artifactType}. Add it to ARTIFACT_DELETERS.`,
        );
      }
      try {
        await deleter(tx, artifact.artifactId);
        removed[artifact.artifactType] = (removed[artifact.artifactType] ?? 0) + 1;
      } catch (error) {
        // Already gone is fine — somebody may have deleted the pupil by hand.
        // Anything else is a real failure and must not be swallowed.
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2025"
        ) {
          throw error;
        }
      }
    }

    await tx.schoolImportArtifact.deleteMany({
      where: { companyId: input.companyId, row: { jobId: job.id } },
    });

    await tx.schoolImportRow.updateMany({
      where: { jobId: job.id },
      data: { status: "PENDING", errorMessage: null },
    });

    await tx.schoolImportJob.update({
      where: { id: job.id },
      data: {
        status: "ROLLED_BACK",
        rolledBackAt: new Date(),
        rowsCreated: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsFailed: 0,
      },
    });

    await writeSchoolAuditEvent(tx, {
      companyId: input.companyId,
      actorId: input.actorId,
      eventType: "schools.import.rolled-back",
      entityType: "SchoolImportJob",
      entityId: job.id,
      payload: { entityType: job.entityType, fileName: job.fileName, removed },
    });
  });

  return {
    jobId: job.id,
    removed,
    total: Object.values(removed).reduce((sum, count) => sum + count, 0),
  };
}
