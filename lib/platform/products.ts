import type { WorkspaceProduct } from "@prisma/client";

import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { getClientTemplateDefinition } from "@/lib/platform/client-templates";

/**
 * The products sold under their own trading names.
 *
 * A product decides what a stranger is signed up for: which template the
 * workspace is provisioned from, which tier the trial runs on, and where the
 * workspace opens. `Company.product` records the answer at provisioning and is
 * never inferred afterwards.
 *
 * CORELITH is every workspace an operator provisioned before self-serve
 * existed. It is not self-serve, so it has no signup page.
 */
export type ProductDefinition = {
  id: WorkspaceProduct;
  /** The URL segment on the signup pages: `/signup/flare`. */
  slug: string;
  name: string;
  /** Whether a stranger can sign up for it without an operator. */
  selfServe: boolean;
  /** The client template a new workspace is provisioned from. */
  templateCode: string | null;
  trialDays: number;
  /** Where a new workspace opens. */
  homePath: string;
  /** What the signup page says. Only a self-serve product has one. */
  signup: { headline: string; lede: string } | null;
};

const PRODUCTS: Record<WorkspaceProduct, ProductDefinition> = {
  CORELITH: {
    id: "CORELITH",
    slug: "corelith",
    name: PLATFORM_BRAND_NAME,
    selfServe: false,
    templateCode: null,
    trialDays: 0,
    homePath: "/",
    signup: null,
  },
  FLARE: {
    id: "FLARE",
    slug: "flare",
    name: "Flare",
    selfServe: true,
    templateCode: "TEMPLATE_CRM",
    trialDays: 14,
    homePath: "/crm",
    signup: {
      headline: "Never lose a follow-up again",
      lede: "Free for 14 days. No card.",
    },
  },
};

export function getProduct(id: WorkspaceProduct): ProductDefinition {
  return PRODUCTS[id];
}

/** The self-serve product a signup URL names, or null for anything else. */
export function getSelfServeProductBySlug(slug: string | null | undefined): ProductDefinition | null {
  const normalized = String(slug ?? "").trim().toLowerCase();
  const product = Object.values(PRODUCTS).find((candidate) => candidate.slug === normalized);
  return product?.selfServe ? product : null;
}

/**
 * The tier a product's trial runs on: the one its template recommends.
 *
 * Read from the template rather than written down twice, so the template and
 * the trial cannot disagree about which tier carries the product.
 */
export function getTrialTierCode(product: ProductDefinition): string {
  const template = getClientTemplateDefinition(product.templateCode);
  if (!template) {
    throw new Error(`${product.name} has no provisioning template, so it has no trial tier.`);
  }
  return template.recommendedTierCode;
}
