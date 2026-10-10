/**
 * What this till is set to, read from the shop's setup rather than a copy of it.
 *
 * S-7.4. `docs/design-system/portals/pos.html` puts seven settings tabs on the till
 * — branch and till identity, currency and tax, discount limits, PINs and
 * permissions, printer, receipt template, and a demo-state tab that has no
 * meaning here. Every one of them writes to `state.settings`, a JSON blob in the
 * browser's local storage, because the prototype has no shop behind it.
 *
 * ── Why this endpoint reads and does not write ─────────────────────────────
 *
 * The settings the demo shows already exist, in one place: `RetailTillRules`
 * (SET-06), `RetailReceiptSettings` (SET-07), `Site` and `RetailRegister`. They are
 * edited under `/retail/manage/**` through PUT handlers gated on
 * `requireRetailManager`. This composes those for the till and shapes them for a
 * cashier; it does not accept a write, and there is no second store.
 *
 * That is not timidity, it is the permissions matrix applied honestly. In
 * `lib/retail/permissions.ts` a CASHIER holds no `retail.till-rules` and no
 * `retail.payments` — the shop's configuration is not theirs. A cashier who could raise the discount ceiling from the till has
 * removed the control the ceiling exists to be. So the till *shows* the rules it
 * is operating under, which is genuinely useful to the person operating under
 * them, and the place to change them is a link to the back office.
 *
 * The one setting on this screen that is the cashier's own is their unlock PIN,
 * and that has its own endpoint — `pos/pin` — because it is a secret rather than
 * a setting.
 *
 * ── What is deliberately not here ──────────────────────────────────────────
 *
 * **Tax.** The prototype has an editable "Tax rate (%)" field defaulted to 14.5,
 * which was Zimbabwe's rate from 2020 to 2022 and went back to 15% on 1 January
 * 2023. Retail does not hold a shop-wide tax rate and should not start: tax is
 * per price list and per item, and the till reads it off the shelf-price snapshot
 * it is already selling from. The screen derives the rate it is *actually*
 * charging from that snapshot rather than displaying a number somebody typed.
 *
 * ── S-7.6: what the screen this serves needed that was not here ────────────
 *
 * The endpoint shipped ahead of its screen and covered four of the contract's six
 * groups. Building `PosTillSettingsView` turned up two gaps, and both are answered
 * by deriving rather than by adding a second store:
 *
 * - **Currency & tax** returned only the base currency. It now carries the price
 *   list the till sells off, whether the shelf price contains the VAT, and the
 *   rates actually in use across the range — a `groupBy` over
 *   `Product.defaultTaxRate`, summarised exactly in `lib/retail/till-settings.ts`.
 * - **PINs & permissions** had `canEdit` and nothing else. It now carries the
 *   caller's capability list off the same matrix, so the screen can tell a cashier
 *   what they may do and what needs a manager. The PIN half is not here: it is
 *   the cashier's own credential, it lives at `pos/pin`, and the screen calls that.
 *
 * **Printer** is still absent and that is the honest answer rather than a gap. The
 * till prints through the browser's own dialog — `window.print()` on the Z-report,
 * `openReceiptPrintWindow` on a receipt — and there is no server-side printer
 * record anywhere in this repository to read or to write. A "Printer name" field
 * that configured nothing, which is what the prototype has, would be a control a
 * cashier trusts on the day the receipts stop coming out.
 */

