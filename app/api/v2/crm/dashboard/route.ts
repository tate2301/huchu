import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { hasCrmFullAccess } from "@/lib/crm/scope";
import { ageingBucket } from "@/lib/crm/collections";
import { ensureDefaultPipeline } from "@/lib/crm/pipelines";
import { stageSla, workingMinutesBetween } from "@/lib/crm/sla";

/**
 * Everything the CRM home needs, in one round trip.
 *
 * The old summary answered three questions — open leads, weighted pipeline,
 * overdue follow-ups — and ignored deals, quotes, invoices, work orders and
 * site visits entirely. Someone opening the module could not tell whether
 * anything needed them today. This answers the whole lifecycle: what is in
 * flight, what is owed to a customer, what is owed to us, and what is booked.
 *
 * Deltas are computed against a single "previous period" boundary here rather
 * than in each caller, so the dashboard and the report cannot disagree.
 */

/** A rep sees their own numbers; a manager sees the team's. */
function ownerScope(userId: string, isManager: boolean) {
  return isManager ? {} : { assignedToId: userId };
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyId = session.user.companyId;
    const isManager = hasCrmFullAccess(session.user.role);
    const scope = ownerScope(session.user.id, isManager);

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const periodDays = 30;
    const periodStart = new Date(now.getTime() - periodDays * 24 * 3600 * 1000);
    const previousStart = new Date(now.getTime() - 2 * periodDays * 24 * 3600 * 1000);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    // A company always has at least the default pipeline; the board, the deal
    // form and this dashboard all assume one exists.
    await prisma.$transaction((tx) => ensureDefaultPipeline(tx, companyId));

    const [
      openDeals,
      wonDealsPeriod,
      wonThisPeriod,
      wonPreviousPeriod,
      lostThisPeriod,
      stages,
      taskCounts,
      legacyOverdue,
      quotations,
      quotesWithCustomers,
      openLeads,
      recentLeads,
      answeredLeads,
      openInvoices,
      workOrders,
      projects,
      upcomingVisits,
      todayVisits,
      overdueVisits,
      pendingApprovals,
    ] = await Promise.all([
      prisma.crmDeal.findMany({
        where: { companyId, status: "OPEN", archivedAt: null, ...scope },
        select: {
          id: true,
          value: true,
          currency: true,
          probability: true,
          source: true,
          sourceChannel: true,
          services: true,
          stageId: true,
          stageEnteredAt: true,
          expectedCloseDate: true,
          stage: { select: { id: true, name: true, position: true, inactivityDays: true } },
        },
      }),

      prisma.crmDeal.findMany({
        where: { companyId, wonAt: { gte: periodStart }, ...scope },
        select: {
          id: true,
          value: true,
          currency: true,
          source: true,
          sourceChannel: true,
          services: true,
        },
      }),

      prisma.crmDeal.aggregate({
        where: { companyId, wonAt: { gte: periodStart }, ...scope },
        _count: { _all: true },
        _sum: { value: true },
      }),
      prisma.crmDeal.aggregate({
        where: { companyId, wonAt: { gte: previousStart, lt: periodStart }, ...scope },
        _count: { _all: true },
        _sum: { value: true },
      }),
      prisma.crmDeal.count({
        where: { companyId, lostAt: { gte: periodStart }, ...scope },
      }),

      prisma.crmPipelineStage.findMany({
        where: { pipeline: { companyId, isDefault: true }, archivedAt: null },
        select: { id: true, name: true, position: true, status: true },
        orderBy: { position: "asc" },
      }),

      prisma.crmTask.groupBy({
        by: ["status"],
        where: { companyId, ...(isManager ? {} : { assignedToId: session.user.id }) },
        _count: { _all: true },
      }),

      prisma.crmFollowUp.count({
        where: {
          companyId,
          status: "PENDING",
          dueAt: { lt: now },
          ...(isManager ? {} : { assignedToId: session.user.id }),
        },
      }),

      prisma.crmLeadDocument.findMany({
        where: { companyId, type: "QUOTATION", createdAt: { gte: periodStart } },
        select: {
          id: true,
          amount: true,
          currency: true,
          // A quotation's state lives on its approval record, not the document.
          approval: { select: { status: true } },
        },
      }),

      // Every quote still sitting with a customer, not just the ones raised
      // inside the reporting window. A quote sent seven weeks ago and never
      // answered is exactly the one worth chasing, and the 30-day cut was
      // hiding it.
      prisma.crmLeadDocument.findMany({
        where: {
          companyId,
          type: "QUOTATION",
          approval: { status: "PENDING" },
        },
        select: { id: true, amount: true, currency: true, createdAt: true },
      }),

      // Leads nobody has answered yet. Deliberately the first-contact clock
      // and nothing else: later stages measure from when the lead entered
      // them, which is only recoverable from the activity log, and a
      // dashboard tile is not worth that join. This is the one the business
      // actually runs on — a new enquiry gets answered inside the half hour.
      prisma.crmLead.findMany({
        where: {
          companyId,
          stage: { notIn: ["WON", "LOST"] },
          firstContactAt: null,
          // A lead somebody put away is not waiting on a reply, and one that
          // became a deal is being worked as the deal. Neither is an
          // unanswered enquiry, which is what this tile counts.
          archivedAt: null,
          ...scope,
        },
        select: { id: true, createdAt: true },
      }),

      // Recent active leads for source channel and service line attribution
      prisma.crmLead.findMany({
        where: {
          companyId,
          archivedAt: null,
          convertedDealId: null,
          stage: { notIn: ["LOST"] },
          ...scope,
        },
        select: {
          id: true,
          estimatedValue: true,
          currency: true,
          source: true,
          sourceChannel: true,
          services: true,
        },
      }),

      // How fast we actually answered, over the period. Only leads that were
      // answered count — an unanswered lead has no response time, and folding
      // it in as a zero would flatter the number.
      prisma.crmLead.findMany({
        where: {
          companyId,
          createdAt: { gte: periodStart },
          firstContactAt: { not: null },
          ...scope,
        },
        select: { createdAt: true, firstContactAt: true },
      }),

      prisma.salesInvoice.findMany({
        where: {
          companyId,
          status: { notIn: ["PAID", "VOIDED"] },
          // Only invoices that came out of the CRM belong on the CRM's home.
          quotationId: { not: null },
        },
        select: { id: true, total: true, amountPaid: true, dueDate: true, currency: true },
      }),

      prisma.crmWorkOrder.groupBy({
        by: ["status"],
        where: { companyId },
        _count: { _all: true },
      }),

      prisma.crmProject.findMany({
        where: { companyId },
        select: { status: true, budget: true, currency: true },
      }),

      prisma.crmAppointment.count({
        where: {
          companyId,
          status: "SCHEDULED",
          scheduledStart: { gte: now, lte: weekAhead },
          ...(isManager ? {} : { assignedToId: session.user.id }),
        },
      }),

      prisma.crmAppointment.count({
        where: {
          companyId,
          status: "SCHEDULED",
          scheduledStart: { gte: startOfToday, lt: endOfToday },
          ...(isManager ? {} : { assignedToId: session.user.id }),
        },
      }),

      prisma.crmAppointment.count({
        where: {
          companyId,
          status: "SCHEDULED",
          scheduledStart: { lt: now },
          ...(isManager ? {} : { assignedToId: session.user.id }),
        },
      }),

      prisma.crmDiscountApproval.count({
        where: { companyId, status: "PENDING" },
      }),
    ]);

    const grossValue = openDeals.reduce((sum, deal) => sum + (deal.value ?? 0), 0);
    const weightedValue = Math.round(
      openDeals.reduce(
        (sum, deal) => sum + (deal.value ?? 0) * (Math.min(100, Math.max(0, deal.probability ?? 50)) / 100),
        0,
      ),
    );

    // "Stale" is the stage's own inactivity budget, not a global number — a
    // deal can sit in Quoted for a fortnight and be fine, but three days in New
    // is not.
    const stale = openDeals.filter((deal) => {
      const days = deal.stage.inactivityDays;
      if (!days) return false;
      return now.getTime() - deal.stageEnteredAt.getTime() > days * 24 * 3600 * 1000;
    });

    const closingThisWeek = openDeals.filter(
      (deal) => deal.expectedCloseDate && deal.expectedCloseDate <= weekAhead,
    );
    const closingThisWeekValue = closingThisWeek.reduce((sum, deal) => sum + (deal.value ?? 0), 0);

    const byStage = stages.map((stage) => {
      const deals = openDeals.filter((deal) => deal.stageId === stage.id);
      return {
        id: stage.id,
        name: stage.name,
        status: stage.status,
        count: deals.length,
        value: deals.reduce((sum, deal) => sum + (deal.value ?? 0), 0),
        weightedValue: Math.round(
          deals.reduce(
            (sum, deal) => sum + (deal.value ?? 0) * (Math.min(100, Math.max(0, deal.probability ?? 50)) / 100),
            0,
          ),
        ),
      };
    });

    // Normalize Zimbabwean lead & deal sources into clear acquisition channels
    const classifyChannel = (source: string | null | undefined, channel: string | null | undefined): { key: string; label: string } => {
      const raw = `${source ?? ""} ${channel ?? ""}`.toLowerCase();
      if (raw.includes("whatsapp") || raw.includes("wa ") || raw.includes("phone") || raw.includes("call")) {
        return { key: "whatsapp", label: "WhatsApp & direct calls" };
      }
      if (channel === "REFERRAL" || raw.includes("refer") || raw.includes("word of mouth") || raw.includes("client") || raw.includes("repeat")) {
        return { key: "referral", label: "Referrals & repeat clients" };
      }
      if (raw.includes("walk") || raw.includes("showroom") || raw.includes("workshop") || raw.includes("branch") || raw.includes("site")) {
        return { key: "walkin", label: "Walk-in, showroom & site" };
      }
      if (channel === "SOCIAL" || channel === "ADS" || raw.includes("facebook") || raw.includes("instagram") || raw.includes("linkedin") || raw.includes("tiktok") || raw.includes("ads")) {
        return { key: "social", label: "Facebook, Instagram & ads" };
      }
      if (channel === "WEB_FORM" || channel === "WEBHOOK" || raw.includes("web") || raw.includes("email") || raw.includes("form")) {
        return { key: "web", label: "Website & online forms" };
      }
      if (raw.includes("tender") || raw.includes("rfq") || raw.includes("rfp") || raw.includes("bid")) {
        return { key: "tender", label: "Tenders & RFQ invitations" };
      }
      return { key: "direct", label: "Direct & outbound sales" };
    };

    const sourceMap = new Map<string, { key: string; label: string; count: number; value: number }>();
    for (const deal of [...openDeals, ...wonDealsPeriod]) {
      const ch = classifyChannel(deal.source, deal.sourceChannel);
      const entry = sourceMap.get(ch.key) ?? { key: ch.key, label: ch.label, count: 0, value: 0 };
      entry.count += 1;
      entry.value += deal.value ?? 0;
      sourceMap.set(ch.key, entry);
    }
    for (const lead of recentLeads) {
      const ch = classifyChannel(lead.source, lead.sourceChannel);
      const entry = sourceMap.get(ch.key) ?? { key: ch.key, label: ch.label, count: 0, value: 0 };
      entry.count += 1;
      entry.value += lead.estimatedValue ?? 0;
      sourceMap.set(ch.key, entry);
    }
    const totalSourceValue = [...sourceMap.values()].reduce((sum, item) => sum + item.value, 0);
    const totalSourceCount = [...sourceMap.values()].reduce((sum, item) => sum + item.count, 0);
    const sources = [...sourceMap.values()]
      .sort((a, b) => b.value - a.value || b.count - a.count)
      .map((item) => ({
        ...item,
        share:
          totalSourceValue > 0
            ? Math.round((item.value / totalSourceValue) * 100)
            : totalSourceCount > 0
              ? Math.round((item.count / totalSourceCount) * 100)
              : 0,
      }));

    // Service lines / Practice areas / Workshop categories
    const serviceMap = new Map<string, { label: string; count: number; value: number }>();
    for (const deal of [...openDeals, ...wonDealsPeriod]) {
      const tags = deal.services?.length ? deal.services : [];
      for (const rawTag of tags) {
        const label = rawTag.trim();
        if (!label) continue;
        const key = label.toLowerCase();
        const entry = serviceMap.get(key) ?? { label, count: 0, value: 0 };
        entry.count += 1;
        entry.value += deal.value ?? 0;
        serviceMap.set(key, entry);
      }
    }
    for (const lead of recentLeads) {
      const tags = lead.services?.length ? lead.services : [];
      for (const rawTag of tags) {
        const label = rawTag.trim();
        if (!label) continue;
        const key = label.toLowerCase();
        const entry = serviceMap.get(key) ?? { label, count: 0, value: 0 };
        entry.count += 1;
        entry.value += lead.estimatedValue ?? 0;
        serviceMap.set(key, entry);
      }
    }
    const totalServiceValue = [...serviceMap.values()].reduce((sum, item) => sum + item.value, 0);
    const totalServiceCount = [...serviceMap.values()].reduce((sum, item) => sum + item.count, 0);
    const services = [...serviceMap.values()]
      .sort((a, b) => b.value - a.value || b.count - a.count)
      .slice(0, 6)
      .map((item) => ({
        ...item,
        share:
          totalServiceValue > 0
            ? Math.round((item.value / totalServiceValue) * 100)
            : totalServiceCount > 0
              ? Math.round((item.count / totalServiceCount) * 100)
              : 0,
      }));

    const taskByStatus = Object.fromEntries(
      taskCounts.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;

    const [tasksOverdue, tasksToday] = await Promise.all([
      prisma.crmTask.count({
        where: {
          companyId,
          status: "OPEN",
          dueAt: { lt: startOfToday },
          ...(isManager ? {} : { assignedToId: session.user.id }),
        },
      }),
      prisma.crmTask.count({
        where: {
          companyId,
          status: "OPEN",
          dueAt: { gte: startOfToday, lt: endOfToday },
          ...(isManager ? {} : { assignedToId: session.user.id }),
        },
      }),
    ]);

    const balanceOf = (invoice: { total: number; amountPaid: number }) =>
      Math.max(0, invoice.total - invoice.amountPaid);

    const receivable = openInvoices.reduce((sum, invoice) => sum + balanceOf(invoice), 0);
    const overdueReceivable = openInvoices
      .filter((invoice) => invoice.dueDate && invoice.dueDate < now)
      .reduce((sum, invoice) => sum + balanceOf(invoice), 0);

    const ageing = openInvoices.reduce<Record<string, { count: number; value: number }>>(
      (buckets, invoice) => {
        const bucket = ageingBucket(invoice.dueDate ?? now, now);
        const row = buckets[bucket] ?? { count: 0, value: 0 };
        row.count += 1;
        row.value += balanceOf(invoice);
        buckets[bucket] = row;
        return buckets;
      },
      {},
    );

    const workOrderByStatus = Object.fromEntries(
      workOrders.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;

    const projectByStatus = projects.reduce<Record<string, number>>((acc, proj) => {
      acc[proj.status] = (acc[proj.status] ?? 0) + 1;
      return acc;
    }, {});
    const activeProjectBudget = projects
      .filter((proj) => proj.status === "PLANNING" || proj.status === "ACTIVE")
      .reduce((sum, proj) => sum + Number(proj.budget ?? 0), 0);

    const wonValue = wonThisPeriod._sum.value ?? 0;
    const previousWonValue = wonPreviousPeriod._sum.value ?? 0;
    const avgDealSize =
      wonThisPeriod._count._all > 0
        ? Math.round(wonValue / wonThisPeriod._count._all)
        : openDeals.length > 0
          ? Math.round(grossValue / openDeals.length)
          : 0;

    // Counted in working hours, so a lead that arrived at five on Friday is
    // not half a week late by Monday morning.
    const firstContactStates = openLeads.map((lead) => stageSla("NEW", lead.createdAt, now));
    const breachedLeads = firstContactStates.filter((state) => state.breached);
    const atRiskLeads = firstContactStates.filter((state) => state.atRisk);

    // Median, not mean: one lead answered three weeks late drags an average
    // somewhere no actual lead has ever been.
    const responseMinutes = answeredLeads
      .map((lead) =>
        workingMinutesBetween(lead.createdAt, lead.firstContactAt as Date),
      )
      .sort((a, b) => a - b);
    const medianResponseMinutes =
      responseMinutes.length === 0
        ? null
        : Math.round(responseMinutes[Math.floor(responseMinutes.length / 2)]);

    const closedThisPeriod = wonThisPeriod._count._all + lostThisPeriod;

    // The currency most of the open money is actually in, plus a multi-currency
    // breakdown (USD / ZWG / ZAR) for Zimbabwean dual-currency operations.
    const currencyTally = new Map<string, number>();
    for (const doc of [...quotesWithCustomers, ...openInvoices, ...openDeals]) {
      const code = (doc.currency || "USD").toUpperCase();
      currencyTally.set(code, (currencyTally.get(code) ?? 0) + 1);
    }
    const currency =
      [...currencyTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

    const currencyBookMap = new Map<
      string,
      {
        code: string;
        openDeals: number;
        pipelineValue: number;
        quotesValue: number;
        receivableValue: number;
        wonValue: number;
      }
    >();
    const ensureCurrencyRow = (rawCode: string | null | undefined) => {
      const code = (rawCode || currency || "USD").toUpperCase();
      let row = currencyBookMap.get(code);
      if (!row) {
        row = { code, openDeals: 0, pipelineValue: 0, quotesValue: 0, receivableValue: 0, wonValue: 0 };
        currencyBookMap.set(code, row);
      }
      return row;
    };
    for (const deal of openDeals) {
      const row = ensureCurrencyRow(deal.currency);
      row.openDeals += 1;
      row.pipelineValue += deal.value ?? 0;
    }
    for (const deal of wonDealsPeriod) {
      const row = ensureCurrencyRow(deal.currency);
      row.wonValue += deal.value ?? 0;
    }
    for (const quote of quotesWithCustomers) {
      const row = ensureCurrencyRow(quote.currency);
      row.quotesValue += quote.amount ?? 0;
    }
    for (const inv of openInvoices) {
      const row = ensureCurrencyRow(inv.currency);
      row.receivableValue += balanceOf(inv);
    }
    if (currencyBookMap.size === 0) {
      ensureCurrencyRow(currency);
    }
    const currencies = [...currencyBookMap.values()].sort(
      (a, b) =>
        b.pipelineValue + b.receivableValue + b.quotesValue -
        (a.pipelineValue + a.receivableValue + a.quotesValue),
    );

    return successResponse({
      scope: isManager ? "TEAM" : "MINE",
      periodDays,
      currency,
      currencies,
      pipeline: {
        openDeals: openDeals.length,
        grossValue,
        weightedValue,
        byStage,
        stale: stale.length,
        closingThisWeek: closingThisWeek.length,
        closingThisWeekValue,
      },
      won: {
        count: wonThisPeriod._count._all,
        value: wonValue,
        lost: lostThisPeriod,
        avgDealSize,
        // Null rather than 0% when there is no baseline — a fabricated
        // "+100%" against nothing is worse than saying nothing.
        valueDeltaPercent:
          previousWonValue > 0
            ? Math.round(((wonValue - previousWonValue) / previousWonValue) * 100)
            : null,
        previousValue: previousWonValue,
        // Of everything that actually closed in the period. Counting open
        // deals in the denominator would make the rate fall every time
        // somebody added a lead, which is the opposite of the truth.
        winRatePercent:
          closedThisPeriod > 0
            ? Math.round((wonThisPeriod._count._all / closedThisPeriod) * 100)
            : null,
        closed: closedThisPeriod,
      },
      sources,
      services,
      speed: {
        breachedLeads: breachedLeads.length,
        atRiskLeads: atRiskLeads.length,
        medianResponseMinutes,
        answered: answeredLeads.length,
      },
      tasks: {
        overdue: tasksOverdue,
        today: tasksToday,
        open: taskByStatus.OPEN ?? 0,
        legacyOverdue,
      },
      documents: {
        quotationsRaised: quotations.length,
        quotedValue: quotations.reduce((sum, doc) => sum + doc.amount, 0),
        awaitingApproval: quotesWithCustomers.length,
        awaitingValue: quotesWithCustomers.reduce((sum, doc) => sum + doc.amount, 0),
        // The oldest quote nobody has answered — the number that says whether
        // "awaiting a decision" means "sent this morning" or "forgotten".
        oldestAwaitingDays:
          quotesWithCustomers.length === 0
            ? null
            : Math.floor(
                (now.getTime() -
                  Math.min(...quotesWithCustomers.map((doc) => doc.createdAt.getTime()))) /
                  (24 * 3600 * 1000),
              ),
        pendingDiscountApprovals: pendingApprovals,
      },
      collections: {
        outstanding: receivable,
        overdue: overdueReceivable,
        invoiceCount: openInvoices.length,
        ageing,
      },
      delivery: {
        workOrders: workOrderByStatus,
        projects: projectByStatus,
        activeProjectBudget,
        upcomingVisits,
        todayVisits,
        overdueVisits,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/dashboard error:", error);
    return errorResponse("Failed to build the dashboard");
  }
}
