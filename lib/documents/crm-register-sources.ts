/**
 * CRM lists as exports: `crm.register.<list>`.
 *
 * An export is the list its reader was looking at — the same query string,
 * read by the same code, inside the same access scope — so what was on
 * screen is what lands in the file. Resolved on the server only: a client
 * that could hand in its own rows could export anything it liked under the
 * list's name.
 *
 * Every export is checked against `records.export` as the person who asked,
 * again when a background job finally runs it, so a permission taken away in
 * the meantime is a failed job rather than a file.
 */
import { readState } from "@/lib/crm/registers/codec";
import { dayIn } from "@/lib/crm/registers/dates";
import { REGISTERS, isEngineRegisterKey, type EngineRegisterKey } from "@/lib/crm/registers/registry";
import { REGISTER_SERVERS } from "@/lib/crm/registers/server";
import { registerContextFor } from "@/lib/crm/registers/server/context";
import type { RegisterDef, ViewState } from "@/lib/crm/registers/types";
import { denialMessage } from "@/lib/crm/permissions";
import type { ListColumn } from "@/lib/documents/types";

const PREFIX = "crm.register.";

/** The most rows any export will scan, whatever its format says. */
const SCAN_CEILING = 50_000;

export function crmRegisterSourceKey(key: EngineRegisterKey): string {
  return `${PREFIX}${key.toLowerCase()}`;
}

/** Any `crm.register.*` key — including one naming no list, which is refused. */
export function isCrmRegisterSourceKey(sourceKey: string): boolean {
  return sourceKey.startsWith(PREFIX);
}

export function crmRegisterKeyFromSource(sourceKey: string): EngineRegisterKey | null {
  if (!isCrmRegisterSourceKey(sourceKey)) return null;
  const key = sourceKey.slice(PREFIX.length).toUpperCase();
  return isEngineRegisterKey(key) ? key : null;
}

/** An export refused for who is asking, with the status to answer it with. */
export class CrmExportRefusedError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404,
  ) {
    super(message);
  }
}

type ExportInput = {
  sourceKey: string;
  filters?: Record<string, string>;
  ids?: string[];
  columns?: string[];
  title?: string;
};

async function prepare(companyId: string, input: ExportInput, actorId: string | null) {
  const key = crmRegisterKeyFromSource(input.sourceKey);
  if (!key) throw new CrmExportRefusedError("There is no such list to export.", 404);
  if (!actorId) throw new CrmExportRefusedError("A list export has to be made for somebody.", 403);

  const params = new URLSearchParams(input.filters ?? {});
  const ctx = await registerContextFor({ companyId, userId: actorId, tz: params.get("tz") });
  if (!ctx) throw new CrmExportRefusedError("That account can no longer export.", 403);
  if (!ctx.can("records.export")) {
    throw new CrmExportRefusedError(denialMessage("records.export"), 403);
  }

  const server = REGISTER_SERVERS[key];
  const { state } = readState(server.def, params);
  return { ctx, server, state };
}

/**
 * The columns to write, in order: the ones asked for that the list has, or
 * the list's own default set. Never none — the list's one required column
 * stands in for an empty choice.
 */
export function exportColumns(def: RegisterDef, requested?: readonly string[]): ListColumn[] {
  const byId = new Map(def.columns.map((column) => [column.id, column]));
  const asked = (requested ?? []).filter((id) => byId.has(id));
  const ids =
    asked.length > 0
      ? [...new Set(asked)]
      : def.columns.filter((column) => !column.hiddenByDefault).map((column) => column.id);
  const chosen = ids.length > 0 ? ids : def.columns.filter((column) => column.required).map((column) => column.id);
  return chosen.map((id) => {
    const column = byId.get(id)!;
    return { key: column.id, label: column.label, kind: column.kind };
  });
}

/** "Search “roof” · Type, Owner" — what narrowed the export, for its header. */
export function describeNarrowing(def: RegisterDef, state: ViewState, selected?: number): string | null {
  const parts: string[] = [];
  if (selected) parts.push(`${selected} selected`);
  if (state.q?.trim()) parts.push(`Search “${state.q.trim()}”`);
  const labels = def.filters.filter((filter) => state.filters[filter.key] !== undefined).map((f) => f.label);
  const custom = Object.keys(state.filters).filter((key) => key.startsWith("cf.")).length;
  if (labels.length > 0 || custom > 0) {
    parts.push([...labels, ...(custom > 0 ? [`${custom} custom field${custom === 1 ? "" : "s"}`] : [])].join(", "));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function titleFor(def: RegisterDef, title?: string): string {
  if (title?.trim()) return title.trim();
  return def.noun.many.charAt(0).toUpperCase() + def.noun.many.slice(1);
}

export async function summarizeCrmRegisterSource(
  companyId: string,
  input: ExportInput,
  actorId: string | null,
) {
  const { ctx, server, state } = await prepare(companyId, input, actorId);
  return {
    targetType: "LIST" as const,
    documentType: "REPORT_TABLE" as const,
    sourceKey: input.sourceKey,
    rowCount: await server.count(ctx, state, input.ids),
    noun: server.def.noun,
  };
}

export async function resolveCrmRegisterSource(
  companyId: string,
  input: ExportInput,
  actorId: string | null,
) {
  const { ctx, server, state } = await prepare(companyId, input, actorId);
  const def = server.def;
  const columns = exportColumns(def, input.columns);

  const rows: Array<Record<string, unknown>> = [];
  for await (const batch of server.scan(ctx, state, { ids: input.ids })) {
    for (const row of batch) {
      const cells = server.cells(row, ctx);
      rows.push(Object.fromEntries(columns.map((column) => [column.key, cells[column.key] ?? null])));
    }
    if (rows.length >= SCAN_CEILING) break;
  }

  const title = titleFor(def, input.title);
  const today = dayIn(ctx.now, ctx.tz);
  const narrowing = describeNarrowing(def, state, input.ids?.length);
  const fileName = `${title} ${today}`;

  return {
    targetType: "LIST" as const,
    documentType: "REPORT_TABLE" as const,
    sourceKey: input.sourceKey,
    fileName,
    payload: {
      title,
      fileName,
      ...(narrowing ? { subtitle: narrowing } : {}),
      meta: [
        { label: "Rows", value: rows.length.toLocaleString("en-US") },
        { label: "Exported", value: today },
      ],
      list: { columns, rows },
    },
    rowsForCsv: rows,
  };
}

/** The list a source key exports, for gating it by the list's own feature. */
export function crmRegisterRoute(sourceKey: string): string | null {
  const key = crmRegisterKeyFromSource(sourceKey);
  return key ? REGISTERS[key].route : null;
}
