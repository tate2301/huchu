import { buildPaymentRows, type PaymentRow } from "@/lib/documents/payment-details";

/**
 * Branding (PageBrandIdentity, PageBrandAssets, PageBrandFinance): the form's
 * state, what Save sends, each tab's finding and the live quotation beside it.
 * Pure, so the page and its tests share one reading of the record.
 *
 * The record is `CompanyBranding`, read and written through
 * `/api/settings/branding` exactly as before; the two domain routes and the
 * payment-accounts route are unchanged.
 */

export type BrandingTab = "identity" | "assets" | "finance";

export const BRANDING_TABS: Array<{ value: BrandingTab; label: string; href: string }> = [
  { value: "identity", label: "Identity and theme", href: "/preferences/organization/branding/identity" },
  { value: "assets", label: "Assets and contact", href: "/preferences/organization/branding/assets" },
  { value: "finance", label: "Finance and defaults", href: "/preferences/organization/branding/finance" },
];

export function tabOfPath(pathname: string | null | undefined, fallback: BrandingTab): BrandingTab {
  const last = (pathname ?? "").split("/").filter(Boolean).pop();
  return BRANDING_TABS.some((tab) => tab.value === last) ? (last as BrandingTab) : fallback;
}

export const BRANDING_FIELDS = [
  "displayName",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "fontFamilyKey",
  "logoUrl",
  "secondaryLogoUrl",
  "signatureUrl",
  "stampUrl",
  "legalName",
  "tradingName",
  "registrationNumber",
  "vatNumber",
  "taxNumber",
  "email",
  "phone",
  "website",
  "physicalAddress",
  "postalAddress",
  "privacyPolicyUrl",
  "termsUrl",
  "bankName",
  "bankBranch",
  "bankBranchCode",
  "bankAddress",
  "bankAccountName",
  "bankAccountNumber",
  "bankSwiftCode",
  "bankIban",
  "defaultFooterText",
  "legalDisclaimer",
  "paymentTerms",
  "documentLocale",
  "dateFormat",
  "timeFormat",
  "numberFormat",
  "currencyDisplayMode",
] as const;

export type BrandingField = (typeof BRANDING_FIELDS)[number];
export type BrandingRecord = Record<BrandingField, string | null>;
export type BrandingForm = Record<BrandingField, string>;

export type DomainStatus = "PENDING_VERIFICATION" | "VERIFIED" | "ACTIVE" | "FAILED" | "DISABLED";

export type BrandingResponse = {
  company: { id: string; name: string; slug: string };
  branding: BrandingRecord | null;
  effective: {
    displayName: string;
    brandingEnabled: boolean;
    customDomainEnabled: boolean;
    colors: { primary: string; secondary: string; accent: string };
    fontFamilyKey: string;
  };
  domain: {
    hostname: string;
    status: DomainStatus;
    verificationType: string;
    verificationHost: string;
    verificationValue: string;
    lastCheckedAt: string | null;
    verifiedAt: string | null;
    activatedAt: string | null;
  } | null;
  fontOptions: Array<{ key: string; label: string; fontFamily: string }>;
};

/** An account the paper asks customers to pay into (`/api/settings/branding/payment-accounts`). */
export type PaymentAccount = {
  id: string;
  name: string;
  currency: string;
  accountName: string | null;
  accountNumber: string | null;
  bankName: string | null;
  showOnDocuments: boolean;
  documentPosition: number;
};

/** The form as the record has it; the colours and the face fall back to what documents use today. */
export function formOf(data: BrandingResponse): BrandingForm {
  const form = Object.fromEntries(BRANDING_FIELDS.map((field) => [field, data.branding?.[field] ?? ""])) as BrandingForm;
  form.primaryColor = data.branding?.primaryColor ?? data.effective.colors.primary;
  form.secondaryColor = data.branding?.secondaryColor ?? data.effective.colors.secondary;
  form.accentColor = data.branding?.accentColor ?? data.effective.colors.accent;
  form.fontFamilyKey = data.branding?.fontFamilyKey ?? data.effective.fontFamilyKey;
  return form;
}

const nullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/** What Save sends: every field, blanks as null. The colours and the face are never blank. */
export function payloadOf(form: BrandingForm): Record<BrandingField, string | null> {
  const payload = Object.fromEntries(BRANDING_FIELDS.map((field) => [field, nullable(form[field])])) as Record<
    BrandingField,
    string | null
  >;
  payload.primaryColor = form.primaryColor;
  payload.secondaryColor = form.secondaryColor;
  payload.accentColor = form.accentColor;
  payload.fontFamilyKey = form.fontFamilyKey;
  return payload;
}

/** The fields that differ from what is saved. */
export function changedFields(saved: BrandingForm, draft: BrandingForm): BrandingField[] {
  return BRANDING_FIELDS.filter((field) => saved[field].trim() !== draft[field].trim());
}

/** `#RRGGBB` in upper case, or null: a swatch cannot draw anything else. */
export function normalizeHex(input: string): string | null {
  const value = input.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(value) ? value : null;
}

/** A colour that is not a full hex is refused before it reaches the server. */
export function invalidColours(form: BrandingForm): Array<"primaryColor" | "secondaryColor" | "accentColor"> {
  return (["primaryColor", "secondaryColor", "accentColor"] as const).filter((field) => !normalizeHex(form[field]));
}

/* ---------------------------------------------------------------------- *
 * The formats: a stored string of up to 40 characters each, chosen from
 * worked examples. Anything already saved that is not on a list is offered
 * back as its own option, so choosing nothing never rewrites it.
 * ---------------------------------------------------------------------- */

export type Option = { value: string; label: string };

export const DATE_FORMATS: Option[] = [
  { value: "dd MMM yyyy", label: "11 Oct 2026" },
  { value: "yyyy-MM-dd", label: "2026-10-11" },
  { value: "dd/MM/yyyy", label: "11/10/2026" },
];

export const TIME_FORMATS: Option[] = [
  { value: "HH:mm", label: "24-hour, 14:05" },
  { value: "h:mm a", label: "12-hour, 2:05 pm" },
];

export const NUMBER_FORMATS: Option[] = [
  { value: "1,234,567.89", label: "1,234.56" },
  { value: "1 234 567.89", label: "1 234.56" },
];

export const MONEY_FORMATS: Option[] = [
  { value: "$1 234.00", label: "$1,234.56" },
  { value: "USD 1 234.00", label: "USD 1,234.56" },
  { value: "1 234.00 USD", label: "1,234.56 USD" },
];

export const LANGUAGES: Option[] = [
  { value: "en-ZW", label: "English, Zimbabwe" },
  { value: "en-ZA", label: "English, South Africa" },
  { value: "en-GB", label: "English, United Kingdom" },
  { value: "en-US", label: "English, United States" },
];

export function withCurrent(options: Option[], current: string): Option[] {
  const value = current.trim();
  if (!value || options.some((option) => option.value === value)) return options;
  return [...options, { value, label: value }];
}

/* ---------------------------------------------------------------------- *
 * Each tab's finding
 * ---------------------------------------------------------------------- */

export type Finding = { fact: string; rest: string };

const list = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const either = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

export function nameOf(form: BrandingForm, companyName: string): string {
  return form.displayName.trim() || companyName;
}

export function findingFor(
  tab: BrandingTab,
  form: BrandingForm,
  context: { companyName: string; hasRecord: boolean; accounts: PaymentAccount[] },
): Finding {
  const name = nameOf(form, context.companyName);
  if (tab === "identity") {
    return {
      fact: context.hasRecord ? `${name} looks like ${name} everywhere it sends.` : `${name} has no colours or names of its own yet.`,
      rest: "Quotes, invoices, payslips, emails and the customer portal take these colours and names.",
    };
  }
  if (tab === "assets") {
    const assets: Array<[string, string]> = [
      ["the logo", form.logoUrl],
      ["the signature", form.signatureUrl],
      ["the stamp", form.stampUrl],
    ];
    const on = assets.filter(([, url]) => url.trim()).map(([label]) => label);
    const off = assets.filter(([, url]) => !url.trim()).map(([label]) => label);
    const is = (items: string[]) => (items.length === 1 ? "is" : "are");
    const sentence = list(on);
    const fact =
      off.length === 0
        ? "The logo, signature and stamp are on file."
        : on.length === 0
          ? "No logo, signature or stamp is on file yet."
          : `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} ${is(on)} on file; ${list(off)} ${is(off)} not.`;
    return { fact, rest: "They are added to quotes and invoices, and the signature to payslips." };
  }
  const banks = [
    form.bankName.trim(),
    ...context.accounts.filter((account) => account.showOnDocuments).map((account) => account.bankName?.trim() || account.name),
  ].filter(Boolean);
  const unique = [...new Set(banks)];
  return {
    fact: unique.length ? `Customers are told to pay ${either(unique)}.` : "No bank details are on the paper yet.",
    rest: "Every quote and invoice prints the same bank details, terms and footer.",
  };
}

