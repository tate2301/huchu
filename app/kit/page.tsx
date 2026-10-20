import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { designRoutesEnabled } from "@/lib/design/routes";

import { KitSheet } from "./kit-sheet";
import { TeamsSheet } from "./teams/teams-sheet";

export const metadata: Metadata = { title: "The kit" };

/**
 * Every part of the kit with its states: the core modules kit (design/core-modules), then the Teams kit,
 * boards K1 to K9 (design/teams). `?sheet=teams` shows the Teams kit alone.
 */
export default async function KitPage({ searchParams }: { searchParams: Promise<{ sheet?: string }> }) {
  if (!designRoutesEnabled()) notFound();
  const { sheet } = await searchParams;
  return (
    <>
      {sheet === "teams" ? null : <KitSheet />}
      <TeamsSheet />
    </>
  );
}
