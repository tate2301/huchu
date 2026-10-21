import type { Vertical, WorkspaceProduct } from "@prisma/client";

import { AdminRefusal } from "@/lib/admin/refusal";
import { applyVerticalFeatures } from "@/lib/admin/verticals";
import { operatorActor } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { getClientTemplateDefinition } from "@/lib/platform/client-templates";
import { getProduct } from "@/lib/platform/products";
import { provisionTenant, SlugTakenError } from "@/lib/platform/provision";
import { slugifyTenant } from "@/lib/platform/tenant-slug";
import { VERTICAL_ORDER, VERTICALS } from "@/lib/platform/verticals";

/**
 * Setting up a workspace for a customer who did not sign up themselves.
 *
 * The same provisioning a self-serve signup runs, so an operator's workspace
 * and a stranger's are built the same way. The owner has no password: they
 * sign in with a code sent to their email, and choose one if they want.
 *
 * The operator chooses what it runs — its verticals — and that is what it
 * pays for. A Flare or Pabasa workspace is a CRM, a Tender one is retail.
 */

export type SetUpInput = {
  name: string;
  slug: string;
  product: WorkspaceProduct;
  /** Corelith only; a Flare workspace is a CRM. */
  verticals: Vertical[];
  ownerName: string;
  ownerEmail: string;
  start: "TRIAL" | "PAID";
};

/** The verticals a set-up runs, in the catalogue's order. Every product but Corelith is one thing. */
export function setUpVerticals(product: WorkspaceProduct, chosen: readonly Vertical[]): Vertical[] {
  const fixed = getProduct(product).vertical;
  if (fixed) return [fixed];
  return VERTICAL_ORDER.filter((vertical) => chosen.includes(vertical));
}

export async function setUpWorkspace(operator: SignedInOperator, input: SetUpInput) {
  const name = input.name.trim();
  const slug = slugifyTenant(input.slug || name);
  if (name.length < 2) throw new AdminRefusal("Enter the business's name.");
  if (slug.length < 3) throw new AdminRefusal("The address needs at least 3 letters or numbers.");
  if (input.ownerName.trim().length < 2) throw new AdminRefusal("Enter the owner's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ownerEmail.trim())) throw new AdminRefusal("Enter the owner's email. They sign in with a code sent to it.");

  const verticals = setUpVerticals(input.product, input.verticals);
  if (verticals.length === 0) throw new AdminRefusal("Choose at least one thing the business runs.");
  // The first vertical lays the workspace out; the rest are switched on after.
  const [first, ...rest] = verticals;
  const templateCode = getProduct(input.product).templateCode ?? VERTICALS[first].templateCode;
  const tierCode = getClientTemplateDefinition(templateCode)?.recommendedTierCode;

  try {
    const result = await provisionTenant({
      name,
      slug,
      product: input.product,
      templateCode,
      tierCode,
      verticals,
      adminEmail: input.ownerEmail,
      adminName: input.ownerName.trim(),
      subscriptionStatus: input.start === "TRIAL" ? "TRIALING" : "ACTIVE",
      trialDays: input.start === "TRIAL" ? 14 : undefined,
      actor: operatorActor(operator.id),
      // The provisioning event carries the operator as its actor, so the
      // workspace's feed reads "<operator> set up the workspace".
      reason: `For ${input.ownerName.trim()}, running ${verticals.map((vertical) => VERTICALS[vertical].label).join(", ")}`,
      onExistingSlug: "refuse",
    });
    // Provisioning wrote every vertical's row and priced them; these switch the
    // rest's features on.
    for (const vertical of rest) await applyVerticalFeatures(result.company.id, vertical);
    return result.company;
  } catch (error) {
    if (error instanceof SlugTakenError) throw new AdminRefusal(`${slug} is taken. Choose another address.`);
    if (error instanceof Error && /already (belongs|reserved)/.test(error.message)) throw new AdminRefusal(error.message);
    throw error;
  }
}
