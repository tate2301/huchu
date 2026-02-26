import type { AccountingPeriod, AccountingPeriodLockPolicy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { findPeriodForDate } from "@/lib/accounting/ledger";

export type PostingPeriodDecision = {
  allowed: boolean;
  period: AccountingPeriod;
  requiresOverride: boolean;
  overrideReason?: string;
  code?: "PERIOD_LOCKED" | "PERIOD_OVERRIDE_REASON_REQUIRED" | "PERIOD_OVERRIDE_FORBIDDEN";
  message?: string;
};

function normalizedOverrideReason(reason: string | null | undefined) {
  const value = reason?.trim();
  return value && value.length > 0 ? value : undefined;
}

function resolvePeriodLockPolicy(policy: AccountingPeriodLockPolicy | null | undefined): AccountingPeriodLockPolicy {
  return policy ?? "MANAGER_OVERRIDE";
}

export async function resolvePostingPeriod(input: {
  companyId: string;
  entryDate: Date;
  actorRole?: string | null;
  overrideReason?: string | null;
}): Promise<PostingPeriodDecision> {
  let period = await findPeriodForDate(input.companyId, input.entryDate);
  if (!period) {
    const periodStart = new Date(input.entryDate.getFullYear(), input.entryDate.getMonth(), 1);
    const periodEnd = new Date(input.entryDate.getFullYear(), input.entryDate.getMonth() + 1, 0);
    period = await prisma.accountingPeriod.create({
      data: {
        companyId: input.companyId,
        startDate: periodStart,
        endDate: periodEnd,
        status: "OPEN",
      },
    });
  }

  if (period.status === "OPEN") {
    return {
      allowed: true,
      period,
      requiresOverride: false,
    };
  }

  const settings = await prisma.accountingSettings.findUnique({
    where: { companyId: input.companyId },
    select: { periodLockPolicy: true, freezeBeforeDate: true },
  });

  if (settings?.freezeBeforeDate && input.entryDate <= settings.freezeBeforeDate) {
    if (!hasRole(input.actorRole, ["SUPERADMIN", "MANAGER"])) {
      return {
        allowed: false,
        period,
        requiresOverride: false,
        code: "PERIOD_OVERRIDE_FORBIDDEN",
        message: `Posting date is frozen through ${settings.freezeBeforeDate.toISOString().slice(0, 10)}.`,
      };
    }

    const freezeReason = normalizedOverrideReason(input.overrideReason);
    if (!freezeReason) {
      return {
        allowed: false,
        period,
        requiresOverride: true,
        code: "PERIOD_OVERRIDE_REASON_REQUIRED",
        message: "Override reason is required for freeze-date posting.",
      };
    }

    return {
      allowed: true,
      period,
      requiresOverride: true,
      overrideReason: freezeReason,
    };
  }

  const policy = resolvePeriodLockPolicy(settings?.periodLockPolicy);
  if (policy === "SOFT_WARN") {
    return {
      allowed: true,
      period,
      requiresOverride: false,
    };
  }

  if (policy === "STRICT") {
    return {
      allowed: false,
      period,
      requiresOverride: false,
      code: "PERIOD_LOCKED",
      message: "Posting period is closed and strict lock is enabled.",
    };
  }

  if (!hasRole(input.actorRole, ["SUPERADMIN", "MANAGER"])) {
    return {
      allowed: false,
      period,
      requiresOverride: false,
      code: "PERIOD_OVERRIDE_FORBIDDEN",
      message: "Posting period is closed. Only managers can override.",
    };
  }

  const reason = normalizedOverrideReason(input.overrideReason);
  if (!reason) {
    return {
      allowed: false,
      period,
      requiresOverride: true,
      code: "PERIOD_OVERRIDE_REASON_REQUIRED",
      message: "Override reason is required for closed period posting.",
    };
  }

  return {
    allowed: true,
    period,
    requiresOverride: true,
    overrideReason: reason,
  };
}
