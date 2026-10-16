import { VANE_INTEGRATION } from "@/lib/vane/integration";

import type { Integration } from "./types";

/** Every integration Corelith knows. A new one is an `Integration`, listed here (`docs/platform/integrations.md`). */
export const INTEGRATIONS: readonly Integration[] = [VANE_INTEGRATION];

export function findIntegration(key: string): Integration | null {
  return INTEGRATIONS.find((integration) => integration.key === key) ?? null;
}
