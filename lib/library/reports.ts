import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { checkBlocks, tablesRead } from "@/lib/reports/custom/run";
import { customTemplate, templateReads, templatesFor, type CustomTemplate } from "@/lib/reports/custom/templates";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { sqlName } from "@/lib/reports/sql/schema";
import { canSeeTemplate } from "@/lib/reports/template-access";
import type { ReportDefinition } from "@/lib/reports/types";

import { libraryFor } from "./reach";
import { reportPayloadSchema } from "./report-kinds";
import { libraryTables } from "./tables";

/**
 * Corelith's reports from a workspace's side: the built-in custom reports in
 * code (`CUSTOM_TEMPLATES`), then the library's published ones that reach the
 * workspace, read live. Both are offered the same way — to someone who can
 * open every source the report reads — open at `/reports/built/{key}`, and
 * are copied by "Make it yours". One in code keeps its address: a library
 * report with the same address is not offered.
 */

export type OfferedTemplate = CustomTemplate & {
  /** The source keys it reads. */
  reads: string[];
  /** Published from the portal's library, rather than shipped in code. */
  fromLibrary: boolean;
};

/** A library address may be written `library:<key>`, to say which it means. */
const LIBRARY_PREFIX = "library:";

let keyOf: Map<string, string> | null = null;

function sourceKeys(tables: readonly string[]): string[] {
  keyOf ??= new Map(REPORT_DEFINITIONS.map((definition) => [sqlName(definition.key), definition.key]));
  return tables.map((name) => keyOf!.get(name) ?? name);
}

/** The library's reports that reach a workspace, as built-in custom reports. One whose payload no longer reads is left out. */
export async function libraryReportTemplates(companyId: string): Promise<OfferedTemplate[]> {
  const items = await libraryFor(companyId, "REPORT");
  const tables = libraryTables();
  return items.flatMap((item) => {
    if (customTemplate(item.key)) return [];
    const parsed = reportPayloadSchema.safeParse(item.payload);
    if (!parsed.success) return [];
    const reads = sourceKeys(tablesRead(checkBlocks(parsed.data.blocks, tables), tables));
    return [
      {
        key: item.key,
        title: item.title,
        description: item.summary ?? "",
        audience: "EVERYONE" as const,
        profiles: [],
        document: parsed.data,
        reads,
        fromLibrary: true,
      },
    ];
  });
}

/**
 * The built-in custom reports this person is offered: Corelith's in code,
 * their own business's first, then the library's. Each only where its
 * audience includes them and they can open every source it reads.
 */
export async function offeredTemplates(session: AuthenticatedSession, readable: readonly Pick<ReportDefinition, "key">[]): Promise<OfferedTemplate[]> {
  const person = { id: session.user.id, role: session.user.role };
  const reads = templateReads();
  const code = templatesFor(readable, person, session.user.workspaceProfile).map((template) => ({
    ...template,
    reads: reads.get(template.key) ?? [],
    fromLibrary: false,
  }));
  const open = new Set(readable.map((definition) => definition.key));
  const library = (await libraryReportTemplates(session.user.companyId)).filter(
    (template) =>
      canSeeTemplate({ audience: template.audience, createdById: null }, person) &&
      template.reads.length > 0 &&
      template.reads.every((key) => open.has(key)),
  );
  return [...code, ...library];
}

/** One offered report by its address (`library:<key>` names the library's), or null when it is not offered to this person. */
export async function offeredTemplate(
  session: AuthenticatedSession,
  readable: readonly Pick<ReportDefinition, "key">[],
  key: string,
): Promise<OfferedTemplate | null> {
  const offered = await offeredTemplates(session, readable);
  if (key.startsWith(LIBRARY_PREFIX)) {
    const own = key.slice(LIBRARY_PREFIX.length);
    return offered.find((template) => template.fromLibrary && template.key === own) ?? null;
  }
  return offered.find((template) => template.key === key) ?? null;
}
