const ALLOW_VALUES = new Set([
  "allow",
  "allow-by-default",
  "allow_by_default",
  "fail-open",
  "fail_open",
  "true",
  "1",
]);

const DENY_VALUES = new Set([
  "deny",
  "deny-by-default",
  "deny_by_default",
  "fail-closed",
  "fail_closed",
  "false",
  "0",
]);

function normalizePolicy(value: string | undefined | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function isAllowByDefaultFeaturePolicy() {
  const rawPolicy = normalizePolicy(
    process.env.FEATURE_GATE_POLICY ??
      process.env.NEXT_PUBLIC_FEATURE_GATE_POLICY,
  );

  if (DENY_VALUES.has(rawPolicy)) {
    return false;
  }
  if (ALLOW_VALUES.has(rawPolicy)) {
    return true;
  }

  return true;
}

