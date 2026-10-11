"use client";

import * as React from "react";
import { MotionConfig } from "framer-motion";

import { TillRootProvider } from "./parts";
import "./till.css";

/**
 * The till's root element: the `.tl` scope every till style hangs from, the two
 * faces, and the node overlays portal into so they stay inside that scope.
 */
export function TillRoot({ fontClass, children }: { fontClass: string; children: React.ReactNode }) {
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setElement}
      className={`tl ${fontClass}`}
    >
      {/* Movement follows the device: with reduced motion asked for, the till keeps still. */}
      <MotionConfig reducedMotion="user">
        <TillRootProvider element={element}>{children}</TillRootProvider>
      </MotionConfig>
    </div>
  );
}
