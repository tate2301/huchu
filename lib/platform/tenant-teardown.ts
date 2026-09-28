import { prisma } from "@/lib/prisma";

/**
 * Remove a tenant that provisioning built, and everything it built with it.
 *
 * For tests and cleanup scripts. Deleting a company is not one statement: the
 * accounting seed pack writes a dozen models that point at each other, and
 * `Site` is `Restrict` on purpose, so `company.delete` refuses on whichever it
 * meets first — `TaxTemplateLine_taxCodeId_fkey`, usually. A teardown that
 * swallows that refusal leaves the tenant behind, which is how test litter
 * built up before (`lib/retail/provision.test.ts` and
 * `scripts/clean-provision-test-tenants.ts` record the damage). So the order is
 * innermost first, in one transaction, and a failure throws.
 */
export async function destroyProvisionedTenant(companyId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      // Rows that outlive their company by design (SetNull), which a test
      // still has to take with it.
      await tx.platformAuditEvent.deleteMany({ where: { companyId } });
      await tx.signupRequest.deleteMany({ where: { companyId } });
      await tx.user.deleteMany({ where: { companyId } });

      await tx.productPrice.deleteMany({ where: { companyId } });
      await tx.priceList.deleteMany({ where: { companyId } });
      const sites = await tx.site.findMany({ where: { companyId }, select: { id: true } });
      const siteIds = sites.map((site) => site.id);
      if (siteIds.length > 0) {
        await tx.stockMovement.deleteMany({ where: { item: { siteId: { in: siteIds } } } });
        await tx.inventoryItem.deleteMany({ where: { siteId: { in: siteIds } } });
        await tx.stockLocation.deleteMany({ where: { siteId: { in: siteIds } } });
      }
      await tx.product.deleteMany({ where: { companyId } });
      await tx.retailRegister.deleteMany({ where: { companyId } });
      await tx.site.deleteMany({ where: { companyId } });

      await tx.taxRule.deleteMany({ where: { template: { companyId } } });
      await tx.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
      await tx.taxTemplate.deleteMany({ where: { companyId } });
      await tx.taxCode.deleteMany({ where: { companyId } });
      await tx.taxCategory.deleteMany({ where: { companyId } });
      await tx.tenderAccountMapping.deleteMany({ where: { companyId } });
      await tx.postingRule.deleteMany({ where: { companyId } });
      await tx.bankAccount.deleteMany({ where: { companyId } });
      await tx.accountingPeriod.deleteMany({ where: { companyId } });
      await tx.accountingSettings.deleteMany({ where: { companyId } });
      await tx.accountingSeedExecution.deleteMany({ where: { companyId } });
      await tx.currencyRate.deleteMany({ where: { companyId } });
      await tx.currencyDefinition.deleteMany({ where: { companyId } });
      await tx.chartOfAccount.deleteMany({ where: { companyId } });
      await tx.fiscalisationProviderConfig.deleteMany({ where: { companyId } });

      // `deleteMany`, so a tenant something else already removed is a no-op.
      await tx.company.deleteMany({ where: { id: companyId } });
    },
    { timeout: 60_000 },
  );
}
