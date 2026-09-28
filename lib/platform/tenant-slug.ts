/**
 * A tenant's URL-safe identity, derived from its name.
 *
 * Its own module, with no imports, because the signup page shows the address
 * as it is typed and the browser has to derive it exactly as provisioning will.
 */
export function slugifyTenant(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
