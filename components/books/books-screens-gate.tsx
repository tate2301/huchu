"use client";

import { usePathname } from "next/navigation";
import type * as React from "react";

/** Takings is the floor's End of day at a Books address: it keeps its retail gate (books-final §1.2). */
const OPEN_WITHOUT_SCREENS = ["/books/takings"];

/**
 * Every Books page shows what the screens add in a workspace without them,
 * except the ones that keep their own gate. The layout decides whether the
 * screens are on; this picks by the address, which a layout cannot read.
 */
export function BooksScreensGate({ upsell, children }: { upsell: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const open = OPEN_WITHOUT_SCREENS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return <>{open ? children : upsell}</>;
}