import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import { requirePosDevice } from "@/lib/retail/devices";
import { findDefaultPriceList } from "@/lib/retail/prices/change";
import { receiptWire } from "@/lib/retail/receipt-settings";
import { loadTillRules, tillRulesForTill } from "@/lib/retail/till-rules";
import { summariseShelfTax, summariseTillCapabilities } from "@/lib/retail/till-settings";
import { requireRetailSession } from "../../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  /**
   * `retail.sell`, not `retail.till-rules`. Everything returned below is a rule the
   * caller is already operating under at the counter — which register they are
   * on, whether a reference is required for EcoCash, whether a refund needs a
   * reason. Withholding it from the person it constrains would be theatre. What
   * `retail.till-rules` decides is whether they may *change* any of it, which is the
   * `canEdit` flag at the bottom and is enforced by the PUT handlers, not here.
   */
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;
  // The till is this device's (SET-04), not a company-wide default.
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  try {
    const companyId = session.user.companyId;

    const [tillRules, baseCurrency, receipt, shift] = await Promise.all([
      loadTillRules(companyId),
      resolveBaseCurrency(companyId),
      // What this till's receipts say (SET-07), at its site.
      receiptWire(companyId, device.register.site.id),
      // The caller's shift on this till.
      prisma.retailShift.findFirst({
        where: { companyId, cashierId: session.user.id, registerId: device.registerId, status: "OPEN" },
        orderBy: { openedAt: "desc" },
        select: { id: true, shiftNo: true, registerName: true, siteId: true, openedAt: true },
      }),
    ]);

    const siteId = device.register.site.id;
    const site = siteId
      ? await prisma.site.findFirst({
          where: { id: siteId, companyId },
          select: { id: true, name: true, code: true, location: true },
        })
      : null;

    const [company, shelfPriceList, taxTallies] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
      // The list the till actually sells off, and — the part that changes what a
      // receipt says — whether its prices already contain the VAT.
      findDefaultPriceList(prisma, companyId),
      /**
       * What the shelf is taxed at, counted rather than configured.
       *
       * Same population as `loadSellableProducts`: not archived, active, and
       * carrying stock at this branch. A product core knows about but this shop
       * has never received is not on the shelf and should not colour the rate
       * the screen reports.
       *
       * The rate shown is `Product.defaultTaxRate`. A `PriceListItem` may
       * override it per line, which is why the screen labels this the shelf's
       * standard rate and not the rate of any particular sale.
       */
      prisma.product.groupBy({
        by: ["defaultTaxRate"],
        where: {
          companyId,
          archivedAt: null,
          isActive: true,
          inventoryItems: {
            some: { site: { companyId, ...(siteId ? { id: siteId } : {}) } },
          },
        },
        _count: { _all: true },
      }),
    ]);

    const shelfTax = summariseShelfTax(
      taxTallies.map((tally) => ({
        taxPercent: tally.defaultTaxRate,
        productCount: tally._count._all,
      })),
    );

    return successResponse({
      data: {
        identity: {
          companyName: company?.name ?? null,
          branchName: site?.name ?? null,
          branchCode: site?.code ?? null,
          branchLocation: site?.location ?? null,
          registerName: device.register.name,
          registerCode: device.register.code,
          shiftNo: shift?.shiftNo ?? null,
          shiftOpenedAt: shift?.openedAt ?? null,
        },
        money: {
          baseCurrency,
          priceListName: shelfPriceList?.name ?? null,
          priceListCurrency: shelfPriceList?.currency ?? baseCurrency,
          /**
           * Null when no shelf list exists yet, which is not the same as false.
           * False says "add the VAT at the till"; null says "nothing is priced",
           * and a screen that showed the first for the second would tell a
           * cashier the shop charges VAT on top when it charges nothing at all.
           */
          taxInclusive: shelfPriceList?.taxInclusive ?? null,
          shelfTax,
        },
        /**
         * The till rules the caller works under (SET-06), and whether they
         * need a manager's PIN for what the rules limit: a person holding the
         * approve right is their own approval.
         */
        rules: {
          ...tillRulesForTill(tillRules),
          needsApproval: !canRetailSessionDo(session, "retail.sell", "approve"),
        },
        receipt,
        /**
         * What the person at this till may do, off the same matrix the API
         * gates on — so the screen cannot drift from the enforcement.
         */
        capabilities: summariseTillCapabilities(session.user.role),
        /** Whether this caller may change any of it, and therefore see the link. */
        canEdit: canRetailSessionDo(session, "retail.till-rules", "update"),
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/pos/till-settings error:", error);
    return errorResponse("Failed to read this till's settings");
  }
}
