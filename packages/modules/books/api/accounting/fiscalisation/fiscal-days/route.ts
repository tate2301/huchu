import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { hasRole } from "@corelithzw/platform/roles";
import {
  FISCAL_DAY_STATUS,
  FiscalDayAlreadyOpenError,
  FiscalDayConfigError,
  openFiscalDay,
} from "../../../../fiscal-day";
import {
  type BlockingReceiptRow,
  toBlockingReceiptWire,
} from "../../../../components/fiscalisation/receipt-mapping";
import type {
  FiscalDayFleetResponse,
  FiscalDayStatusWire,
  FiscalDayWire,
  FiscalDeviceWire,
} from "../../../../components/fiscalisation/types";

/**
 * FD-7.1 — every device's fiscal day, on one request.
 *
 * A supervisor of a two-site, three-till tenant has three ZIMRA devices and
 * therefore three independent day numbers, three counter lines and three ways
 * for the evening to go wrong. Making them open a console per till is how a day
 * gets left open overnight, and an open day that rolls past midnight is a
 * discrepancy ZIMRA raises against the taxpayer. So this route answers for the
 * whole fleet in one shot rather than being called once per device.
 *
 * **A device here is a `FiscalisationProviderConfig` row.** That is what
 * `FiscalDay.providerConfigId` points at, what `openFiscalDay` takes, and what
 * the `FiscalDay_one_open_per_device` partial unique index is scoped to — so it
 * is the only unit at which "is a day open?" has an answer. Site and till
 * labels are decoration on top of it, read best-effort from `metadataJson`
 * because `RetailRegister.siteId` is still a loose string (FD-7.2 owns making
 * it a relation). The device ID is the identifier that is always true; a label
 * is never invented when metadata does not carry one.
 *
 * No fiscal logic lives here. Opening is `openFiscalDay`, closing is the
 * sibling `[id]` route, and both refuse through the service's named errors —
 * this route only decides HTTP status and shape.
 */

/** Roles that run a shift and therefore open and close days. A CASHIER rings
 *  sales but does not sign off the Z-report. */
const MANAGE_ROLES = ["SUPERADMIN", "MANAGER", "SHOP_MANAGER", "FINANCE_OFFICER"] as const;

/**
 * How many blocking receipts each device lists.
 *
 * Capped because a device that lost the network for an hour can hold hundreds,
 * and a supervisor cannot act on hundreds anyway — the oldest few plus a true
 * total is what turns "cannot close" into a next action. The count beside the
 * list is always exact even when the list is cut, so the console never implies
 * four failures when there are forty.
 */
const BLOCKING_PREVIEW = 8;

const UNSUBMITTED_STATUSES = ["PENDING", "FAILED"] as const;

const openSchema = z.object({
  providerConfigId: z.string().uuid(),
});

type ProviderRow = {
  id: string;
  providerKey: string;
  deviceId: string | null;
  isActive: boolean;
  metadataJson: string | null;
};

type StatusCount = { status: string; _count: { _all: number } };

const BLOCKING_SELECT = {
  id: true,
  status: true,
  receiptNumber: true,
  fiscalNumber: true,
  receiptCounter: true,
  receiptGlobalNo: true,
  createdAt: true,
  lastError: true,
  attemptCount: true,
  nextRetryAt: true,
  invoiceId: true,
  schoolReceiptId: true,
  creditNoteId: true,
  retailSaleId: true,
  invoice: { select: { invoiceNumber: true } },
  schoolReceipt: { select: { receiptNo: true } },
  creditNote: { select: { noteNumber: true } },
  retailSale: { select: { saleNo: true } },
} as const;

/** Site hints a provider's metadata may carry. Nothing is required — a tenant
 *  that never filled metadata in still gets a usable console keyed on device. */
function readSiteHints(metadataJson: string | null): { siteId: string | null; label: string | null } {
  if (!metadataJson) return { siteId: null, label: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataJson);
  } catch {
    // Metadata is a free-text field on the config form. A typo in it is not a
    // reason to fail the whole fleet read.
    return { siteId: null, label: null };
  }
  if (typeof parsed !== "object" || parsed === null) return { siteId: null, label: null };
  const record = parsed as Record<string, unknown>;
  const str = (key: string) =>
    typeof record[key] === "string" && record[key] ? (record[key] as string) : null;
  return {
    siteId: str("siteId") ?? str("site_id"),
    label: str("siteName") ?? str("branch") ?? str("site") ?? str("location") ?? str("till"),
  };
}

