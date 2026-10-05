import { redirect } from "next/navigation";

import { unpairedSentence, type UnpairReason } from "@/lib/retail/device-words";
import { salesSentAfterUnpairing } from "@/lib/retail/devices";
import { deviceWords } from "@/lib/retail/till-words";
import { deviceForPage } from "../device-page";

import "@/components/retail/device/device-screen.css";

/**
 * POS host `/unpaired` (10-setup 5.5, TillPairing panel 4): what a device
 * shows once a manager unpaired it or paired another to its till, with how
 * many of the sales it held offline came in after that (counted here).
 */
export default async function UnpairedPage() {
  const { device, base } = await deviceForPage();
  if (!device) redirect(`${base}/pair`);
  if (!device.unpairedAt) redirect(base || "/");
  const sent = await salesSentAfterUnpairing(device);
  const label = device.kind === "BROWSER" && device.label ? device.label : deviceWords(device);
  const body = unpairedSentence({
    by: device.unpairedBy?.name ?? "",
    at: device.unpairedAt,
    reason: (device.unpairReason ?? "UNPAIRED") as UnpairReason,
    tillName: device.register.name,
    sent,
  });
  return (
    <main className="device-screen" data-theme="tender-dark">
      <section className="device-card" aria-labelledby="unpaired-title">
        <span className="device-eyebrow">
          {device.register.name} · {label}
        </span>
        <h1 id="unpaired-title" className="device-title">This device is no longer a till</h1>
        <p className="device-body">{body}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="device-button" href={`${base}/pair`}>
            Pair it to a till
          </a>
        </div>
      </section>
    </main>
  );
}