/* ---------------------------------------------------------------------- *
 * The live quotation: the paper as the document renderer prints it
 * (`lib/documents/html-renderer.ts`), from the draft rather than the record.
 * ---------------------------------------------------------------------- */

export type QuotePreview = {
  name: string;
  /** The tile a workspace with no logo gets: up to two initials. */
  initials: string;
  logoUrl: string | null;
  /** The address, then phone · email · website, as the masthead prints them. */
  contact: string[];
  primary: string;
  inkOnPrimary: string;
  fontFamily: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
  payment: PaymentRow[];
  paymentTerms: string | null;
  footer: string | null;
  /** VAT, tax number and website on the paper's last line. */
  legal: string;
};

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/** White or near-black, whichever reads on the colour (the renderer's own rule). */
export function inkOn(hex: string): string {
  const value = normalizeHex(hex);
  if (!value) return "#ffffff";
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = parseInt(value.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#18181b" : "#ffffff";
}

export function previewOf(
  form: BrandingForm,
  context: { companyName: string; accounts: PaymentAccount[]; fontFamily: string | null },
): QuotePreview {
  const name = nameOf(form, context.companyName);
  const primary = normalizeHex(form.primaryColor) ?? "#4B5563";
  const value = (field: BrandingField) => form[field].trim() || null;
  const shown = context.accounts
    .filter((account) => account.showOnDocuments)
    .sort((a, b) => a.documentPosition - b.documentPosition);
  const payment = buildPaymentRows({
    displayName: name,
    bankName: value("bankName"),
    bankBranch: value("bankBranch"),
    bankBranchCode: value("bankBranchCode"),
    bankAddress: value("bankAddress"),
    bankSwiftCode: value("bankSwiftCode"),
    bankAccountName: value("bankAccountName"),
    bankAccountNumber: value("bankAccountNumber"),
    bankIban: value("bankIban"),
    bankAccounts: shown.map((account) => ({
      currency: account.currency,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
    })),
  });
  return {
    name,
    initials: initialsOf(name),
    logoUrl: value("logoUrl"),
    contact: [value("physicalAddress"), [value("phone"), value("email"), value("website")].filter(Boolean).join(" · ")].filter(
      (line): line is string => Boolean(line),
    ),
    primary,
    inkOnPrimary: inkOn(primary),
    fontFamily: context.fontFamily,
    signatureUrl: value("signatureUrl"),
    stampUrl: value("stampUrl"),
    payment,
    paymentTerms: value("paymentTerms"),
    footer: value("defaultFooterText"),
    legal: [
      value("vatNumber") ? `VAT ${value("vatNumber")}` : null,
      value("taxNumber") ? `TIN ${value("taxNumber")}` : null,
      value("website"),
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

/* ---------------------------------------------------------------------- *
 * The custom domain: one verb, and which one depends on where it has got to.
 * ---------------------------------------------------------------------- */

export type DomainVerb = "save" | "check" | null;

export function domainVerb(input: {
  enabled: boolean;
  typed: string;
  saved: { hostname: string; status: DomainStatus } | null;
}): DomainVerb {
  if (!input.enabled) return null;
  const typed = input.typed.trim();
  if (typed && typed !== (input.saved?.hostname ?? "")) return "save";
  if (input.saved && input.saved.status !== "ACTIVE" && input.saved.status !== "VERIFIED") return "check";
  return null;
}

export const DOMAIN_LABEL: Record<DomainStatus, string> = {
  ACTIVE: "Active",
  VERIFIED: "Verified",
  PENDING_VERIFICATION: "Waiting for DNS",
  FAILED: "Not found",
  DISABLED: "Off",
};

/** "floorcode-logo.svg" from an address. */
export function fileNameOf(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const last = trimmed.split(/[?#]/)[0].split("/").filter(Boolean).pop();
  return last || trimmed;
}
