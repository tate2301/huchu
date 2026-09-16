/**
 * Which bank accounts reach a customer-facing document.
 *
 * The rule this pins down is easy to get wrong, and was wrong once: document
 * visibility follows `showOnDocuments` and nothing else. Deactivating an
 * account through /accounting/banking sets `isActive: false`, and the first
 * version of `getDocumentBranding` filtered on that too — so retiring an
 * account from the ledger silently changed the payment instructions on the
 * next quotation, and fell back to whatever single legacy account
 * `CompanyBranding` still held.
 *
 * A comment would not stop somebody adding the filter back. This does.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";

const SLUG = "document-accounts-test";
let companyId: string;

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Document Accounts Test Co", slug: SLUG },
  });
  companyId = company.id;

  await prisma.bankAccount.deleteMany({ where: { companyId } });
  await prisma.bankAccount.createMany({
    data: [
      // Opted in and still live.
      {
        companyId,
        name: "USD Current",
        currency: "USD",
        accountName: "Test Account Name",
        accountNumber: "00000000000001",
        showOnDocuments: true,
        documentPosition: 0,
        isActive: true,
      },
      // Opted in, but retired from the ledger. Must still print.
      {
        companyId,
        name: "ZWG Current",
        currency: "ZWG",
        accountName: "Test Account Name",
        accountNumber: "00000000000002",
        showOnDocuments: true,
        documentPosition: 1,
        isActive: false,
      },
      // Live, but never opted in. Must not print.
      {
        companyId,
        name: "Payroll Clearing",
        currency: "USD",
        accountName: "Test Account Name",
        accountNumber: "00000000000003",
        showOnDocuments: false,
        isActive: true,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.bankAccount.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("getDocumentBranding account selection", () => {
  it("includes an opted-in account that has been deactivated in the ledger", async () => {
    const branding = await getDocumentBranding(companyId);
    const numbers = (branding.bankAccounts ?? []).map((a) => a.accountNumber);
    expect(numbers).toContain("00000000000002");
  });

  it("excludes a live account nobody opted in", async () => {
    const branding = await getDocumentBranding(companyId);
    const numbers = (branding.bankAccounts ?? []).map((a) => a.accountNumber);
    expect(numbers).not.toContain("00000000000003");
  });

  it("orders by documentPosition so a tenant can lead with its preferred currency", async () => {
    const branding = await getDocumentBranding(companyId);
    expect((branding.bankAccounts ?? []).map((a) => a.currency)).toEqual(["USD", "ZWG"]);
  });
});
