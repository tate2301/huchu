/**
 * Migration witness for `20261019160000_books_buying_enums` and
 * `20261019160100_books_buying_crm_money` (books-final §7, P2): the approval
 * targets (D9), the money limits (D10), the purchase order's optional site
 * and approval (D11), the bill's goods receipt, order and FTI check (D12,
 * D16), the supplier payment's states (D5), claims, floats and vouchers
 * (D13), commission's posting fields (D19), and what Vane's and Explore's
 * readers may read of them.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

const columns = async (table: string) => {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table}
    ORDER BY column_name`;
  return Object.fromEntries(rows.map((row) => [row.column_name, row]));
};

const labels = async (name: string) =>
  (await prisma.$queryRawUnsafe<Array<{ value: string }>>(`SELECT unnest(enum_range(NULL::"${name}"))::text AS value`)).map((row) => row.value);

describe("buying and CRM money, as stored", () => {
  it("keeps every Books approval in ApprovalAction (D9)", async () => {
    expect(await labels("ApprovalTargetType")).toEqual(
      expect.arrayContaining(["REQUISITION", "PURCHASE_ORDER", "PURCHASE_BILL", "SUPPLIER_PAYMENT", "EXPENSE_CLAIM", "PETTY_CASH_VOUCHER", "WRITE_OFF", "CREDIT_NOTE", "MANUAL_JOURNAL", "COMMISSION", "VAT_RETURN"]),
    );
  });

  it("posts acquittals, claims, vouchers, top-ups and commission under their own source types", async () => {
    expect(await labels("AccountingSourceType")).toEqual(
      expect.arrayContaining(["REQUISITION_ACQUITTAL", "EXPENSE_CLAIM", "EXPENSE_CLAIM_PAYMENT", "PETTY_CASH_VOUCHER", "PETTY_CASH_TOPUP", "CRM_COMMISSION", "CRM_COMMISSION_PAYMENT"]),
    );
  });

  it("holds the company's money limits with their defaults (D10)", async () => {
    const facts = await columns("RetailApprovalSettings");
    expect(facts.paymentOwnerOver).toMatchObject({ data_type: "numeric", is_nullable: "NO", column_default: "500" });
    expect(facts.journalSecondOver).toMatchObject({ data_type: "numeric", is_nullable: "NO", column_default: "1000" });
    expect(facts.voucherHolderUnder).toMatchObject({ data_type: "numeric", is_nullable: "NO", column_default: "20" });
  });

  it("numbers a requisition and a supplier payment only once they are sent and paid (D8)", async () => {
    expect((await columns("CrmRequisition")).requisitionNo).toMatchObject({ is_nullable: "YES" });
    expect((await columns("PurchasePayment")).paymentNumber).toMatchObject({ is_nullable: "YES" });
  });

  it("lets a purchase order have no shop, and wait for approval (D11)", async () => {
    const facts = await columns("RetailPurchaseOrder");
    expect(facts.siteId).toMatchObject({ is_nullable: "YES" });
    for (const column of ["submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "decisionNote"]) expect(facts[column]).toMatchObject({ is_nullable: "YES" });
    expect(await labels("RetailPurchaseOrderStatus")).toEqual(["DRAFT", "TO_APPROVE", "SENT", "PARTIAL", "RECEIVED", "CLOSED", "CANCELLED"]);
  });

  it("ties a bill to its goods receipt and order, and keeps the FDMS check (D12, D16)", async () => {
    const facts = await columns("PurchaseBill");
    expect(facts.goodsReceiptId).toMatchObject({ is_nullable: "YES" });
    expect(facts.purchaseOrderId).toMatchObject({ is_nullable: "YES" });
    expect(facts.needsReview).toMatchObject({ is_nullable: "NO", column_default: "false" });
    expect(facts.supplierFtiNumber).toMatchObject({ is_nullable: "YES" });
    expect(facts.fdmsStatus).toMatchObject({ is_nullable: "NO", column_default: `'NOT_CHECKED'::"FdmsCheckStatus"` });
    expect(await labels("FdmsCheckStatus")).toEqual(["NOT_CHECKED", "VALID", "NOT_VALID"]);
    const unique = await prisma.$queryRaw<Array<{ indexdef: string }>>`SELECT indexdef FROM pg_indexes WHERE tablename = 'PurchaseBill' AND indexname = 'PurchaseBill_goodsReceiptId_key'`;
    expect(unique[0]?.indexdef).toContain("UNIQUE INDEX");
    // Every posted goods receipt has its bill: a draft, flagged, never posted.
    const [orphans] = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM "RetailGoodsReceipt" g WHERE g."status" = 'POSTED' AND NOT EXISTS (SELECT 1 FROM "PurchaseBill" b WHERE b."goodsReceiptId" = g."id")`;
    expect(Number(orphans!.n)).toBe(0);
  });

  it("gives a supplier payment its states, every past one Paid (D5)", async () => {
    const facts = await columns("PurchasePayment");
    expect(facts.status).toMatchObject({ is_nullable: "NO", column_default: `'PAID'::"PurchasePaymentStatus"` });
    for (const column of ["approvedById", "approvedAt", "voidedAt", "voidedById", "voidReason", "approverId", "approvalLimit"]) expect(facts[column]).toMatchObject({ is_nullable: "YES" });
    expect(await labels("PurchasePaymentStatus")).toEqual(["DRAFT", "TO_APPROVE", "APPROVED", "PAID", "VOIDED"]);
  });

  it("holds claims and their lines, floats and vouchers (D13)", async () => {
    const claim = await columns("ExpenseClaim");
    expect(claim.claimNo).toMatchObject({ is_nullable: "YES" });
    expect(claim.status).toMatchObject({ column_default: `'DRAFT'::"ExpenseClaimStatus"` });
    expect(claim.needsReview).toMatchObject({ column_default: "false" });
    const line = await columns("ExpenseClaimLine");
    expect(line.costEntryId).toMatchObject({ is_nullable: "YES" });
    expect(line.alreadyPostedEntryId).toMatchObject({ is_nullable: "YES" });
    const bank = await columns("BankAccount");
    expect(bank.isFloat).toMatchObject({ is_nullable: "NO", column_default: "false" });
    expect(bank.imprestAmount).toMatchObject({ data_type: "numeric", is_nullable: "YES" });
    expect(bank.holderId).toMatchObject({ is_nullable: "YES" });
    const voucher = await columns("PettyCashVoucher");
    expect(voucher.kind).toMatchObject({ column_default: `'SPEND'::"PettyCashVoucherKind"` });
    expect(voucher.bankAccountId).toMatchObject({ is_nullable: "NO" });
    const rules = await prisma.$queryRaw<Array<{ table: string; column: string; on_delete: string }>>`
      SELECT kcu.table_name AS table, kcu.column_name AS column, rc.delete_rule AS on_delete
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name IN ('ExpenseClaim', 'ExpenseClaimLine', 'PettyCashVoucher')
      ORDER BY kcu.table_name, kcu.column_name`;
    expect(rules).toEqual([
      { table: "ExpenseClaim", column: "bankAccountId", on_delete: "SET NULL" },
      { table: "ExpenseClaim", column: "claimantId", on_delete: "RESTRICT" },
      { table: "ExpenseClaim", column: "companyId", on_delete: "CASCADE" },
      { table: "ExpenseClaimLine", column: "claimId", on_delete: "CASCADE" },
      { table: "ExpenseClaimLine", column: "companyId", on_delete: "CASCADE" },
      { table: "PettyCashVoucher", column: "bankAccountId", on_delete: "RESTRICT" },
      { table: "PettyCashVoucher", column: "companyId", on_delete: "CASCADE" },
      { table: "PettyCashVoucher", column: "fromBankAccountId", on_delete: "SET NULL" },
    ]);
  });

  it("keeps who approved and paid commission, and its journal (D19)", async () => {
    const facts = await columns("CrmCommissionEntry");
    for (const column of ["approvedAt", "paidById", "paidBankAccountId", "journalEntryId", "voidedAt", "voidedById"]) expect(facts[column]).toMatchObject({ is_nullable: "YES" });
  });

  it("lets Vane's and Explore's readers read the new tables and columns", async () => {
    for (const reader of ["vane_reader", "explore_reader"]) {
      const rows = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT table_name || '.' || column_name AS name FROM information_schema.column_privileges
        WHERE grantee = ${reader} AND privilege_type = 'SELECT'
          AND ((table_name IN ('ExpenseClaim', 'ExpenseClaimLine', 'PettyCashVoucher') AND column_name IN ('companyId', 'status', 'amount', 'total'))
            OR (table_name = 'PurchaseBill' AND column_name IN ('fdmsStatus', 'goodsReceiptId'))
            OR (table_name = 'PurchasePayment' AND column_name = 'status')
            OR (table_name = 'BankAccount' AND column_name = 'isFloat')
            OR (table_name = 'RetailApprovalSettings' AND column_name = 'paymentOwnerOver')
            OR (table_name = 'CrmCommissionEntry' AND column_name = 'journalEntryId'))
        ORDER BY 1`;
      expect(rows.map((row) => row.name), reader).toEqual([
        "BankAccount.isFloat",
        "CrmCommissionEntry.journalEntryId",
        "ExpenseClaim.companyId",
        "ExpenseClaim.status",
        "ExpenseClaim.total",
        "ExpenseClaimLine.amount",
        "ExpenseClaimLine.companyId",
        "PettyCashVoucher.amount",
        "PettyCashVoucher.companyId",
        "PettyCashVoucher.status",
        "PurchaseBill.fdmsStatus",
        "PurchaseBill.goodsReceiptId",
        "PurchasePayment.status",
        "RetailApprovalSettings.paymentOwnerOver",
      ]);
    }
  });
});
