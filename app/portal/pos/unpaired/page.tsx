import { redirect } from "next/navigation";

import { unpairedSentence, type UnpairReason } from "@/lib/retail/device-words";
import { deviceWords } from "@/lib/retail/till-words";
import { deviceForPage } from "../device-page";

import "@/components/retail/device/device-screen.css";

/**
 * POS host `/unpaired` (10-setup 5.5, TillPairing panel 4): what a device
 * shows once a manager unpaired it or paired another to its till. `sent` is
 * how many sales it sent in on its way out.
 */
export default async function UnpairedPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { device, base } = await deviceForPage();
  if (!device) redirect(`${base}/pair`);
  if (!device.unpairedAt) redirect(base || "/");
  const sent = Math.max(0, Math.min(9999, Number.parseInt((await searchParams).sent ?? "0", 10) || 0));
  const label = device.kind === "BROWSER" && device.label ? device.label : deviceWords(device);
  const body = unpairedSentence({
    by: device.unpairedBy?.name ?? "",
    at: device.unpairedAt,
    reason: (device.unpairReason ?? "UNPAIRED") as UnpairReason,
    tillName: device.register.name,
    sent,
  });
  return (
    <main className="device-screen">
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
