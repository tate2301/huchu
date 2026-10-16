import { BOOKS_OPERATIONS } from "@/lib/books/operations";
import { CRM_OPERATIONS } from "@/lib/crm/operations";
import { ASSETS_OPERATIONS } from "@/lib/maintenance/operations";
import { PEOPLE_OPERATIONS } from "@/lib/platform/operations";
import { REPORTS_OPERATIONS } from "@/lib/reports/operations";
import { RETAIL_OPERATIONS } from "@/lib/retail/operations";
import { SCHOOLS_OPERATIONS } from "@/lib/schools/operations";
import { VANE_OWN_OPERATIONS } from "@/lib/vane/operations";

import type { Operation } from "./types";

/**
 * Every operation Corelith publishes, by product. A new one is an
 * `Operation` in its product's `operations.ts`, listed here
 * (`docs/platform/operations.md`). Integrations reach only the ones their
 * definition names (`lib/integrations/registry.ts`).
 */
export const OPERATIONS: readonly Operation<never>[] = [
  ...BOOKS_OPERATIONS,
  ...CRM_OPERATIONS,
  ...RETAIL_OPERATIONS,
  ...REPORTS_OPERATIONS,
  ...SCHOOLS_OPERATIONS,
  ...ASSETS_OPERATIONS,
  ...PEOPLE_OPERATIONS,
  ...VANE_OWN_OPERATIONS,
] as unknown as readonly Operation<never>[];

export function findOperation(key: string, registry: readonly Operation<never>[] = OPERATIONS): Operation | null {
  return (registry.find((operation) => operation.key === key) as Operation | undefined) ?? null;
}
