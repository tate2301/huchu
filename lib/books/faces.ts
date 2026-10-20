/**
 * Faces for Books (owner, 19 Oct): every person or profile shows its avatar
 * beside its name. A user's photo is `User.image`; a customer has none of its
 * own, so it takes the photo of the CRM client it is linked to, when that has
 * one. Suppliers, banks and ZIMRA are businesses with no profile: no avatar.
 */

/** Add to a `customer: { select }` to read its photo. */
export const customerFace = {
  crmClients: { where: { avatarUrl: { not: null } }, select: { avatarUrl: true }, take: 1 },
} as const;

export function customerImage(customer: { crmClients?: Array<{ avatarUrl: string | null }> } | null | undefined): string | null {
  return customer?.crmClients?.[0]?.avatarUrl ?? null;
}
