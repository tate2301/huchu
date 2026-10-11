import { result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportParams, ReportRow } from "@/lib/reports/types";
import { addMonths, voucherToday } from "@/lib/retail/vouchers/dates";
import { loadVoucherViews, voucherUseRows, type VoucherView } from "@/lib/retail/vouchers/service";
import { addDays, formatMediumDay, formatWhen } from "@/lib/workspace/format";

/**
 * Vouchers (PRD-10): every voucher of the shop, read in memory with its
 * state by the calendar, what is left and where its expiry falls; and a
 * voucher record's Uses tab.
 */

/** Its expiry within 31 days, while it can still be spent: the board's warn pill. */
const WARN_DAYS = 31;

function voucherRow(view: VoucherView, today: string): ReportRow {
  const open = !view.voidedAt && !view.expiredAt;
  const live = view.state === "LIVE" || view.state === "IN_USE";
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  const weekEnd = addDays(today, 7 - weekday);
  const monthEnd = addDays(addMonths(`${today.slice(0, 7)}-01`, 1), -1);
  const ahead = view.expiresOn >= today;
  return {
    id: view.id,
    code: view.code,
    kindKey: view.kind,
    kind: view.kindLabel,
    kindTone: "hollow",
    stateKey: view.state,
    holder: view.holder,
    value: view.valueLabel,
    left: view.leftLabel,
    leftMoney: view.left ?? 0,
    leftUses: view.left === null ? (view.usesLeft ?? 0) : 0,
    issued: view.issuedAt.slice(0, 10),
    expires: view.expiresOn,
    expiresText: formatMediumDay(view.expiresOn),
    expiresTone: live && view.daysToExpiry <= WARN_DAYS ? "warn" : null,
    inWeek: ahead && view.expiresOn <= weekEnd ? "yes" : "no",
    inMonth: ahead && view.expiresOn <= monthEnd ? "yes" : "no",
    in3m: ahead && view.expiresOn <= addMonths(today, 3) ? "yes" : "no",
    past: ahead ? "no" : "yes",
    openKey: open ? "yes" : "no",
    sendKey: view.canSend ? "yes" : "no",
  };
}

async function loadVouchers(ctx: ReportContext) {
  const now = new Date();
  const today = voucherToday(now);
  const views = await loadVoucherViews(ctx.companyId, now);
  return result(views.map((view) => voucherRow(view, today)));
}

const isId = (value: string | undefined) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

async function loadUses(ctx: ReportContext, params: ReportParams) {
  if (!isId(params.voucher)) return result([]);
  const rows = await voucherUseRows(ctx.companyId, params.voucher!);
  return result(
    rows.map(
      (row): ReportRow => ({
        id: row.id,
        voucherId: params.voucher!,
        saleId: row.saleId,
        saleNo: row.saleNo,
        at: voucherToday(new Date(row.at)),
        whenText: formatWhen(row.at),
        till: row.till,
        spent: row.spent,
        leftAfter: row.leftAfter,
      }),
    ),
  );
}

export const VOUCHER_LOADERS: Record<string, ReportLoader> = {
  "retail-vouchers": { load: loadVouchers },
  "retail-voucher-uses": { load: loadUses },
};
