/**
 * A stand-in for ZIMRA's FDMS, for the end-to-end suite and local work.
 *
 *   node scripts/fake-fdms.mjs            # listens on 127.0.0.1:9911
 *   FAKE_FDMS_PORT=9912 node scripts/fake-fdms.mjs
 *
 * The fiscal workflow cannot be walked against the real service: registration
 * spends a single-use activation key, and a submitted receipt is a real tax
 * document. This answers the calls a shop's day makes — RegisterDevice,
 * GetConfig, SubmitReceipt, GetStatus, CloseDay — in the shapes `lib/accounting/fdms-connector.ts`
 * and `fdms-device.ts` read, and nothing else. Point a fiscal device's FDMS
 * address at `http://127.0.0.1:9911` to use it.
 *
 * It checks one thing ZIMRA checks: a receipt dated before its fiscal day opened is refused
 * (RCPT014). GetStatus says the device's day is closed once its CloseDay was taken, until a
 * receipt for the next day arrives, as ZIMRA's does (`lastFiscalDayNo`). The app never sends OpenDay, so the fake takes a device's day as opening no
 * earlier than the last receipt of its previous day, as the app opens it: a sale rung while
 * that day's report was on its way is signed into the next day with its own time. Anything
 * else is accepted if it arrives, and a device is registered with whatever key it asks for.
 */

import http from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.FAKE_FDMS_PORT ?? 9911);

/**
 * The fake's own certificate authority. A device's certificate is its CSR
 * signed by this, so it carries the device's own public key — what the app
 * checks a signature against ("Test a receipt") — and a real expiry.
 */
const caDir = mkdtempSync(join(tmpdir(), "fake-fdms-ca-"));
execFileSync(
  "openssl",
  [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", join(caDir, "ca.key"), "-out", join(caDir, "ca.pem"),
    "-days", "365", "-subj", "/CN=fake-fdms-ca",
  ],
  { stdio: "ignore" },
);
process.on("exit", () => rmSync(caDir, { recursive: true, force: true }));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));

function signDevice(csrPem) {
  const dir = mkdtempSync(join(tmpdir(), "fake-fdms-"));
  try {
    writeFileSync(join(dir, "device.csr"), csrPem);
    execFileSync(
      "openssl",
      [
        "x509", "-req", "-in", join(dir, "device.csr"),
        "-CA", join(caDir, "ca.pem"), "-CAkey", join(caDir, "ca.key"), "-set_serial", String(Date.now()),
        "-days", "365", "-out", join(dir, "device.pem"),
      ],
      { stdio: "ignore" },
    );
    return readFileSync(join(dir, "device.pem"), "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let receiptCounter = 0;
/** The newest receipt date each device's current day has taken. */
const lastReceiptDate = new Map();
/** Where each device's day opened, as far as the fake knows: its previous day's last receipt. */
const dayOpenedAfter = new Map();
/** Each device's last day as ZIMRA knows it: its number and whether its CloseDay was taken. */
const dayState = new Map();

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const path = new URL(req.url ?? "/", "http://fake").pathname;
    const match = path.match(/^\/Device\/v\d+\/([^/]+)\/(\w+)$/);
    const [, deviceId, operation] = match ?? [];
    console.log(`${req.method} ${path}`);

    if (operation === "RegisterDevice") {
      let csr = "";
      try {
        csr = String(JSON.parse(raw || "{}").certificateRequest ?? "");
      } catch {
        csr = "";
      }
      if (!csr.includes("CERTIFICATE REQUEST")) {
        return send(res, 400, { status: "FAILED", error: "The registration carried no certificate request." });
      }
      return send(res, 200, { status: "SUCCESS", operationID: `reg-${deviceId}`, certificate: signDevice(csr) });
    }
    if (operation === "SubmitReceipt") {
      let receiptDate = null;
      try {
        receiptDate = new Date(String(JSON.parse(raw || "{}").receipt?.receiptDate ?? ""));
      } catch {
        receiptDate = null;
      }
      const opened = dayOpenedAfter.get(deviceId);
      if (opened && receiptDate && !Number.isNaN(receiptDate.getTime()) && receiptDate < opened) {
        return send(res, 422, {
          status: "FAILED",
          error: `RCPT014: receipt dated ${receiptDate.toISOString()} is before its fiscal day opened (${opened.toISOString()}).`,
        });
      }
      const state = dayState.get(deviceId);
      if (state?.closed) dayState.set(deviceId, { no: state.no + 1, closed: false });
      if (receiptDate && !Number.isNaN(receiptDate.getTime())) {
        const last = lastReceiptDate.get(deviceId);
        if (!last || receiptDate > last) lastReceiptDate.set(deviceId, receiptDate);
      }
      receiptCounter += 1;
      const receiptID = 100000 + receiptCounter;
      return send(res, 200, {
        status: "SUCCESS",
        operationID: `rcpt-${receiptID}`,
        receiptID,
        fiscalNumber: `FAKE-${deviceId}-${receiptID}`,
        reference: String(receiptID),
        serverDate: new Date().toISOString(),
      });
    }
    if (operation === "CloseDay") {
      const last = lastReceiptDate.get(deviceId);
      if (last) dayOpenedAfter.set(deviceId, last);
      let dayNo = null;
      try {
        dayNo = Number(JSON.parse(raw || "{}").fiscalDayNo);
      } catch {
        dayNo = null;
      }
      if (Number.isInteger(dayNo)) dayState.set(deviceId, { no: dayNo, closed: true });
      return send(res, 200, { status: "SUCCESS", operationID: `close-${deviceId}-${Date.now()}` });
    }
    if (operation === "GetStatus") {
      const state = dayState.get(deviceId);
      return send(res, 200, {
        status: "SUCCESS",
        fiscalDayStatus: state?.closed ? "FiscalDayClosed" : "FiscalDayOpened",
        ...(state ? { lastFiscalDayNo: state.no } : {}),
      });
    }
    if (operation === "GetConfig") {
      return send(res, 200, {
        status: "SUCCESS",
        taxPayerName: "Fake taxpayer",
        applicableTaxes: [
          // 15.5% from 1 January 2026.
          { taxID: 1, taxPercent: 15.5, taxName: "Standard rated 15.5%" },
          { taxID: 2, taxPercent: 0, taxName: "Zero rated 0%" },
          { taxID: 3, taxName: "Exempt" },
        ],
      });
    }
    return send(res, 404, { status: "FAILED", error: `The fake FDMS has no ${path}` });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake FDMS on http://127.0.0.1:${PORT}`);
});
