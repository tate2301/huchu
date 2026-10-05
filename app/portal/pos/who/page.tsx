import { redirect } from "next/navigation";

import { WhoIsSelling } from "@/components/retail/device/who-is-selling";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { tillContext } from "@/lib/retail/devices";
import { deviceForPage } from "../device-page";

/**
 * "Who is selling?" (10-setup 5.5, TillPairing panel 3): the POS host's `/`
 * when the device is paired and nobody is signed in. The proxy sends a
 * signed-out `/` here.
 */
export default async function WhoIsSellingPage() {
  const { device, base } = await deviceForPage();
  if (!device) redirect(`${base}/pair`);
  if (device.unpairedAt) redirect(`${base}/unpaired`);
  const session = await getCurrentAuthSession();
  // Somebody is signed in already: the till is theirs.
  if (session?.user) redirect(base || "/");
  const context = await tillContext(device);
  return (
    <WhoIsSelling
      base={base}
      eyebrow={`${context.till.name} · ${context.site.name}`}
      footnote={context.device.paired}
    />
  );
}
