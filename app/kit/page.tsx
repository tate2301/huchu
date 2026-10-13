import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { designRoutesEnabled } from "@/lib/design/routes";

import { KitSheet } from "./kit-sheet";

export const metadata: Metadata = { title: "The kit" };

/** Every part of the core modules kit with its states (design/core-modules). */
export default function KitPage() {
  if (!designRoutesEnabled()) notFound();
  return <KitSheet />;
}
