import type { z } from "zod";

import type { AuthenticatedSession } from "@/lib/auth-core/types";

/**
 * Operations: what Corelith can do, published by each product
 * (`docs/platform/operations.md`). An operation is one named thing ("Create a
 * quote"), with its inputs, the checks the app itself makes before doing it,
 * and the module code that does it. It always runs as a person, with their
 * role and the parts of Corelith their workspace has, never as raw SQL.
 *
 * Integrations use operations: Vane proposes them for a person to approve
 * (`lib/vane/integration.ts`), and every integration that comes after it
 * reaches the platform the same way (`docs/platform/integrations.md`).
 */

/**
 * An input a person can change before an operation runs: the due date Vane
 * suggested, the reminder's wording. Everything else (which invoice, which
 * customer) stays as it was proposed.
 */
export type OperationField =
  | { name: string; label: string; type: "date" }
  | { name: string; label: string; type: "text"; multiline?: boolean }
  | { name: string; label: string; type: "number" }
  | { name: string; label: string; type: "select"; options: Array<{ value: string; label: string }> };

/** What an operation risks, which decides how much a person must see before it runs. */
export type OperationRisk =
  /** It changes records inside the workspace: a stage, a task, a draft. */
  | "change"
  /** It reaches someone outside the business: an email, a WhatsApp, an order sent to a supplier. */
  | "send"
  /** It records or moves money: an issued invoice, a receipt, a bank match. */
  | "money"
  /** It changes who may do what: an owner, a permission. */
  | "access";

/** How the operation was reached: by a person in the app, or through an integration they approved it in. */
export type OperationVia = { kind: "person" } | { kind: "integration"; integration: string };

/** Who an operation runs as: the person, with their role and session, and how it reached them. */
export type OperationActor = {
  companyId: string;
  userId: string;
  role: string;
  /** Their session, for module code that asks for one, and for the features and permissions it carries. */
  session: AuthenticatedSession;
  /** The address the request came to, for links module code builds: an order's PDF. */
  requestUrl: string;
  via: OperationVia;
};

/** What happened, in a line a person reads, and the record it made or changed when there is one. */
export type OperationOutcome = string | { said: string; record?: { id: string; href: string } };

export type Operation<Input extends Record<string, unknown> = Record<string, unknown>> = {
  /** "crm.quote.create": the product, the record, the verb. */
  key: string;
  /** The product it acts in, as Corelith names them: "books", "crm", "retail", "schools", "assets", "reports", "people", "vane". */
  product: string;
  /** What it is, in a few words, for lists and permissions: "Create a quote". */
  name: string;
  /** When to use it and what it does, for people building on it and for Vane. */
  description: string;
  risk: OperationRisk;
  /** Its inputs, checked when it is proposed and again just before it runs. */
  input: z.ZodType<Input>;
  /** The inputs a person may change before it runs. */
  fields: OperationField[];
  /** Inputs changed only on the operation's own page (its target), not where it is proposed: the families a reminder goes to. */
  pageFields?: readonly string[];
  /** The button: "Set the due date", "Send 3 reminders". */
  verb: (input: Input) => string;
  /** What it will do, in a line: "Set INV-0142 due on 30 October". */
  title: (input: Input) => string;
  /** The page it acts on, filtered to its records, or the proposal's own page (by its id). */
  target: (input: Input, id: string) => string;
  /**
   * Why this person may not, in a sentence, or null when they may: the same
   * checks the app's own route makes (`routeGate`), and the module's own
   * (who owns the record, the CRM capability, the retail permission).
   */
  authorize: (actor: OperationActor, input: Input) => string | null | Promise<string | null>;
  /** Does it, as the person, through the module's own code. Throws `OperationRefused` when it cannot, saying why. */
  run: (actor: OperationActor, input: Input) => Promise<OperationOutcome>;
};

/** Why an operation did not happen, in a sentence a person can act on. */
export class OperationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationRefused";
  }
}

/** The line a person reads, whichever shape the outcome took. */
export function outcomeWords(outcome: OperationOutcome): string {
  return typeof outcome === "string" ? outcome : outcome.said;
}
