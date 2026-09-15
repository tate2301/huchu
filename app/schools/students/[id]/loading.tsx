import { CardsSkeleton, StatsSkeleton } from "@/components/records/states";

/**
 * A record is two columns, not a list: the standing column carries the mark,
 * the name and the pupil's properties, the glance tiles sit under it, and the
 * tabbed section beside them opens on the overview's cards.
 */
export default function StudentRecordLoading() {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <CardsSkeleton count={1} columns={1} lines={8} />
        <StatsSkeleton count={3} />
      </div>
      <CardsSkeleton count={4} columns={2} lines={4} />
    </div>
  );
}
