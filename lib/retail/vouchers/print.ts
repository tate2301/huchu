import { esc } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { defaultTemplateSchema } from "@/lib/documents/template-schema";
import { prisma } from "@/lib/prisma";
import { barcodeSvg } from "@/lib/retail/labels/render";
import { formatDay, formatMoney } from "@/lib/workspace/format";

import { shopNames } from "./issue";
import { barcodeText } from "./redeem";
import { dateKeyOf, KIND_WORDS, valueWords } from "./words";

/**
 * Vouchers on paper (`GET /api/v2/retail/vouchers/print?ids=`): one A6 card
 * each, with the shop's name, what it is and is worth, the code and its
 * secret, a barcode carrying both (a scan needs no typing), when it expires
 * and the smallest sale it works on.
 */

type Card = {
  shop: string;
  kind: string;
  value: string;
  holder: string | null;
  code: string;
  secret: string;
  expires: string;
  minSale: string | null;
};

function card(input: Card): string {
  return `<section class="card">
  <div class="shop">${esc(input.shop)}</div>
  <div class="kind">${esc(input.kind)}</div>
  <div class="value">${esc(input.value)}</div>
  ${input.holder ? `<div class="for">For ${esc(input.holder)}</div>` : ""}
  <div class="codes"><div><span>Code</span><b>${esc(input.code)}</b></div><div><span>Secret</span><b>${esc(input.secret)}</b></div></div>
  <div class="bars">${barcodeSvg(barcodeText(input.code, input.secret), "CODE128")}</div>
  <div class="foot">Use it until ${esc(input.expires)}.${input.minSale ? ` Smallest sale ${esc(input.minSale)}.` : ""}</div>
</section>`;
}

const CSS = `@page { size: 105mm 148mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #000; font-family: Arial, Helvetica, sans-serif; }
.card { width: 105mm; height: 148mm; padding: 10mm 9mm; display: flex; flex-direction: column; gap: 4mm; overflow: hidden; }
.card + .card { break-before: page; }
.shop { font-size: 11pt; font-weight: 700; }
.kind { font-size: 10pt; color: #333; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4mm; }
.value { font-size: 30pt; font-weight: 700; font-family: "DejaVu Sans Mono", ui-monospace, monospace; }
.for { font-size: 10pt; }
.codes { display: flex; gap: 8mm; margin-top: 2mm; }
.codes span { display: block; font-size: 8pt; color: #555; }
.codes b { font-size: 15pt; font-family: "DejaVu Sans Mono", ui-monospace, monospace; letter-spacing: 0.04em; }
.bars { height: 18mm; margin-top: 2mm; }
.bars svg { height: 100%; width: auto; max-width: 100%; display: block; }
.foot { margin-top: auto; font-size: 9pt; color: #333; }`;

/** The cards for these vouchers of the company, in the order asked; null when none is the company's. */
export async function voucherCardsPdf(companyId: string, ids: string[]): Promise<Uint8Array<ArrayBuffer> | null> {
  const rows = await prisma.retailVoucher.findMany({
    where: { companyId, id: { in: ids } },
    select: {
      id: true,
      code: true,
      secret: true,
      kind: true,
      value: true,
      percentOff: true,
      amountOff: true,
      copies: true,
      minSale: true,
      expiresOn: true,
      holderNote: true,
      customer: { select: { name: true } },
    },
  });
  if (rows.length === 0) return null;
  const { shop } = await shopNames(prisma, companyId);
  const order = new Map(ids.map((id, index) => [id, index]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const cards = rows.flatMap((row) => {
    const facts = {
      kind: row.kind,
      value: row.value === null ? null : Number(row.value),
      percentOff: row.percentOff === null ? null : Number(row.percentOff),
      amountOff: row.amountOff === null ? null : Number(row.amountOff),
    };
    const holder = row.customer?.name ?? row.holderNote ?? null;
    const one = card({
      shop,
      kind: KIND_WORDS[row.kind],
      value: valueWords(facts),
      holder,
      code: row.code,
      secret: row.secret,
      expires: formatDay(dateKeyOf(row.expiresOn)),
      minSale: row.minSale && Number(row.minSale) > 0 ? formatMoney(Number(row.minSale)) : null,
    });
    // A discount voucher prints as many copies as it has uses.
    return Array.from({ length: row.kind === "DISCOUNT" ? Math.max(1, row.copies) : 1 }, () => one);
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Vouchers</title><style>${CSS}</style></head><body>${cards.join("\n")}</body></html>`;
  const pdf = await renderPdfFromHtml({
    html,
    template: { ...defaultTemplateSchema, page: { ...defaultTemplateSchema.page, marginMm: 0, orientation: "portrait" } },
  });
  return new Uint8Array(pdf);
}
