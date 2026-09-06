import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { RECORD_ENTITIES, type RecordEntity } from "@/lib/crm/record-ref";

/**
 * One record, small enough to look at without going there.
 *
 * The peek needs the same handful of facts about any of six different tables —
 * what it is called, its reference, where it stands, and four or five
 * properties — and each of those tables already has a detail endpoint that
 * returns everything: a deal's `GET` carries its activities, its documents,
 * its contacts and its visits. Fetching all of that to draw a card with five
 * rows on it would make hovering a link cost more than opening the page.
 *
 * So: a summary of its own, normalised, so the peek has one shape to render
 * rather than six, and one place to change when a record gains a fact worth
 * previewing.
 *
 * The properties come back as `{ label, value }` in the order they should be
 * read. Deliberately strings — this is a preview, and a peek that renders a
 * live editor for six entity types is a second record page, not a peek.
 */

export type PeekTone = "neutral" | "info" | "success" | "warn" | "danger";

export type PeekSummary = {
  entity: RecordEntity;
  id: string;
  href: string;
  title: string;
  /** CRMD-0142, DEAL-0039 — the thing people quote at each other. */
  reference: string | null;
  /** Where it stands, when that means anything for this entity. */
  status: { label: string; tone: PeekTone } | null;
  /** The line under the title: a company, a job title, a town. */
  subtitle: string | null;
  properties: Array<{ label: string; value: string }>;
  /** Archived records are still reachable by link, and should say so. */
  archived: boolean;
};

