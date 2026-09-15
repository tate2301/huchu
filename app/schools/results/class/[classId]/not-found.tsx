import { RecordNotFound } from "@/components/schools/common/states";

/** A class that no longer resolves, sent back to the results it was opened from. */
export default function ClassResultsNotFound() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <RecordNotFound
        what="That class"
        backHref="/schools/results"
        backLabel="Back to the results"
      />
    </div>
  );
}
