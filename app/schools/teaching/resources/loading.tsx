import { CardsSkeleton } from "@/components/schools/common/states";

/** The shelf is a two-up grid of resource cards, each a title and its file line. */
export default function TeachingResourcesLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <CardsSkeleton count={6} columns={2} lines={2} />
    </div>
  );
}
