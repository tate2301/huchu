import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PairDoor } from "@/components/retail/till/door";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import { isLiveTill } from "@/lib/retail/devices";
import { deviceForPage } from "../device-page";

/**
 * POS host `/pair`: a device that is not a till types a manager's code. A
 * till already goes to its till; one whose till was closed pairs again.
 */
export default async function PairPage() {
  const [{ device, base, kora }, headersList] = await Promise.all([deviceForPage(), headers()]);
  if (isLiveTill(device)) redirect(base || "/");
  const host = (getHostHeaderFromRequestHeaders(headersList) ?? "").split(":")[0] || "This device";
  return <PairDoor base={base} host={host} kora={kora} />;
}
