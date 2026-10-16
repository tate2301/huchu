/**
 * The workspace's owner, as Management and Explore read it: the top role,
 * `SUPERADMIN`, which People shows as "Owner" (`lib/admin/members.ts`,
 * `lib/explore/runs.ts`, `lib/retail/approvals/limits.ts`). Corelith's own
 * staff sign in to the operator portal as operators, a separate table with
 * roles of its own, so no platform role shares this one.
 *
 * Only an owner reverses or deletes an invoice that has been issued.
 */
export const WORKSPACE_OWNER_ROLE = "SUPERADMIN";

export function isWorkspaceOwner(role: string | null | undefined): boolean {
  return (role ?? "").trim().toUpperCase() === WORKSPACE_OWNER_ROLE;
}

/** The person changing an invoice, as the session names them. */
export type InvoiceActor = { companyId: string; userId: string; role: string | null | undefined };

/** Why an invoice was not reversed or deleted, in a sentence, with the status the route answers. */
export class InvoiceChangeRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "InvoiceChangeRefused";
  }
}

export const OWNER_ONLY = "Only the workspace's owner can reverse or delete an issued invoice.";
