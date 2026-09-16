"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { CreateButton } from "@/components/schools/common/record-actions";
import { TableControls } from "@/components/records/table-controls";

import { BedBoardContent } from "@/components/schools/boarding/bed-board-content";
import { AllocateBedDialog } from "@/components/schools/boarding/boarding-dialogs";
import { BoardingViews } from "@/components/schools/boarding/boarding-views";
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
 * It carried a band of five figures — Term, Houses, Rooms, Beds, Free — and an
 * "Open allocations" button pinned beside them. Both are gone. The figures were
 * a summary sitting on top of the board that shows the same thing in the shape
 * somebody can act on, and a screen whose job is a board does not also
 * summarise itself; that belongs on the module overview. The button was a tab
 * wearing a button's clothes, so it is a tab now — the bed board is boarding's
 * fourth face, alongside allocations, hostels and the gate book.
 */
export function SchoolsBoardingContent() {
  const [allocating, setAllocating] = useState(false);

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "dashboard", "", ""],
    queryFn: () => fetchBoardingDashboard(),
  });

  const hostels = useMemo(() => boardQuery.data?.hostels ?? [], [boardQuery.data]);
  const summary = boardQuery.data?.summary;

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

      <TableControls
        tabs={
          <BoardingViews
            beds={boardQuery.isPending ? undefined : summary?.beds}
            allocations={summary?.totalAllocations}
            hostels={summary?.hostels}
          />
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
