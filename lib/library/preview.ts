import { AdminRefusal } from "@/lib/admin/refusal";
import { enrichTokenClaims } from "@/lib/auth-core/session-claims";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import { readableSources, toSource } from "@/lib/reports/custom/sources";
import { readSourceRows, type SourceRowsAnswer } from "@/lib/reports/custom/source-rows";
import { withCurrency } from "@/lib/reports/format";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { workspaceCurrency } from "@/lib/reports/request";
import type { ReportParams } from "@/lib/reports/types";

/**
 * Previewing a library item on a workspace's rows, from the portal.
 *
 * An operator has no session in the workspace, so the rows are read as its
 * owner reads them: the same fetch a report's own page does, under the
 * owner's role and the workspace's features, through `readSourceRows`. Only
 * rows come back — no SQL runs on the server. The SQL runs in the
 * operator's browser, in the report database (`lib/reports/sql/engine.ts`),
 * after the guard has passed it, exactly as it runs in the workspace. Each
 * read is on the workspace's audit chain.
 */

/** The workspace's first active owner, as a sign-in would read them; a refusal when it has none. */
export async function previewSession(companyId: string): Promise<AuthenticatedSession> {
  const owner = await prisma.user.findFirst({
    where: { companyId, role: "SUPERADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });
  if (!owner) throw new AdminRefusal("This workspace has no owner to read it as.");
  const claims = await enrichTokenClaims({ id: owner.id, companyId });
  if (!claims.role) throw new AdminRefusal("This workspace cannot be read now.");
  return {
    expires: new Date(Date.now() + 5 * 60_000).toISOString(),
    user: { ...claims, id: owner.id, name: owner.name, email: owner.email, role: claims.role, companyId },
  } as AuthenticatedSession;
}

export type PreviewSources = {
  /** Every source there is, with its columns: what an item is written against. */
  sources: ReturnType<typeof toSource>[];
  /** The ones the workspace's owner reads, by key; null when no workspace is chosen. */
  readable: string[] | null;
};

export async function previewSources(companyId: string | null): Promise<PreviewSources> {
  if (!companyId) return { sources: REPORT_DEFINITIONS.map(toSource), readable: null };
  const session = await previewSession(companyId);
  const currency = await workspaceCurrency(companyId);
  const readable = await readableSources(session);
  return {
    sources: REPORT_DEFINITIONS.map(toSource).map((source) => ({ ...source, columns: withCurrency(source.columns, [], currency) })),
    readable: readable.map((definition) => definition.key),
  };
}

/**
 * The rows of the sources an item reads, in one workspace. A source the
 * workspace does not read comes back empty and named in `missing`, so the
 * item still runs and the editor says which tables keep it from that
 * workspace.
 */
export async function previewRows(operator: SignedInOperator, companyId: string, keys: readonly string[], params: ReportParams): Promise<SourceRowsAnswer> {
  const session = await previewSession(companyId);
  const known = keys.filter((key) => REPORT_DEFINITIONS.some((definition) => definition.key === key));
  const read = await readSourceRows(session, known, params);
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: "operator.library.previewed",
    companyId,
    entityType: "company",
    entityId: companyId,
    payload: { sources: known, missing: read.missing },
  });
  const empty = Object.fromEntries(read.missing.map((key) => [key, { rows: [], truncated: false, params }]));
  return { sources: { ...empty, ...read.sources }, missing: read.missing };
}
