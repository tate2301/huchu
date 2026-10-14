"use client";

import * as React from "react";

/** Opens the browser's print once the statements are on the page. */
export function PrintNow() {
  React.useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
