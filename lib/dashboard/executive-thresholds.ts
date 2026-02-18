export type ExecutiveModuleKey =
  | "finance"
  | "gold"
  | "workforce"
  | "operations"
  | "stores"
  | "maintenance"
  | "compliance"
  | "security"
  | "reports";

export type ExecutiveModuleStatus = "healthy" | "watch" | "critical";

type ExecutiveModuleThreshold = {
  watch: number;
  critical: number;
};

export const EXECUTIVE_MODULE_ORDER: ExecutiveModuleKey[] = [
  "finance",
  "gold",
  "workforce",
  "operations",
  "stores",
  "maintenance",
  "compliance",
  "security",
  "reports",
];

export const EXECUTIVE_MODULE_THRESHOLDS: Record<ExecutiveModuleKey, ExecutiveModuleThreshold> = {
  finance: { watch: 1, critical: 2 },
  gold: { watch: 1, critical: 4 },
  workforce: { watch: 2, critical: 5 },
  operations: { watch: 3, critical: 8 },
  stores: { watch: 2, critical: 6 },
  maintenance: { watch: 2, critical: 6 },
  compliance: { watch: 2, critical: 5 },
  security: { watch: 1, critical: 4 },
  reports: { watch: 4, critical: 10 },
};

export function scoreExecutiveModuleStatus(
  module: ExecutiveModuleKey,
  openExceptions: number,
): ExecutiveModuleStatus {
  const thresholds = EXECUTIVE_MODULE_THRESHOLDS[module];
  const normalizedOpenExceptions = Number.isFinite(openExceptions)
    ? Math.max(0, Math.round(openExceptions))
    : 0;

  if (normalizedOpenExceptions >= thresholds.critical) {
    return "critical";
  }
  if (normalizedOpenExceptions >= thresholds.watch) {
    return "watch";
  }
  return "healthy";
}
