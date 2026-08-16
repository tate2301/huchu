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
 * The settings the demo shows already exist, in one place: `RetailPosPolicy` and
 * `RetailTenderPolicy` (both `FiscalisationProviderConfig` rows),
 * `RetailSetupProfile`, `CompanyBranding`, `Site` and `RetailRegister`. They are
 * edited under `/retail/setup/**` through PUT handlers gated on
 * `requireRetailManager`. This composes those for the till and shapes them for a
 * cashier; it does not accept a write, and there is no second store.
 *
 * That is not timidity, it is the permissions matrix applied honestly. In
 * `lib/retail/permissions.ts` a CASHIER holds `retail.sell` and `retail.catalog`
 * and nothing else — `retail.setup` is the shop's configuration and is not
 * theirs. A cashier who could raise the discount ceiling from the till has
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
 */

import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-utils";
import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { canRetailRoleDo, requireRetailPermission } from "@/lib/retail/permissions";
import { getRetailPosPolicy } from "@/lib/retail/pos-policy";
import { getRetailSetupProfile } from "@/lib/retail/setup-profile";
import { getRetailTenderPolicy } from "@/lib/retail/tender-policy";
import { canManageRetailTransactions, requireRetailSession } from "../../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  /**
   * `retail.sell`, not `retail.setup`. Everything returned below is a rule the
   * caller is already operating under at the counter — which register they are
   * on, whether a reference is required for EcoCash, whether a refund needs a
   * reason. Withholding it from the person it constrains would be theatre. What
   * `retail.setup` decides is whether they may *change* any of it, which is the
   * `canEdit` flag at the bottom and is enforced by the PUT handlers, not here.
   */
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  try {
    const companyId = session.user.companyId;

    const [profile, posPolicy, tenderPolicy, baseCurrency, branding, shift] = await Promise.all([
      getRetailSetupProfile(companyId),
      getRetailPosPolicy(companyId),
      getRetailTenderPolicy(companyId),
      resolveBaseCurrency(companyId),
      prisma.companyBranding.findUnique({
        where: { companyId },
        select: {
          displayName: true,
          tradingName: true,
          legalName: true,
          vatNumber: true,
          registrationNumber: true,
          phone: true,
          physicalAddress: true,
          defaultFooterText: true,
        },
      }),
      // The shift names the register this device is actually on, which beats the
      // company-wide default when the two disagree — and they disagree exactly
      // when a shop runs a second till.
      prisma.retailShift.findFirst({
        where: { companyId, cashierId: session.user.id, status: "OPEN" },
        orderBy: { openedAt: "desc" },
        select: { id: true, shiftNo: true, registerName: true, siteId: true, openedAt: true },
      }),
    ]);

    const siteId = shift?.siteId ?? profile.defaultSiteId;
    const site = siteId
      ? await prisma.site.findFirst({
          where: { id: siteId, companyId },
          select: { id: true, name: true, code: true, location: true },
        })
      : null;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    return successResponse({
      data: {
        identity: {
          companyName: company?.name ?? null,
          branchName: site?.name ?? null,
          branchCode: site?.code ?? null,
          branchLocation: site?.location ?? null,
          registerName: shift?.registerName ?? profile.defaultRegisterName,
          registerCode: profile.defaultRegisterCode,
          shiftNo: shift?.shiftNo ?? null,
          shiftOpenedAt: shift?.openedAt ?? null,
        },
        money: {
          baseCurrency,
        },
        rules: {
          /**
           * The discount rule as it actually is, not as a percentage.
           *
           * The prototype has a "Default discount limit (%)" and retail has no
           * such column — `Product.maxDiscountPercent` exists in core and no
           * retail surface reads it. What `pos/sales` really enforces is binary:
           * a manager may change a price or give a discount with a reason, and
           * anybody else needs a manager's password on the spot. Rendering that
           * as "25%" would be a comforting lie on the one screen whose job is to
           * tell a cashier what they are allowed to do.
           */
          discountsNeedApproval: !canManageRetailTransactions(session.user.role),
          refundRequiresReason: posPolicy.refundRequiresReason,
          voidRequiresReason: posPolicy.voidRequiresReason,
          requireSupervisorForRefunds: posPolicy.requireSupervisorForRefunds,
          splitTenderEnabled: posPolicy.splitTenderEnabled,
          requiredReferenceTenders: tenderPolicy.requiredReferenceTenders,
          minReferenceLength: tenderPolicy.minReferenceLength,
        },
        receipt: {
          displayName: branding?.displayName ?? branding?.tradingName ?? company?.name ?? null,
          legalName: branding?.legalName ?? null,
          vatNumber: branding?.vatNumber ?? null,
          registrationNumber: branding?.registrationNumber ?? null,
          phone: branding?.phone ?? null,
          physicalAddress: branding?.physicalAddress ?? null,
          footerText: branding?.defaultFooterText ?? null,
        },
        /** Whether this caller may change any of it, and therefore see the link. */
        canEdit: canRetailRoleDo(session.user.role, "retail.setup", "update"),
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/pos/till-settings error:", error);
    return errorResponse("Failed to read this till's settings");
  }
}
