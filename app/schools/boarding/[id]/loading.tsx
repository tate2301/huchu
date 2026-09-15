import { CardsSkeleton, StatsSkeleton } from "@/components/schools/common/states";

/**
 * The hostel's record, in the same two columns as the other records: the house
 * and its capacity down the side, the boarders in it beside them.
 */
export default function HostelRecordLoading() {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <CardsSkeleton count={1} columns={1} lines={6} />
        <StatsSkeleton count={3} />
      </div>
      <CardsSkeleton count={4} columns={1} lines={3} />
    </div>
  );
}
