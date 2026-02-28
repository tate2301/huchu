"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchInspections, fetchSites, fetchUsers, type InspectionRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type InspectionForm = {
  id?: string;
  siteId: string;
  inspectionDate: string;
  inspectorName: string;
  inspectorOrg: string;
  findings: string;
  actions: string;
  actionsDue: string;
  completedById: string;
  completedAt: string;
  documentUrl: string;
};

const emptyForm: InspectionForm = {
  siteId: "",
  inspectionDate: "",
  inspectorName: "",
  inspectorOrg: "",
  findings: "",
  actions: "",
  actionsDue: "",
  completedById: "",
  completedAt: "",
  documentUrl: "",
};

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");
const TODAY_ISO = new Date().toISOString().slice(0, 10);

export function InspectionsTab({ createdId }: { createdId: string | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("all");
  const [overdueFilter, setOverdueFilter] = useState("all");
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<InspectionForm>(emptyForm);

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users", "compliance", "inspections"],
    queryFn: () => fetchUsers({ limit: 500 }),
  });
  const users = usersData?.data ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "inspections", siteFilter, overdueFilter, queryState.search],
    queryFn: () =>
      fetchInspections({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        overdue: overdueFilter === "overdue" ? true : undefined,
        search: queryState.search || undefined,
        limit: 500,
      }),
  });

  const inspections = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createdId", id);
    params.set("source", "inspection");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance/inspections?${params.toString()}`);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: InspectionForm) => {
      const method = payload.id ? "PATCH" : "POST";
      const url = payload.id ? `/api/compliance/inspections/${payload.id}` : "/api/compliance/inspections";
      return fetchJson<InspectionRecord>(url, {
        method,
        body: JSON.stringify({
          siteId: payload.siteId,
          inspectionDate: payload.inspectionDate,
          inspectorName: payload.inspectorName,
          inspectorOrg: payload.inspectorOrg,
          findings: payload.findings,
          actions: payload.actions || undefined,
          actionsDue: payload.actionsDue || undefined,
          completedById: payload.completedById || undefined,
          completedAt: payload.completedAt || undefined,
          documentUrl: payload.documentUrl || undefined,
        }),
      });
    },
    onSuccess: (inspection) => {
      toast({
        title: form.id ? "Inspection updated" : "Inspection created",
        description: "Inspection record saved successfully.",
        variant: "success",
      });
      setDialogOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["compliance", "inspections"] });
      pushSaved(inspection.id, inspection.createdAt);
    },
    onError: (saveError) => {
      toast({
        title: "Unable to save inspection",
        description: getApiErrorMessage(saveError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compliance/inspections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Inspection deleted",
        description: "Inspection was removed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["compliance", "inspections"] });
    },
    onError: (deleteError) => {
      toast({
        title: "Unable to delete inspection",
        description: getApiErrorMessage(deleteError),
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setForm({
      ...emptyForm,
      siteId: siteFilter !== "all" ? siteFilter : sites?.[0]?.id ?? "",
      inspectionDate: new Date().toISOString().slice(0, 10),
    });
    setDialogOpen(true);
  };

  const columns = useMemo<ColumnDef<InspectionRecord>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        accessorFn: (row) => row.inspectionDate,
        cell: ({ row }) => (
          <div>
            <NumericCell align="left">{toDateInput(row.original.inspectionDate)}</NumericCell>
            {createdId === row.original.id ? <Badge variant="secondary">Saved</Badge> : null}
          </div>
        ),
      },
      {
        id: "site",
        header: "Site",
        accessorFn: (row) => row.site.name,
        cell: ({ row }) => row.original.site.name,
      },
      {
        id: "inspector",
        header: "Inspector",
        accessorFn: (row) => `${row.inspectorName} ${row.inspectorOrg}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.inspectorName}</div>
            <div className="text-xs text-muted-foreground">{row.original.inspectorOrg}</div>
          </div>
        ),
      },
      {
        id: "actionsDue",
        header: "Actions Due",
        accessorFn: (row) => row.actionsDue ?? "",
        cell: ({ row }) => (
          <NumericCell align="left">{toDateInput(row.original.actionsDue)}</NumericCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => {
          const overdue =
            Boolean(row.actionsDue) &&
            !row.completedAt &&
            toDateInput(row.actionsDue) < TODAY_ISO;
          return overdue ? "OVERDUE" : row.completedAt ? "COMPLETED" : "OPEN";
        },
        cell: ({ row }) => {
          const overdue =
            Boolean(row.original.actionsDue) &&
            !row.original.completedAt &&
            toDateInput(row.original.actionsDue) < TODAY_ISO;
          return (
            <Badge variant={overdue ? "destructive" : row.original.completedAt ? "secondary" : "outline"}>
              {overdue ? "OVERDUE" : row.original.completedAt ? "COMPLETED" : "OPEN"}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm({
                  id: row.original.id,
                  siteId: row.original.siteId,
                  inspectionDate: toDateInput(row.original.inspectionDate),
                  inspectorName: row.original.inspectorName,
                  inspectorOrg: row.original.inspectorOrg,
                  findings: row.original.findings,
                  actions: row.original.actions ?? "",
                  actionsDue: toDateInput(row.original.actionsDue),
                  completedById: row.original.completedById ?? "",
                  completedAt: toDateInput(row.original.completedAt),
                  documentUrl: row.original.documentUrl ?? "",
                });
                setDialogOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!window.confirm("Delete this inspection?")) return;
                deleteMutation.mutate(row.original.id);
              }}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [createdId, deleteMutation],
  );

  return (
    <>
      <section className="space-y-4">
        <header className="section-shell flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-section-title text-foreground font-bold tracking-tight">
              Inspections
            </h2>
            <p className="text-sm text-muted-foreground">Track findings and closure actions</p>
          </div>
          <Button onClick={openCreate}>New Inspection</Button>
        </header>
          {pageError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load inspections</AlertTitle>
              <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
            </Alert>
          ) : null}

          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : inspections.length === 0 ? (
            <div className="text-sm text-muted-foreground">No inspections found.</div>
          ) : (
            <DataTable
              data={inspections}
              columns={columns}
              queryState={queryState}
              onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
              searchPlaceholder="Inspector, organization, findings"
              searchSubmitLabel="Search"
              tableClassName="text-sm"
              pagination={{ enabled: true }}
              toolbar={
                <>
                  {sitesLoading ? (
                    <Skeleton className="h-8 w-[180px]" />
                  ) : (
                    <Select
                      value={siteFilter}
                      onValueChange={(value) => {
                        setSiteFilter(value);
                        setQueryState((prev) => ({ ...prev, page: 1 }));
                      }}
                    >
                      <SelectTrigger className="h-8 w-[180px]">
                        <SelectValue placeholder="All sites" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sites</SelectItem>
                        {sites?.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Select
                    value={overdueFilter}
                    onValueChange={(value) => {
                      setOverdueFilter(value);
                      setQueryState((prev) => ({ ...prev, page: 1 }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All inspections</SelectItem>
                      <SelectItem value="overdue">Overdue only</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              }
            />
          )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md" className="w-full">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Inspection" : "New Inspection"}</DialogTitle>
            <DialogDescription>Capture findings, actions, and closure details.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-semibold">Site *</label>
              <Select
                value={form.siteId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, siteId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Inspection Date *</label>
                <Input
                  type="date"
                  value={form.inspectionDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, inspectionDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Actions Due</label>
                <Input
                  type="date"
                  value={form.actionsDue}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, actionsDue: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Inspector Name *</label>
                <Input
                  value={form.inspectorName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, inspectorName: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Inspector Org *</label>
                <Input
                  value={form.inspectorOrg}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, inspectorOrg: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Findings *</label>
              <Textarea
                value={form.findings}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, findings: event.target.value }))
                }
                rows={3}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Actions</label>
              <Textarea
                value={form.actions}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, actions: event.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Completed By</label>
                <Select
                  value={form.completedById || "none"}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, completedById: value === "none" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Completed At</label>
                <Input
                  type="date"
                  value={form.completedAt}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, completedAt: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Document URL</label>
              <Input
                type="url"
                value={form.documentUrl}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, documentUrl: event.target.value }))
                }
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}


