import { prisma } from "@/lib/prisma";
import {
  DEFAULT_TAX_CODES,
  getZimbabweRetailFoundationPack,
  ZIMBABWE_RETAIL_FOUNDATION_PACK_CODE,
} from "@/lib/accounting/defaults";
import { RETAIL_REQUIRED_SOURCE_TYPES, RETAIL_TENDER_TYPES } from "@/lib/accounting/source-types";

type SeedRunMode = "DRY_RUN" | "APPLY";

export type AccountingSetupReadiness = {
  companyId: string;
  packCode: string;
  summary: {
    completed: number;
    total: number;
    percent: number;
  };
  checks: Array<{
    id: string;
    label: string;
    ready: boolean;
    note?: string;
  }>;
  accountCounts: Record<string, number>;
  openPeriods: number;
  requiredRules: Array<{ sourceType: string; configured: boolean }>;
  tenderMappings: Array<{ tenderType: string; configured: boolean }>;
  currencies: Array<{ code: string; configured: boolean; hasRecentRate: boolean }>;
  defaults: {
    retainedEarningsAccountId: string | null;
    defaultTaxCodeId: string | null;
    defaultBankAccountId: string | null;
  };
  failedEvents: number;
  pendingEvents: number;
  recentExecutions: Array<{
    id: string;
    mode: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  }>;
};

export type AccountingSeedPackResult = {
  companyId: string;
  packCode: string;
  mode: SeedRunMode;
  createdAccounts: number;
  createdTaxCodes: number;
  createdTaxCategories: number;
  createdTaxTemplates: number;
  createdTaxRules: number;
  createdPostingRules: number;
  createdTenderMappings: number;
  createdCurrencyDefinitions: number;
  createdCurrencyRates: number;
  createdPeriods: number;
  createdBankAccounts: number;
  preview: {
    missingAccounts: string[];
    missingTaxCodes: string[];
    missingTaxCategories: string[];
    missingTaxTemplates: string[];
    missingTaxRules: string[];
    missingPostingRules: string[];
    missingTenderMappings: string[];
    missingCurrencies: string[];
    missingFxQuotes: string[];
  };
  readiness: AccountingSetupReadiness;
  executionId?: string;
};

type BootstrapSummary = Pick<
  AccountingSeedPackResult,
  "createdAccounts" | "createdTaxCodes" | "createdPostingRules"
>;

type SeedPackInput = {
  companyId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  mode?: SeedRunMode;
  fxRates?: Record<string, number | string | null | undefined>;
};

function toMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(6));
}

function monthWindow(offset = 0) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    startDate,
    endDate,
  };
}

async function createSeedExecution(input: SeedPackInput & { mode: SeedRunMode }) {
  return prisma.accountingSeedExecution.create({
    data: {
      companyId: input.companyId,
      packCode: ZIMBABWE_RETAIL_FOUNDATION_PACK_CODE,
      mode: input.mode,
      status: "PENDING",
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      inputJson: JSON.stringify({
        fxRates: input.fxRates ?? {},
      }),
    },
    select: { id: true },
  });
}

async function completeSeedExecution(id: string, summary: AccountingSeedPackResult) {
  await prisma.accountingSeedExecution.update({
    where: { id },
    data: {
      status: "COMPLETED",
      summaryJson: JSON.stringify(summary),
      completedAt: new Date(),
    },
  });
}

async function failSeedExecution(id: string, error: string) {
  await prisma.accountingSeedExecution.update({
    where: { id },
    data: {
      status: "FAILED",
      error,
      completedAt: new Date(),
    },
  });
}

