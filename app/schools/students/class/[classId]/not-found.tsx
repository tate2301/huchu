import { RecordNotFound } from "@/components/records/states";

/**
 * The class in the URL is resolved on the server, so a stale link or another
 * tenant's id lands here. Back to the roll, which is where the class was
 * picked from.
 */
export default function ClassStudentsNotFound() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <RecordNotFound
        what="That class"
        backHref="/schools/students"
        backLabel="Back to the roll"
      />
    </div>
  );
}
