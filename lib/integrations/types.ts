import { OPERATIONS } from "@/lib/operations/registry";
import type { Operation } from "@/lib/operations/types";

/**
 * An integration: something that does work in Corelith through its
 * operations, and nothing else (`docs/platform/integrations.md`). It names
 * the operations it uses, and every run goes through the operation's own
 * checks, as the person it runs for. Vane is the first
 * (`lib/vane/integration.ts`).
 */
export type Integration = {
  /** "vane". Recorded on everything it runs (`OperationVia`). */
  key: string;
  name: string;
  /** Who makes it: "Corelith", or the partner who publishes it. */
  maker: string;
  /** What it does for a workspace, in a sentence. */
  summary: string;
  /**
   * The operations it may use: keys ("crm.quote.create"), a product's
   * ("crm.*"), or every one ("*"). Nothing outside these is offered to it,
   * and nothing outside them runs for it.
   */
  uses: readonly string[];
  /**
   * When its operations run. "on-approval": each one waits for a person in
   * the workspace to approve it, with what they may change, and runs as them.
   */
  runs: "on-approval";
};

/** Whether the integration names this operation. */
export function integrationUses(integration: Integration, key: string): boolean {
  return integration.uses.some((use) => use === "*" || use === key || (use.endsWith(".*") && key.startsWith(use.slice(0, -1))));
}

/** The operations an integration may use, from the registry. */
export function operationsFor(integration: Integration, registry: readonly Operation<never>[] = OPERATIONS): readonly Operation<never>[] {
  return registry.filter((operation) => integrationUses(integration, operation.key));
}
