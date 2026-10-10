"use client";

import * as React from "react";
import QRCode from "qrcode";

/**
 * A QR code drawn in the browser with the `qrcode` package (10-setup W-04
 * step 3): never an outside QR service, so a pairing code leaves the page
 * only on the screen.
 */
export function QrCode({ payload, label, size = 112 }: { payload: string; label: string; size?: number }) {
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    QRCode.toDataURL(payload, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }).then(
      (url) => {
        if (live) setSrc(url);
      },
      () => {
        if (live) setSrc(null);
      },
    );
    return () => {
      live = false;
    };
  }, [payload, size]);
  return (
    <span className="sf-qr" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made here, nothing to optimise */}
      {src ? <img src={src} alt={label} width={size} height={size} /> : null}
    </span>
  );
}
