/**
 * Reading the pairing QR with the device's camera (W-04 step 3).
 *
 * The back office's QR holds `tender-pair:482917` (`pairingPayload`). The till
 * opens the camera with `getUserMedia` and reads it with the browser's own
 * `BarcodeDetector` (Chrome on Android, ChromeOS and macOS), so no decoder
 * ships with the till. Where either is missing, or the camera is refused, the
 * pairing screen says so in one line and the code is typed as before.
 */

/** Why the camera could not read a code. */
export type ScanFailure = "unsupported" | "refused" | "no-camera" | "camera-failed" | "nothing-seen" | "wrong-qr";

/** One line each, ending on the way in that still works. */
export const SCAN_FAILURE: Record<ScanFailure, string> = {
  unsupported: "This browser cannot read a QR. Type the code instead.",
  refused: "The camera is not allowed on this device. Type the code instead.",
  "no-camera": "This device has no camera. Type the code instead.",
  "camera-failed": "The camera did not start. Type the code instead.",
  "nothing-seen": "No QR seen. Type the code, or scan again.",
  "wrong-qr": "That QR is not a pairing code. Type the code, or scan again.",
};

/** What a QR that is not a pairing code says, while the camera keeps looking. */
export const NOT_A_PAIRING_QR = "That QR is not a pairing code. Hold up the one under Tills and devices.";

/** How long the camera looks before it gives up. */
export const SCAN_FOR_MS = 30_000;

/** The six digits in a pairing QR's text, or null for any other QR. */
export function pairingCodeFrom(text: string): string | null {
  const match = /^tender-pair:(\d{6})$/i.exec(text.trim());
  return match ? match[1]! : null;
}

/** A `getUserMedia` refusal in the screen's terms. */
export function cameraFailure(error: unknown): ScanFailure {
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  if (name === "NotAllowedError" || name === "SecurityError") return "refused";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-camera";
  return "camera-failed";
}

/* ─── The browser's detector, which lib.dom does not type yet ─────────── */

type DetectedBarcode = { rawValue: string };
export type QrDetector = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
type BarcodeDetectorClass = {
  new (options: { formats: string[] }): QrDetector;
  getSupportedFormats: () => Promise<string[]>;
};

/**
 * A detector for QR codes, or the reason there is none: no camera API, no
 * `BarcodeDetector`, or one that cannot read QR codes. Asks for nothing, so
 * the camera prompt only comes once the till can use what it gives.
 */
export async function qrDetector(): Promise<QrDetector | "unsupported"> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (!Detector) return "unsupported";
  try {
    if (!(await Detector.getSupportedFormats()).includes("qr_code")) return "unsupported";
    return new Detector({ formats: ["qr_code"] });
  } catch {
    return "unsupported";
  }
}
