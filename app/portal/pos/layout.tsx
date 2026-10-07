import type { ReactNode } from "react";

import { tillMono, tillSans } from "@/components/retail/till/fonts";
import { TillRoot } from "@/components/retail/till/till-root";

/**
 * Every till screen, signed in or not, sits in the till's own root: its tokens,
 * its kit and its two faces. The door (`/pair`, "Who is selling?",
 * `/unpaired`) and the receipt use it as they are; the signed-in screens add
 * the shell in `(till)`.
 */
export default function PosPortalLayout({ children }: { children: ReactNode }) {
  return <TillRoot fontClass={`${tillSans.variable} ${tillMono.variable}`}>{children}</TillRoot>;
}
