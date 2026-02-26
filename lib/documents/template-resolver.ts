import { prisma } from "@/lib/prisma";
import { defaultTemplateSchema, parseTemplateSchema, type DocumentTemplateSchema } from "@/lib/documents/template-schema";
import { resolveCatalogTemplateEntry } from "@/lib/documents/default-template-catalog";

export type TemplateResolutionInput = {
  companyId: string;
  documentType: "REPORT_TABLE" | "DASHBOARD_PACK" | "SALES_INVOICE" | "SALES_QUOTATION" | "SALES_RECEIPT" | "GENERIC_RECORD";
  targetType: "LIST" | "RECORD" | "DASHBOARD";
  sourceKey: string;
  templateId?: string;
  templateVersionId?: string;
};

export type TemplateResolution = {
  templateId: string | null;
  templateVersionId: string | null;
  templateSchema: DocumentTemplateSchema;
};

function chooseVersion(versions: Array<{ id: string; schemaJson: string; isPublished: boolean }>) {
  const published = versions.find((version) => version.isPublished);
  return published ?? versions[0] ?? null;
}

async function findDefaultTemplate(input: {
  companyId: string;
  documentType: TemplateResolutionInput["documentType"];
  targetType: TemplateResolutionInput["targetType"];
  sourceKey: string;
}) {
  const whereBase = {
    documentType: input.documentType,
    targetType: input.targetType,
    isDefault: true,
    isActive: true,
  } as const;

  const companyDefault = await prisma.documentTemplate.findFirst({
    where: {
      ...whereBase,
      companyId: input.companyId,
      sourceKey: input.sourceKey,
    },
    include: {
      versions: {
        orderBy: [{ isPublished: "desc" }, { version: "desc" }],
        select: { id: true, schemaJson: true, isPublished: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  if (companyDefault) return companyDefault;

  const systemExact = await prisma.documentTemplate.findFirst({
    where: {
      ...whereBase,
      scope: "SYSTEM",
      companyId: null,
      sourceKey: input.sourceKey,
    },
    include: {
      versions: {
        orderBy: [{ isPublished: "desc" }, { version: "desc" }],
        select: { id: true, schemaJson: true, isPublished: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  if (systemExact) return systemExact;

  if (!input.sourceKey.startsWith("ui.table.")) {
    return null;
  }

  return prisma.documentTemplate.findFirst({
    where: {
      ...whereBase,
      scope: "SYSTEM",
      companyId: null,
      sourceKey: "ui.table.*",
    },
    include: {
      versions: {
        orderBy: [{ isPublished: "desc" }, { version: "desc" }],
        select: { id: true, schemaJson: true, isPublished: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function resolveTemplate(input: TemplateResolutionInput): Promise<TemplateResolution> {
  if (input.templateVersionId) {
    const version = await prisma.documentTemplateVersion.findUnique({
      where: { id: input.templateVersionId },
      include: {
        template: {
          select: {
            id: true,
            companyId: true,
            scope: true,
          },
        },
      },
    });

    if (
      version &&
      (version.template.companyId === input.companyId || version.template.scope === "SYSTEM")
    ) {
      return {
        templateId: version.template.id,
        templateVersionId: version.id,
        templateSchema: parseTemplateSchema(version.schemaJson),
      };
    }
  }

  if (input.templateId) {
    const template = await prisma.documentTemplate.findUnique({
      where: { id: input.templateId },
      include: {
        versions: {
          orderBy: [{ isPublished: "desc" }, { version: "desc" }],
          select: { id: true, schemaJson: true, isPublished: true },
        },
      },
    });

    if (template && (template.companyId === input.companyId || template.scope === "SYSTEM")) {
      const chosen = chooseVersion(template.versions);
      return {
        templateId: template.id,
        templateVersionId: chosen?.id ?? null,
        templateSchema: chosen ? parseTemplateSchema(chosen.schemaJson) : defaultTemplateSchema,
      };
    }
  }

  const selected = await findDefaultTemplate({
    companyId: input.companyId,
    documentType: input.documentType,
    targetType: input.targetType,
    sourceKey: input.sourceKey,
  });
  if (!selected) {
    const catalogFallback = resolveCatalogTemplateEntry({
      sourceKey: input.sourceKey,
      documentType: input.documentType,
      targetType: input.targetType,
    });
    if (catalogFallback) {
      return {
        templateId: null,
        templateVersionId: null,
        templateSchema: catalogFallback.schema,
      };
    }

    return {
      templateId: null,
      templateVersionId: null,
      templateSchema: defaultTemplateSchema,
    };
  }

  const selectedVersion = chooseVersion(selected.versions);
  return {
    templateId: selected.id,
    templateVersionId: selectedVersion?.id ?? null,
    templateSchema: selectedVersion ? parseTemplateSchema(selectedVersion.schemaJson) : defaultTemplateSchema,
  };
}
