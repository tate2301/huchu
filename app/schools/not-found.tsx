import { RecordNotFound } from "@/components/schools/common/states";

/**
 * The catch-all under `/schools`. The routes that resolve a named record of
 * their own send somebody back to the list they came from instead.
 */
export default function SchoolsNotFound() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <RecordNotFound
        what="That page"
        backHref="/schools"
        backLabel="Back to the school overview"
      />
    </div>
  );
}
