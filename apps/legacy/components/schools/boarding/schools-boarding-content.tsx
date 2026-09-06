"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, StatCard } from "@corelithzw/react";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { CreateButton } from "@/components/schools/common/record-actions";
import { StatsSkeleton } from "@/components/schools/common/states";

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
 * The stats stay because they are the numbers somebody quotes on the phone, and
 * they are the same five the allocations board carries — one set of figures for
 * the module, not two that can disagree.
 */
export function SchoolsBoardingContent() {
  const [allocating, setAllocating] = useState(false);

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "dashboard", "", ""],
    queryFn: () => fetchBoardingDashboard(),
  });

  const hostels = useMemo(() => boardQuery.data?.hostels ?? [], [boardQuery.data]);
  const summary = boardQuery.data?.summary;

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

      <PageBand
        chips={[
          { label: "Term", value: activeTerm?.code ?? "—" },
          { label: "Beds", value: `${taken} of ${beds}`, tone: "brand" },
          { label: "Free", value: free, tone: free > 0 ? "success" : "warn" },
        ]}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/schools/boarding/allocations">Open allocations</Link>
          </Button>
        }
      />

      {boardQuery.isLoading ? (
        <StatsSkeleton count={5} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Active Allocations" value={summary?.activeAllocations ?? 0} />
          <StatCard label="Total Allocations" value={summary?.totalAllocations ?? 0} />
          <StatCard label="Hostels" value={summary?.hostels ?? 0} />
          <StatCard label="Rooms" value={summary?.rooms ?? 0} />
          <StatCard label="Beds" value={summary?.beds ?? 0} />
        </div>
      )}

      <Card flush title="Beds" subtitle="every bed in the school, free ones included">
        <div className="px-3 py-3">
          <BedBoardContent />
        </div>
      </Card>

      <AllocateBedDialog
        open={allocating}
        hostels={hostels}
        onClose={() => setAllocating(false)}
      />
    </>
  );
}
