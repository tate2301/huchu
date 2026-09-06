import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  ageingBucket,
  chaseUrgency,
  collectionNoteSchema,
  daysOverdue,
  orderChaseList,
  summarizeAgeing,
  validateCollectionNote,
} from "@/lib/crm/collections";

/** What is still owed on an invoice, after payments, credits and write-offs. */
function outstandingOf(invoice: {
  total: number;
  amountPaid: number;
  creditTotal: number;
  writeOffTotal: number;
}): number {
  return Math.max(
    0,
    Math.round(
      (invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal) * 100,
    ) / 100,
  );
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const documents = await prisma.crmLeadDocument.findMany({
      where: {
        companyId,
        type: "INVOICE",
        invoice: { is: { status: { notIn: ["PAID", "VOIDED", "DRAFT"] } } },
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            dueDate: true,
            total: true,
            amountPaid: true,
            creditTotal: true,
            writeOffTotal: true,
            status: true,
          },
        },
        lead: { select: { id: true, leadNo: true, title: true, assignedToId: true } },
        deal: { select: { id: true, dealNo: true, title: true, assignedToId: true } },
        // The latest chase, which is what decides whether to ring again today.
        collectionNotes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            outcome: true,
            promisedAt: true,
            promisedAmount: true,
            notes: true,
            createdAt: true,
          },
        },
      },
      take: 500,
    });

    const now = new Date();
    const rows = documents
      .filter((document) => document.invoice)
      .map((document) => {
        const invoice = document.invoice!;
        const outstanding = outstandingOf(invoice);
        const latest = document.collectionNotes[0] ?? null;

        return {
          documentId: document.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          currency: document.currency,
          total: invoice.total,
          outstanding,
          dueDate: invoice.dueDate,
          daysOverdue: daysOverdue(invoice.dueDate, now),
          bucket: ageingBucket(invoice.dueDate, now),
          record: document.deal
            ? { kind: "deal" as const, id: document.deal.id, label: document.deal.title }
            : document.lead
              ? {
                  kind: "lead" as const,
                  id: document.lead.id,
                  label: document.lead.title ?? document.lead.leadNo,
                }
              : null,
          ownerId: document.deal?.assignedToId ?? document.lead?.assignedToId ?? null,
          lastNote: latest,
          promisedAt: latest?.promisedAt ?? null,
          promiseKept: latest?.outcome === "PAID",
          urgency: chaseUrgency(
            {
              outstanding,
              dueDate: invoice.dueDate,
              promisedAt: latest?.promisedAt ?? null,
              promiseKept: latest?.outcome === "PAID",
            },
            now,
          ),
        };
      })
      .filter((row) => row.outstanding > 0);

    return successResponse({
      data: orderChaseList(rows, now),
      ageing: summarizeAgeing(rows, now),
      totalOutstanding:
        Math.round(rows.reduce((sum, row) => sum + row.outstanding, 0) * 100) / 100,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/collections error:", error);
    return errorResponse("Failed to build the collections list");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = collectionNoteSchema.parse(await request.json());

    const problem = validateCollectionNote(data);
    if (problem) return errorResponse(problem, 400);

    const document = await prisma.crmLeadDocument.findFirst({
      where: { id: data.documentId, companyId },
      select: {
        id: true,
        invoiceId: true,
        leadId: true,
        dealId: true,
        lead: { select: { clientId: true } },
        deal: { select: { clientId: true } },
      },
    });
    if (!document) return errorResponse("Document not found", 404);

    const note = await prisma.crmCollectionNote.create({
      data: {
        companyId,
        documentId: document.id,
        invoiceId: document.invoiceId ?? undefined,
        clientId: document.deal?.clientId ?? document.lead?.clientId ?? undefined,
        outcome: data.outcome,
        promisedAt: data.promisedAt ? new Date(data.promisedAt) : undefined,
        promisedAmount: data.promisedAmount ?? undefined,
        notes: data.notes ?? undefined,
        createdById: session.user.id,
      },
    });

    // A promise is only useful if somebody checks it on the day, so the check
    // is booked as a task rather than left to memory.
    if (data.outcome === "PROMISED_TO_PAY" && data.promisedAt) {
      await prisma.crmTask.create({
        data: {
          companyId,
          title: "Check the payment they promised",
          type: "PAYMENT_FOLLOW_UP",
          priority: "HIGH",
          dueAt: new Date(data.promisedAt),
          hasDueTime: false,
          assignedToId: session.user.id,
          createdById: session.user.id,
          leadId: document.leadId ?? undefined,
          dealId: document.dealId ?? undefined,
        },
      });
    }

    // The chase belongs on the record's timeline too.
    await prisma.crmActivity.create({
      data: {
        companyId,
        type: "SYSTEM",
        leadId: document.leadId ?? undefined,
        dealId: document.dealId ?? undefined,
        subject: `Collections: ${data.outcome.toLowerCase().replace(/_/g, " ")}`,
        body: data.notes ?? undefined,
        metadata: { kind: "COLLECTION", noteId: note.id, promisedAt: data.promisedAt ?? null },
        createdById: session.user.id,
        occurredAt: new Date(),
      },
    });

    return successResponse(note, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/collections error:", error);
    return errorResponse("Failed to record the chase");
  }
}
