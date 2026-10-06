import { redirect } from "next/navigation";

import { TillGate } from "@/components/retail/till/gate";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { isLiveTill } from "@/lib/retail/devices";
import { deviceForPage } from "../device-page";

/**
 * "Who is selling?": the POS host's `/` when the device is a till and nobody
 * is signed in (the proxy rewrites a signed-out `/` here).
 */
export default async function WhoIsSellingPage() {
  const { device, base } = await deviceForPage();
  if (device?.unpairedAt) redirect(`${base}/unpaired`);
  if (!isLiveTill(device)) redirect(`${base}/pair`);
  // Somebody is signed in already: the till is theirs.
  const session = await getCurrentAuthSession();
  if (session?.user) redirect(base || "/");
  return (
    <TillGate
      base={base}
      till={{
        name: device.register.name,
        site: device.register.site.name,
        pairedAt: device.pairedAt.toISOString(),
        pairedBy: device.pairedBy.name ?? "a manager",
      }}
    />
  );
}
