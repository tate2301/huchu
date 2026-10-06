import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { NoLongerDoor } from "@/components/retail/till/door";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import { salesSentAfterUnpairing } from "@/lib/retail/devices";
import { deviceForPage } from "../device-page";

/**
 * POS host `/unpaired`: what a device shows once a manager unpaired it or
 * paired another to its till, with how many of the sales it held offline
 * came in after that.
 */
export default async function UnpairedPage() {
  const [{ device, base }, headersList] = await Promise.all([deviceForPage(), headers()]);
  if (!device) redirect(`${base}/pair`);
  if (!device.unpairedAt) redirect(base || "/");
  const sent = await salesSentAfterUnpairing(device);
  const host = (getHostHeaderFromRequestHeaders(headersList) ?? "").split(":")[0] || "This device";
  return (
    <NoLongerDoor
      base={base}
      host={host}
      facts={{
        till: device.register.name,
        reason: device.unpairReason ?? "UNPAIRED",
        by: device.unpairedBy?.name ?? null,
        at: device.unpairedAt.toISOString(),
        sent,
      }}
    />
  );
}
