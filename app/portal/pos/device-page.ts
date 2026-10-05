import { cookies, headers } from "next/headers";

import { getHostHeaderFromRequestHeaders, getPortalRequestRouting, resolveTenantFromHost } from "@/lib/platform/tenant";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { findDeviceByKey, shopSiteId, type PosDevice } from "@/lib/retail/devices";

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

/** A device that is one of this shop's tills now. */
export const isPairedTill = (device: PosDevice | null) => Boolean(device && !device.unpairedAt);

/**
 * Where price check looks up prices: the till's site when this device is a
 * till, else the shop's default site, so it works before pairing (W-04 step 5).
 */
export async function priceCheckSiteForPage(): Promise<string | null> {
  const { device, companyId } = await deviceForPage();
  if (device && isPairedTill(device)) return device.register.site.id;
  return companyId ? shopSiteId(companyId) : null;
}
