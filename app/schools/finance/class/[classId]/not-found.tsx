import { RecordNotFound } from "@/components/records/states";

/** A class that no longer resolves, sent back to the fees it was opened from. */
export default function ClassFeesNotFound() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <RecordNotFound
        what="That class"
        backHref="/schools/finance"
        backLabel="Back to the fees"
      />
    </div>
  );
}
