import { CardsSkeleton, StatsSkeleton } from "@/components/schools/common/states";

/**
 * The teacher's record: the standing column with the mark and the property
 * list, the glance tiles under it, and the classes they stand in front of
 * beside them, one row each.
 */
export default function TeacherRecordLoading() {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <CardsSkeleton count={1} columns={1} lines={6} />
        <StatsSkeleton count={3} />
      </div>
      <CardsSkeleton count={4} columns={1} lines={2} />
    </div>
  );
}
