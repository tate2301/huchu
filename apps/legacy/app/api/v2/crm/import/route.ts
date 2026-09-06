import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { buildFullName } from "@/lib/crm/conversion";
import { normalizeName } from "@/lib/crm/duplicates";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  buildImportPlan,
  importMappingSchema,
  parseImportFile,
  parseImportList,
  parseImportNumber,
  type ImportEntity,
  type ImportPlan,
} from "@/lib/crm/import";

const requestSchema = importMappingSchema.extend({
  csv: z.string().min(1).max(5_000_000),
  /** Preview by default. Nothing is written until this is explicitly true. */
  commit: z.boolean().default(false),
});

type MatchIndex = Map<string, { id: string; label: string }>;

/**
 * Build one lookup of everything already in the tenant, so matching is a map
 * hit per row rather than a query per row.
 */
async function loadMatchIndex(companyId: string, entity: ImportEntity): Promise<MatchIndex> {
  const index: MatchIndex = new Map();
  const add = (key: string | null, value: { id: string; label: string }) => {
    if (key && !index.has(key)) index.set(key, value);
  };

  if (entity === "PERSON") {
    const people = await prisma.crmPerson.findMany({
      where: { companyId, mergedIntoId: null },
      select: { id: true, fullName: true, emailNormalized: true, phoneE164: true },
    });
    for (const person of people) {
      const value = { id: person.id, label: person.fullName };
      add(person.emailNormalized ? `email:${person.emailNormalized}` : null, value);
      add(person.phoneE164 ? `phone:${person.phoneE164.replace(/\D/g, "")}` : null, value);
    }
    return index;
  }

  if (entity === "COMPANY") {
    const companies = await prisma.crmClient.findMany({
      where: { companyId, mergedIntoId: null },
      select: { id: true, name: true, email: true },
    });
    for (const record of companies) {
      const value = { id: record.id, label: record.name };
      add(record.email ? `email:${record.email.toLowerCase()}` : null, value);
      add(`name:${normalizeName(record.name)}`, value);
    }
    return index;
  }

  // Leads are events, not records — the same person asking twice is two leads,
  // so nothing here matches and every row creates.
  return index;
}

function matcherFor(entity: ImportEntity, index: MatchIndex) {
  return (values: Record<string, string>) => {
    const email = (values.email ?? values.contactEmail ?? "").toLowerCase().trim();
    if (email && index.has(`email:${email}`)) return index.get(`email:${email}`)!;

    if (entity === "COMPANY" && values.name) {
      const key = `name:${normalizeName(values.name)}`;
      if (index.has(key)) return index.get(key)!;
    }

    const phone = (values.phone ?? values.contactPhone ?? "").replace(/\D/g, "");
    if (phone && index.has(`phone:${phone}`)) return index.get(`phone:${phone}`)!;

    return null;
  };
}

/** Resolve a company name to an id, creating one where the name is new. */
async function resolveCompanyByName(
  companyId: string,
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const key = normalizeName(name);
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await prisma.crmClient.findFirst({
    where: { companyId, name: { equals: name, mode: "insensitive" }, mergedIntoId: null },
    select: { id: true },
  });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const clientNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_CLIENT" });
  const created = await prisma.crmClient.create({
    data: { companyId, clientNo, name },
    select: { id: true },
  });
  cache.set(key, created.id);
  return created.id;
}

