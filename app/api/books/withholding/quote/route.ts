import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { imttOn, quoteWithholding } from "@/lib/books/core";
import { taxSettings } from "@/lib/books/core/tax-settings";
import { itf263State } from "@/lib/books/itf263";
import { prisma } from "@/lib/prisma";

/**
 * What a payment to a supplier would withhold (D17), and the IMTT the bank
 * would take on it (§5.8.3), before it is made: the pay form shows both. The
 * payment itself withholds through the core when it is paid.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const companyId = sessionResult.session.user.companyId;
    const params = new URL(request.url).searchParams;
    const vendorId = params.get("supplier");
    const amount = Number(params.get("amount")) || 0;
    const currency = (params.get("currency") ?? "USD").toUpperCase();
    const billIds = (params.get("bills") ?? "").split(",").filter(Boolean);
    if (!vendorId) return errorResponse("Choose the supplier", 400);
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, companyId }, select: { name: true, phone: true, whatsapp: true, itf263Number: true, itf263ExpiresAt: true } });
    if (!vendor) return errorResponse("Supplier not found", 404);
    const now = new Date();
    // One quote per bill, so the VAT share follows each bill; the threshold counts what was paid this year.
    let incomeTax = 0;
    let vat = 0;
    const reasons = new Set<string>();
    const bills = billIds.length ? await prisma.purchaseBill.findMany({ where: { companyId, id: { in: billIds } }, select: { id: true, total: true } }) : [];
    const share = (id: string) => {
      const bill = bills.find((row) => row.id === id);
      const sum = bills.reduce((total, row) => total + row.total, 0);
      return bill && sum > 0 ? (amount * bill.total) / sum : 0;
    };
    for (const id of billIds.length ? billIds : [null]) {
      const part = id ? share(id) : amount;
      const quote = await quoteWithholding(companyId, { vendorId, billId: id, amount: part, currency, date: now });
      incomeTax += quote.incomeTax;
      vat += quote.vat;
      for (const reason of quote.reasons) reasons.add(reason);
    }
    const settings = await taxSettings(companyId);
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const withheld = round2(incomeTax + vat);
    const net = round2(amount - withheld);
    const itf = itf263State(vendor, now);
    const month = now.getUTCMonth() + 1;
    const due = new Date(Date.UTC(now.getUTCFullYear(), month, settings.withholding.paymentDay));
    return successResponse({
      itf263: { state: itf.state, label: itf.label, expires: itf.expires },
      phone: vendor.whatsapp ?? vendor.phone,
      incomeTax: round2(incomeTax),
      vat: round2(vat),
      withheld,
      net,
      rate: settings.withholding.contractRate,
      imtt: net > 0 ? imttOn(net, currency, settings) : 0,
      imttRate: currency === "ZWG" ? settings.imtt.zwgRate : settings.imtt.usdRate,
      dueBy: due.toISOString().slice(0, 10),
      reasons: [...reasons],
    });
  } catch (error) {
    console.error("[API] GET /api/books/withholding/quote error:", error);
    return errorResponse("Could not work out the withholding");
  }
}
