-- P2 (books-final §8, approved 19 Oct): the enum values buying and CRM money need, in a
-- migration of their own because Postgres will not use a value added in the same transaction.
--   D9: every Books approval is one ApprovalAction row, so its target types are added.
--   D11: a purchase order over the limit waits, "To approve", before it is sent.
--   Postings: a requisition's acquittal by category, claims and their reimbursement, petty cash
--   vouchers and top-ups, and commission approved and paid each post under a source type of their own.
-- No table or column changes shape here, so there are no reader grants.

ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'REQUISITION';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'PURCHASE_BILL';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'EXPENSE_CLAIM';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'PETTY_CASH_VOUCHER';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'WRITE_OFF';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'MANUAL_JOURNAL';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'COMMISSION';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'VAT_RETURN';

ALTER TYPE "RetailPurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'TO_APPROVE' AFTER 'DRAFT';

ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'REQUISITION_ACQUITTAL';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'EXPENSE_CLAIM';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'EXPENSE_CLAIM_PAYMENT';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'PETTY_CASH_VOUCHER';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'PETTY_CASH_TOPUP';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'CRM_COMMISSION';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'CRM_COMMISSION_PAYMENT';
