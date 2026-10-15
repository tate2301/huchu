import { describe, expect, it } from "vitest";

import {
  BRANDING_FIELDS,
  changedFields,
  domainVerb,
  fileNameOf,
  findingFor,
  formOf,
  initialsOf,
  inkOn,
  invalidColours,
  payloadOf,
  previewOf,
  tabOfPath,
  withCurrent,
  DATE_FORMATS,
  type BrandingForm,
  type BrandingResponse,
  type PaymentAccount,
} from "./form";

const empty = (): BrandingResponse => ({
  company: { id: "c1", name: "Floorcode", slug: "floorcode" },
  branding: null,
  effective: {
    displayName: "Floorcode",
    brandingEnabled: true,
    customDomainEnabled: false,
    colors: { primary: "#0F8F86", secondary: "#DCF4F1", accent: "#EBF7F5" },
    fontFamilyKey: "huchu",
  },
  domain: null,
  fontOptions: [],
});

const withRecord = (patch: Partial<BrandingForm>): BrandingResponse => {
  const data = empty();
  data.branding = Object.fromEntries(BRANDING_FIELDS.map((field) => [field, null])) as BrandingResponse["branding"];
  Object.assign(data.branding!, patch);
  return data;
};

const account = (patch: Partial<PaymentAccount>): PaymentAccount => ({
  id: "a1",
  name: "CBZ ZWG",
  currency: "ZWG",
  accountName: "Floorcode (Pvt) Ltd",
  accountNumber: "0112",
  bankName: "CBZ Bank",
  showOnDocuments: true,
  documentPosition: 0,
  ...patch,
});

describe("formOf and payloadOf", () => {
  it("falls back to the colours and face documents use when nothing is saved", () => {
    const form = formOf(empty());
    expect(form.primaryColor).toBe("#0F8F86");
    expect(form.fontFamilyKey).toBe("huchu");
    expect(form.displayName).toBe("");
  });

  it("sends blanks as null and keeps the colours", () => {
    const form = formOf(withRecord({ displayName: "  ", bankName: " CBZ Bank " }));
    const payload = payloadOf(form);
    expect(payload.displayName).toBeNull();
    expect(payload.bankName).toBe("CBZ Bank");
    expect(payload.primaryColor).toBe("#0F8F86");
    expect(Object.keys(payload)).toHaveLength(BRANDING_FIELDS.length);
  });

  it("lists only what changed", () => {
    const saved = formOf(empty());
    expect(changedFields(saved, { ...saved, phone: "077 220 4180" })).toEqual(["phone"]);
    expect(changedFields(saved, { ...saved, phone: "   " })).toEqual([]);
  });

  it("refuses a colour that is not a full hex", () => {
    const form = { ...formOf(empty()), accentColor: "#ab" };
    expect(invalidColours(form)).toEqual(["accentColor"]);
  });
});

describe("findingFor", () => {
  const context = { companyName: "Floorcode", hasRecord: true, accounts: [] as PaymentAccount[] };

  it("names the workspace by its display name", () => {
    const form = formOf(withRecord({ displayName: "Floorcode Zim" }));
    expect(findingFor("identity", form, context).fact).toBe("Floorcode Zim looks like Floorcode Zim everywhere it sends.");
  });

  it("says which images are on file", () => {
    const form = formOf(empty());
    expect(findingFor("assets", form, context).fact).toBe("No logo, signature or stamp is on file yet.");
    expect(findingFor("assets", { ...form, logoUrl: "/l.svg" }, context).fact).toBe(
      "The logo is on file; the signature and the stamp are not.",
    );
    expect(findingFor("assets", { ...form, logoUrl: "/l.svg", signatureUrl: "/s.png", stampUrl: "/p.png" }, context).fact).toBe(
      "The logo, signature and stamp are on file.",
    );
  });

  it("names the banks the paper asks customers to pay", () => {
    const form = { ...formOf(empty()), bankName: "CBZ Bank" };
    const accounts = [account({}), account({ id: "a2", bankName: null, name: "EcoCash merchant 160442" }), account({ id: "a3", showOnDocuments: false, bankName: "Stanbic" })];
    expect(findingFor("finance", form, { ...context, accounts }).fact).toBe("Customers are told to pay CBZ Bank or EcoCash merchant 160442.");
    expect(findingFor("finance", formOf(empty()), context).fact).toBe("No bank details are on the paper yet.");
  });
});

