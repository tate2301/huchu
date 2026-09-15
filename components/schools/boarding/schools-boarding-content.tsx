"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { CreateButton } from "@/components/schools/common/record-actions";

import { BedBoardContent } from "@/components/schools/boarding/bed-board-content";
import { AllocateBedDialog } from "@/components/schools/boarding/boarding-dialogs";
import { fetchBoardingDashboard } from "@/components/schools/boarding/boarding-data";

/**
 * The bed board, for the whole school.
 *
 * This route used to be three read-only tables of allocations, hostels and
 * leave — a summary of everything and the answer to nothing. Each of those
 * three now has a screen where it can actually be worked, so what is left here
 * is the question none of them answers: where is there a free bed.
 *
 * Built from the beds outward, so a free bed is a row. That is the whole point.
 * A warden with a new boarder in front of them cannot read the answer off a
 * list of allocations, because the beds nobody is in are exactly the rows such
 * a list does not have.
 *
 * The numbers somebody quotes on the phone are in the band, and only there.
 * They were also five tiles under it — Active allocations, Total allocations,
 * Hostels, Rooms, Beds — of which two said what the band already said in a
 * different typeface, and all five pushed the board they describe below the
 * fold on a laptop. The band is the half that survives, because it is the half
 * that stays in view while a warden scrolls the houses.
 */
export function SchoolsBoardingContent() {
  const [allocating, setAllocating] = useState(false);

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "dashboard", "", ""],
    queryFn: () => fetchBoardingDashboard(),
  });

  const hostels = useMemo(() => boardQuery.data?.hostels ?? [], [boardQuery.data]);
  const summary = boardQuery.data?.summary;

  const pending = boardQuery.isPending;
  const beds = summary?.beds ?? 0;
  const taken = summary?.activeAllocations ?? 0;
  const free = Math.max(0, beds - taken);
  const activeTerm = boardQuery.data?.data?.find((row) => row.term.isActive)?.term ?? null;

  return (
    <>
      <PageChrome title="Bed board">
        <CreateButton
          resource="schools.boarding"
          action="allocate-bed"
          label="Allocate a bed"
          onSelect={() => setAllocating(true)}
          unavailable={
            hostels.length === 0 ? "There is no hostel to put anybody in." : undefined
          }
        />
      </PageChrome>

      {/* Dashes, not noughts, until the board answers. "0 free" for the frame
          before the beds land is the one thing a warden with a new boarder in
          front of them would act on, and it is wrong. */}
      <PageBand
        chips={[
          { label: "Term", value: activeTerm?.code ?? "—" },
          { label: "Houses", value: pending ? "—" : (summary?.hostels ?? "—") },
          { label: "Rooms", value: pending ? "—" : (summary?.rooms ?? "—") },
          { label: "Beds", value: pending ? "—" : `${taken} of ${beds}`, tone: "brand" },
          {
            label: "Free",
            value: pending ? "—" : free,
            tone: free > 0 ? "success" : "warn",
          },
        ]}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/schools/boarding/allocations">Open allocations</Link>
          </Button>
        }
      />

      {/* No card around it. The bar says "Bed board" and a card headed "Beds"
          under it is the page naming itself twice, with a frame around the one
          thing on the screen. */}
      <BedBoardContent />

      <AllocateBedDialog
        open={allocating}
        hostels={hostels}
        onClose={() => setAllocating(false)}
      />
    </>
  );
}
