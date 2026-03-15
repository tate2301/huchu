import type { Prisma, ScrapMetalBalanceEntryType } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

export const SCRAP_METAL_CATEGORIES = [
  "BATTERIES",
  "COPPER",
  "ALUMINUM",
  "STEEL",
  "BRASS",
  "MIXED",
  "OTHER",
] as const;

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

async function generateUniqueNumber(args: {
  tx: TransactionClient;
  prefix: string;
  exists: (candidate: string) => Promise<boolean>;
}) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const now = new Date();
    const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
    const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
    const randomPart = Math.floor(100 + Math.random() * 900);
    const candidate = `${args.prefix}-${datePart}-${timePart}-${randomPart}`;
    if (!(await args.exists(candidate))) {
      return candidate;
    }
  }
  return `${args.prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function applyScrapBalanceDelta(
  tx: TransactionClient,
  input: {
    companyId: string;
    employeeId: string;
    amountDelta: number;
    entryType: ScrapMetalBalanceEntryType;
    sourceId?: string | null;
    note?: string | null;
    createdById?: string | null;
  },
) {
  const balance = await tx.scrapMetalEmployeeBalance.upsert({
    where: {
      companyId_employeeId: {
        companyId: input.companyId,
        employeeId: input.employeeId,
      },
    },
    create: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      balance: input.amountDelta,
    },
    update: {
      balance: {
        increment: input.amountDelta,
      },
    },
  });

  const refreshedBalance = await tx.scrapMetalEmployeeBalance.findUniqueOrThrow({
    where: { id: balance.id },
    select: { id: true, balance: true },
  });

  await tx.scrapMetalBalanceEntry.create({
    data: {
      companyId: input.companyId,
      balanceId: refreshedBalance.id,
      employeeId: input.employeeId,
      entryType: input.entryType,
      amountDelta: input.amountDelta,
      balanceAfter: refreshedBalance.balance,
      sourceId: input.sourceId ?? undefined,
      note: input.note ?? undefined,
      createdById: input.createdById ?? undefined,
    },
  });

  return refreshedBalance;
}

export async function createScrapPurchaseAccountingDocs(
  tx: TransactionClient,
  input: {
    companyId: string;
    vendorId: string;
    description: string;
    amount: number;
    currency: string;
    billDate: Date;
    paymentMethod?: string | null;
    paymentReference?: string | null;
    createdById: string;
  },
) {
  const billNumber = await generateUniqueNumber({
    tx,
    prefix: "BILL",
    exists: async (candidate) => {
      const existing = await tx.purchaseBill.findFirst({
        where: { billNumber: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    },
  });

  const bill = await tx.purchaseBill.create({
    data: {
      companyId: input.companyId,
      vendorId: input.vendorId,
      billNumber,
      billDate: input.billDate,
      dueDate: input.billDate,
      status: input.paymentMethod ? "PAID" : "RECEIVED",
      currency: input.currency,
      subTotal: input.amount,
      taxTotal: 0,
      total: input.amount,
      amountPaid: input.paymentMethod ? input.amount : 0,
      notes: input.description,
      createdById: input.createdById,
      issuedById: input.createdById,
      issuedAt: input.billDate,
      lines: {
        create: [
          {
            description: input.description,
            quantity: 1,
            unitPrice: input.amount,
            taxRate: 0,
            taxAmount: 0,
            lineTotal: input.amount,
          },
        ],
      },
    },
  });

  let payment: { id: string; paidAt: Date } | null = null;
  if (input.paymentMethod) {
    const paymentNumber = await generateUniqueNumber({
      tx,
      prefix: "PAY",
      exists: async (candidate) => {
        const existing = await tx.purchasePayment.findFirst({
          where: { paymentNumber: candidate },
          select: { id: true },
        });
        return Boolean(existing);
      },
    });

    payment = await tx.purchasePayment.create({
      data: {
        companyId: input.companyId,
        billId: bill.id,
        paymentNumber,
        paidAt: input.billDate,
        amount: input.amount,
        method: input.paymentMethod,
        reference: input.paymentReference ?? undefined,
        createdById: input.createdById,
      },
      select: { id: true, paidAt: true },
    });
  }

  return { bill, payment };
}

export async function createScrapSaleAccountingDocs(
  tx: TransactionClient,
  input: {
    companyId: string;
    customerId: string;
    description: string;
    amount: number;
    currency: string;
    invoiceDate: Date;
    paymentMethod?: string | null;
    paymentReference?: string | null;
    createdById: string;
  },
) {
  const invoiceNumber = await generateUniqueNumber({
    tx,
    prefix: "INV",
    exists: async (candidate) => {
      const existing = await tx.salesInvoice.findFirst({
        where: { invoiceNumber: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    },
  });

  const invoice = await tx.salesInvoice.create({
    data: {
      companyId: input.companyId,
      customerId: input.customerId,
      invoiceNumber,
      invoiceDate: input.invoiceDate,
      dueDate: input.invoiceDate,
      status: input.paymentMethod ? "PAID" : "ISSUED",
      currency: input.currency,
      subTotal: input.amount,
      taxTotal: 0,
      total: input.amount,
      amountPaid: input.paymentMethod ? input.amount : 0,
      notes: input.description,
      createdById: input.createdById,
      issuedById: input.createdById,
      issuedAt: input.invoiceDate,
      lines: {
        create: [
          {
            description: input.description,
            quantity: 1,
            unitPrice: input.amount,
            taxRate: 0,
            taxAmount: 0,
            lineTotal: input.amount,
          },
        ],
      },
    },
  });

  let receipt: { id: string; receivedAt: Date } | null = null;
  if (input.paymentMethod) {
    const receiptNumber = await generateUniqueNumber({
      tx,
      prefix: "REC",
      exists: async (candidate) => {
        const existing = await tx.salesReceipt.findFirst({
          where: { receiptNumber: candidate },
          select: { id: true },
        });
        return Boolean(existing);
      },
    });

    receipt = await tx.salesReceipt.create({
      data: {
        companyId: input.companyId,
        invoiceId: invoice.id,
        receiptNumber,
        receivedAt: input.invoiceDate,
        amount: input.amount,
        method: input.paymentMethod,
        reference: input.paymentReference ?? undefined,
        createdById: input.createdById,
      },
      select: { id: true, receivedAt: true },
    });
  }

  return { invoice, receipt };
}
