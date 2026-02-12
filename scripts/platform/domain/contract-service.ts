import { prisma } from "../prisma";
import type {
  ContractEnforcementResult,
  ContractEvaluationResult,
  ContractOverrideResult,
  ContractState,
  EnforceContractInput,
  EvaluateContractInput,
  OverrideContractInput,
  SubscriptionStatusValue,
} from "../types";
import { appendAuditEvent } from "./audit-ledger";
import { formatDate, parseIso } from "./helpers";

const ACTIVE_SUBSCRIPTION_STATES = new Set<SubscriptionStatusValue>(["ACTIVE", "TRIALING"]);

function deriveContractState(
  rows: Array<{ toState: string; expiresAt: Date | null }>,
): ContractState {
  for (const row of rows) {
    const state = row.toState as ContractState;
    if (state === "OVERRIDE" && row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      continue;
    }
    return state;
  }
  return "ACTIVE";
}

export async function getContractState(companyId: string): Promise<ContractState> {
  const rows = await prisma.contractEnforcementEvent.findMany({
    where: { companyId },
    select: { toState: true, expiresAt: true },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
    take: 25,
  });
  return deriveContractState(rows);
}

async function latestSubscriptionStatus(companyId: string): Promise<SubscriptionStatusValue | null> {
  const row = await prisma.companySubscription.findFirst({
    where: { companyId },
    orderBy: [{ updatedAt: "desc" }],
    select: { status: true },
  });
  return (row?.status as SubscriptionStatusValue | undefined) ?? null;
}

export async function evaluateContract(input: EvaluateContractInput): Promise<ContractEvaluationResult> {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const subscriptionStatus = await latestSubscriptionStatus(input.companyId);
  const currentState = await getContractState(input.companyId);
  const active = subscriptionStatus ? ACTIVE_SUBSCRIPTION_STATES.has(subscriptionStatus) : false;
  const recommendedState: ContractState = active ? "ACTIVE" : "SUSPENDED";

  return {
    companyId: company.id,
    companyName: company.name,
    companySlug: company.slug,
    subscriptionStatus,
    currentState,
    recommendedState,
    warningReason: active ? null : `Subscription status is ${subscriptionStatus ?? "unknown"}`,
    canOperate: currentState !== "SUSPENDED",
  };
}

export async function enforceContract(input: EnforceContractInput): Promise<ContractEnforcementResult> {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, slug: true, tenantStatus: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const evaluation = await evaluateContract({ companyId: input.companyId });
  const beforeState = evaluation.currentState;

  let afterState = beforeState;
  let enforced = false;
  let reason = input.reason ?? evaluation.warningReason ?? "Contract enforcement cycle.";

  if (evaluation.recommendedState === "ACTIVE") {
    if (beforeState !== "ACTIVE") {
      afterState = "ACTIVE";
      enforced = true;
      if (company.tenantStatus !== "ACTIVE") {
        await prisma.company.update({
          where: { id: input.companyId },
          data: { tenantStatus: "ACTIVE", suspendedAt: null },
        });
      }
    }
  } else if (beforeState === "ACTIVE") {
    afterState = "WARNING";
    enforced = true;
    reason = reason || "Pre-suspension warning issued.";
  } else if (beforeState === "WARNING") {
    afterState = "SUSPENDED";
    enforced = true;
    reason = reason || "Subscription still inactive after warning.";
    if (company.tenantStatus !== "SUSPENDED") {
      await prisma.company.update({
        where: { id: input.companyId },
        data: { tenantStatus: "SUSPENDED", suspendedAt: new Date() },
      });
      await prisma.user.updateMany({
        where: { companyId: input.companyId, isActive: true },
        data: { isActive: false },
      });
      await prisma.site.updateMany({
        where: { companyId: input.companyId, isActive: true },
        data: { isActive: false },
      });
    }
  }

  if (enforced) {
    await prisma.contractEnforcementEvent.create({
      data: {
        companyId: input.companyId,
        fromState: beforeState,
        toState: afterState,
        reason,
        effectiveAt: new Date(),
      },
    });
  }

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: enforced ? "CONTRACT_ENFORCED" : "CONTRACT_ENFORCEMENT_NOOP",
    entityType: "contract",
    entityId: input.companyId,
    companyId: input.companyId,
    reason,
    before: { state: beforeState },
    after: { state: afterState },
  });

  return {
    companyId: input.companyId,
    companySlug: company.slug,
    beforeState,
    afterState,
    enforced,
    reason,
    auditEventId: audit.id,
  };
}

export async function overrideContract(input: OverrideContractInput): Promise<ContractOverrideResult> {
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("Override reason is required.");

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, slug: true, tenantStatus: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);
  const beforeState = await getContractState(input.companyId);
  const expiresAt = parseIso(input.expiresAt);

  await prisma.contractEnforcementEvent.create({
    data: {
      companyId: input.companyId,
      fromState: beforeState,
      toState: "OVERRIDE",
      reason,
      overrideBy: input.actor,
      expiresAt,
      effectiveAt: new Date(),
    },
  });

  if (company.tenantStatus === "SUSPENDED") {
    await prisma.company.update({
      where: { id: input.companyId },
      data: { tenantStatus: "ACTIVE", suspendedAt: null },
    });
  }

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "CONTRACT_OVERRIDE",
    entityType: "contract",
    entityId: input.companyId,
    companyId: input.companyId,
    reason,
    after: { state: "OVERRIDE", expiresAt: formatDate(expiresAt) },
  });

  return {
    companyId: input.companyId,
    companySlug: company.slug,
    overrideState: "OVERRIDE",
    expiresAt: formatDate(expiresAt),
    reason,
    auditEventId: audit.id,
  };
}