function toDayWire(day: {
  id: string;
  fiscalDayNo: number;
  status: string;
  deviceId: string;
  openedAt: Date;
  closedAt: Date | null;
  lastReceiptCounter: number;
  lastReceiptGlobalNo: number;
  lastReceiptHash: string | null;
  lastError: string | null;
}): FiscalDayWire {
  return {
    id: day.id,
    fiscalDayNo: day.fiscalDayNo,
    status: day.status as FiscalDayStatusWire,
    deviceId: day.deviceId,
    openedAt: day.openedAt.toISOString(),
    closedAt: day.closedAt?.toISOString() ?? null,
    lastReceiptCounter: day.lastReceiptCounter,
    lastReceiptGlobalNo: day.lastReceiptGlobalNo,
    lastReceiptHash: day.lastReceiptHash,
    lastError: day.lastError,
  };
}

/** Why this device cannot be given a day right now, in the words the service
 *  would refuse with — computed here so the console can disable the button and
 *  say why, instead of offering an action guaranteed to fail. */
function openBlockedReason(provider: ProviderRow, activeDay: FiscalDayWire | null): string | null {
  if (activeDay) {
    return activeDay.status === FISCAL_DAY_STATUS.OPENED
      ? `Fiscal day ${activeDay.fiscalDayNo} is already open on this device`
      : `Fiscal day ${activeDay.fiscalDayNo} is still closing; finish its Z-report before opening another`;
  }
  if (!provider.isActive) return "This fiscalisation provider is not active";
  if (!provider.deviceId) return "No device ID — register the device with ZIMRA first";
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const providers: ProviderRow[] = await prisma.fiscalisationProviderConfig.findMany({
      where: { companyId },
      orderBy: [{ isActive: "desc" }, { providerKey: "asc" }],
      select: { id: true, providerKey: true, deviceId: true, isActive: true, metadataJson: true },
    });

    // The not-yet-closed day per device — the row the partial unique index
    // permits exactly one of, so one `findMany` over the whole fleet cannot
    // return two for the same device.
    const activeDays = await prisma.fiscalDay.findMany({
      where: { companyId, status: { not: FISCAL_DAY_STATUS.CLOSED } },
    });
    const activeByProvider = new Map(activeDays.map((day) => [day.providerConfigId, day]));

    const hints = providers.map((provider) => readSiteHints(provider.metadataJson));
    const siteIds = [...new Set(hints.map((h) => h.siteId).filter((id): id is string => Boolean(id)))];

    const sites = siteIds.length
      ? await prisma.site.findMany({
          where: { companyId, id: { in: siteIds } },
          select: { id: true, name: true },
        })
      : [];
    const registers = siteIds.length
      ? await prisma.retailRegister.findMany({
          where: { companyId, siteId: { in: siteIds }, isActive: true },
          orderBy: { code: "asc" },
          select: { siteId: true, code: true, name: true },
        })
      : [];

    const siteNameById = new Map(sites.map((site) => [site.id, site.name]));
    const registersBySite = new Map<string, string[]>();
    for (const register of registers) {
      const list = registersBySite.get(register.siteId) ?? [];
      list.push(`${register.code} — ${register.name}`);
      registersBySite.set(register.siteId, list);
    }

    // Per-device rather than one fleet-wide query: a global `take` would let a
    // device that failed a hundred receipts starve every other device out of
    // the preview, and the supervisor would see a clean console for a till that
    // is stuck. The device count is the number of registered ZIMRA devices in
    // one tenant — a handful of indexed reads, not an N+1 over rows.
    const devices: FiscalDeviceWire[] = await Promise.all(
      providers.map(async (provider, index): Promise<FiscalDeviceWire> => {
        const hint = hints[index];
        const active = activeByProvider.get(provider.id) ?? null;
        const activeDay = active ? toDayWire(active) : null;

        const lastClosed = await prisma.fiscalDay.findFirst({
          where: { companyId, providerConfigId: provider.id, status: FISCAL_DAY_STATUS.CLOSED },
          orderBy: { fiscalDayNo: "desc" },
          select: { id: true, fiscalDayNo: true, closedAt: true },
        });

        let statusCounts: StatusCount[] = [];
        let blocking: BlockingReceiptRow[] = [];
        if (active) {
          // Landed in an inferred local and mapped from there, rather than
          // assigned straight into `statusCounts`. Prisma intersects
          // `groupBy`'s argument type with whatever the result flows into, so
          // an annotated assignment target makes the *argument* fail to
          // typecheck against a shape that has grown array methods. Keeping the
          // inference one-directional avoids that without casting the call,
          // which would also stop `by: ["status"]` being checked at all.
          const grouped = await prisma.fiscalReceipt.groupBy({
            by: ["status"],
            where: { fiscalDayId: active.id },
            _count: { _all: true },
          });
          statusCounts = grouped.map((row) => ({
            status: row.status,
            _count: { _all: row._count._all },
          }));
          blocking = await prisma.fiscalReceipt.findMany({
            where: { fiscalDayId: active.id, status: { in: [...UNSUBMITTED_STATUSES] } },
            // Oldest first: the front of this list is both the thing to fix and
            // the age that says whether this is a blip or a whole lost shift.
            orderBy: { createdAt: "asc" },
            take: BLOCKING_PREVIEW,
            select: BLOCKING_SELECT,
          });
        }

        const countFor = (status: string) =>
          statusCounts.find((row) => row.status === status)?._count._all ?? 0;
        const pending = countFor("PENDING");
        const failed = countFor("FAILED");
        const total = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
        const blockingReceipts = blocking.map(toBlockingReceiptWire);

        return {
          providerConfigId: provider.id,
          providerKey: provider.providerKey,
          deviceId: provider.deviceId,
          isActive: provider.isActive,
          siteLabel: (hint.siteId ? (siteNameById.get(hint.siteId) ?? null) : null) ?? hint.label,
          siteId: hint.siteId,
          registerLabels: hint.siteId ? (registersBySite.get(hint.siteId) ?? []) : [],
          activeDay,
          lastClosedDay: lastClosed
            ? {
                id: lastClosed.id,
                fiscalDayNo: lastClosed.fiscalDayNo,
                closedAt: lastClosed.closedAt?.toISOString() ?? null,
              }
            : null,
          receiptCounts: {
            total,
            accepted: countFor("SUCCESS"),
            pending,
            failed,
            blocking: pending + failed,
          },
          oldestBlockingAt: blockingReceipts[0]?.createdAt ?? null,
          blockingReceipts,
          blockingTruncated: pending + failed > blockingReceipts.length,
          openBlockedReason: openBlockedReason(provider, activeDay),
        };
      }),
    );

    // ISO-8601 sorts lexicographically in time order, so the first entry is the
    // genuinely oldest unsubmitted receipt anywhere in the fleet.
    const oldestBlockingAt =
      devices
        .map((device) => device.oldestBlockingAt)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null;

    const response: FiscalDayFleetResponse = {
      devices,
      summary: {
        devices: devices.length,
        daysOpen: devices.filter((d) => d.activeDay?.status === FISCAL_DAY_STATUS.OPENED).length,
        daysClosing: devices.filter((d) => d.activeDay?.status === FISCAL_DAY_STATUS.CLOSING).length,
        devicesWithoutOpenDay: devices.filter((d) => d.isActive && !d.activeDay).length,
        blockingReceipts: devices.reduce((sum, d) => sum + d.receiptCounts.blocking, 0),
        oldestBlockingAt,
      },
      canManage: hasRole(session.user.role, [...MANAGE_ROLES]),
    };

    return successResponse(response);
  } catch (error) {
    console.error("[API] GET /api/accounting/fiscalisation/fiscal-days error:", error);
    return errorResponse("Failed to load fiscal days");
  }
}

/**
 * Open a fiscal day on one device.
 *
 * Every refusal `openFiscalDay` can produce is an operational state a
 * supervisor caused, not a server fault, so each maps to a 4xx carrying the
 * service's own message. `FiscalDayAlreadyOpenError` is a 409 in particular
 * because it is exactly what a double-click or a retried request produces, and
 * the console reconciles it by refetching rather than by alarming anyone.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session.user.role, [...MANAGE_ROLES])) {
      return errorResponse("Insufficient permissions to open a fiscal day", 403);
    }

    const body = await request.json().catch(() => ({}));
    const validated = openSchema.parse(body);

    const day = await openFiscalDay({
      companyId: session.user.companyId,
      providerConfigId: validated.providerConfigId,
    });

    return successResponse({ day: toDayWire(day) }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof FiscalDayAlreadyOpenError) {
      return errorResponse(error.message, 409, {
        code: error.code,
        openDayId: error.openDayId,
        fiscalDayNo: error.fiscalDayNo,
      });
    }
    if (error instanceof FiscalDayConfigError) {
      return errorResponse(error.message, 400, { code: error.code });
    }
    console.error("[API] POST /api/accounting/fiscalisation/fiscal-days error:", error);
    return errorResponse("Failed to open fiscal day");
  }
}
