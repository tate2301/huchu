"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { ManagementShell } from "@/components/settings/management-shell";
import { getSettingsRailGroups } from "@/lib/settings/management-nav";

/** Where the reader lands when no rail entry at all survives their gates. */
const LAST_RESORT_HREF = "/preferences/profile";

/**
 * Master data's front page, which is now the rail.
 *
 * It used to be a list of every reference set with a line under each saying
 * what it was for: a second copy of the navigation beside it, and — after rule
 * 1 took the lines away — a list of names you could already see. `Rail.dc.html`
 * draws the sets themselves under Operations, People and School, so there is
 * no area landing page left to draw.
 *
 * The route stays, because a sidebar entry, a workspace `homeHref` and a retail
 * setup link all point at it. It opens the surface and moves to the first set
 * the reader may actually see.
 *
 * ## Why it picks from the rail rather than the old area table
 *
 * Because the rail is what the reader is about to look at. Choosing from any
 * other list can land them on a row the rail beside them does not draw, which
 * reads as the surface disagreeing with itself. Every candidate below has
 * already been through `getSettingsRailGroups`, so it has passed the same
 * predicate — `canViewPreferenceItem` or the route registry's feature check —
 * that guards the route itself. Nothing here decides access; it only picks
 * among destinations the reader could already reach, and falls back to
 * Profile, which every signed-in role has.
 */
export default function MasterDataIndexPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const user = session?.user as
    | { role?: string; enabledFeatures?: string[] }
    | undefined;
  const role = user?.role;
  const enabledFeatures = user?.enabledFeatures;

  const destination = useMemo(() => {
    const visible = getSettingsRailGroups({ role, enabledFeatures }).flatMap(
      (group) => group.items,
    );

    // A master-data set first, because that is the route the reader asked for.
    // Only when they may see none of them does this widen to the rest of the
    // rail, so a reader who can reach Users but no reference set still arrives
    // somewhere useful rather than at their own profile.
    const inArea = visible.find((entry) =>
      entry.href.startsWith("/management/master-data/"),
    );

    return inArea?.href ?? visible[0]?.href ?? LAST_RESORT_HREF;
  }, [enabledFeatures, role]);

  useEffect(() => {
    // Waiting for the session first: filtering against an undefined role and
    // feature list would send a reader to whichever set happens to be ungated.
    if (status === "loading") return;
    router.replace(destination);
  }, [destination, router, status]);

  // The surface, already open, with its rail. A blank content column for the
  // one frame this is on screen reads as the surface deciding where to land —
  // a spinner over a full-screen dialog reads as a page that failed.
  return (
    <ManagementShell>
      <div />
    </ManagementShell>
  );
}
