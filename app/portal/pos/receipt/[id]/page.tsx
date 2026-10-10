import * as React from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requirePageAuth } from "@/lib/auth-core/guards";
import { toNumberOrZero } from "@/lib/money";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { prisma } from "@/lib/prisma";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { receiptWire } from "@/lib/retail/receipt-settings";
import { receiptTenderLabel } from "@/lib/retail/receipt-words";
import { postedChange } from "@/lib/retail/sale-totals";
import { firstName, qty, usd } from "@/components/retail/till/format";
import { depositRowLabel, ReceiptFoot, ReceiptHead, receiptFigure as figure, receiptStamp } from "@/components/retail/till/receipt-parts";
import { requireTillDevice } from "../../device-page";
import { PrintedStamp } from "./printed-stamp";

/**
 * A sale's receipt, to print: on paid, and again from History. The till loads
 * it in a hidden frame and prints it; once printed, the sale is stamped
 * (`PrintedStamp`). "sample" prints the shop's header and footer around a
 * made-up line, to test the printer. The top and bottom lines, the VAT and
 * licence numbers, the logo and the number of copies are the shop's receipt
 * settings (Setup › Receipts).
 */
export default async function TillReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hostHeader = getHostHeaderFromRequestHeaders(await headers());
  const routing = getPortalRequestRouting(hostHeader, "/portal/pos");
  const session = await requirePageAuth({ pathname: "/portal/pos", callbackUrl: routing.callbackPath, loginPath: routing.loginPath });
  if (!canAccessPosPortal(session.user.role)) redirect("/access-blocked");
  const device = await requireTillDevice();
  const companyId = session.user.companyId;

  const sale =
    id === "sample"
      ? null
      : await prisma.retailSale.findFirst({
          where: { id, companyId },
          include: {
            // One bottle's deposit, to count the bottles a line's deposit is for.
            lines: { orderBy: { createdAt: "asc" }, include: { product: { select: { depositAmount: true } } } },
            payments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            fiscalReceipt: { select: { status: true, fiscalNumber: true } },
            shift: { select: { registerName: true } },
            site: { select: { name: true } },
          },
        });
  if (id !== "sample" && !sale) notFound();

  const wire = await receiptWire(companyId, sale?.siteId ?? device.register.site.id);

  const stamp = receiptStamp(sale ? (sale.postedAt ?? sale.createdAt) : new Date());
  const total = sale ? toNumberOrZero(sale.totalAmount) : 1;
  const deposit = sale ? toNumberOrZero(sale.depositAmount) : 0;
  const due = total + deposit;
  const change = sale ? postedChange(sale) : null;
  const tillLine = sale
    ? [sale.shift?.registerName ?? sale.site.name, sale.cashierName ? firstName(sale.cashierName) : null].filter(Boolean).join(", ")
    : "";
  const fiscalNumber = sale?.fiscalReceipt?.status === "SUCCESS" ? sale.fiscalReceipt.fiscalNumber : null;
  const title = !sale ? "Test receipt" : sale.saleType === "REFUND" ? "Refund" : sale.saleType === "VOID" ? "Void" : "Tax invoice";

  const copy = (
    <div className="receipt">
      <ReceiptHead wire={wire} />
      <hr />
      <div className="c t">{title}</div>
      <div className="l">
        <span>{sale?.saleNo ?? "Sample"}</span>
        <span>{stamp}</span>
      </div>
      {sale ? (
        <div className="l">
          <span>{tillLine}</span>
          <span />
        </div>
      ) : null}
      {sale?.customerName ? <div>Customer: {sale.customerName}</div> : null}
      <hr />
      {sale ? (
        sale.lines.map((line) => {
          const lineDeposit = toNumberOrZero(line.depositAmount);
          const each = line.product?.depositAmount ? toNumberOrZero(line.product.depositAmount) : null;
          return (
            <React.Fragment key={line.id}>
              <div className="l">
                <span>
                  {qty(toNumberOrZero(line.quantity))} × {line.itemName}
                  {toNumberOrZero(line.discountAmount) ? `, ${figure(toNumberOrZero(line.discountAmount))} off` : ""}
                </span>
                <span>{figure(toNumberOrZero(line.lineTotal))}</span>
              </div>
              {/* The line's deposit, net of the empties brought back against it, right under it. */}
              {lineDeposit ? (
                <div className="l">
                  <span>{depositRowLabel(lineDeposit, each)}</span>
                  <span>{figure(lineDeposit)}</span>
                </div>
              ) : null}
            </React.Fragment>
          );
        })
      ) : (
        <div className="l">
          <span>Printer test</span>
          <span>{figure(1)}</span>
        </div>
      )}
      <hr />
      {sale && toNumberOrZero(sale.discountAmount) ? (
        <div className="l">
          <span>Discounts</span>
          <span>{figure(-toNumberOrZero(sale.discountAmount))}</span>
        </div>
      ) : null}
      <div className="l t">
        <span>Total</span>
        <span>{usd(due)}</span>
      </div>
      {sale && toNumberOrZero(sale.taxAmount) ? (
        <div className="l">
          <span>VAT included</span>
          <span>{figure(toNumberOrZero(sale.taxAmount))}</span>
        </div>
      ) : null}
      {sale?.payments.map((payment) => (
        <div key={payment.id} className="l">
          <span>
            {receiptTenderLabel(payment.tenderType, payment.currency)}
            {payment.reference ? ` ${payment.reference}` : ""}
          </span>
          <span>{figure(toNumberOrZero(payment.amount))}</span>
        </div>
      ))}
      {change?.usd ? (
        <div className="l">
          <span>Change</span>
          <span>{figure(change.usd)}</span>
        </div>
      ) : null}
      {change?.zig ? (
        <div className="l">
          <span>Change ZiG</span>
          <span>{figure(Math.abs(change.zig))}</span>
        </div>
      ) : null}
      {sale?.idCheckedAt || fiscalNumber ? <hr /> : null}
      {sale?.idCheckedAt ? (
        <>
          <div className="c">ID checked, 18 or over</div>
          <div className="c strong">Not for sale to persons under 18</div>
        </>
      ) : null}
      {fiscalNumber ? <div className="c muted">Fiscal {fiscalNumber}</div> : null}
      <ReceiptFoot wire={wire} />
    </div>
  );

  return (
    <div className="receipt-page">
      {/* Each copy on its own page, as many as the receipt settings say. */}
      <div>
        {Array.from({ length: wire.copies }, (_, index) => (
          <div key={index} style={index < wire.copies - 1 ? { breakAfter: "page" } : undefined}>
            {copy}
          </div>
        ))}
      </div>
      {sale ? <PrintedStamp saleId={sale.id} /> : null}
    </div>
  );
}
