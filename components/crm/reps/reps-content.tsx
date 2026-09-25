"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  type ColumnListRow,
} from "@/components/management/ui";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchCrmReps } from "@/lib/crm/crm-v2";

import { RecordMark } from "@/components/records/record-mark";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { formatMoney } from "@/components/crm/documents/document-types";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Owner",
  MANAGER: "Sales manager",
  SALES_REP: "Sales rep",
  SALES_EXEC: "Sales executive",
};

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

/**
 * The team as a directory.
 *
 * Rep performance was a table inside a report, which answers "who is ahead"
 * and nothing else. Here a member is a record: the numbers are still the
 * point, but they sit beside the workload, and the row opens onto everything
 * that person is carrying.
 *
 * The figures are named once, in the column header line (rule 6), rather
 * than "Open pipeline", "Collected" and "Win rate" written again on every
 * row; the role is a word on the line under the name, not a chip — a role is
 * a fact about somebody, not a state (rule 5).
 */
export function RepsContent() {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);

  const repsQuery = useQuery({
    queryKey: ["crm", "reps"],
    queryFn: () => fetchCrmReps(),
  });

  const reps = useMemo(() => repsQuery.data?.data ?? [], [repsQuery.data]);
  const mayOpenEveryone = repsQuery.data?.mayOpenEveryone ?? false;

  const rows = useMemo<ColumnListRow[]>(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    // The roster is small enough that filtering it in the browser beats a
    // round trip — a company with a thousand salespeople is not this product.
    const filtered = needle
      ? reps.filter((rep) => `${rep.name ?? ""} ${rep.email ?? ""}`.toLowerCase().includes(needle))
      : reps;

    return filtered.map((rep) => ({
      id: rep.id,
      cells: {
        member: (
          <ColumnName
            mark={<RecordMark kind="rep" name={rep.name ?? rep.email} size="sm" />}
            name={rep.name ?? rep.email ?? "Unnamed"}
            meta={[
              ROLE_LABELS[rep.role] ?? rep.role,
              `${rep.openLeads} lead${rep.openLeads === 1 ? "" : "s"}`,
              `${rep.openDeals} deal${rep.openDeals === 1 ? "" : "s"}`,
              rep.openTasks > 0 ? `${rep.openTasks} open task${rep.openTasks === 1 ? "" : "s"}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            // Everybody sees the whole team; a page is opened by its owner or
            // a manager, so a colleague's row does not pretend to go anywhere.
            href={mayOpenEveryone || rep.id === me ? `/crm/reps/${rep.id}` : null}
          />
        ),
        pipeline: <ColumnFigure>{formatMoney(rep.openLeadValue + rep.openDealValue, "USD")}</ColumnFigure>,
        // A dash, not a zero: "not shown to you" and "sold nothing" are
        // different facts and must not look the same.
        collected: rep.performance ? (
          <ColumnFigure>{formatMoney(rep.performance.collectedAmount, "USD")}</ColumnFigure>
        ) : (
          <ColumnFigure tone="muted">—</ColumnFigure>
        ),
        winRate: rep.performance ? (
          <ColumnFigure>{rep.performance.winRate}%</ColumnFigure>
        ) : (
          <ColumnFigure tone="muted">—</ColumnFigure>
        ),
      },
    }));
  }, [debouncedSearch, mayOpenEveryone, me, reps]);

  return (
    <RecordListShell
      title="Team"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search the team by name or email"
      error={repsQuery.error}
    >
      {repsQuery.isLoading ? (
        <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : (
        <ColumnList
          label="Team"
          maxWidth={WIDTH}
          empty={debouncedSearch ? "Nobody matches that search." : "Nobody on the team yet."}
          columns={[
            { id: "member", label: "Member" },
            { id: "pipeline", label: "Open pipeline", align: "end" },
            { id: "collected", label: "Collected", align: "end", hideBelow: "sm" },
            { id: "winRate", label: "Win rate", align: "end", hideBelow: "sm" },
          ]}
          rows={rows}
        />
      )}
    </RecordListShell>
  );
}
