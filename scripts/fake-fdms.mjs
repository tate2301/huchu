/**
 * A stand-in for ZIMRA's FDMS, for the end-to-end suite and local work.
 *
 *   node scripts/fake-fdms.mjs            # listens on 127.0.0.1:9911
 *   FAKE_FDMS_PORT=9912 node scripts/fake-fdms.mjs
 *
 * The fiscal workflow cannot be walked against the real service: registration
 * spends a single-use activation key, and a submitted receipt is a real tax
 * document. This answers the calls a shop's day makes — RegisterDevice,
 * GetConfig, SubmitReceipt, GetStatus — in the shapes `lib/accounting/fdms-connector.ts`
 * and `fdms-device.ts` read, and nothing else. Point a fiscal device's FDMS
 * address at `http://127.0.0.1:9911` to use it.
 *
 * It signs nothing and checks nothing. A receipt is accepted if it arrives.
 */

import http from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.FAKE_FDMS_PORT ?? 9911);

/** A real certificate, because the app parses the one it is given for its expiry. */
function selfSignedCertificate() {
  const dir = mkdtempSync(join(tmpdir(), "fake-fdms-"));
  try {
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
        "-days", "365", "-subj", "/CN=fake-fdms-device",
      ],
      { stdio: "ignore" },
    );
    return readFileSync(join(dir, "cert.pem"), "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const certificate = selfSignedCertificate();
let receiptCounter = 0;

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
      return send(res, 200, { status: "SUCCESS", operationID: `reg-${deviceId}`, certificate });
    }
    if (operation === "SubmitReceipt") {
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
    if (operation === "GetStatus") {
      return send(res, 200, { status: "SUCCESS", fiscalDayStatus: "FiscalDayOpened" });
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
