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

/**
 * What happens to a request the entitlement data cannot answer for.
 *
 * SS-1.1 — this used to end in `return true`, so every gate in the platform was
 * decorative unless somebody remembered to set `FEATURE_GATE_POLICY=deny` in the
 * environment. A gate that is on only where an operator switched it on is not a
 * gate; it is a suggestion. The day a stranger can sign themselves up, "did not
 * pay for it" has to mean "cannot reach it" without an env var standing in the
 * way, so the default is deny.
 *
 * The env var survives as break-glass, not as configuration: if a bad
 * entitlement migration locks paying tenants out of what they bought,
 * `FEATURE_GATE_POLICY=allow` restores service in one redeploy while the data is
 * repaired. It is deliberately the same variable — one switch, both directions,
 * nothing to discover under pressure.
 *
 * Note what this does NOT decide: a path with no entry in the route registry is
 * not a gated surface at all, and `canAccessRouteWithToken` lets it through
 * before this function is ever consulted. Denying by default here therefore
 * cannot take an unmapped route off the air; it only decides the answer for a
 * route that names a feature the caller does not hold.
 */
export function isAllowByDefaultFeaturePolicy() {
  const rawPolicy = normalizePolicy(
    process.env.FEATURE_GATE_POLICY ??
      process.env.NEXT_PUBLIC_FEATURE_GATE_POLICY,
  );

  if (ALLOW_VALUES.has(rawPolicy)) {
    return true;
  }
  if (DENY_VALUES.has(rawPolicy)) {
    return false;
  }

  return false;
}

