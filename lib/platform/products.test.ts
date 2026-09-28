import { describe, expect, it } from "vitest";

import { getClientTemplateDefinition } from "@/lib/platform/client-templates";
import { getTierDefinition } from "@/lib/platform/feature-catalog";
import { getProduct, getSelfServeProductBySlug, getTrialTierCode } from "./products";

describe("products", () => {
  it("opens Flare signup by its slug, in any case", () => {
    expect(getSelfServeProductBySlug("flare")?.id).toBe("FLARE");
    expect(getSelfServeProductBySlug(" FLARE ")?.id).toBe("FLARE");
  });

  it("has no signup for a product an operator provisions", () => {
    expect(getSelfServeProductBySlug("corelith")).toBeNull();
    expect(getSelfServeProductBySlug("educo")).toBeNull();
    expect(getSelfServeProductBySlug("")).toBeNull();
    expect(getSelfServeProductBySlug(null)).toBeNull();
  });

  it("provisions every self-serve product from a template that exists, on a tier that exists", () => {
    const flare = getProduct("FLARE");
    expect(getClientTemplateDefinition(flare.templateCode)?.code).toBe("TEMPLATE_CRM");
    expect(getTierDefinition(getTrialTierCode(flare))).not.toBeNull();
  });

  it("opens a Flare workspace on the CRM", () => {
    expect(getProduct("FLARE").homePath).toBe("/crm");
  });

  it("refuses to name a trial tier for a product with no template", () => {
    expect(() => getTrialTierCode(getProduct("CORELITH"))).toThrow(/no provisioning template/);
  });
});
