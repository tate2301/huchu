import type {
  AccountingSourceType,
  PostingBasis,
  PostingRuleConditionField,
  PostingRuleLine,
  PostingRuleOperator,
  PrismaClient,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;
import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { buildAccountingEventKey } from "@/lib/accounting/integration-keys";
import { getNextEntryNumber, toMoney } from "@/lib/accounting/ledger";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";
import { syncPaymentLedgerEntryForSource } from "@/lib/accounting/payment-ledger";
import { buildRetailPostingPayload } from "@/lib/accounting/retail-posting";

const BALANCE_TOLERANCE = 0.01;
const BASE_RETRY_DELAY_MINUTES = 5;
const MAX_RETRY_DELAY_MINUTES = 24 * 60;

export type PostingPaymentSplit = {
  tenderType: string;
  amount: number;
  reference?: string | null;
  currency?: string | null;
};

export type PostingInventoryLine = {
  inventoryItemId?: string;
  itemName?: string;
  quantity: number;
  unitCost: number;
  totalCost?: number;
};

export type PostingContext = {
  companyId: string;
  sourceType: AccountingSourceType;
  sourceId?: string | null;
  sourceSubtype?: string | null;
  siteId?: string | null;
  registerCode?: string | null;
  causationKey?: string | null;
  entryDate: Date;
  description: string;
  createdById: string;
  amount: number;
  netAmount?: number;
  taxAmount?: number;
  grossAmount?: number;
  deductionsAmount?: number;
  allowancesAmount?: number;
  currency?: string;
  actorRole?: string | null;
  periodOverrideReason?: string | null;
  invertDirection?: boolean;
  payload?: Record<string, unknown> | null;
  payments?: PostingPaymentSplit[];
  inventory?: {
    lines: PostingInventoryLine[];
    totalCost?: number;
  } | null;
};

type PostingResult = {
  entryId?: string;
  skipped?: boolean;
  error?: string;
  code?: string;
};

export type PostingSimulationResult = {
  selectedRule?: {
    id: string;
    name: string;
    sourceType: string;
    priority: number;
    scopeType: string;
    isFallback: boolean;
  };
  lines: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    memo: string;
  }>;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  warnings: string[];
  error?: string;
  code?: string;
};

function resolveBasisAmount(basis: PostingBasis, context: PostingContext) {
  switch (basis) {
    case "NET":
      return toMoney(context.netAmount ?? context.amount);
    case "TAX":
      return toMoney(context.taxAmount ?? 0);
    case "GROSS":
      return toMoney(context.grossAmount ?? context.amount);
    case "DEDUCTIONS":
      return toMoney(context.deductionsAmount ?? 0);
    case "ALLOWANCES":
      return toMoney(context.allowancesAmount ?? 0);
    case "AMOUNT":
    default:
      return toMoney(context.amount);
  }
}

function totalsBalanced(totalDebit: number, totalCredit: number) {
  return Math.abs(totalDebit - totalCredit) <= BALANCE_TOLERANCE;
}

function nextRetryDate(attemptCount: number) {
  const backoffMultiplier = 2 ** Math.max(attemptCount - 1, 0);
  const delayMinutes = Math.min(BASE_RETRY_DELAY_MINUTES * backoffMultiplier, MAX_RETRY_DELAY_MINUTES);
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

function truncateErrorMessage(message: string) {
  return message.length > 1000 ? message.slice(0, 1000) : message;
}

function getPathValue(source: Record<string, unknown> | null | undefined, path?: string | null): number | string | null {
  if (!source || !path) return null;
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return null;
    return (current as Record<string, unknown>)[key];
  }, source);
  if (typeof value === "number") return toMoney(value);
  if (typeof value === "string") return value;
  return null;
}

function renderTemplate(template: string | null | undefined, data: Record<string, unknown>, fallback: string) {
  if (!template) return fallback;
  return template.replace(/\{([\w.]+)\}/g, (_, token: string) => {
    const value = getPathValue(data, token);
    return value === null ? "" : String(value);
  });
}

