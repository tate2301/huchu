import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getHostHeaderFromRequestHeaders, getPortalRequestRouting, resolveTenantFromHost } from "@/lib/platform/tenant";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { findDeviceByKey, isLiveTill, type PosDevice } from "@/lib/retail/devices";

/**
 * What a device screen needs to know before it draws: this device (by its
 * key, and only if it is the POS host's shop's), and where the till's root is
 * ("" on the POS host, "/portal/pos" elsewhere).
 */
export async function deviceForPage(): Promise<{ device: PosDevice | null; companyId: string | null; base: string; kora: boolean }> {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const base = getPortalRequestRouting(hostHeader, "/portal/pos").isPortalHost ? "" : "/portal/pos";
  const kora = headersList.get("x-tender-shell")?.trim().toLowerCase() === "kora";
  const [found, tenant] = await Promise.all([
    findDeviceByKey((await cookies()).get(DEVICE_COOKIE)?.value),
    resolveTenantFromHost(hostHeader),
  ]);
  const device = found && tenant && found.companyId === tenant.companyId ? found : null;
  return { device, companyId: tenant?.companyId ?? null, base, kora };
}

/**
 * Every till page but price check: this device must be one of the shop's
 * live tills. An unpaired device goes to `/unpaired`; one with no key, another
 * shop's key or a closed till goes to `/pair`. The (till) layout cannot do
 * this, because price check works before pairing (W-04 step 5).
 */
export async function requireTillDevice(): Promise<PosDevice> {
  const { device, base } = await deviceForPage();
  if (device?.unpairedAt) redirect(`${base}/unpaired`);
  if (!isLiveTill(device)) redirect(`${base}/pair`);
  return device;
}
