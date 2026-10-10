import { describe, expect, it } from "vitest";

import { pairingPayload } from "@/lib/retail/till-words";

import { cameraFailure, pairingCodeFrom, qrDetector } from "./pair-scan";

describe("reading the pairing QR", () => {
  it("takes the six digits out of what the back office's QR holds", () => {
    expect(pairingCodeFrom(pairingPayload("482917"))).toBe("482917");
    expect(pairingCodeFrom("  TENDER-PAIR:048291\n")).toBe("048291");
  });

  it("refuses any other QR, so a stray one never spends a try", () => {
    for (const text of ["482917", "https://example.com/tender-pair:482917", "tender-pair:48291", "tender-pair:4829170", "tender-pair:48a917", ""]) {
      expect(pairingCodeFrom(text)).toBeNull();
    }
  });

  it("names a camera refusal by what the person can do about it", () => {
    expect(cameraFailure({ name: "NotAllowedError" })).toBe("refused");
    expect(cameraFailure({ name: "SecurityError" })).toBe("refused");
    expect(cameraFailure({ name: "NotFoundError" })).toBe("no-camera");
    expect(cameraFailure({ name: "OverconstrainedError" })).toBe("no-camera");
    expect(cameraFailure({ name: "NotReadableError" })).toBe("camera-failed");
    expect(cameraFailure(null)).toBe("camera-failed");
  });

  it("has no detector where there is no browser", async () => {
    expect(await qrDetector()).toBe("unsupported");
  });
});
