"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";

import { useDevicePrefs } from "./device-prefs";
import { TillRootProvider } from "./parts";
import "./till.css";

/**
 * The till's root element: the `.tl` scope every till style hangs from, the two
 * faces, and the node overlays portal into so they stay inside that scope.
 */
export function TillRoot({ fontClass, children }: { fontClass: string; children: React.ReactNode }) {
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const { dim, large } = useDevicePrefs();
  // A receipt prints on paper, never dim: it keeps the light ground whatever this device is set to.
  const printed = usePathname()?.includes("/receipt");
  return (
    <div
      ref={setElement}
      className={`tl ${fontClass}`}
      data-theme={dim && !printed ? "tender-dark" : undefined}
      data-size={large && !printed ? "large" : undefined}
    >
      {/* Movement follows the device: with reduced motion asked for, the till keeps still. */}
      <MotionConfig reducedMotion="user">
        <TillRootProvider element={element}>{children}</TillRootProvider>
      </MotionConfig>
    </div>
  );
}
