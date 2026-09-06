import { z } from "zod";
import { prisma } from "@corelithzw/db/client";
import type { ExportTargetType, UniversalDocumentPayload } from "./types";
import { registry } from "@corelithzw/platform/registry";

const sourceInputSchema = z.object({
  target: z.enum(["LIST", "RECORD", "DASHBOARD"]),
  sourceKey: z.string().min(1),
  recordId: z.string().uuid().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  payload: z
    .object({
      title: z.string().min(1),
      subtitle: z.string().optional(),
      fileName: z.string().optional(),
      meta: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
      list: z
        .object({
          columns: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
          rows: z.array(z.record(z.string(), z.unknown())),
        })
        .optional(),
      record: z
        .object({
          sections: z.array(
            z.object({
              title: z.string(),
              rows: z.array(z.object({ label: z.string(), value: z.string() })),
            }),
          ),
          lines: z.array(z.record(z.string(), z.unknown())).optional(),
          lineColumns: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
        })
        .optional(),
      dashboard: z
        .object({
          metrics: z.array(
            z.object({
              label: z.string(),
              value: z.string(),
              detail: z.string().optional(),
            }),
          ),
          notes: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type SourceResolutionInput = z.infer<typeof sourceInputSchema>;

/**
 * Where a document's content comes from. A source answers for the keys it
 * knows — a school's fee receipt, a payslip, an invoice — and resolves one into
 * the universal payload the renderers print. The modules that own the records
 * register theirs from the host's `modules.ts`; this file names none of them.
 */
export type DocumentSource = {
  id: string;
  matches: (sourceKey: string) => boolean;
  resolve: (input: {
    companyId: string;
    sourceKey: string;
    recordId?: string;
    filters?: Record<string, string>;
  }) => Promise<SourceResolution>;
};

const sources = registry<Map<string, DocumentSource>>("documents.sources", () => new Map());

export function registerDocumentSource(source: DocumentSource): void {
  sources.set(source.id, source);
}

export function registeredDocumentSources(): DocumentSource[] {
  return [...sources.values()];
}

export type SourceResolution = {
  targetType: ExportTargetType;
  documentType: "REPORT_TABLE" | "DASHBOARD_PACK" | "SALES_INVOICE" | "SALES_QUOTATION" | "SALES_RECEIPT" | "GENERIC_RECORD";
  sourceKey: string;
  fileName: string;
  payload: UniversalDocumentPayload;
  rowsForCsv?: Array<Record<string, unknown>>;
};

export async function resolveSourcePayload(
  companyId: string,
  rawInput: SourceResolutionInput,
): Promise<SourceResolution> {
  const input = sourceInputSchema.parse(rawInput);

  if (input.payload) {
    return {
      targetType: input.target,
      documentType:
        input.target === "LIST"
          ? "REPORT_TABLE"
          : input.target === "DASHBOARD"
            ? "DASHBOARD_PACK"
            : "GENERIC_RECORD",
      sourceKey: input.sourceKey,
      fileName: input.payload.fileName || `${input.sourceKey.replace(/[^a-z0-9-]/gi, "-")}.pdf`,
      payload: input.payload,
      rowsForCsv: input.payload.list?.rows,
    };
  }

  // Iteration 5 — the school's own documents. Kept in their own file because
  // there are eight of them and this one is long enough; dispatched here so a
  // school document is rendered by the same pipeline, the same template and the
  // same letterhead as everything else the product prints.
  for (const source of registeredDocumentSources()) {
    if (source.matches(input.sourceKey)) {
      return source.resolve({
        companyId,
        sourceKey: input.sourceKey,
        recordId: input.recordId,
        filters: input.filters,
      });
    }
  }

  throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
}
