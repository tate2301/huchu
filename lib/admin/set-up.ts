import type { WorkspaceProduct } from "@prisma/client";

import { AdminRefusal } from "@/lib/admin/refusal";
import { operatorActor } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { CLIENT_BUNDLE_TEMPLATES } from "@/lib/platform/client-templates";
import { getTierDefinition, TIERS } from "@/lib/platform/feature-catalog";
import { getProduct } from "@/lib/platform/products";
import { provisionTenant, SlugTakenError } from "@/lib/platform/provision";
import { slugifyTenant } from "@/lib/platform/tenant-slug";

/**
 * Setting up a workspace for a customer who did not sign up themselves.
 *
 * The same provisioning a self-serve signup runs, so an operator's workspace
 * and a stranger's are built the same way. The owner has no password: they
 * sign in with a code sent to their email, and choose one if they want.
 */

/** What a Corelith workspace can be set up to run, newest offering first. Flare is one thing. */
export const SET_UP_TEMPLATES = CLIENT_BUNDLE_TEMPLATES.filter((template) => template.code !== "TEMPLATE_ALL_FEATURES" && template.code !== "TEMPLATE_CRM").map(
  (template) => ({ code: template.code, label: template.label, tier: template.recommendedTierCode }),
);

export const SET_UP_TIERS = TIERS.map((tier) => ({ code: tier.code, name: tier.name, monthlyPrice: tier.monthlyPrice }));

export type SetUpInput = {
  name: string;
  slug: string;
  product: WorkspaceProduct;
  templateCode: string;
  tierCode: string;
  ownerName: string;
  ownerEmail: string;
  start: "TRIAL" | "PAID";
};

export async function setUpWorkspace(operator: SignedInOperator, input: SetUpInput) {
  const name = input.name.trim();
  const slug = slugifyTenant(input.slug || name);
  if (name.length < 2) throw new AdminRefusal("Enter the business's name.");
  if (slug.length < 3) throw new AdminRefusal("The address needs at least 3 letters or numbers.");
  if (input.ownerName.trim().length < 2) throw new AdminRefusal("Enter the owner's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ownerEmail.trim())) throw new AdminRefusal("Enter the owner's email. They sign in with a code sent to it.");

  const flare = input.product === "FLARE";
  const templateCode = flare ? getProduct("FLARE").templateCode! : input.templateCode;
  if (!flare && !SET_UP_TEMPLATES.some((template) => template.code === templateCode)) throw new AdminRefusal("Choose what the business runs.");
  if (!getTierDefinition(input.tierCode)) throw new AdminRefusal("Choose a plan.");

  try {
    const result = await provisionTenant({
      name,
      slug,
      product: input.product,
      templateCode,
      tierCode: input.tierCode,
      adminEmail: input.ownerEmail,
      adminName: input.ownerName.trim(),
      subscriptionStatus: input.start === "TRIAL" ? "TRIALING" : "ACTIVE",
      trialDays: input.start === "TRIAL" ? 14 : undefined,
      actor: operatorActor(operator.id),
      // The provisioning event carries the operator as its actor, so the
      // workspace's feed reads "<operator> set up the workspace".
      reason: `For ${input.ownerName.trim()}, on ${getTierDefinition(input.tierCode)?.name ?? input.tierCode}`,
      onExistingSlug: "refuse",
    });
    return result.company;
  } catch (error) {
    if (error instanceof SlugTakenError) throw new AdminRefusal(`${slug} is taken. Choose another address.`);
    if (error instanceof Error && /already (belongs|reserved)/.test(error.message)) throw new AdminRefusal(error.message);
    throw error;
  }
}
