import { redirect } from "next/navigation";

import { PairScreen } from "@/components/retail/device/pair-screen";
import { deviceForPage } from "../device-page";

/** POS host `/pair` (10-setup 5.5, TillPairing panel 1). A device that is a till already goes to its till. */
export default async function PairPage() {
  const { device, base, kora } = await deviceForPage();
  if (device && !device.unpairedAt) redirect(base || "/");
  return <PairScreen home={base || "/"} kora={kora} />;
}
