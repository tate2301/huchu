import { cookies, headers } from "next/headers";

import { getHostHeaderFromRequestHeaders, getPortalRequestRouting, resolveTenantFromHost } from "@/lib/platform/tenant";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { findDeviceByKey, type PosDevice } from "@/lib/retail/devices";

/**
 * What a device screen needs to know before it draws: this device (by its
 * key, and only if it is the POS host's shop's), and where the till's root is
 * ("" on the POS host, "/portal/pos" elsewhere).
 */
export async function deviceForPage(): Promise<{ device: PosDevice | null; base: string; kora: boolean }> {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const base = getPortalRequestRouting(hostHeader, "/portal/pos").isPortalHost ? "" : "/portal/pos";
  const kora = headersList.get("x-tender-shell")?.trim().toLowerCase() === "kora";
  const [found, tenant] = await Promise.all([
    findDeviceByKey((await cookies()).get(DEVICE_COOKIE)?.value),
    resolveTenantFromHost(hostHeader),
  ]);
  const device = found && tenant && found.companyId === tenant.companyId ? found : null;
  return { device, base, kora };
}
