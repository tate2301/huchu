import { renderDocumentHtml } from "@/lib/documents/html-renderer";
import { applyPayslipLayout } from "@/lib/documents/payslip-rows";
import { getSamplePayload } from "@/lib/documents/sample-payloads";
import type { DocumentTemplateSchema } from "@/lib/documents/template-schema";
import type { CompanyBrandingSnapshot } from "@/lib/documents/types";
import { DOCUMENT_MONO_FONT_FAMILY, getDocumentFontByKey } from "@/lib/platform/branding";

/**
 * A library layout as it prints, for the admin portal's builder: the source's
 * sample record on a made-up company's letterhead. A workspace's own branding
 * replaces all of it once the layout reaches one; the layout only decides what
 * shows and how the page is set.
 */

const INTER = getDocumentFontByKey("inter");

export const SAMPLE_BRANDING: CompanyBrandingSnapshot = {
  displayName: "Sample Company",
  legalName: "Sample Company (Private) Limited",
  tradingName: "Sample Company",
  registrationNumber: "1234/2020",
  taxNumber: "2000123456",
  email: "accounts@sample.example",
  phone: "+263 242 000 000",
  physicalAddress: "1 Sample Road, Harare",
  bankName: "Sample Bank",
  bankAccountName: "Sample Company",
  bankAccountNumber: "0000 0000 0000",
  defaultFooterText: "Thank you for your business.",
  legalDisclaimer: "This document is a sample.",
  primaryColor: "#0B5DF0",
  secondaryColor: "#E8EFFE",
  accentColor: "#EEF3FE",
  fontFamily: INTER.fontFamily,
  fontImportUrl: INTER.importUrl,
  monoFontFamily: DOCUMENT_MONO_FONT_FAMILY,
};

export function libraryLayoutPreview(sourceKey: string, template: DocumentTemplateSchema): string {
  const sample = getSamplePayload(sourceKey);
  const payload = sourceKey === "hr.payslip" ? applyPayslipLayout(sample, template) : sample;
  return renderDocumentHtml({ payload, branding: SAMPLE_BRANDING, template });
}