async function applyPlan(
  companyId: string,
  userId: string,
  plan: ImportPlan,
): Promise<{ created: number; updated: number; failed: { line: number; message: string }[] }> {
  const failed: { line: number; message: string }[] = [];
  const companyCache = new Map<string, string>();
  let created = 0;
  let updated = 0;

  for (const row of plan.rows) {
    if (row.action === "SKIP") continue;
    const values = row.values;

    try {
      if (plan.entity === "PERSON") {
        const clientId = values.companyName
          ? await resolveCompanyByName(companyId, values.companyName, companyCache)
          : undefined;
        const data = {
          firstName: values.firstName,
          lastName: values.lastName || null,
          fullName: buildFullName(values.firstName, values.lastName || null),
          jobTitle: values.jobTitle || null,
          email: values.email || null,
          emailNormalized: values.email ? values.email.toLowerCase() : null,
          phone: values.phone || null,
          phoneE164: values.phone ? values.phone.replace(/[^\d+]/g, "") : null,
          city: values.city || null,
          country: values.country || null,
          notes: values.notes || null,
          tags: values.tags ? parseImportList(values.tags) : undefined,
          clientId,
        };

        if (row.action === "UPDATE" && row.matchId) {
          await prisma.crmPerson.update({ where: { id: row.matchId }, data });
          updated += 1;
        } else {
          const personNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_PERSON" });
          await prisma.crmPerson.create({
            data: {
              ...data,
              tags: data.tags ?? [],
              companyId,
              personNo,
              sourceType: "IMPORT",
              createdById: userId,
            },
          });
          created += 1;
        }
        continue;
      }

      if (plan.entity === "COMPANY") {
        const data = {
          name: values.name,
          tradingName: values.tradingName || null,
          contactName: values.contactName || null,
          email: values.email || null,
          phone: values.phone || null,
          website: values.website || null,
          registrationNumber: values.registrationNumber || null,
          taxNumber: values.taxNumber || null,
          industry: values.industry || null,
          city: values.city || null,
          country: values.country || null,
          tags: values.tags ? parseImportList(values.tags) : undefined,
        };

        if (row.action === "UPDATE" && row.matchId) {
          await prisma.crmClient.update({ where: { id: row.matchId }, data });
          updated += 1;
        } else {
          const clientNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_CLIENT" });
          await prisma.crmClient.create({
            data: {
              ...data,
              tags: data.tags ?? [],
              emailNormalized: values.email ? values.email.toLowerCase() : null,
              phoneE164: values.phone ? values.phone.replace(/[^\d+]/g, "") : null,
              companyId,
              clientNo,
            },
          });
          created += 1;
        }
        continue;
      }

      // LEAD
      const clientId = values.companyName
        ? await resolveCompanyByName(companyId, values.companyName, companyCache)
        : undefined;
      const leadNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_LEAD" });
      await prisma.crmLead.create({
        data: {
          companyId,
          leadNo,
          title: values.title,
          contactName: values.contactName || null,
          contactEmail: values.contactEmail || null,
          contactPhone: values.contactPhone || null,
          clientId,
          estimatedValue: values.estimatedValue
            ? (parseImportNumber(values.estimatedValue) ?? undefined)
            : undefined,
          currency: values.currency || "USD",
          services: values.services ? parseImportList(values.services) : [],
          source: values.source || null,
          sourceChannel: "MANUAL",
          createdById: userId,
        },
      });
      created += 1;
    } catch (error) {
      // One bad row shouldn't abandon the other four thousand — it's reported
      // by line number so it can be fixed and re-run on its own.
      failed.push({
        line: row.line,
        message: error instanceof Error ? error.message : "Could not import this row",
      });
    }
  }

  return { created, updated, failed };
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Import writes across the whole tenant's book, which is a manager's call.
    if (!(await canUser(session, "records.import"))) {
      return errorResponse(denialMessage("records.import"), 403);
    }

    const body = requestSchema.parse(await request.json());
    const table = parseImportFile(body.csv);

    if (table.headers.length === 0) return errorResponse("That file has no columns", 400);
    if (table.rows.length === 0) return errorResponse("That file has no rows", 400);
    if (table.rows.length > MAX_IMPORT_ROWS) {
      return errorResponse(
        `That file has ${table.rows.length} rows; the limit is ${MAX_IMPORT_ROWS}. Split it and run it in parts.`,
        400,
      );
    }

    const index = await loadMatchIndex(session.user.companyId, body.entity);
    const plan = buildImportPlan(
      table,
      { entity: body.entity, mapping: body.mapping, onDuplicate: body.onDuplicate },
      matcherFor(body.entity, index),
    );

    if (!body.commit) {
      return successResponse({
        ...plan,
        // Previews only need enough rows to see what will happen.
        rows: plan.rows.slice(0, 100),
        rowCount: plan.rows.length,
        fields: IMPORT_FIELDS[body.entity],
      });
    }

    const result = await applyPlan(session.user.companyId, session.user.id, plan);
    return successResponse({ ...result, totals: plan.totals });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/import error:", error);
    return errorResponse("Failed to import");
  }
}
