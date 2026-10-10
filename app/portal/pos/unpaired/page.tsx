import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { NoLongerDoor } from "@/components/retail/till/door";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import { noLongerFacts } from "@/lib/retail/devices";
import { deviceForPage } from "../device-page";

/**
 * POS host `/unpaired`: what a device shows once a manager unpaired it or
 * paired another to its till: who, when, the device that took over, the
 * shift that carried on there, and how many of the sales it held offline
 * came in after that.
 */
export default async function UnpairedPage() {
  const [{ device, base }, headersList] = await Promise.all([deviceForPage(), headers()]);
  if (!device) redirect(`${base}/pair`);
  const facts = await noLongerFacts(device);
  if (!facts) redirect(base || "/");
  const host = (getHostHeaderFromRequestHeaders(headersList) ?? "").split(":")[0] || "This device";
  return <NoLongerDoor base={base} host={host} facts={facts} />;
}
