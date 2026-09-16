import { CardsSkeleton, StatsSkeleton } from "@/components/records/states";

/**
 * The guardian's record, in the same two columns as the pupil's: the property
 * list and the glance tiles down the side, the children they answer for beside
 * them.
 */
export default function GuardianRecordLoading() {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <CardsSkeleton count={1} columns={1} lines={7} />
        <StatsSkeleton count={3} />
      </div>
      <CardsSkeleton count={3} columns={1} lines={3} />
    </div>
  );
}