export async function getAccountingSetupReadiness(companyId: string): Promise<AccountingSetupReadiness> {
  const [
    settings,
    accountCounts,
    openPeriods,
    postingRules,
    tenderMappings,
    currencies,
    rates,
    failedEvents,
    pendingEvents,
    executions,
  ] = await Promise.all([
    prisma.accountingSettings.findUnique({
      where: { companyId },
      select: {
        retainedEarningsAccountId: true,
        defaultTaxCodeId: true,
        defaultBankAccountId: true,
      },
    }),
    prisma.chartOfAccount.groupBy({
      by: ["type"],
      where: { companyId },
      _count: { _all: true },
    }),
    prisma.accountingPeriod.count({
      where: { companyId, status: "OPEN" },
    }),
    prisma.postingRule.findMany({
      where: {
        companyId,
        sourceType: { in: RETAIL_REQUIRED_SOURCE_TYPES },
        isActive: true,
      },
      select: { sourceType: true },
    }),
    prisma.tenderAccountMapping.findMany({
      where: { companyId, isActive: true },
      select: { tenderType: true },
    }),
    prisma.currencyDefinition.findMany({
      where: { companyId, isActive: true },
      select: { code: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.currencyRate.findMany({
      where: {
        companyId,
        baseCurrency: "USD",
      },
      orderBy: [{ effectiveDate: "desc" }],
      distinct: ["quoteCurrency"],
      select: { quoteCurrency: true, effectiveDate: true, rate: true },
    }),
    prisma.accountingIntegrationEvent.count({
      where: { companyId, status: "FAILED" },
    }),
    prisma.accountingIntegrationEvent.count({
      where: { companyId, status: { in: ["FAILED", "PENDING"] } },
    }),
    prisma.accountingSeedExecution.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        mode: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    }),
  ]);

  const configuredRuleSet = new Set(postingRules.map((rule) => rule.sourceType));
  const configuredTenderSet = new Set(tenderMappings.map((mapping) => mapping.tenderType));
  const configuredCurrencySet = new Set(currencies.map((currency) => currency.code));
  const recentRateMap = new Map(rates.map((rate) => [rate.quoteCurrency, rate]));
  const accountCountMap = accountCounts.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.type] = row._count._all;
    return accumulator;
  }, {});

  const requiredRules = RETAIL_REQUIRED_SOURCE_TYPES.map((sourceType) => ({
    sourceType,
    configured: configuredRuleSet.has(sourceType),
  }));

  const tenderMappingCoverage = RETAIL_TENDER_TYPES.map((tenderType) => ({
    tenderType,
    configured: configuredTenderSet.has(tenderType),
  }));

  const currencyCoverage = ["USD", "ZWG", "ZAR"].map((code) => {
    const rate = recentRateMap.get(code);
    const hasRecentRate =
      code === "USD" ||
      Boolean(
        rate &&
          Math.abs(Date.now() - rate.effectiveDate.getTime()) <= 31 * 24 * 60 * 60 * 1000 &&
          rate.rate > 0,
      );
    return {
      code,
      configured: configuredCurrencySet.has(code),
      hasRecentRate,
    };
  });

  const checks = [
    {
      id: "accounts",
      label: "Core accounts seeded",
      ready: Object.values(accountCountMap).reduce((sum, value) => sum + value, 0) > 0,
    },
    {
      id: "periods",
      label: "Open accounting period",
      ready: openPeriods > 0,
    },
    {
      id: "retained-earnings",
      label: "Retained earnings configured",
      ready: Boolean(settings?.retainedEarningsAccountId),
    },
    {
      id: "default-tax",
      label: "Default tax code configured",
      ready: Boolean(settings?.defaultTaxCodeId),
    },
    {
      id: "default-bank",
      label: "Default bank configured",
      ready: Boolean(settings?.defaultBankAccountId),
    },
    {
      id: "rules",
      label: "Retail posting rules seeded",
      ready: requiredRules.every((rule) => rule.configured),
      note: `${requiredRules.filter((rule) => rule.configured).length}/${requiredRules.length} required rules ready`,
    },
    {
      id: "tenders",
      label: "Tender clearing mappings seeded",
      ready: tenderMappingCoverage.every((mapping) => mapping.configured),
      note: `${tenderMappingCoverage.filter((mapping) => mapping.configured).length}/${tenderMappingCoverage.length} tenders mapped`,
    },
    {
      id: "currencies",
      label: "Currency master seeded",
      ready: currencyCoverage.every((currency) => currency.configured),
    },
    {
      id: "fx-rates",
      label: "Recent FX rates captured",
      ready: currencyCoverage.every((currency) => currency.hasRecentRate),
      note: "Non-base currencies should have a recent reference rate.",
    },
  ];

  const completed = checks.filter((check) => check.ready).length;

  return {
    companyId,
    packCode: ZIMBABWE_RETAIL_FOUNDATION_PACK_CODE,
    summary: {
      completed,
      total: checks.length,
      percent: checks.length > 0 ? Math.round((completed / checks.length) * 100) : 0,
    },
    checks,
    accountCounts: accountCountMap,
    openPeriods,
    requiredRules,
    tenderMappings: tenderMappingCoverage,
    currencies: currencyCoverage,
    defaults: {
      retainedEarningsAccountId: settings?.retainedEarningsAccountId ?? null,
      defaultTaxCodeId: settings?.defaultTaxCodeId ?? null,
      defaultBankAccountId: settings?.defaultBankAccountId ?? null,
    },
    failedEvents,
    pendingEvents,
    recentExecutions: executions.map((execution) => ({
      id: execution.id,
      mode: execution.mode,
      status: execution.status,
      createdAt: execution.createdAt.toISOString(),
      completedAt: execution.completedAt?.toISOString() ?? null,
    })),
  };
}

