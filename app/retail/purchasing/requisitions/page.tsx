"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot } from "@/components/management/ui";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { retailMoney } from "@/components/retail/sale-detail";
import { fetchJson } from "@/lib/api-client";
import { requisitionCategoryLabel } from "@/lib/retail/requisition-words";
import { formatRetailDate, requisitionStatusLabel } from "@/lib/retail/words";

import { RequisitionDialog } from "./_components/requisition-dialog";
import { requisitionAmount, type RetailRequisition } from "./_components/requisition";


const STATUS_OPTIONS = new Map(
  ["SUBMITTED", "APPROVED", "DISBURSED", "REJECTED", "DRAFT", "CANCELLED"].map((status) => [
    status,
    requisitionStatusLabel(status),
  ]),
);

const WIDTH = 960;

const TONE: Record<string, "warn" | "success" | "neutral" | "danger"> = {
  SUBMITTED: "warn",
  APPROVED: "success",
  REJECTED: "danger",
};


/**
 * Buying › Requisitions — money asked for, to spend on the shop.
 *
 * A manager sees the shop's; anybody else sees their own. Waiting ones come
 * first, because they are the ones somebody is standing at the counter for.
 */
export default function RetailRequisitionsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(FILTER_ANY);
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ["retail-requisitions"],
    queryFn: () => fetchJson<{ data: RetailRequisition[] }>("/api/v2/retail/requisitions"),
  });
  const requisitions = useMemo(() => query.data?.data ?? [], [query.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requisitions
      .filter((row) => status === FILTER_ANY || row.status === status)
      .filter(
        (row) =>
          !needle ||
          [row.requisitionNo, row.purpose, row.requestedBy?.name ?? ""].some((value) =>
            value.toLowerCase().includes(needle),
          ),
      )
      .sort((left, right) => Number(right.status === "SUBMITTED") - Number(left.status === "SUBMITTED"));
  }, [requisitions, search, status]);

  return (
    <>
      <RecordListShell
        title="Requisitions"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by number, purpose or person"
        filters={
          <ViewToolbarFilter
            label="Status"
            value={status}
            anyLabel="Any status"
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
        }
        filterCount={status === FILTER_ANY ? 0 : 1}
        count={query.isSuccess ? `${rows.length} of ${requisitions.length}` : null}
        createLabel="New requisition"
        onCreate={() => setCreating(true)}
        error={query.error}
      >
        {query.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <ColumnList
            label="Requisitions"
            maxWidth={WIDTH}
            empty={search.trim() || status !== FILTER_ANY ? "Nothing matches." : "No requisitions yet."}
            columns={[
              { id: "requisition", label: "Requisition" },
              { id: "kind", label: "Kind", hideBelow: "md" },
              { id: "status", label: "Status", hideBelow: "sm" },
              { id: "needed", label: "Needed by", align: "end", hideBelow: "md" },
              { id: "amount", label: "Amount", align: "end" },
            ]}
            rows={rows.map((row) => ({
              id: row.id,
              cells: {
                requisition: (
                  <ColumnName
                    code={row.requisitionNo}
                    name={row.purpose}
                    meta={[row.requestedBy?.name, row.site?.name, formatRetailDate(row.createdAt)].filter(Boolean).join(" · ")}
                    href={`/retail/purchasing/requisitions/${row.id}`}
                  />
                ),
                kind: <ColumnText>{requisitionCategoryLabel(row.category)}</ColumnText>,
                status: <StatusDot tone={TONE[row.status] ?? "neutral"} label={requisitionStatusLabel(row.status)} />,
                needed: <ColumnFigure tone="muted">{formatRetailDate(row.neededBy) || "—"}</ColumnFigure>,
                amount: <ColumnFigure>{retailMoney(requisitionAmount(row))}</ColumnFigure>,
              },
            }))}
          />
        )}
      </RecordListShell>
      <RequisitionDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
