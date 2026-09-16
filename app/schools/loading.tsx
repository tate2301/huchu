import { StatsSkeleton, TableRowsSkeleton } from "@/components/records/states";

/**
 * The shape nearly every campus screen settles into: a band of tiles over a
 * list. It stands in for any route under `/schools` that has not got a closer
 * boundary, so it draws no column names — the header is only worth drawing
 * where it is known, and here it is not. The screens whose shape is its own —
 * the week grid, the admissions board, a record — carry their own file.
 */
export default function SchoolsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <StatsSkeleton count={3} />
      <TableRowsSkeleton
        columns={[
          { avatar: true, twoLine: true },
          { width: 140 },
          { width: 120 },
          { width: 110, badge: true },
          { width: 90, align: "right" },
        ]}
      />
    </div>
  );
}