export async function runAccountingSeedPack(input: SeedPackInput): Promise<AccountingSeedPackResult> {
  const mode = input.mode ?? "APPLY";
  const execution = await createSeedExecution({ ...input, mode });

  try {
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: {
        workspaceProfile: true,
        featureFlags: {
          where: { isEnabled: true },
          select: {
            feature: {
              select: { key: true },
            },
          },
        },
      },
    });

    if (!company) {
      throw new Error("Company not found while seeding accounting defaults");
    }

    const enabledFeatures = company.featureFlags.map((flag) => flag.feature.key);
    const pack = getZimbabweRetailFoundationPack({
      workspaceProfile: company.workspaceProfile,
      enabledFeatures,
    });

    const [
      settings,
      existingAccounts,
      existingTaxCodes,
      existingTaxCategories,
      existingTaxTemplates,
      existingTaxRules,
      existingRules,
      existingMappings,
      existingCurrencies,
      existingBankAccounts,
      existingPeriods,
    ] = await Promise.all([
      prisma.accountingSettings.upsert({
        where: { companyId: input.companyId },
        update: {},
        create: { companyId: input.companyId, baseCurrency: "USD" },
      }),
      prisma.chartOfAccount.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      }),
      prisma.taxCode.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      }),
      prisma.taxCategory.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      }),
      prisma.taxTemplate.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      }),
      prisma.taxRule.findMany({
        where: { companyId: input.companyId },
        select: { id: true, name: true },
      }),
      prisma.postingRule.findMany({
        where: { companyId: input.companyId },
        select: { id: true, name: true, sourceType: true, siteId: true },
      }),
      prisma.tenderAccountMapping.findMany({
        where: { companyId: input.companyId },
        select: { id: true, tenderType: true, siteId: true, registerCode: true, currency: true },
      }),
      prisma.currencyDefinition.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      }),
      prisma.bankAccount.findMany({
        where: { companyId: input.companyId },
        select: { id: true, name: true },
      }),
      prisma.accountingPeriod.findMany({
        where: { companyId: input.companyId },
        select: { id: true, startDate: true, endDate: true },
      }),
    ]);

    const accountByCode = new Map(existingAccounts.map((account) => [account.code, account.id]));
    const taxCodeByCode = new Map(existingTaxCodes.map((taxCode) => [taxCode.code, taxCode.id]));
    const taxCategoryByCode = new Map(existingTaxCategories.map((category) => [category.code, category.id]));
    const taxTemplateByCode = new Map(existingTaxTemplates.map((template) => [template.code, template.id]));
    const currencyCodeSet = new Set(existingCurrencies.map((currency) => currency.code));
    const taxRuleNameSet = new Set(existingTaxRules.map((rule) => rule.name));

    const preview = {
      missingAccounts: pack.accounts.filter((account) => !accountByCode.has(account.code)).map((account) => account.code),
      missingTaxCodes: pack.taxCodes.filter((taxCode) => !taxCodeByCode.has(taxCode.code)).map((taxCode) => taxCode.code),
      missingTaxCategories: pack.taxCategories.filter((category) => !taxCategoryByCode.has(category.code)).map((category) => category.code),
      missingTaxTemplates: pack.taxTemplates.filter((template) => !taxTemplateByCode.has(template.code)).map((template) => template.code),
      missingTaxRules: pack.taxRules.filter((rule) => !taxRuleNameSet.has(rule.name)).map((rule) => rule.name),
      missingPostingRules: pack.postingRules
        .filter(
          (rule) =>
            !existingRules.some(
              (existing) =>
                existing.sourceType === rule.sourceType &&
                existing.name === rule.name &&
                existing.siteId === null,
            ),
        )
        .map((rule) => `${rule.sourceType}:${rule.name}`),
      missingTenderMappings: pack.tenderMappings
        .filter(
          (mapping) =>
            !existingMappings.some(
              (existing) =>
                existing.tenderType === mapping.tenderType &&
                (existing.siteId ?? null) === null &&
                (existing.registerCode ?? null) === (mapping.registerCode ?? null) &&
                (existing.currency ?? null) === (mapping.currency ?? null),
            ),
        )
        .map((mapping) => mapping.tenderType),
      missingCurrencies: pack.currencies.filter((currency) => !currencyCodeSet.has(currency.code)).map((currency) => currency.code),
      missingFxQuotes: pack.currencies
        .filter((currency) => !currency.isBase)
        .filter((currency) => toMoney(input.fxRates?.[currency.code]) <= 0)
        .map((currency) => currency.code),
    };

    let createdAccounts = 0;
    let createdTaxCodes = 0;
    let createdTaxCategories = 0;
    let createdTaxTemplates = 0;
    let createdTaxRules = 0;
    let createdPostingRules = 0;
    let createdTenderMappings = 0;
    let createdCurrencyDefinitions = 0;
    let createdCurrencyRates = 0;
    let createdPeriods = 0;
    let createdBankAccounts = 0;

    if (mode === "APPLY") {
      if (preview.missingAccounts.length > 0) {
        await prisma.chartOfAccount.createMany({
          data: pack.accounts
            .filter((account) => !accountByCode.has(account.code))
            .map((account) => ({
              companyId: input.companyId,
              code: account.code,
              name: account.name,
              type: account.type,
              category: account.category,
              description: account.description,
              systemManaged: account.systemManaged ?? false,
            })),
        });
        createdAccounts = preview.missingAccounts.length;
      }

      if (preview.missingTaxCodes.length > 0) {
        await prisma.taxCode.createMany({
          data: pack.taxCodes
            .filter((taxCode) => !taxCodeByCode.has(taxCode.code))
            .map((taxCode) => ({
              companyId: input.companyId,
              code: taxCode.code,
              name: taxCode.name,
              rate: taxCode.rate,
              type: taxCode.type ?? "VAT",
              appliesTo: taxCode.appliesTo ?? "BOTH",
              vat7OutputBox: taxCode.vat7OutputBox,
              vat7InputBox: taxCode.vat7InputBox,
              scheduleType: taxCode.scheduleType ?? "NONE",
              effectiveFrom: taxCode.effectiveFrom ? new Date(taxCode.effectiveFrom) : undefined,
              effectiveTo: taxCode.effectiveTo ? new Date(taxCode.effectiveTo) : undefined,
              isActive: taxCode.isActive ?? true,
            })),
        });
        createdTaxCodes = preview.missingTaxCodes.length;
      }

      for (const category of pack.taxCategories) {
        const existing = existingTaxCategories.find((row) => row.code === category.code);
        if (existing) continue;
        await prisma.taxCategory.create({
          data: {
            companyId: input.companyId,
            code: category.code,
            name: category.name,
            scope: category.scope ?? "BOTH",
            isActive: category.isActive ?? true,
          },
        });
        createdTaxCategories += 1;
      }

      const refreshedAccounts = await prisma.chartOfAccount.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      });
      const refreshedTaxCodes = await prisma.taxCode.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      });
      const refreshedTaxCategories = await prisma.taxCategory.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      });

      const nextAccountByCode = new Map(refreshedAccounts.map((account) => [account.code, account.id]));
      const nextTaxCodeByCode = new Map(refreshedTaxCodes.map((taxCode) => [taxCode.code, taxCode.id]));
      const nextTaxCategoryByCode = new Map(refreshedTaxCategories.map((category) => [category.code, category.id]));

      for (const currency of pack.currencies) {
        const exists = existingCurrencies.some((row) => row.code === currency.code);
        await prisma.currencyDefinition.upsert({
          where: {
            companyId_code: {
              companyId: input.companyId,
              code: currency.code,
            },
          },
          update: {
            name: currency.name,
            symbol: currency.symbol ?? null,
            decimalPlaces: currency.decimalPlaces ?? 2,
            isBase: currency.isBase ?? false,
            isActive: currency.isActive ?? true,
            sortOrder: currency.sortOrder ?? 0,
          },
          create: {
            companyId: input.companyId,
            code: currency.code,
            name: currency.name,
            symbol: currency.symbol ?? null,
            decimalPlaces: currency.decimalPlaces ?? 2,
            isBase: currency.isBase ?? false,
            isActive: currency.isActive ?? true,
            sortOrder: currency.sortOrder ?? 0,
          },
        });
        if (!exists) createdCurrencyDefinitions += 1;

        if (!currency.isBase) {
          const rate = toMoney(input.fxRates?.[currency.code]);
          if (rate > 0) {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const existingRate = await prisma.currencyRate.findFirst({
              where: {
                companyId: input.companyId,
                baseCurrency: "USD",
                quoteCurrency: currency.code,
                effectiveDate: { gte: startOfDay },
              },
              select: { id: true },
            });
            if (!existingRate) {
              await prisma.currencyRate.create({
                data: {
                  companyId: input.companyId,
                  baseCurrency: "USD",
                  quoteCurrency: currency.code,
                  rate,
                  effectiveDate: today,
                },
              });
              createdCurrencyRates += 1;
            }
          }
        }
      }

      for (const template of pack.taxTemplates) {
        const existing = existingTaxTemplates.find((row) => row.code === template.code);
        const lines = template.lines.map((line, index) => {
          const taxCodeId = nextTaxCodeByCode.get(line.taxCodeCode);
          if (!taxCodeId) {
            throw new Error(`Tax code ${line.taxCodeCode} is required for template ${template.code}`);
          }
          return {
            taxCodeId,
            sortOrder: line.sortOrder ?? index,
            appliesTo: line.appliesTo ?? "BOTH",
            isDefault: line.isDefault ?? index === 0,
          };
        });
        if (!existing) {
          await prisma.taxTemplate.create({
            data: {
              companyId: input.companyId,
              code: template.code,
              name: template.name,
              description: template.description ?? null,
              isActive: template.isActive ?? true,
              lines: { create: lines },
            },
          });
          createdTaxTemplates += 1;
        }
      }

      const refreshedTemplates = await prisma.taxTemplate.findMany({
        where: { companyId: input.companyId },
        select: { id: true, code: true },
      });
      const nextTemplateByCode = new Map(refreshedTemplates.map((template) => [template.code, template.id]));

      for (const rule of pack.taxRules) {
        const templateId = nextTemplateByCode.get(rule.templateCode);
        if (!templateId) {
          throw new Error(`Tax template ${rule.templateCode} is required for tax rule ${rule.name}`);
        }
        if (existingTaxRules.some((existing) => existing.name === rule.name)) {
          continue;
        }
        await prisma.taxRule.create({
          data: {
            companyId: input.companyId,
            name: rule.name,
            appliesTo: rule.appliesTo ?? "BOTH",
            priority: rule.priority ?? 100,
            taxCategoryId: rule.taxCategoryCode ? nextTaxCategoryByCode.get(rule.taxCategoryCode) ?? null : null,
            templateId,
            currency: rule.currency ?? null,
            effectiveFrom: rule.effectiveFrom ? new Date(rule.effectiveFrom) : null,
            effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo) : null,
            isActive: rule.isActive ?? true,
          },
        });
        createdTaxRules += 1;
      }

      for (const mapping of pack.tenderMappings) {
        const clearingAccountId = nextAccountByCode.get(mapping.clearingAccountCode);
        if (!clearingAccountId) {
          throw new Error(`Account ${mapping.clearingAccountCode} is required for tender mapping ${mapping.tenderType}`);
        }
        const offsetAccountId = mapping.offsetAccountCode
          ? nextAccountByCode.get(mapping.offsetAccountCode) ?? null
          : null;
        const existing = existingMappings.find(
          (row) =>
            row.tenderType === mapping.tenderType &&
            (row.siteId ?? null) === null &&
            (row.registerCode ?? null) === (mapping.registerCode ?? null) &&
            (row.currency ?? null) === (mapping.currency ?? null),
        );
        if (existing) continue;
        await prisma.tenderAccountMapping.create({
          data: {
            companyId: input.companyId,
            tenderType: mapping.tenderType,
            currency: mapping.currency ?? null,
            registerCode: mapping.registerCode ?? null,
            priority: mapping.priority ?? 100,
            clearingAccountId,
            offsetAccountId,
            isActive: mapping.isActive ?? true,
          },
        });
        createdTenderMappings += 1;
      }

      for (const rule of pack.postingRules) {
        const existing = existingRules.find(
          (row) => row.name === rule.name && row.sourceType === rule.sourceType && row.siteId === null,
        );

        const lineCreates = rule.lines.map((line, index) => ({
          accountId: line.accountCode ? nextAccountByCode.get(line.accountCode) ?? null : null,
          direction: line.direction,
          basis: line.basis ?? "AMOUNT",
          allocationType: line.allocationType ?? "PERCENT",
          allocationValue: line.allocationValue ?? 100,
          taxCodeId: line.taxCodeCode ? nextTaxCodeByCode.get(line.taxCodeCode) ?? null : null,
          repeatMode: line.repeatMode ?? "NONE",
          accountSource: line.accountSource ?? "FIXED_ACCOUNT",
          valuePath: line.valuePath ?? null,
          memoTemplate: line.memoTemplate ?? null,
          costCenterId: null,
          sortOrder: line.sortOrder ?? index,
        }));

        const conditionCreates = (rule.conditions ?? []).map((condition) => ({
          field: condition.field,
          operator: condition.operator ?? "EQ",
          valueString: condition.valueString ?? null,
          valueListJson: condition.valueList ? JSON.stringify(condition.valueList) : null,
        }));

        if (existing) {
          await prisma.postingRule.update({
            where: { id: existing.id },
            data: {
              description: rule.description ?? null,
              priority: rule.priority ?? 100,
              scopeType: rule.scopeType ?? "COMPANY",
              ruleMode: rule.ruleMode ?? "GUIDED",
              isFallback: rule.isFallback ?? false,
              isActive: rule.isActive ?? true,
              lines: {
                deleteMany: {},
                create: lineCreates,
              },
              conditions: {
                deleteMany: {},
                create: conditionCreates,
              },
            },
          });
        } else {
          await prisma.postingRule.create({
            data: {
              companyId: input.companyId,
              name: rule.name,
              sourceType: rule.sourceType,
              description: rule.description ?? null,
              priority: rule.priority ?? 100,
              scopeType: rule.scopeType ?? "COMPANY",
              ruleMode: rule.ruleMode ?? "GUIDED",
              isFallback: rule.isFallback ?? false,
              isActive: rule.isActive ?? true,
              lines: { create: lineCreates },
              conditions: { create: conditionCreates },
            },
          });
          createdPostingRules += 1;
        }
      }

      let defaultBankAccountId = settings.defaultBankAccountId ?? null;
      if (!defaultBankAccountId) {
        const existingBank = existingBankAccounts.find((account) => account.name === pack.defaultBankAccount.name);
        if (existingBank) {
          defaultBankAccountId = existingBank.id;
        } else {
          const bank = await prisma.bankAccount.create({
            data: {
              companyId: input.companyId,
              name: pack.defaultBankAccount.name,
              bankName: pack.defaultBankAccount.bankName ?? null,
              currency: pack.defaultBankAccount.currency,
            },
            select: { id: true },
          });
          defaultBankAccountId = bank.id;
          createdBankAccounts += 1;
        }
      }

      const retainedEarningsAccountId = nextAccountByCode.get("3000") ?? null;
      const defaultTaxCodeId =
        nextTaxCodeByCode.get("VAT15_5") ?? nextTaxCodeByCode.get(DEFAULT_TAX_CODES[0].code) ?? null;
      await prisma.accountingSettings.update({
        where: { companyId: input.companyId },
        data: {
          retainedEarningsAccountId,
          defaultTaxCodeId,
          defaultBankAccountId,
          baseCurrency: "USD",
        },
      });

      const targetPeriods = [monthWindow(0), monthWindow(1)];
      for (const period of targetPeriods) {
        const exists = existingPeriods.some(
          (existing) =>
            existing.startDate.getTime() === period.startDate.getTime() &&
            existing.endDate.getTime() === period.endDate.getTime(),
        );
        if (exists) continue;
        await prisma.accountingPeriod.create({
          data: {
            companyId: input.companyId,
            startDate: period.startDate,
            endDate: period.endDate,
            status: "OPEN",
          },
        });
        createdPeriods += 1;
      }
    }

    const readiness = await getAccountingSetupReadiness(input.companyId);
    const result: AccountingSeedPackResult = {
      companyId: input.companyId,
      packCode: pack.code,
      mode,
      createdAccounts,
      createdTaxCodes,
      createdTaxCategories,
      createdTaxTemplates,
      createdTaxRules,
      createdPostingRules,
      createdTenderMappings,
      createdCurrencyDefinitions,
      createdCurrencyRates,
      createdPeriods,
      createdBankAccounts,
      preview,
      readiness,
      executionId: execution.id,
    };

    await completeSeedExecution(execution.id, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Accounting seed pack failed";
    await failSeedExecution(execution.id, message);
    throw error;
  }
}

export async function previewAccountingSeedPack(input: Omit<SeedPackInput, "mode">) {
  return runAccountingSeedPack({ ...input, mode: "DRY_RUN" });
}

export async function ensureAccountingDefaults(companyId: string): Promise<BootstrapSummary> {
  const result = await runAccountingSeedPack({
    companyId,
    mode: "APPLY",
  });

  return {
    createdAccounts: result.createdAccounts,
    createdTaxCodes: result.createdTaxCodes,
    createdPostingRules: result.createdPostingRules,
  };
}
