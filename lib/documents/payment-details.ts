/**
 * The payment block, in one place.
 *
 * A customer sees the same job's banking details twice: on the generated
 * quotation or invoice, and on the public approval page they are sent to sign
 * it. Those were computed separately, and drifted the moment multi-currency
 * accounts arrived — the document printed the opted-in accounts while the
 * approval page still read the single legacy field and, finding it empty,
 * showed no payment details at all.
 *
 * Both now call this. Two renderings of one list, not two lists.
 */

import type { CompanyBrandingSnapshot } from "@/lib/documents/types";

export type PaymentRow = { label: string; value: string };

/**
 * Bank-level details first, then one pair of rows per account.
 *
 * The bank-level facts are the same whichever account is paid into, so they are
 * stated once rather than repeated per account. Accounts are labelled by
 * currency so nobody pays USD into the ZWG account.
 *
 * Returns an empty array when nothing is configured, which is the signal to
 * omit the block rather than render an empty heading.
 */
export function buildPaymentRows(branding: CompanyBrandingSnapshot): PaymentRow[] {
  const rows: Array<PaymentRow | null> = [
    branding.bankName ? { label: "Bank", value: branding.bankName } : null,
    branding.bankBranch ? { label: "Branch", value: branding.bankBranch } : null,
    branding.bankBranchCode ? { label: "Branch Code", value: branding.bankBranchCode } : null,
    branding.bankAddress ? { label: "Bank Address", value: branding.bankAddress } : null,
    branding.bankSwiftCode ? { label: "SWIFT/BIC", value: branding.bankSwiftCode } : null,
  ];

  const accounts = branding.bankAccounts ?? [];
  if (accounts.length > 0) {
    for (const account of accounts) {
      if (account.accountName) {
        rows.push({ label: `${account.currency} Account Name`, value: account.accountName });
      }
      if (account.accountNumber) {
        rows.push({ label: `${account.currency} Account No.`, value: account.accountNumber });
      }
    }
  } else {
    // A tenant that has only ever filled in the single legacy account still
    // gets the block it had before, without a currency prefix — there is no
    // second account to confuse it with.
    rows.push(
      branding.bankAccountName
        ? { label: "Account Name", value: branding.bankAccountName }
        : null,
    );
    rows.push(
      branding.bankAccountNumber
        ? { label: "Account No.", value: branding.bankAccountNumber }
        : null,
    );
  }

  rows.push(branding.bankIban ? { label: "IBAN", value: branding.bankIban } : null);

  return rows.filter((row): row is PaymentRow => row !== null);
}
