import { getEffectiveBrandingForCompany } from "@/lib/platform/branding";
import { prisma } from "@/lib/prisma";
import { loadShopProfile } from "@/lib/retail/shop-profile";

export const RETAIL_REQUIRED_POSTING_RULES = [
  "RETAIL_SHIFT_OPEN",
  "RETAIL_SALE",
  "RETAIL_REFUND",
  "RETAIL_VOID",
  "RETAIL_GOODS_RECEIPT",
  "RETAIL_STOCK_ADJUSTMENT",
  "RETAIL_SHIFT_VARIANCE",
] as const;

export type RetailSetupSnapshot = Awaited<ReturnType<typeof getRetailSetupSnapshot>>;

export async function getRetailSetupSnapshot(companyId: string) {
  const [
    company,
    setupProfile,
    branding,
    accountingSettings,
    chartOfAccounts,
    postingRules,
    sites,
    registers,
    openShiftCount,
    openShiftCountsBySite,
    pairedDevices,
    tillRulesRecord,
    effectiveBranding,
    openPeriods,
    postedJournals,
    draftJournals,
  ] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true },
    }),
    // The default site from the shop profile. A till is where its device is (SET-04).
    loadShopProfile(companyId).then((shop) => ({ defaultSiteId: shop.defaultSiteId })),
    prisma.companyBranding.findUnique({
      where: { companyId },
      select: {
        displayName: true,
        logoUrl: true,
        defaultFooterText: true,
        legalName: true,
        tradingName: true,
        registrationNumber: true,
        vatNumber: true,
        taxNumber: true,
        email: true,
        phone: true,
        website: true,
        physicalAddress: true,
        postalAddress: true,
      },
    }),
    prisma.accountingSettings.findUnique({
      where: { companyId },
      select: {
        defaultTaxCodeId: true,
        defaultBankAccountId: true,
        retainedEarningsAccountId: true,
      },
    }),
    prisma.chartOfAccount.groupBy({
      by: ["type"],
      where: { companyId },
      _count: { _all: true },
    }),
    prisma.postingRule.findMany({
      where: { companyId, sourceType: { in: [...RETAIL_REQUIRED_POSTING_RULES] } },
      select: { sourceType: true, isActive: true },
    }),
    prisma.site.findMany({
      where: { companyId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, location: true, isActive: true },
    }),
    prisma.retailRegister.findMany({
      where: { companyId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, siteId: true, isActive: true, createdAt: true, updatedAt: true },
    }),
    prisma.retailShift.count({
      where: { companyId, status: "OPEN" },
    }),
    prisma.retailShift.groupBy({
      by: ["siteId"],
      where: { companyId, status: "OPEN" },
      _count: { _all: true },
    }),
    prisma.retailDevice.findMany({
      where: { companyId, unpairedAt: null },
      select: { registerId: true },
    }),
    prisma.retailTillRules.findUnique({ where: { companyId }, select: { companyId: true } }),
    getEffectiveBrandingForCompany(companyId),
    prisma.accountingPeriod.count({ where: { companyId, status: "OPEN" } }),
    prisma.journalEntry.count({ where: { companyId, status: "POSTED" } }),
    prisma.journalEntry.count({ where: { companyId, status: "DRAFT" } }),
  ]);

  const siteMap = new Map(sites.map((site) => [site.id, site]));
  const registerRows = registers.map((register) => ({
    ...register,
    site: siteMap.get(register.siteId) ?? null,
  }));
  const registerCountsBySite = registers.reduce<Record<string, number>>((accumulator, register) => {
    accumulator[register.siteId] = (accumulator[register.siteId] ?? 0) + 1;
    return accumulator;
  }, {});
  const openShiftCountsBySiteMap = openShiftCountsBySite.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.siteId] = row._count._all;
    return accumulator;
  }, {});

  const activePostingRules = new Map(
    postingRules.filter((rule) => rule.isActive).map((rule) => [rule.sourceType, rule.isActive]),
  );
  const accountCounts = chartOfAccounts.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.type] = row._count._all;
    return accumulator;
  }, {});

  const operationsCompleted = [
    sites.some((site) => site.isActive),
    registers.some((register) => register.isActive),
    Boolean(setupProfile.defaultSiteId && sites.some((site) => site.id === setupProfile.defaultSiteId)),
    pairedDevices.length > 0,
  ].filter(Boolean).length;

  const operationsTotal = 4;

  const brandingChecks = [
    Boolean(branding?.displayName ?? effectiveBranding.displayName),
    Boolean(branding?.logoUrl),
    Boolean(branding?.defaultFooterText),
    Boolean(branding?.physicalAddress || branding?.postalAddress),
    Boolean(branding?.email || branding?.phone || branding?.website),
    Boolean(branding?.legalName || branding?.tradingName || branding?.registrationNumber),
  ];
  const brandingCompleted = brandingChecks.filter(Boolean).length;

  // Till rules (SET-06) always hold a value: saved, or the defaults.
  const posPolicyChecks = [true];
  const posPolicyCompleted = 1;

  const accountingChecks = [
    Object.values(accountCounts).reduce((sum, value) => sum + value, 0) > 0,
    Boolean(accountingSettings?.retainedEarningsAccountId),
    Boolean(accountingSettings?.defaultTaxCodeId),
    Boolean(accountingSettings?.defaultBankAccountId),
    activePostingRules.has("RETAIL_SHIFT_OPEN"),
    activePostingRules.has("RETAIL_SALE"),
    activePostingRules.has("RETAIL_REFUND"),
    activePostingRules.has("RETAIL_VOID"),
    activePostingRules.has("RETAIL_GOODS_RECEIPT"),
    activePostingRules.has("RETAIL_STOCK_ADJUSTMENT"),
    activePostingRules.has("RETAIL_SHIFT_VARIANCE"),
  ];
  const accountingCompleted = accountingChecks.filter(Boolean).length;

  const sections = [
    {
      id: "operations",
      label: "Operations",
      href: "/retail/manage/tills",
      total: operationsTotal,
      completed: operationsCompleted,
      missing: Math.max(operationsTotal - operationsCompleted, 0),
      note:
        pairedDevices.length === 0
          ? "Pair a device to a till so it knows where it is."
          : operationsCompleted < operationsTotal
          ? "Bind a default site and register so terminal setup is one tap."
          : "Default branch/register linkage is ready for daily use.",
    },
    {
      id: "branding",
      label: "Branding",
      href: "/preferences/organization/branding",
      total: brandingChecks.length,
      completed: brandingCompleted,
      missing: Math.max(brandingChecks.length - brandingCompleted, 0),
      note:
        brandingCompleted < brandingChecks.length
          ? "Fill the receipt identity and footer fields used on printed output."
          : "Receipt identity is complete enough for customer-facing docs.",
    },
    {
      id: "policy",
      label: "Till rules",
      href: "/retail/manage/till-rules",
      total: posPolicyChecks.length,
      completed: posPolicyCompleted,
      missing: Math.max(posPolicyChecks.length - posPolicyCompleted, 0),
      note:
        tillRulesRecord
          ? "The shop's till rules are saved."
          : "The till rules are the defaults.",
    },
    {
      id: "accounting",
      label: "Accounting",
      href: "/retail/manage/posting",
      total: accountingChecks.length,
      completed: accountingCompleted,
      missing: Math.max(accountingChecks.length - accountingCompleted, 0),
      note:
        accountingCompleted < accountingChecks.length
          ? "Posting rules and fiscal defaults need another pass."
          : "Retail posting rules and core accounts are ready.",
    },
  ];

  const overallCompleted = sections.reduce((sum, section) => sum + section.completed, 0);
  const overallTotal = sections.reduce((sum, section) => sum + section.total, 0);

  return {
    company,
    setupProfile,
    branding,
    effectiveBranding,
    accountingSettings,
    counts: {
      openShifts: openShiftCount,
      totalSites: sites.length,
      activeSites: sites.filter((site) => site.isActive).length,
      totalRegisters: registers.length,
      activeRegisters: registers.filter((register) => register.isActive).length,
      accounts: Object.values(accountCounts).reduce((sum, value) => sum + value, 0),
    },
    sites: sites.map((site) => ({
      ...site,
      registerCount: registerCountsBySite[site.id] ?? 0,
      openShiftCount: openShiftCountsBySiteMap[site.id] ?? 0,
      hasPairedTill: registerRows.some(
        (register) => register.siteId === site.id && pairedDevices.some((device) => device.registerId === register.id),
      ),
    })),
    registers: registerRows,
    postingRules: {
      required: RETAIL_REQUIRED_POSTING_RULES.map((sourceType) => ({
        sourceType,
        configured: activePostingRules.has(sourceType),
      })),
    },
    accounting: {
      accountCounts,
      openPeriods,
      postedJournals,
      draftJournals,
      defaultTaxCodeId: accountingSettings?.defaultTaxCodeId ?? null,
      defaultBankAccountId: accountingSettings?.defaultBankAccountId ?? null,
      retainedEarningsAccountId: accountingSettings?.retainedEarningsAccountId ?? null,
    },
    sections,
    readiness: {
      completed: overallCompleted,
      total: overallTotal,
      percent: overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0,
    },
  };
}