const money = (value: number | null | undefined, currency: string | null | undefined) =>
  value == null
    ? null
    : `${currency ?? "USD"} ${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);

/** Drop the properties that have no answer rather than printing "—" five times. */
const kept = (rows: Array<{ label: string; value: string | null | undefined }>) =>
  rows.filter((row): row is { label: string; value: string } => Boolean(row.value));

const LEAD_TONE: Record<string, PeekTone> = {
  NEW: "info",
  CONTACTED: "info",
  QUALIFIED: "info",
  SITE_VISIT: "info",
  QUOTED: "warn",
  INVOICED: "warn",
  WON: "success",
  LOST: "danger",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { entity, id } = await params;

    if (!RECORD_ENTITIES.includes(entity as RecordEntity)) {
      return errorResponse("Unknown record type", 400);
    }
    const companyId = session.user.companyId;
    const kind = entity as RecordEntity;

    if (kind === "deal") {
      const deal = await prisma.crmDeal.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          dealNo: true,
          title: true,
          value: true,
          currency: true,
          expectedCloseDate: true,
          archivedAt: true,
          stage: { select: { name: true, status: true } },
          client: { select: { name: true } },
          primaryContact: { select: { fullName: true } },
          site: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
      });
      if (!deal) return errorResponse("Deal not found", 404);
      return successResponse<PeekSummary>({
        entity: kind,
        id: deal.id,
        href: `/crm/deals/${deal.id}`,
        title: deal.title,
        reference: deal.dealNo,
        status: deal.stage
          ? {
              label: deal.stage.name,
              tone:
                deal.stage.status === "WON"
                  ? "success"
                  : deal.stage.status === "LOST"
                    ? "danger"
                    : "info",
            }
          : null,
        subtitle: deal.client?.name ?? null,
        properties: kept([
          { label: "Value", value: money(deal.value, deal.currency) },
          { label: "Owner", value: deal.assignedTo?.name },
          { label: "Contact", value: deal.primaryContact?.fullName },
          { label: "Site", value: deal.site?.name },
          { label: "Expected close", value: day(deal.expectedCloseDate) },
        ]),
        archived: Boolean(deal.archivedAt),
      });
    }

    if (kind === "lead") {
      const lead = await prisma.crmLead.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          leadNo: true,
          title: true,
          contactName: true,
          stage: true,
          estimatedValue: true,
          currency: true,
          source: true,
          archivedAt: true,
          client: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
      });
      if (!lead) return errorResponse("Lead not found", 404);
      return successResponse<PeekSummary>({
        entity: kind,
        id: lead.id,
        href: `/crm/leads/${lead.id}`,
        title: lead.title ?? lead.contactName ?? lead.leadNo,
        reference: lead.leadNo,
        status: {
          label: lead.stage.replace(/_/g, " ").toLowerCase(),
          tone: LEAD_TONE[lead.stage] ?? "neutral",
        },
        subtitle: lead.client?.name ?? lead.contactName ?? null,
        properties: kept([
          { label: "Value", value: money(lead.estimatedValue, lead.currency) },
          { label: "Owner", value: lead.assignedTo?.name },
          { label: "Source", value: lead.source },
        ]),
        archived: Boolean(lead.archivedAt),
      });
    }

    if (kind === "company") {
      const client = await prisma.crmClient.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          clientNo: true,
          name: true,
          industry: true,
          city: true,
          country: true,
          email: true,
          phone: true,
          archivedAt: true,
          assignedTo: { select: { name: true } },
          _count: { select: { deals: true, people: true, sites: true } },
        },
      });
      if (!client) return errorResponse("Company not found", 404);
      return successResponse<PeekSummary>({
        entity: kind,
        id: client.id,
        href: `/crm/companies/${client.id}`,
        title: client.name,
        reference: client.clientNo,
        status: null,
        subtitle: [client.industry, client.city].filter(Boolean).join(" · ") || null,
        properties: kept([
          { label: "Owner", value: client.assignedTo?.name },
          { label: "Email", value: client.email },
          { label: "Phone", value: client.phone },
          {
            label: "On the books",
            value:
              client._count.deals || client._count.people || client._count.sites
                ? [
                    client._count.deals ? `${client._count.deals} deals` : null,
                    client._count.people ? `${client._count.people} people` : null,
                    client._count.sites ? `${client._count.sites} sites` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null,
          },
        ]),
        archived: Boolean(client.archivedAt),
      });
    }

    if (kind === "person") {
      const person = await prisma.crmPerson.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          personNo: true,
          fullName: true,
          jobTitle: true,
          email: true,
          phone: true,
          city: true,
          archivedAt: true,
          client: { select: { name: true } },
        },
      });
      if (!person) return errorResponse("Person not found", 404);
      return successResponse<PeekSummary>({
        entity: kind,
        id: person.id,
        href: `/crm/people/${person.id}`,
        title: person.fullName,
        reference: person.personNo,
        status: null,
        subtitle: [person.jobTitle, person.client?.name].filter(Boolean).join(" · ") || null,
        properties: kept([
          { label: "Email", value: person.email },
          { label: "Phone", value: person.phone },
          { label: "Town", value: person.city },
        ]),
        archived: Boolean(person.archivedAt),
      });
    }

    if (kind === "site") {
      const site = await prisma.crmSite.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          siteNo: true,
          name: true,
          addressLine: true,
          city: true,
          archivedAt: true,
          client: { select: { name: true } },
          primaryContact: { select: { fullName: true } },
          _count: { select: { deals: true, appointments: true } },
        },
      });
      if (!site) return errorResponse("Site not found", 404);
      return successResponse<PeekSummary>({
        entity: kind,
        id: site.id,
        href: `/crm/sites/${site.id}`,
        title: site.name,
        reference: site.siteNo,
        status: null,
        subtitle: site.client?.name ?? null,
        properties: kept([
          { label: "Address", value: [site.addressLine, site.city].filter(Boolean).join(", ") },
          { label: "Contact", value: site.primaryContact?.fullName },
          { label: "Deals", value: site._count.deals ? String(site._count.deals) : null },
          {
            label: "Visits",
            value: site._count.appointments ? String(site._count.appointments) : null,
          },
        ]),
        archived: Boolean(site.archivedAt),
      });
    }

    // A rep is a colleague, and lives in `User` rather than in a CRM table.
    const rep = await prisma.user.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!rep) return errorResponse("Rep not found", 404);
    return successResponse<PeekSummary>({
      entity: "rep",
      id: rep.id,
      href: `/crm/reps/${rep.id}`,
      title: rep.name ?? rep.email ?? "Colleague",
      reference: null,
      status: rep.isActive ? null : { label: "Inactive", tone: "neutral" },
      subtitle: rep.role ? rep.role.replace(/_/g, " ").toLowerCase() : null,
      properties: kept([{ label: "Email", value: rep.email }]),
      archived: false,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/records/[entity]/[id]/summary error:", error);
    return errorResponse("Failed to load record", 500);
  }
}
