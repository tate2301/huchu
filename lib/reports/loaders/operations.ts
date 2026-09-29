import { prisma } from "@/lib/prisma";
import { dateRange } from "@/lib/reports/params";
import { day, label, num, personName, result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportParams } from "@/lib/reports/types";

/**
 * The mine's rows. Every query is held to the company through its site, the
 * way the old report pages' own API routes held them.
 */

async function siteOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const sites = await prisma.site.findMany({
    where: { companyId: ctx.companyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { site: [{ value: "all", label: "All sites" }, ...sites.map((site) => ({ value: site.id, label: site.name }))] };
}

/** A site filter, or none for "all". */
function siteWhere(params: ReportParams) {
  return params.site && params.site !== "all" ? { id: params.site } : {};
}

const withSites = (load: ReportLoader["load"]): ReportLoader => ({ load, options: siteOptions });

async function loadShift(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.shiftReport.findMany({
    where: { site: { companyId: ctx.companyId, ...siteWhere(params) }, date: dateRange(params) },
    select: {
      id: true,
      date: true,
      shift: true,
      workType: true,
      crewCount: true,
      outputTonnes: true,
      outputTrips: true,
      metresAdvanced: true,
      hasIncident: true,
      status: true,
      site: { select: { name: true } },
      section: { select: { name: true } },
      shiftGroup: { select: { name: true } },
      groupLeader: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: TAKE,
  });
  return result(
    found.map((report) => ({
      id: report.id,
      date: day(report.date),
      shift: report.shift,
      site: report.site.name,
      section: report.section?.name ?? null,
      group: report.shiftGroup?.name ?? null,
      leader: report.groupLeader.name,
      workType: label(report.workType),
      crew: report.crewCount,
      tonnes: report.outputTonnes,
      trips: report.outputTrips,
      metres: report.metresAdvanced,
      incident: report.hasIncident ? "Incident" : null,
      status: label(report.status),
    })),
  );
}

async function loadAttendance(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.attendance.findMany({
    where: {
      companyId: ctx.companyId,
      date: dateRange(params),
      ...(params.site && params.site !== "all" ? { siteId: params.site } : {}),
    },
    select: {
      id: true,
      date: true,
      shift: true,
      status: true,
      overtime: true,
      notes: true,
      shiftLeaderName: true,
      site: { select: { name: true } },
      shiftGroup: { select: { name: true } },
      employee: { select: { name: true, employeeId: true } },
    },
    orderBy: { date: "desc" },
    take: TAKE,
  });
  return result(
    found.map((record) => ({
      id: record.id,
      date: day(record.date),
      employee: record.employee.name,
      employeeNo: record.employee.employeeId,
      shift: record.shift,
      site: record.site?.name ?? null,
      group: record.shiftGroup?.name ?? null,
      leader: record.shiftLeaderName,
      status: label(record.status),
      // The code the correction form starts from; the column shows the word.
      statusCode: record.status,
      overtime: record.overtime,
      notes: record.notes,
    })),
  );
}

async function loadPlant(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.plantReport.findMany({
    where: { site: { companyId: ctx.companyId, ...siteWhere(params) }, date: dateRange(params) },
    select: {
      id: true,
      date: true,
      tonnesFed: true,
      tonnesProcessed: true,
      runHours: true,
      dieselUsed: true,
      goldRecovered: true,
      status: true,
      site: { select: { name: true } },
      reportedBy: { select: { name: true, email: true } },
      downtimeEvents: { select: { durationHours: true } },
    },
    orderBy: { date: "desc" },
    take: TAKE,
  });
  return result(
    found.map((report) => ({
      id: report.id,
      date: day(report.date),
      site: report.site.name,
      tonnesFed: report.tonnesFed,
      tonnes: report.tonnesProcessed,
      runHours: report.runHours,
      downtime: report.downtimeEvents.reduce((total, event) => total + event.durationHours, 0),
      diesel: report.dieselUsed,
      gold: report.goldRecovered,
      status: label(report.status),
      reportedBy: personName(report.reportedBy),
    })),
  );
}

async function loadDowntime(ctx: ReportContext, params: ReportParams) {
  const range = dateRange(params);
  const site = { companyId: ctx.companyId, ...siteWhere(params) };
  const found = await prisma.downtimeEvent.findMany({
    where: {
      OR: [
        { plantReport: { site, date: range } },
        { shiftReport: { site, date: range } },
      ],
    },
    select: {
      id: true,
      durationHours: true,
      notes: true,
      downtimeCode: { select: { code: true, description: true } },
      plantReport: { select: { date: true, site: { select: { name: true } } } },
      shiftReport: { select: { date: true, shift: true, site: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((event) => {
      const from = event.plantReport ?? event.shiftReport;
      return {
        id: event.id,
        date: day(from?.date),
        site: from?.site.name ?? null,
        cause: event.downtimeCode.description,
        code: event.downtimeCode.code,
        from: event.plantReport ? "Plant report" : event.shiftReport ? `${event.shiftReport.shift} shift` : null,
        hours: event.durationHours,
        notes: event.notes,
      };
    }),
  );
}

async function loadGoldChain(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.goldPour.findMany({
    where: { site: { companyId: ctx.companyId, ...siteWhere(params) }, pourDate: dateRange(params) },
    select: {
      id: true,
      pourBarId: true,
      pourDate: true,
      grossWeight: true,
      estimatedPurity: true,
      valueUsd: true,
      site: { select: { name: true } },
      dispatches: {
        select: {
          dispatchDate: true,
          destination: true,
          buyerReceipts: { select: { receiptNumber: true, paidAmount: true } },
        },
        orderBy: { dispatchDate: "desc" },
        take: 1,
      },
      receipts: { select: { receiptNumber: true, paidAmount: true }, take: 1 },
    },
    orderBy: { pourDate: "desc" },
    take: TAKE,
  });
  return result(
    found.map((pour) => {
      const dispatch = pour.dispatches[0] ?? null;
      const receipt = dispatch?.buyerReceipts[0] ?? pour.receipts[0] ?? null;
      return {
        id: pour.id,
        bar: pour.pourBarId,
        poured: day(pour.pourDate),
        site: pour.site.name,
        grams: num(pour.grossWeight),
        purity: num(pour.estimatedPurity),
        stage: receipt ? "Settled" : dispatch ? "In transit" : "In storage",
        dispatched: day(dispatch?.dispatchDate),
        destination: dispatch?.destination ?? null,
        receipt: receipt?.receiptNumber ?? null,
        paid: num(receipt?.paidAmount),
        value: num(pour.valueUsd),
      };
    }),
  );
}

async function loadGoldReceipts(ctx: ReportContext, params: ReportParams) {
  const company = { site: { companyId: ctx.companyId } };
  const found = await prisma.buyerReceipt.findMany({
    where: {
      receiptDate: dateRange(params),
      OR: [{ goldPour: company }, { goldDispatch: { goldPour: company } }],
    },
    select: {
      id: true,
      receiptNumber: true,
      receiptDate: true,
      assayResult: true,
      paidAmount: true,
      paymentMethod: true,
      paymentChannel: true,
      paymentReference: true,
      goldPriceUsdPerGram: true,
      goldPour: { select: { pourBarId: true } },
      goldDispatch: { select: { goldPour: { select: { pourBarId: true } } } },
    },
    orderBy: { receiptDate: "desc" },
    take: TAKE,
  });
  return result(
    found.map((receipt) => ({
      id: receipt.id,
      receipt: receipt.receiptNumber,
      date: day(receipt.receiptDate),
      bar: receipt.goldPour?.pourBarId ?? receipt.goldDispatch?.goldPour.pourBarId ?? null,
      assay: num(receipt.assayResult),
      paid: num(receipt.paidAmount),
      method: label(receipt.paymentMethod),
      channel: receipt.paymentChannel,
      reference: receipt.paymentReference,
      pricePerGram: num(receipt.goldPriceUsdPerGram),
    })),
  );
}

async function movements(ctx: ReportContext, params: ReportParams, category?: string) {
  return prisma.stockMovement.findMany({
    where: {
      createdAt: dateRange(params),
      item: { site: { companyId: ctx.companyId, ...siteWhere(params) }, ...(category ? { category } : {}) },
    },
    select: {
      id: true,
      referenceId: true,
      movementType: true,
      quantity: true,
      unit: true,
      issuedTo: true,
      createdAt: true,
      issuedBy: { select: { name: true, email: true } },
      item: {
        select: {
          name: true,
          itemCode: true,
          category: true,
          currentStock: true,
          site: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
}

/** Stock leaving is a negative quantity, so a sum is what the stock moved by. */
function signed(type: string, quantity: number | null): number | null {
  if (quantity === null) return null;
  return type === "ISSUE" ? -Math.abs(quantity) : quantity;
}

async function loadStoresMovements(ctx: ReportContext, params: ReportParams) {
  const found = await movements(ctx, params);
  return result(
    found.map((movement) => ({
      id: movement.id,
      date: day(movement.createdAt),
      reference: movement.referenceId,
      item: movement.item.name,
      itemCode: movement.item.itemCode,
      category: label(movement.item.category),
      type: label(movement.movementType),
      quantity: signed(movement.movementType, num(movement.quantity)),
      unit: movement.unit,
      site: movement.item.site.name,
      issuedTo: movement.issuedTo,
      by: personName(movement.issuedBy),
    })),
  );
}

async function loadFuelLedger(ctx: ReportContext, params: ReportParams) {
  const found = await movements(ctx, params, "FUEL");
  return result(
    found.map((movement) => ({
      id: movement.id,
      date: day(movement.createdAt),
      item: movement.item.name,
      type: label(movement.movementType),
      quantity: signed(movement.movementType, num(movement.quantity)),
      site: movement.item.site.name,
      issuedTo: movement.issuedTo,
      onHand: num(movement.item.currentStock),
    })),
  );
}

async function loadWorkOrders(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.workOrder.findMany({
    where: {
      equipment: { site: { companyId: ctx.companyId, ...siteWhere(params) } },
      downtimeStart: dateRange(params),
    },
    select: {
      id: true,
      issue: true,
      status: true,
      downtimeStart: true,
      downtimeEnd: true,
      partsCost: true,
      laborCost: true,
      equipment: { select: { name: true, equipmentCode: true } },
      technician: { select: { name: true } },
    },
    orderBy: { downtimeStart: "desc" },
    take: TAKE,
  });
  return result(
    found.map((order) => ({
      id: order.id,
      equipment: order.equipment.name,
      code: order.equipment.equipmentCode,
      issue: order.issue,
      status: label(order.status),
      down: day(order.downtimeStart),
      up: day(order.downtimeEnd),
      hours: order.downtimeEnd
        ? Math.round(((order.downtimeEnd.getTime() - order.downtimeStart.getTime()) / 3_600_000) * 10) / 10
        : null,
      technician: order.technician?.name ?? null,
      parts: order.partsCost,
      labour: order.laborCost,
    })),
  );
}

async function loadEquipment(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.equipment.findMany({
    where: { isActive: true, site: { companyId: ctx.companyId, ...siteWhere(params) } },
    select: {
      id: true,
      equipmentCode: true,
      name: true,
      category: true,
      numberOfItems: true,
      lastServiceDate: true,
      nextServiceDue: true,
      site: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: TAKE,
  });
  const today = new Date();
  const soon = new Date(today.getTime() + 7 * 86_400_000);
  return result(
    found.map((item) => ({
      id: item.id,
      code: item.equipmentCode,
      name: item.name,
      category: label(item.category),
      site: item.site.name,
      service: !item.nextServiceDue
        ? "No schedule"
        : item.nextServiceDue < today
          ? "Overdue"
          : item.nextServiceDue < soon
            ? "Due this week"
            : "In date",
      lastService: day(item.lastServiceDate),
      nextDue: day(item.nextServiceDue),
      count: item.numberOfItems,
    })),
  );
}

async function loadIncidents(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.incident.findMany({
    where: { site: { companyId: ctx.companyId, ...siteWhere(params) }, incidentDate: dateRange(params) },
    select: {
      id: true,
      incidentDate: true,
      incidentType: true,
      severity: true,
      description: true,
      actionsTaken: true,
      reportedBy: true,
      status: true,
      site: { select: { name: true } },
    },
    orderBy: { incidentDate: "desc" },
    take: TAKE,
  });
  return result(
    found.map((incident) => ({
      id: incident.id,
      date: day(incident.incidentDate),
      type: label(incident.incidentType),
      severity: label(incident.severity),
      site: incident.site.name,
      description: incident.description,
      actions: incident.actionsTaken,
      reportedBy: incident.reportedBy,
      status: label(incident.status),
    })),
  );
}

async function loadActivity(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.platformAuditEvent.findMany({
    where: { companyId: ctx.companyId, createdAt: dateRange(params) },
    select: { id: true, actor: true, eventType: true, entityType: true, entityId: true, reason: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((event) => ({
      id: event.id,
      when: day(event.createdAt),
      time: event.createdAt.toISOString().slice(11, 16),
      actor: event.actor,
      event: event.eventType,
      entity: label(event.entityType),
      entityId: event.entityId,
      reason: event.reason,
    })),
  );
}

export const OPERATIONS_LOADERS: Record<string, ReportLoader> = {
  shift: withSites(loadShift),
  attendance: withSites(loadAttendance),
  plant: withSites(loadPlant),
  downtime: withSites(loadDowntime),
  "gold-chain": withSites(loadGoldChain),
  "gold-receipts": { load: loadGoldReceipts },
  "stores-movements": withSites(loadStoresMovements),
  "fuel-ledger": withSites(loadFuelLedger),
  "maintenance-work-orders": withSites(loadWorkOrders),
  "maintenance-equipment": withSites(loadEquipment),
  "compliance-incidents": withSites(loadIncidents),
  "audit-trails": { load: loadActivity },
};
