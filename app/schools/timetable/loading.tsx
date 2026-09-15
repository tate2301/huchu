import { CardsSkeleton, TableRowsSkeleton } from "@/components/records/states";
import { DAY_NAMES } from "@/lib/schools/timetable-format";

/** Monday to Friday, the columns the grid opens on before a Saturday lesson adds one. */
const WEEK = [1, 2, 3, 4, 5];

/**
 * The timetable is a week, not a list: a period label down the side and one
 * bar per weekday across. A five-row table here would reflow the whole grid
 * when the slots land. The phone reads the same week as a stack of lessons, so
 * the placeholder splits the same way the grid does.
 */
export default function TimetableLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="lg:hidden">
        <CardsSkeleton count={5} columns={1} lines={2} />
      </div>
      <div className="hidden lg:block">
        <TableRowsSkeleton
          headers={["Period", ...WEEK.map((day) => DAY_NAMES[day])]}
          columns={[{ twoLine: true }, ...WEEK.map(() => ({}))]}
          rows={7}
        />
      </div>
    </div>
  );
}
