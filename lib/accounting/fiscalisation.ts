import { prisma } from "@/lib/prisma";

export type FiscalValidationResult = {
  ok: boolean;
  missing: string[];
};

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export async function validateFiscalInvoice(companyId: string, invoiceId: string): Promise<FiscalValidationResult> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      lines: true,
    },
  });

  if (!invoice || invoice.companyId !== companyId) {
    return { ok: false, missing: ["invoice"] };
  }

  const settings = await prisma.accountingSettings.findUnique({
    where: { companyId },
  });

  const missing: string[] = [];
  if (!settings) {
    missing.push("accounting settings");
  } else {
    if (!normalize(settings.legalName)) missing.push("supplier legal name");
    if (!normalize(settings.vatNumber)) missing.push("supplier VAT number");
    if (!normalize(settings.taxNumber)) missing.push("supplier tax number");
    if (!normalize(settings.address)) missing.push("supplier address");
  }

  if (!normalize(invoice.invoiceNumber)) missing.push("invoice number");
  if (!invoice.invoiceDate) missing.push("invoice date");
  if (!normalize(invoice.currency)) missing.push("currency");

  if (!normalize(invoice.customer?.name)) missing.push("customer name");
  if (!normalize(invoice.customer?.address)) missing.push("customer address");

  if (!invoice.lines || invoice.lines.length === 0) {
    missing.push("invoice line items");
  }

  const invalidLines = (invoice.lines ?? []).filter(
    (line) =>
      !normalize(line.description) ||
      line.quantity <= 0 ||
      !Number.isFinite(line.unitPrice) ||
      line.unitPrice < 0,
  );
  if (invalidLines.length > 0) missing.push("valid line descriptions and quantities");

  return { ok: missing.length === 0, missing };
}

export async function issueFiscalReceipt(companyId: string, invoiceId: string, actorId: string) {
  void actorId;
  const validation = await validateFiscalInvoice(companyId, invoiceId);
  if (!validation.ok) {
    return { status: "FAILED", error: `Missing fiscal fields: ${validation.missing.join(", ")}` };
  }

  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      lines: true,
    },
  });

  if (!invoice) {
    return { status: "FAILED", error: "Invoice not found" };
  }

  const provider = await prisma.fiscalisationProviderConfig.findFirst({
    where: { companyId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!provider) {
    return { status: "FAILED", error: "Missing fiscalisation provider configuration" };
  }

  const payload = {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    currency: invoice.currency,
    totals: {
      subTotal: invoice.subTotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
    },
    supplier: await prisma.accountingSettings.findUnique({
      where: { companyId },
      select: {
        legalName: true,
        tradingName: true,
        vatNumber: true,
        taxNumber: true,
        address: true,
        phone: true,
        email: true,
      },
    }),
    customer: {
      name: invoice.customer?.name ?? null,
      taxNumber: invoice.customer?.taxNumber ?? null,
      vatNumber: invoice.customer?.vatNumber ?? null,
      address: invoice.customer?.address ?? null,
      phone: invoice.customer?.phone ?? null,
      email: invoice.customer?.email ?? null,
    },
    items: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
    })),
  };

  const receipt = await prisma.fiscalReceipt.create({
    data: {
      companyId,
      invoiceId,
      status: "PENDING",
      providerKey: provider.providerKey,
      rawResponseJson: JSON.stringify({
        status: "PENDING",
        providerKey: provider.providerKey,
        request: payload,
      }),
    },
  });

  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: {
      fiscalStatus: "PENDING",
    },
  });

  return { status: "PENDING", receiptId: receipt.id, providerKey: provider.providerKey };
}

export async function markFiscalReceiptResult(input: {
  receiptId: string;
  status: "SUCCESS" | "FAILED" | "VOIDED";
  fiscalNumber?: string | null;
  qrCodeData?: string | null;
  signature?: string | null;
  rawResponseJson?: string | null;
  error?: string | null;
}) {
  const updated = await prisma.fiscalReceipt.update({
    where: { id: input.receiptId },
    data: {
      status: input.status,
      fiscalNumber: input.fiscalNumber ?? undefined,
      qrCodeData: input.qrCodeData ?? undefined,
      signature: input.signature ?? undefined,
      rawResponseJson: input.rawResponseJson ?? undefined,
      lastError: input.error ?? undefined,
      issuedAt: input.status === "SUCCESS" ? new Date() : undefined,
    },
  });

  if (updated.invoiceId) {
    await prisma.salesInvoice.update({
      where: { id: updated.invoiceId },
      data: {
        fiscalStatus: updated.status,
      },
    });
  }

  return updated;
}
