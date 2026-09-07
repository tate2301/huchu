export type RetailPostingPayment = {
  tenderType: string;
  amount: number;
  reference?: string | null;
  currency?: string | null;
};

export type RetailPostingInventoryLine = {
  inventoryItemId?: string;
  itemName?: string;
  quantity: number;
  unitCost: number;
  totalCost?: number;
};

export type RetailPostingPayload = {
  siteId?: string | null;
  registerCode?: string | null;
  saleType?: string | null;
  movementType?: string | null;
  customerTaxCategoryId?: string | null;
  vendorTaxCategoryId?: string | null;
  currency?: string | null;
  payments?: RetailPostingPayment[];
  inventory?: {
    lines: RetailPostingInventoryLine[];
    totalCost: number;
  };
};

function toMoney(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

export function normalizeRetailPayments(
  payments: Array<RetailPostingPayment | null | undefined>,
): RetailPostingPayment[] {
  return payments
    .filter((payment): payment is RetailPostingPayment => Boolean(payment))
    .map((payment) => ({
      tenderType: payment.tenderType,
      amount: toMoney(Math.abs(payment.amount)),
      reference: payment.reference ?? null,
      currency: payment.currency ?? null,
    }))
    .filter((payment) => payment.amount > 0);
}

export function summarizeRetailInventory(
  lines: Array<RetailPostingInventoryLine | null | undefined>,
) {
  const normalized = lines
    .filter((line): line is RetailPostingInventoryLine => Boolean(line))
    .map((line) => {
      const quantity = toMoney(Math.abs(line.quantity));
      const unitCost = toMoney(Math.abs(line.unitCost));
      const totalCost = toMoney(line.totalCost ?? quantity * unitCost);
      return {
        inventoryItemId: line.inventoryItemId,
        itemName: line.itemName,
        quantity,
        unitCost,
        totalCost,
      };
    })
    .filter((line) => line.totalCost > 0);

  return {
    lines: normalized,
    totalCost: toMoney(normalized.reduce((total, line) => total + line.totalCost, 0)),
  };
}

export function buildRetailPostingPayload(input: RetailPostingPayload): RetailPostingPayload {
  const inventory = summarizeRetailInventory(input.inventory?.lines ?? []);
  return {
    siteId: input.siteId ?? null,
    registerCode: input.registerCode ?? null,
    saleType: input.saleType ?? null,
    movementType: input.movementType ?? null,
    customerTaxCategoryId: input.customerTaxCategoryId ?? null,
    vendorTaxCategoryId: input.vendorTaxCategoryId ?? null,
    currency: input.currency ?? null,
    payments: normalizeRetailPayments(input.payments ?? []),
    inventory: {
      lines: inventory.lines,
      totalCost:
        inventory.totalCost > 0
          ? inventory.totalCost
          : toMoney(input.inventory?.totalCost ?? inventory.totalCost),
    },
  };
}
