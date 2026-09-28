import { prisma } from "@/lib/prisma";
import {
  DOCUMENT_MONO_FONT_FAMILY,
  getDocumentFontByKey,
  getEffectiveBrandingForCompany,
} from "@/lib/platform/branding";
import type { CompanyBrandingSnapshot } from "@/lib/documents/types";

export async function getDocumentBranding(companyId: string): Promise<CompanyBrandingSnapshot> {
  const [effective, raw, bankAccounts] = await Promise.all([
    getEffectiveBrandingForCompany(companyId),
    prisma.companyBranding.findUnique({
      where: { companyId },
      select: {
        legalName: true,
        tradingName: true,
        registrationNumber: true,
        taxNumber: true,
        vatNumber: true,
        email: true,
        phone: true,
        website: true,
        physicalAddress: true,
        postalAddress: true,
        bankName: true,
        bankBranch: true,
        bankBranchCode: true,
        bankAddress: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankSwiftCode: true,
        bankIban: true,
        defaultFooterText: true,
        legalDisclaimer: true,
        paymentTerms: true,
        logoUrl: true,
        secondaryLogoUrl: true,
        signatureUrl: true,
        stampUrl: true,
        documentLocale: true,
        dateFormat: true,
        timeFormat: true,
        numberFormat: true,
        currencyDisplayMode: true,
      },
    }),
    // Only the accounts somebody has opted in to appearing on paper. An account
    // the ledger reconciles is not automatically an account to be paid into.
    //
    // Deliberately NOT filtered on `isActive`. Deactivating an account through
    // /accounting/banking sets `isActive: false`, and if that also pulled the
    // account off the paper, retiring it from the ledger would silently change
    // what the next quotation tells a customer to pay into -- and fall back to
    // whatever single legacy account `CompanyBranding` still holds. Taking an
    // account off customer-facing documents is its own decision, so it has its
    // own flag.
    prisma.bankAccount.findMany({
      where: { companyId, showOnDocuments: true },
      orderBy: [{ documentPosition: "asc" }, { currency: "asc" }],
      select: { currency: true, accountName: true, accountNumber: true },
    }),
  ]);

  // `effective.fontFamily` is the app's value and is built on CSS variables
  // that only exist inside the app. A document needs the resolved face.
  const documentFont = getDocumentFontByKey(effective.fontFamilyKey);

  return {
    displayName: effective.displayName,
    fontFamily: documentFont.fontFamily,
    fontImportUrl: documentFont.importUrl,
    monoFontFamily: DOCUMENT_MONO_FONT_FAMILY,
    primaryColor: effective.colors.primary,
    secondaryColor: effective.colors.secondary,
    accentColor: effective.colors.accent,
    legalName: raw?.legalName ?? null,
    tradingName: raw?.tradingName ?? null,
    registrationNumber: raw?.registrationNumber ?? null,
    taxNumber: raw?.taxNumber ?? null,
    vatNumber: raw?.vatNumber ?? null,
    email: raw?.email ?? null,
    phone: raw?.phone ?? null,
    website: raw?.website ?? null,
    physicalAddress: raw?.physicalAddress ?? null,
    postalAddress: raw?.postalAddress ?? null,
    bankName: raw?.bankName ?? null,
    bankBranch: raw?.bankBranch ?? null,
    bankBranchCode: raw?.bankBranchCode ?? null,
    bankAddress: raw?.bankAddress ?? null,
    bankAccountName: raw?.bankAccountName ?? null,
    bankAccountNumber: raw?.bankAccountNumber ?? null,
    bankSwiftCode: raw?.bankSwiftCode ?? null,
    bankAccounts,
    bankIban: raw?.bankIban ?? null,
    defaultFooterText: raw?.defaultFooterText ?? null,
    legalDisclaimer: raw?.legalDisclaimer ?? null,
    paymentTerms: raw?.paymentTerms ?? null,
    logoUrl: raw?.logoUrl ?? null,
    secondaryLogoUrl: raw?.secondaryLogoUrl ?? null,
    signatureUrl: raw?.signatureUrl ?? null,
    stampUrl: raw?.stampUrl ?? null,
    documentLocale: raw?.documentLocale ?? null,
    dateFormat: raw?.dateFormat ?? null,
    timeFormat: raw?.timeFormat ?? null,
    numberFormat: raw?.numberFormat ?? null,
    currencyDisplayMode: raw?.currencyDisplayMode ?? null,
  };
}
