import type { z } from "zod";

import type { AuthenticatedSession } from "@/lib/auth-core/types";

/**
 * An input a person can change on a proposed action before approving it: the
 * due date Vane suggested, the reminder's wording. Everything else Vane
 * proposed (which invoice, which customer) stays as it is.
 */
export type VaneActionField =
  | { name: string; label: string; type: "date" }
  | { name: string; label: string; type: "text"; multiline?: boolean }
  | { name: string; label: string; type: "number" }
  | { name: string; label: string; type: "select"; options: Array<{ value: string; label: string }> };

/** Who approved the action: it runs as them, with their role. */
export type VaneActionContext = {
  companyId: string;
  userId: string;
  role: string;
  /** The approving person's session, for module code that asks for one. */
  session: AuthenticatedSession;
  /** The address the approval came to, for links module code builds: an order's PDF. */
  requestUrl: string;
};

/**
 * One thing Vane can do once a person approves it (`lib/vane/actions`). It
 * runs through the module's own code as the approving person, never raw SQL,
 * and refuses what their role could not do in the app.
 */
export type VaneActionKind<Params extends Record<string, unknown> = Record<string, unknown>> = {
  /** "books.invoice.due_date". */
  kind: string;
  /** The module it acts in, as cards name it: "books", "crm", "retail", "vane". */
  module: string;
  /** For Claude: when to propose it and what it does. */
  description: string;
  /** Its inputs, checked when Vane proposes it and again when a person approves it. */
  params: z.ZodType<Params>;
  /** The inputs a person may change before approving. */
  fields: VaneActionField[];
  /** The button: "Set the due date", "Send 3 reminders". */
  verb: (params: Params) => string;
  /** What it does, in a line: "Set INV-0142 due on 30 October". */
  title: (params: Params) => string;
  /** The page it acts on, with the filters that show just those records. */
  target: (params: Params) => string;
  /** Why this person cannot, in a sentence, or null when they can. */
  refuse: (context: VaneActionContext, params: Params) => string | null;
  /** Does it, as the approving person, and says what happened in a line. Throws a VaneActionError when it cannot. */
  run: (context: VaneActionContext, params: Params) => Promise<string>;
};

/** Why an approved action did not happen, in a sentence a person can act on. */
export class VaneActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaneActionError";
  }
}