function parseConditionList(valueListJson: string | null) {
  if (!valueListJson) return null;
  try {
    const parsed = JSON.parse(valueListJson);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : null;
  } catch {
    return null;
  }
}

function buildEnvelope(context: PostingContext) {
  return {
    ...(context.payload ?? {}),
    ...buildRetailPostingPayload({
      ...(context.payload ?? {}),
      siteId: context.siteId ?? null,
      registerCode: context.registerCode ?? null,
      currency: context.currency ?? null,
      payments: context.payments ?? [],
      inventory: context.inventory
        ? {
            lines: context.inventory.lines,
            totalCost: context.inventory.totalCost ?? 0,
          }
        : undefined,
    }),
    sourceType: context.sourceType,
    sourceId: context.sourceId ?? null,
    sourceSubtype: context.sourceSubtype ?? null,
  };
}

function getConditionValue(field: PostingRuleConditionField, context: PostingContext, envelope: ReturnType<typeof buildEnvelope>) {
  switch (field) {
    case "SITE_ID":
      return context.siteId ?? envelope.siteId ?? null;
    case "REGISTER_CODE":
      return context.registerCode ?? envelope.registerCode ?? null;
    case "TENDER_TYPE":
      return (envelope.payments ?? []).map((payment) => payment.tenderType);
    case "CURRENCY":
      return context.currency ?? envelope.currency ?? null;
    case "CUSTOMER_TAX_CATEGORY_ID":
      return envelope.customerTaxCategoryId ?? null;
    case "VENDOR_TAX_CATEGORY_ID":
      return envelope.vendorTaxCategoryId ?? null;
    case "SALE_TYPE":
      return envelope.saleType ?? context.sourceSubtype ?? null;
    case "MOVEMENT_TYPE":
      return envelope.movementType ?? context.sourceSubtype ?? null;
    default:
      return null;
  }
}

export function conditionMatches(input: {
  operator: PostingRuleOperator;
  actual: string | string[] | null;
  expectedString?: string | null;
  expectedList?: string[] | null;
}) {
  const actualList = Array.isArray(input.actual)
    ? input.actual.filter(Boolean)
    : input.actual
      ? [input.actual]
      : [];
  const expectedList = input.expectedList?.filter(Boolean) ?? [];
  const expectedString = input.expectedString ?? null;

  switch (input.operator) {
    case "EXISTS":
      return actualList.length > 0;
    case "NOT_EXISTS":
      return actualList.length === 0;
    case "NEQ":
      return expectedString ? actualList.every((value) => value !== expectedString) : true;
    case "IN":
      return actualList.some((value) => expectedList.includes(value));
    case "NOT_IN":
      return actualList.every((value) => !expectedList.includes(value));
    case "EQ":
    default:
      return expectedString ? actualList.some((value) => value === expectedString) : false;
  }
}

async function createOrRefreshIntegrationEvent(context: PostingContext, envelope: ReturnType<typeof buildEnvelope>) {
  const eventKey = buildAccountingEventKey({
    companyId: context.companyId,
    sourceDomain: "accounting",
    sourceAction: "auto-post",
    sourceType: context.sourceType,
    sourceId: context.sourceId ?? context.causationKey ?? null,
    fallback: `${context.entryDate.toISOString()}:${context.description}`,
  });

  return prisma.accountingIntegrationEvent.upsert({
    where: { eventKey },
    update: {
      sourceType: context.sourceType,
      sourceId: context.sourceId ?? null,
      sourceSubtype: context.sourceSubtype ?? null,
      siteId: context.siteId ?? null,
      registerCode: context.registerCode ?? null,
      causationKey: context.causationKey ?? null,
      entryDate: context.entryDate,
      description: context.description,
      amount: context.amount,
      netAmount: context.netAmount ?? null,
      taxAmount: context.taxAmount ?? null,
      grossAmount: context.grossAmount ?? null,
      deductionsAmount: context.deductionsAmount ?? null,
      allowancesAmount: context.allowancesAmount ?? null,
      currency: context.currency ?? null,
      createdById: context.createdById,
      payloadJson: JSON.stringify(envelope),
      status: "PENDING",
      lastError: null,
      nextRetryAt: null,
    },
    create: {
      eventKey,
      companyId: context.companyId,
      sourceDomain: "accounting",
      sourceAction: "auto-post",
      sourceType: context.sourceType,
      sourceId: context.sourceId ?? null,
      sourceSubtype: context.sourceSubtype ?? null,
      siteId: context.siteId ?? null,
      registerCode: context.registerCode ?? null,
      causationKey: context.causationKey ?? null,
      entryDate: context.entryDate,
      description: context.description,
      amount: context.amount,
      netAmount: context.netAmount ?? null,
      taxAmount: context.taxAmount ?? null,
      grossAmount: context.grossAmount ?? null,
      deductionsAmount: context.deductionsAmount ?? null,
      allowancesAmount: context.allowancesAmount ?? null,
      currency: context.currency ?? null,
      createdById: context.createdById,
      payloadJson: JSON.stringify(envelope),
      status: "PENDING",
    },
    select: { id: true, attemptCount: true },
  });
}

