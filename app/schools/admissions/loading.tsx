import { CardsSkeleton } from "@/components/schools/common/states";

/**
 * The pipeline is stage groups of applicant cards, so the placeholder is cards
 * and not a table. Three columns' worth: what a September board holds.
 */
export default function AdmissionsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <CardsSkeleton count={6} columns={3} lines={2} />
    </div>
  );
}
