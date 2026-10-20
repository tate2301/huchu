/**
 * Development only: a workspace's Bills & spending as the Books boards draw
 * them (books_pages_a.py: Mutare Timber Works, Tile Trader Zimbabwe, BILL-0220
 * overdue and its payment waiting for the owner, orders sent and waiting,
 * requisitions to approve and one accounted for, claims, a float and its
 * vouchers), written through the Books core the way the screens write them,
 * for checking the P2b pages against their boards.
 *
 *   pnpm exec tsx --env-file=.env scripts/books/bills-spending-seed.ts [workspace-slug]   (default: floorcode)
 *
 * It needs an owner and two managers (Floorcode's James, Tendai and Rudo; the
 * float is James's, as the only member signed in). It
 * runs once: a workspace that already has Mutare Timber Works is left alone.
 * The goods receipt behind a draft bill is written as the shop's buying would
 * leave it (a showroom site, its stock and a posted receipt), and its draft
 * bill is made by the core (`draftBillFromGoodsReceipt`). It refuses to run in
 * production.
 */
import { Prisma } from "@prisma/client";

import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { createPurchaseBill } from "@/lib/books/bill-create";
import type { BooksActor } from "@/lib/books/core";
import { draftBillFromGoodsReceipt } from "@/lib/books/core/bills";
import { createClaim, decideClaim, reimburseClaim, submitClaim } from "@/lib/books/core/claims";
import { setUpFloat, writeVoucher } from "@/lib/books/core/petty-cash";
import { createPurchaseOrder, submitPurchaseOrder } from "@/lib/books/core/purchase-orders";
import { postRequisitionAcquittal, postRequisitionDisbursement, sendRequisitionForApproval } from "@/lib/books/core/requisitions";
import { draftSupplierPayment, paySupplierPayment, submitSupplierPayment } from "@/lib/books/core/supplier-payments";
import { decideCrmRequisition } from "@/lib/crm/requisition-decide";
import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

if (process.env.NODE_ENV === "production") throw new Error("The Bills & spending seed is for development only.");

const slug = process.argv[2] ?? "floorcode";
const DAY = 86_400_000;
/** The mark on what cannot be told apart by its date (the requisitions, the day's log), so it can be taken out again. */
const SEEDED = "Seed: Bills & spending";
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const at = (offset: number, hour = 9) => new Date(`${day(offset)}T${String(hour).padStart(2, "0")}:00:00.000+02:00`);