describe("previewOf", () => {
  it("prints what the paper prints, from the draft", () => {
    const form = {
      ...formOf(empty()),
      displayName: "Floorcode",
      primaryColor: "#cf3d1d",
      physicalAddress: "12 Coventry Road, Workington, Harare",
      phone: "077 220 4180",
      website: "floorcode.co.zw",
      vatNumber: "220093114",
      taxNumber: "2000441093",
      bankName: "CBZ Bank",
      defaultFooterText: "Thank you for choosing Floorcode.",
    };
    const preview = previewOf(form, { companyName: "Floorcode", accounts: [account({})], fontFamily: null });
    expect(preview.primary).toBe("#CF3D1D");
    expect(preview.inkOnPrimary).toBe("#ffffff");
    expect(preview.initials).toBe("F");
    expect(preview.contact).toEqual(["12 Coventry Road, Workington, Harare", "077 220 4180 · floorcode.co.zw"]);
    expect(preview.legal).toBe("VAT 220093114 · TIN 2000441093 · floorcode.co.zw");
    expect(preview.payment).toContainEqual({ label: "Bank", value: "CBZ Bank" });
    expect(preview.payment).toContainEqual({ label: "ZWG Account No.", value: "0112" });
    expect(preview.footer).toBe("Thank you for choosing Floorcode.");
  });

  it("keeps the single legacy account when no account is shown", () => {
    const form = { ...formOf(empty()), bankAccountNumber: "01124558830017" };
    const preview = previewOf(form, { companyName: "Floorcode", accounts: [account({ showOnDocuments: false })], fontFamily: null });
    expect(preview.payment).toEqual([{ label: "Account No.", value: "01124558830017" }]);
  });
});

describe("the small readers", () => {
  it("reads the tab from the address", () => {
    expect(tabOfPath("/preferences/organization/branding/finance", "identity")).toBe("finance");
    expect(tabOfPath("/preferences/organization/branding", "assets")).toBe("assets");
  });

  it("chooses one verb for the domain", () => {
    expect(domainVerb({ enabled: false, typed: "work.floorcode.co.zw", saved: null })).toBeNull();
    expect(domainVerb({ enabled: true, typed: "work.floorcode.co.zw", saved: null })).toBe("save");
    expect(domainVerb({ enabled: true, typed: "work.floorcode.co.zw", saved: { hostname: "work.floorcode.co.zw", status: "PENDING_VERIFICATION" } })).toBe(
      "check",
    );
    expect(domainVerb({ enabled: true, typed: "work.floorcode.co.zw", saved: { hostname: "work.floorcode.co.zw", status: "ACTIVE" } })).toBeNull();
  });

  it("offers a saved format that is not on the list back", () => {
    expect(withCurrent(DATE_FORMATS, "d.M.yyyy").at(-1)).toEqual({ value: "d.M.yyyy", label: "d.M.yyyy" });
    expect(withCurrent(DATE_FORMATS, "yyyy-MM-dd")).toBe(DATE_FORMATS);
  });

  it("reads names, initials and ink", () => {
    expect(fileNameOf("https://cdn.example.com/brand/floorcode-logo.svg?v=2")).toBe("floorcode-logo.svg");
    expect(initialsOf("Hurudza Creative (Private) Limited")).toBe("HC");
    expect(inkOn("#FFFFFF")).toBe("#18181b");
  });
});