async function markIntegrationEventPosted(eventId: string, entryId: string) {
  await prisma.accountingIntegrationEvent.update({
    where: { id: eventId },
    data: {
      status: "POSTED",
      journalEntryId: entryId,
      nextRetryAt: null,
      lastError: null,
    },
  });
}

async function markIntegrationEventFailure(eventId: string, attemptCount: number, error: string) {
  await prisma.accountingIntegrationEvent.update({
    where: { id: eventId },
    data: {
      status: "FAILED",
      attemptCount: { increment: 1 },
      lastError: truncateErrorMessage(error),
      nextRetryAt: nextRetryDate(attemptCount + 1),
    },
  });
}

async function resolveTenderMappingLookup(companyId: string, envelope: ReturnType<typeof buildEnvelope>) {
  const tenderTypes = Array.from(new Set((envelope.payments ?? []).map((payment) => payment.tenderType)));
  const mappings = await prisma.tenderAccountMapping.findMany({
    where: {
      companyId,
      isActive: true,
      ...(tenderTypes.length > 0 ? { tenderType: { in: tenderTypes } } : {}),
    },
    include: {
      clearingAccount: { select: { id: true, code: true, name: true, nodeType: true, isActive: true } },
      offsetAccount: { select: { id: true, code: true, name: true, nodeType: true, isActive: true } },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return (payment: { tenderType: string; currency?: string | null }) => {
    const candidates = mappings.filter((mapping) => {
      if (mapping.tenderType !== payment.tenderType) return false;
      if (mapping.siteId && mapping.siteId !== (envelope.siteId ?? null)) return false;
      if (mapping.registerCode && mapping.registerCode !== (envelope.registerCode ?? null)) return false;
      if (mapping.currency && mapping.currency !== (payment.currency ?? envelope.currency ?? null)) return false;
      return true;
    });

    return candidates.sort((a, b) => {
      const aSpecificity = Number(Boolean(a.siteId)) + Number(Boolean(a.registerCode)) + Number(Boolean(a.currency));
      const bSpecificity = Number(Boolean(b.siteId)) + Number(Boolean(b.registerCode)) + Number(Boolean(b.currency));
      if (aSpecificity !== bSpecificity) return bSpecificity - aSpecificity;
      return a.priority - b.priority;
    })[0] ?? null;
  };
}

function resolveLineAmount(line: PostingRuleLine, context: PostingContext, envelope: ReturnType<typeof buildEnvelope>, repeatItem?: Record<string, unknown>) {
  const valueSource = repeatItem ?? envelope;
  const valueFromPath = getPathValue(valueSource, line.valuePath);
  const base = typeof valueFromPath === "number" ? valueFromPath : resolveBasisAmount(line.basis, context);
  if (line.allocationType === "FIXED") {
    return toMoney(line.allocationValue ?? base);
  }
  const percent = toMoney(line.allocationValue ?? 100);
  return toMoney((base * percent) / 100);
}

async function simulatePosting(context: PostingContext): Promise<PostingSimulationResult> {
  const envelope = buildEnvelope(context);
  const rules = await prisma.postingRule.findMany({
    where: {
      companyId: context.companyId,
      sourceType: context.sourceType,
      isActive: true,
    },
    include: {
      conditions: true,
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true, nodeType: true, isActive: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  const matchedRule = rules
    .filter((rule) => (rule.scopeType === "SITE" ? rule.siteId === (context.siteId ?? null) : true))
    .filter((rule) =>
      rule.conditions.every((condition) =>
        conditionMatches({
          operator: condition.operator,
          actual: getConditionValue(condition.field, context, envelope) as string | string[] | null,
          expectedString: condition.valueString,
          expectedList: parseConditionList(condition.valueListJson),
        }),
      ),
    )
    .sort((a, b) => {
      const aSiteFirst = Number(a.scopeType === "SITE");
      const bSiteFirst = Number(b.scopeType === "SITE");
      if (aSiteFirst !== bSiteFirst) return bSiteFirst - aSiteFirst;
      if (a.isFallback !== b.isFallback) return Number(a.isFallback) - Number(b.isFallback);
      return a.priority - b.priority;
    })[0];

  if (!matchedRule || matchedRule.lines.length === 0) {
    return {
      lines: [],
      totalDebit: 0,
      totalCredit: 0,
      balanced: false,
      warnings: [],
      error: `Posting rule missing for source type ${context.sourceType}`,
      code: "POSTING_RULE_MISSING",
    };
  }

  const resolveTenderMapping = await resolveTenderMappingLookup(context.companyId, envelope);
  const lineRows: PostingSimulationResult["lines"] = [];
  const warnings: string[] = [];

  for (const line of matchedRule.lines) {
    const repeats =
      line.repeatMode === "TENDER"
        ? (envelope.payments ?? []).map((payment) => ({
            tenderType: payment.tenderType,
            amount: payment.amount,
            currency: payment.currency ?? envelope.currency ?? null,
          }))
        : [null];

    for (const repeat of repeats) {
      const amount = resolveLineAmount(line, context, envelope, repeat ?? undefined);
      if (amount <= 0) continue;

      const direction = context.invertDirection
        ? line.direction === "DEBIT"
          ? "CREDIT"
          : "DEBIT"
        : line.direction;

      let accountId = line.accountId;
      let accountCode = line.account?.code ?? "";
      let accountName = line.account?.name ?? "";

      if (line.accountSource === "TENDER_MAPPING") {
        const mapping = repeat ? resolveTenderMapping(repeat) : null;
        if (!mapping || !mapping.clearingAccount?.isActive || mapping.clearingAccount.nodeType !== "LEDGER") {
          return {
            lines: [],
            totalDebit: 0,
            totalCredit: 0,
            balanced: false,
            warnings,
            error: `Tender mapping missing for ${(repeat?.tenderType as string | undefined) ?? "payment"}`,
            code: "TENDER_MAPPING_MISSING",
          };
        }
        accountId = mapping.clearingAccount.id;
        accountCode = mapping.clearingAccount.code;
        accountName = mapping.clearingAccount.name;
      } else if (!line.account || !line.account.isActive || line.account.nodeType !== "LEDGER") {
        return {
          lines: [],
          totalDebit: 0,
          totalCredit: 0,
          balanced: false,
          warnings,
          error: "Posting rule contains inactive or non-ledger accounts",
          code: "POSTING_RULE_INVALID_ACCOUNTS",
        };
      }

      const memo = renderTemplate(
        line.memoTemplate,
        {
          ...envelope,
          description: context.description,
          amount,
          tenderType: repeat?.tenderType ?? null,
        },
        context.description,
      ).trim();

      lineRows.push({
        accountId: accountId!,
        accountCode,
        accountName,
        debit: direction === "DEBIT" ? amount : 0,
        credit: direction === "CREDIT" ? amount : 0,
        memo: memo || context.description,
      });
    }
  }

  const totals = lineRows.reduce(
    (accumulator, line) => ({
      totalDebit: accumulator.totalDebit + toMoney(line.debit),
      totalCredit: accumulator.totalCredit + toMoney(line.credit),
    }),
    { totalDebit: 0, totalCredit: 0 },
  );

  if (!totalsBalanced(totals.totalDebit, totals.totalCredit)) {
    warnings.push(`Entry is unbalanced (${totals.totalDebit.toFixed(2)} / ${totals.totalCredit.toFixed(2)})`);
  }

  return {
    selectedRule: {
      id: matchedRule.id,
      name: matchedRule.name,
      sourceType: matchedRule.sourceType,
      priority: matchedRule.priority,
      scopeType: matchedRule.scopeType,
      isFallback: matchedRule.isFallback,
    },
    lines: lineRows,
    totalDebit: toMoney(totals.totalDebit),
    totalCredit: toMoney(totals.totalCredit),
    balanced: totalsBalanced(totals.totalDebit, totals.totalCredit),
    warnings,
  };
}

export async function previewPostingFromSource(context: PostingContext) {
  await ensureAccountingDefaults(context.companyId);
  return simulatePosting(context);
}

export async function createJournalEntryFromSource(context: PostingContext, db: Db = prisma): Promise<PostingResult> {
  const envelope = buildEnvelope(context);
  const integrationEvent = await createOrRefreshIntegrationEvent(context, envelope);

  try {
    await ensureAccountingDefaults(context.companyId);

    if (context.sourceId) {
      const existing = await prisma.journalEntry.findFirst({
        where: {
          companyId: context.companyId,
          sourceType: context.sourceType,
          sourceId: context.sourceId,
        },
        select: { id: true },
      });
      if (existing) {
        await markIntegrationEventPosted(integrationEvent.id, existing.id);
        await syncPaymentLedgerEntryForSource({
          companyId: context.companyId,
          sourceType: context.sourceType,
          sourceId: context.sourceId,
          journalEntryId: existing.id,
        });
        return { entryId: existing.id, skipped: true };
      }
    }

    const simulation = await simulatePosting(context);
    if (simulation.error || simulation.lines.length === 0) {
      const error = simulation.error ?? "Posting rule did not generate journal lines";
      await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, error);
      return { error, code: simulation.code ?? "POSTING_SIMULATION_FAILED" };
    }

    if (!simulation.balanced) {
      const error = `Unbalanced entry (debit ${simulation.totalDebit.toFixed(2)} vs credit ${simulation.totalCredit.toFixed(2)})`;
      await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, error);
      return { error, code: "UNBALANCED_POSTING" };
    }

    const postingPeriod = await resolvePostingPeriod({
      companyId: context.companyId,
      entryDate: context.entryDate,
      actorRole: context.actorRole,
      overrideReason: context.periodOverrideReason,
    });
    if (!postingPeriod.allowed) {
      const error = postingPeriod.message ?? "Posting period is locked";
      await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, error);
      return {
        error,
        code: postingPeriod.code ?? "PERIOD_LOCKED",
      };
    }

    const entryNumber = await getNextEntryNumber(context.companyId);
    const entry = await db.journalEntry.create({
      data: {
        companyId: context.companyId,
        entryNumber,
        entryDate: context.entryDate,
        description: context.description,
        status: "POSTED",
        periodId: postingPeriod.period.id,
        sourceType: context.sourceType,
        sourceId: context.sourceId ?? undefined,
        createdById: context.createdById,
        postedById: context.createdById,
        postedAt: new Date(),
        periodOverrideReason: postingPeriod.requiresOverride ? postingPeriod.overrideReason : undefined,
        periodOverrideById: postingPeriod.requiresOverride ? context.createdById : undefined,
        periodOverrideAt: postingPeriod.requiresOverride ? new Date() : undefined,
        lines: {
          create: simulation.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo,
          })),
        },
      },
      select: { id: true },
    });

    await markIntegrationEventPosted(integrationEvent.id, entry.id);
    await syncPaymentLedgerEntryForSource({
      companyId: context.companyId,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      journalEntryId: entry.id,
    });
    return { entryId: entry.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown posting failure";
    await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, errorMessage);
    return { error: errorMessage, code: "POSTING_EXCEPTION" };
  }
}