async function main() {
  const company = await prisma.company.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!company) throw new Error(`There is no workspace ${slug}.`);
  const companyId = company.id;
  if (await prisma.vendor.findFirst({ where: { companyId, name: "Mutare Timber Works" }, select: { id: true } })) {
    console.log(`${company.name} has its Bills & spending already.`);
    return;
  }
  // Floorcode's managers are switched off as members; they still made and approved these, as the boards' people do.
  const users = await prisma.user.findMany({ where: { companyId }, select: { id: true, name: true, role: true, email: true }, orderBy: { createdAt: "asc" } });
  const ownerUser = users.find((user) => user.role === "SUPERADMIN");
  const managers = users.filter((user) => user.role === "MANAGER");
  if (!ownerUser || managers.length < 2) throw new Error("It needs an owner and two managers.");
  const [tendaiUser, rudoUser] = managers;
  const actor = (user: { id: string; role: string }): BooksActor => ({ companyId, userId: user.id, role: user.role, grants: new Set() });
  const session = (user: { id: string; role: string; name: string; email: string | null }) => ({ user: { id: user.id, role: user.role, companyId, name: user.name, email: user.email } }) as unknown as AuthenticatedSession;
  const owner = actor(ownerUser);
  const tendai = actor(tendaiUser);
  const rudo = actor(rudoUser);

  await ensureAccountingDefaults(companyId);

  // ── Suppliers ──
  const vendor = (name: string, extra: Partial<Prisma.VendorUncheckedCreateInput> = {}) => prisma.vendor.create({ data: { companyId, name, ...extra } });
  const mutare = await vendor("Mutare Timber Works", { contactName: "Mr G. Sithole", phone: "+263 20 206 4471", address: "14 Herbert Chitepo St, Mutare", vatNumber: "220145873", taxNumber: "2000418236", payTermsDays: 7, bankDetails: "CBZ Mutare, 0112 4478 2210", deliversOn: "Tuesdays and Fridays" });
  const tile = await vendor("Tile Trader Zimbabwe", { contactName: "Mrs P. Chari", phone: "+263 24 270 1180", address: "22 Coventry Rd, Workington, Harare", vatNumber: "220098812", payTermsDays: 30 });
  const carpet = await vendor("Carpet Mills Africa", { contactName: "Mr T. Banda", phone: "+263 24 248 6601", address: "5 Simon Mazorodze Rd, Harare", vatNumber: "220077140", payTermsDays: 30 });
  const zetdc = await vendor("ZETDC", { phone: "+263 24 277 4508", address: "Electricity Centre, Samora Machel Ave, Harare", vatNumber: "220000123", payTermsDays: 14 });
  const freight = await vendor("Rapid Freight Harare", { phone: "+263 77 300 2210", address: "Msasa, Harare", payTermsDays: 14 });
  const halsted = await vendor("Halsted Builders", { phone: "+263 24 249 0000", address: "Willowvale, Harare", vatNumber: "220011456", payTermsDays: 30 });

  // ── Money accounts: the showroom's cash box, and a petty cash float Rudo holds ──
  const cbz = await prisma.bankAccount.findFirstOrThrow({ where: { companyId, kind: "BANK", isActive: true }, orderBy: { createdAt: "asc" } });
  const cashBox = await prisma.bankAccount.create({ data: { companyId, name: "Showroom cash box", kind: "CASH", currency: "USD", openingBalance: 600 } });
  const pettyCash = await prisma.bankAccount.create({ data: { companyId, name: "Showroom petty cash", kind: "CASH", currency: "USD", openingBalance: 200 } });
  await setUpFloat(owner, { bankAccountId: pettyCash.id, holderId: ownerUser.id, imprestAmount: 200 });

  // ── Bills, recorded through the core ──
  const vat = { taxRate: 15.5 };
  const b220 = await createPurchaseBill(owner, {
    vendorId: mutare.id,
    billDate: day(-10),
    dueDate: day(-3),
    currency: "USD",
    receiveNow: true,
    supplierFtiNumber: "MTW-2291",
    fdmsStatus: "NOT_CHECKED",
    lines: [
      { description: "Oak strip flooring, 14 mm", quantity: 40, unitPrice: 34.2, ...vat },
      { description: "Oak skirting", quantity: 30, unitPrice: 5.6, ...vat },
      { description: "Underlay", quantity: 40, unitPrice: 1.85, ...vat },
    ],
  });
  await createPurchaseBill(owner, { vendorId: zetdc.id, billDate: day(-6), dueDate: day(3), receiveNow: true, supplierFtiNumber: "ZET-55102", fdmsStatus: "VALID", lines: [{ description: "Electricity, September", quantity: 1, unitPrice: 184.07, ...vat }] });
  await createPurchaseBill(owner, { vendorId: freight.id, billDate: day(-4), dueDate: day(5), receiveNow: true, lines: [{ description: "Deliveries, October", quantity: 1, unitPrice: 185 }] });
  const paidBill = await createPurchaseBill(owner, { vendorId: tile.id, billDate: day(-14), dueDate: day(16), receiveNow: true, supplierFtiNumber: "00183960", fdmsStatus: "VALID", lines: [{ description: "Porcelain tiles, 60 × 60", quantity: 30, unitPrice: 18.5, ...vat }] });
  await createPurchaseBill(tendai, { vendorId: halsted.id, billDate: day(-1), dueDate: day(29), receiveNow: false, lines: [{ description: "Screed, 20 bags", quantity: 20, unitPrice: 6.2, ...vat }] });

  // ── Payments: Tile Trader's bill paid; Mutare's drafted by Rudo, waiting for the owner ──
  const tilePaid = await draftSupplierPayment(owner, { vendorId: tile.id, billId: paidBill.id, bankAccountId: cbz.id, amount: Math.round(paidBill.total * 100) / 100, paidAt: day(-2), reference: "FLOORCODE 00183960" });
  await submitSupplierPayment(owner, tilePaid.id);
  await paySupplierPayment(owner, tilePaid.id, at(-2, 10));
  const mutareDraft = await draftSupplierPayment(rudo, { vendorId: mutare.id, billId: b220.id, bankAccountId: cbz.id, amount: Math.round(b220.total * 100) / 100, paidAt: day(0), reference: "FLOORCODE BILL" });
  await submitSupplierPayment(rudo, mutareDraft.id);
  const zetdcBill = await prisma.purchaseBill.findFirstOrThrow({ where: { companyId, vendorId: zetdc.id } });
  const zetdcDraft = await draftSupplierPayment(tendai, { vendorId: zetdc.id, billId: zetdcBill.id, bankAccountId: cbz.id, amount: 100, paidAt: day(0) });
  await submitSupplierPayment(tendai, zetdcDraft.id);

  // ── Purchase orders (Books' own): sent, waiting, a draft ──
  const order = async (by: BooksActor, vendorId: string, lines: Array<[string, number, number, number]>, expected: number, note: string, send: boolean) => {
    const made = await createPurchaseOrder(by, { vendorId, expectedDate: day(expected), noteToSupplier: note, lines: lines.map(([itemName, quantity, unitCost, vatRate]) => ({ itemName, quantity, unitCost, vatRate })) });
    if (send) await submitPurchaseOrder(by, made.id);
    return made;
  };
  await order(owner, mutare.id, [["Oak strip flooring, 14 mm", 60, 40, 0]], 11, "Ridgeview Apartments", true);
  await order(owner, tile.id, [["Ceramic skirting", 20, 4.8, 0]], 2, "Showroom stock", true);
  await order(owner, carpet.id, [["Carpet tiles", 180, 11, 0]], 9, "Mandara Medical Centre", true);
  await order(owner, halsted.id, [["Screed, 40 kg", 54, 9, 0]], 1, "Showroom stock", true);
  await order(rudo, carpet.id, [["Vinyl", 80, 37, 0]], 14, "Borrowdale Brooke Clinic", true);
  await order(tendai, freight.id, [["Delivery to Mutare", 1, 140, 0]], 7, "Ridgeview Apartments", false);

  // ── A goods receipt the shop counted in, and the draft bill the core made of it (D12) ──
  const site = await prisma.site.create({ data: { companyId, name: "Showroom", code: "SHOW", measurementUnit: "pieces" } });
  const shelf = await prisma.stockLocation.create({ data: { siteId: site.id, code: "SHELF", name: "Showroom store" } });
  const item = (itemCode: string, name: string, unit: string) => prisma.inventoryItem.create({ data: { itemCode, name, category: "CONSUMABLES", unit, siteId: site.id, locationId: shelf.id } });
  const skirting = await item("SKRT-CER", "Ceramic skirting", "m");
  const trim = await item("TRIM-3M", "Trim, 3 m lengths", "pcs");
  const grnLines: Array<[typeof skirting, number, number]> = [
    [skirting, 60, 4.4],
    [trim, 24, 4.3],
  ];
  const po = await prisma.$transaction(async (tx) => {
    const made = await tx.retailPurchaseOrder.create({
      data: {
        companyId,
        poNo: await reserveIdentifier(tx, { companyId, entity: "RETAIL_PURCHASE_ORDER" }),
        siteId: site.id,
        vendorId: tile.id,
        status: "RECEIVED",
        createdById: rudoUser.id,
        sentAt: at(-6),
        sentById: rudoUser.id,
        expectedDate: new Date(`${day(-3)}T00:00:00.000Z`),
        lines: { create: grnLines.map(([stock, quantity, cost], index) => ({ companyId, inventoryItemId: stock.id, itemName: stock.name, quantity, unitCost: cost, lineTotal: Math.round(quantity * cost * 100) / 100, receivedQuantity: quantity, vatRate: 15.5, sortOrder: index })) },
      },
      include: { lines: true },
    });
    return made;
  });
  const receipt = await prisma.$transaction(async (tx) => {
    const grn = await tx.retailGoodsReceipt.create({
      data: {
        companyId,
        receiptNo: await reserveIdentifier(tx, { companyId, entity: "RETAIL_GOODS_RECEIPT" }),
        purchaseOrderId: po.id,
        siteId: site.id,
        vendorId: tile.id,
        status: "POSTED",
        postedAt: at(-3, 14),
        receivedById: tendaiUser.id,
        countedById: tendaiUser.id,
        lines: {
          create: grnLines.map(([stock, quantity, cost], index) => ({ companyId, inventoryItemId: stock.id, itemName: stock.name, quantity, unitCost: cost, lineTotal: Math.round(quantity * cost * 100) / 100, vatRate: 15.5, purchaseOrderLineId: po.lines[index]!.id })),
        },
      },
    });
    await draftBillFromGoodsReceipt(tx, companyId, grn.id, tendaiUser.id);
    return grn;
  });

  // ── Requisitions from the CRM: two to approve, one accounted for with its change back ──
  const ask = async (by: { id: string }, purpose: string, category: "TRANSPORT" | "EQUIPMENT" | "FUEL" | "MATERIALS", amount: number, needed: number, daysAgo: number) => {
    const row = await prisma.crmRequisition.create({ data: { companyId, notes: SEEDED, status: "DRAFT", category, purpose, amount, currency: "USD", requestedById: by.id, neededBy: new Date(`${day(needed)}T00:00:00.000Z`), createdAt: at(-daysAgo, 8) } });
    return prisma.$transaction(async (tx) => {
      const sent = await sendRequisitionForApproval(tx, { companyId, id: row.id, requisitionNo: null, amount, actorId: by.id, at: at(-daysAgo, 8) });
      return tx.crmRequisition.update({ where: { id: row.id }, data: { status: "SUBMITTED", submittedAt: at(-daysAgo, 8), requisitionNo: sent.requisitionNo, approvalLimit: sent.approvalLimit, approverId: sent.approverId } });
    });
  };
  await ask(ownerUser, "Floor sander repair", "EQUIPMENT", 120, 2, 0);
  await ask(tendaiUser, "Transport, 3 trips to the clinic job", "TRANSPORT", 60, 1, 1);
  const done = await ask(tendaiUser, "Fuel and materials, Pomona Offices", "MATERIALS", 180, -12, 13);
  await decideCrmRequisition(session(ownerUser), done.id, { approve: true }, at(-13, 9));
  const paidOut = await prisma.crmRequisition.update({ where: { id: done.id }, data: { status: "DISBURSED", disbursedById: rudoUser.id, disbursedAt: at(-12, 7), bankAccountId: cashBox.id, paidAmount: 180, payoutMethod: "CASH" } });
  await postRequisitionDisbursement(prisma, paidOut, { userId: rudoUser.id, role: rudoUser.role });
  const log = await prisma.crmDailyLog.create({ data: { companyId, notes: SEEDED, userId: tendaiUser.id, logDate: new Date(`${day(-10)}T00:00:00.000Z`), submittedAt: at(-10, 16) } });
  const spends: Array<[string, "FUEL" | "MATERIALS", number]> = [
    ["Fuel, 20 litres, Puma Msasa", "FUEL", 32.5],
    ["Tile adhesive, 4 bags, Bhola Hardware", "MATERIALS", 96],
    ["Screed, 1 bag, Halsted Builders", "MATERIALS", 36],
  ];
  for (const [description, category, amount] of spends) {
    await prisma.crmDailyCostEntry.create({ data: { companyId, logId: log.id, direction: "SPENT", category, amount, currency: "USD", description, requisitionId: done.id, receiptUrl: "/demo/receipts/fuel-receipt.png", createdAt: at(-10, 15) } });
  }
  const spent = spends.reduce((sum, [, , amount]) => sum + amount, 0);
  const acquitted = await prisma.crmRequisition.update({
    where: { id: done.id },
    data: { status: "ACQUITTED", acquittedAt: at(-10, 16), acquittedById: ownerUser.id, acquittedAmount: spent, changeAmount: 180 - spent, changeAccountId: cashBox.id },
  });
  await postRequisitionAcquittal(prisma, acquitted, {
    spend: spends.map(([, category, amount]) => ({ category, amount })),
    change: new Prisma.Decimal(180 - spent),
    changeAccountId: cashBox.id,
    actor: { userId: ownerUser.id, role: ownerUser.role },
  });

  // ── Claims: one to approve, one to pay back, one paid; vouchers from the float ──
  const claim = async (by: BooksActor, notes: string, amount: number, category: "TRANSPORT" | "FUEL" | "MATERIALS") => {
    const made = await createClaim(by, { currency: "USD", notes, lines: [{ category, description: notes, amount, taxAmount: 0, fdmsStatus: "NOT_CHECKED", spentOn: day(-3) }] });
    return submitClaim(by, made.id);
  };
  await claim(tendai, "Parking and tolls, Mutare trip", 23, "TRANSPORT");
  const fuelClaim = await claim(rudo, "Fuel, own car, 3 site visits", 36, "FUEL");
  await decideClaim(owner, fuelClaim.id, { approve: true });
  const grout = await claim(owner, "Grout, Bhola Hardware", 14.5, "MATERIALS");
  await decideClaim(rudo, grout.id, { approve: true });
  await reimburseClaim(tendai, grout.id, { bankAccountId: cashBox.id });
  await writeVoucher(owner, { floatId: pettyCash.id, category: "OTHER", description: "Cleaning supplies, showroom", amount: 12, taxAmount: 0, fdmsStatus: "NOT_CHECKED", spentAt: day(-5) });
  await writeVoucher(owner, { floatId: pettyCash.id, category: "TRANSPORT", description: "Taxi to Pomona Offices", amount: 8, taxAmount: 0, fdmsStatus: "NOT_CHECKED", spentAt: day(-4) });
  await writeVoucher(tendai, { floatId: pettyCash.id, category: "MATERIALS", description: "Silicone and masking tape", amount: 35, taxAmount: 0, fdmsStatus: "NOT_CHECKED", spentAt: day(-1) });

  // Their invoice as a photo on Mutare's bill (a receipt the app ships, as the buying screens' demo does).
  await prisma.retailAttachment.create({ data: { companyId, entityType: "PurchaseBill", entityId: b220.id, kind: "BILL", url: "/demo/receipts/repairs-receipt.png", name: "MTW-2291.png", contentType: "image/png", size: 1, addedById: ownerUser.id } });

  console.log(`${company.name}: Bills & spending seeded (bills, payments, orders, ${receipt.receiptNo}'s draft bill, requisitions, claims and a float).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
