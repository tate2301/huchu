"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { HrShell } from "@/components/human-resources/hr-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageSection } from "@/components/ui/page-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchApprovalHistory, type ApprovalHistoryRecord } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

export default function ApprovalsPage() {
  const [entityType, setEntityType] = useState<string>("all");
  const [entityId, setEntityId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<ApprovalHistoryRecord | null>(null);
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "approval-history",
      entityType,
      entityId,
      startDate,
      endDate,
      queryState.page,
      queryState.pageSize,
    ],
    queryFn: () =>
      fetchApprovalHistory({
        entityType:
          entityType === "all"
            ? undefined
            : (entityType as
                | "PAYROLL_RUN"
                | "DISBURSEMENT_BATCH"
                | "ADJUSTMENT_ENTRY"
                | "COMPENSATION_PROFILE"
                | "COMPENSATION_RULE"
                | "GOLD_SHIFT_ALLOCATION"
                | "DISCIPLINARY_ACTION"),
        entityId: entityId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: queryState.page,
        limit: queryState.pageSize,
      }),
  });

  const records = useMemo(() => data?.data ?? [], [data]);
  const totalRows = data?.pagination.total ?? records.length;

  const columns = useMemo<ColumnDef<ApprovalHistoryRecord>[]>(
    () => [
      {
        accessorKey: "actedAt",
        header: "Timestamp",
        cell: ({ row }) => format(new Date(row.original.actedAt), "yyyy-MM-dd HH:mm:ss"),
      },
      {
        accessorKey: "entityType",
        header: "Entity",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.entityType}</div>
            <div className="text-xs text-muted-foreground">{row.original.entityId}</div>
          </div>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge>,
      },
      {
        id: "status",
        header: "Status Change",
        cell: ({ row }) => `${row.original.fromStatus ?? "-"} -> ${row.original.toStatus ?? "-"}`,
      },
      {
        id: "actor",
        header: "Actor",
        cell: ({ row }) => (
          <div>
            <div>{row.original.actedBy.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.actedBy.role}</div>
          </div>
        ),
      },
      {
        accessorKey: "note",
        header: "Note",
        cell: ({ row }) => row.original.note || "-",
      },
      {
        id: "details",
        header: "",
        cell: ({ row }) => (
          <button
            type="button"
            className="text-xs font-semibold text-primary"
            onClick={() => setSelectedRecord(row.original)}
          >
            Details
          </button>
        ),
      },
    ],
    [],
  );

  const toolbarFilters = (
    <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Select
        value={entityType}
        onValueChange={(value) => {
          setEntityType(value);
          setQueryState((prev) => ({ ...prev, page: 1 }));
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-full">
          <SelectValue placeholder="All entities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All entities</SelectItem>
          <SelectItem value="PAYROLL_RUN">Payroll runs</SelectItem>
          <SelectItem value="DISBURSEMENT_BATCH">Disbursement batches</SelectItem>
          <SelectItem value="ADJUSTMENT_ENTRY">Adjustments</SelectItem>
          <SelectItem value="COMPENSATION_PROFILE">Compensation profiles</SelectItem>
          <SelectItem value="COMPENSATION_RULE">Compensation rules</SelectItem>
          <SelectItem value="GOLD_SHIFT_ALLOCATION">Gold payout allocations</SelectItem>
          <SelectItem value="DISCIPLINARY_ACTION">Disciplinary actions</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={entityId}
        onChange={(event) => {
          setEntityId(event.target.value);
          setQueryState((prev) => ({ ...prev, page: 1 }));
        }}
        placeholder="Entity ID"
        className="h-8"
      />
      <Input
        type="date"
        value={startDate}
        onChange={(event) => {
          setStartDate(event.target.value);
          setQueryState((prev) => ({ ...prev, page: 1 }));
        }}
        className="h-8"
      />
      <Input
        type="date"
        value={endDate}
        onChange={(event) => {
          setEndDate(event.target.value);
          setQueryState((prev) => ({ ...prev, page: 1 }));
        }}
        className="h-8"
      />
    </div>
  );

  return (
    <HrShell activeTab="approvals" description="Track submit, approve, reject, and adjustment events">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load approval history</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <PageSection
        title="Approval Timeline"
        description="Immutable audit feed of approval workflow actions."
      >
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <DataTable
            data={records}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) =>
              setQueryState((prev) => ({ ...prev, ...next }))
            }
            pagination={{
              enabled: true,
              server: true,
              total: totalRows,
              totalPages: Math.max(1, Math.ceil(totalRows / queryState.pageSize)),
            }}
            features={{ sorting: false, globalFilter: true, pagination: true }}
            searchPlaceholder="Search current page"
            noResultsText="No approval actions found."
            tableClassName="text-sm"
            toolbar={toolbarFilters}
          />
        )}
      </PageSection>

      <Sheet open={Boolean(selectedRecord)} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <SheetContent size="lg" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Approval Event Details</SheetTitle>
            <SheetDescription>Context for this workflow transition.</SheetDescription>
          </SheetHeader>
          {selectedRecord ? (
            <div className="mt-6 space-y-4 text-sm">
              <div className="rounded-md border-0 p-3 shadow-[var(--surface-frame-shadow)]">
                <div className="text-xs text-muted-foreground">Timestamp</div>
                <div className="font-semibold">
                  {format(new Date(selectedRecord.actedAt), "yyyy-MM-dd HH:mm:ss")}
                </div>
              </div>
              <div className="rounded-md border-0 p-3 shadow-[var(--surface-frame-shadow)]">
                <div className="text-xs text-muted-foreground">Entity</div>
                <div className="font-semibold">{selectedRecord.entityType}</div>
                <div className="text-xs text-muted-foreground">{selectedRecord.entityId}</div>
              </div>
              <div className="rounded-md border-0 p-3 shadow-[var(--surface-frame-shadow)]">
                <div className="text-xs text-muted-foreground">Action</div>
                <div className="mt-1">
                  <Badge variant="outline">{selectedRecord.action}</Badge>
                </div>
                <div className="mt-2 text-muted-foreground">
                  {selectedRecord.fromStatus ?? "-"}
                  {" -> "}
                  {selectedRecord.toStatus ?? "-"}
                </div>
              </div>
              <div className="rounded-md border-0 p-3 shadow-[var(--surface-frame-shadow)]">
                <div className="text-xs text-muted-foreground">Actor</div>
                <div className="font-semibold">{selectedRecord.actedBy.name}</div>
                <div className="text-xs text-muted-foreground">{selectedRecord.actedBy.role}</div>
              </div>
              <div className="rounded-md border-0 p-3 shadow-[var(--surface-frame-shadow)]">
                <div className="text-xs text-muted-foreground">Note</div>
                <div>{selectedRecord.note || "-"}</div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </HrShell>
  );
}
