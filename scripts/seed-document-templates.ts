import "dotenv/config";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";

function checksumForSchema(schemaJson: string) {
  return createHash("sha256").update(schemaJson).digest("hex");
}

async function seedEntry(entry: (typeof DEFAULT_TEMPLATE_CATALOG)[number]) {
  const schemaJson = JSON.stringify(entry.schema);
  const schemaChecksum = checksumForSchema(schemaJson);

  const template = await prisma.$transaction(async (tx) => {
    const existing = await tx.documentTemplate.findFirst({
      where: {
        scope: "SYSTEM",
        companyId: null,
        sourceKey: entry.sourceKey,
        documentType: entry.documentType,
        targetType: entry.targetType,
      },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true },
    });

    const ensured = existing
      ? await tx.documentTemplate.update({
          where: { id: existing.id },
          data: {
            name: entry.name,
            description: entry.description,
            isActive: true,
            isDefault: true,
          },
          select: { id: true },
        })
      : await tx.documentTemplate.create({
          data: {
            companyId: null,
            scope: "SYSTEM",
            sourceKey: entry.sourceKey,
            documentType: entry.documentType,
            targetType: entry.targetType,
            name: entry.name,
            description: entry.description,
            isDefault: true,
            isActive: true,
          },
          select: { id: true },
        });

    await tx.documentTemplate.updateMany({
      where: {
        scope: "SYSTEM",
        companyId: null,
        sourceKey: entry.sourceKey,
        documentType: entry.documentType,
        targetType: entry.targetType,
        id: { not: ensured.id },
      },
      data: {
        isDefault: false,
      },
    });

    const versions = await tx.documentTemplateVersion.findMany({
      where: { templateId: ensured.id },
      orderBy: [{ version: "desc" }],
      select: {
        id: true,
        version: true,
        schemaJson: true,
        checksum: true,
        isPublished: true,
      },
    });

    const latest = versions[0];
    const latestChecksum =
      latest?.checksum || (latest ? checksumForSchema(latest.schemaJson) : null);

    if (!latest || latestChecksum !== schemaChecksum) {
      const nextVersion = (latest?.version ?? 0) + 1;
      await tx.documentTemplateVersion.updateMany({
        where: { templateId: ensured.id, isPublished: true },
        data: { isPublished: false },
      });
      await tx.documentTemplateVersion.create({
        data: {
          templateId: ensured.id,
          version: nextVersion,
          schemaJson,
          checksum: schemaChecksum,
          isPublished: true,
          publishedAt: new Date(),
        },
      });
    } else if (!latest.isPublished) {
      await tx.documentTemplateVersion.updateMany({
        where: { templateId: ensured.id, isPublished: true },
        data: { isPublished: false },
      });
      await tx.documentTemplateVersion.update({
        where: { id: latest.id },
        data: {
          isPublished: true,
          publishedAt: new Date(),
        },
      });
    }

    return ensured.id;
  });

  return template;
}

async function main() {
  console.log(`[templates:seed-defaults] seeding ${DEFAULT_TEMPLATE_CATALOG.length} entries`);

  for (const entry of DEFAULT_TEMPLATE_CATALOG) {
    const templateId = await seedEntry(entry);
    console.log(
      `[templates:seed-defaults] upserted ${entry.sourceKey} (${entry.documentType}/${entry.targetType}) -> ${templateId}`,
    );
  }

  console.log("[templates:seed-defaults] done");
}

void main()
  .catch((error) => {
    console.error("[templates:seed-defaults] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
