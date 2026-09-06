"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import type { DataTableColumn } from "@corelithzw/react";
import {
  DetailFact,
  MasterDataPage,
} from "@corelithzw/shell/master-data-page";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@corelithzw/ui/components/dialog";
import { Input } from "@corelithzw/ui/components/input";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@corelithzw/ui/components/select";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchInspections, type InspectionRecord } from "../api-client";
import { fetchSites } from "@corelithzw/platform/client/sites";
import { fetchUsers } from "@corelithzw/platform/client/users";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

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

const inspectionStatus = (row: InspectionRecord) => {
  const overdue =
    Boolean(row.actionsDue) && !row.completedAt && toDateInput(row.actionsDue) < TODAY_ISO;
  return overdue ? "OVERDUE" : row.completedAt ? "COMPLETED" : "OPEN";
};

export function InspectionsTab({ createdId, banner }: { createdId: string | null; banner?: ReactNode }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("all");
  const [overdueFilter, setOverdueFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side filter; deferring keeps one request per pause, not keystroke.
  const deferredSearch = useDeferredValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<InspectionForm>(emptyForm);

  const { data: sites, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users", "compliance", "inspections"],
    queryFn: () => fetchUsers({ limit: 500 }),
  });
  const users = usersData?.data ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "inspections", siteFilter, overdueFilter, deferredSearch],
    queryFn: () =>
      fetchInspections({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        overdue: overdueFilter === "overdue" ? true : undefined,
        search: deferredSearch || undefined,
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

  const openEdit = (row: InspectionRecord) => {
    setForm({
      id: row.id,
      siteId: row.siteId,
      inspectionDate: toDateInput(row.inspectionDate),
      inspectorName: row.inspectorName,
      inspectorOrg: row.inspectorOrg,
      findings: row.findings,
      actions: row.actions ?? "",
      actionsDue: toDateInput(row.actionsDue),
      completedById: row.completedById ?? "",
      completedAt: toDateInput(row.completedAt),
      documentUrl: row.documentUrl ?? "",
    });
    setDialogOpen(true);
  };

  // No actions column: a row is picked, and what can be done to it lives in
  // the detail pane.
  const columns = useMemo<DataTableColumn<InspectionRecord>[]>(
    () => [
      {
        key: "date",
        header: "Date",
        sortable: true,
        sortAccessor: (row) => row.inspectionDate,
        render: (row) => (
          <div>
            <NumericCell align="left">{toDateInput(row.inspectionDate)}</NumericCell>
            {createdId === row.id ? <Badge variant="secondary">Saved</Badge> : null}
          </div>
        ),
      },
      {
        key: "site",
        header: "Site",
        sortable: true,
        sortAccessor: (row) => row.site.name,
        render: (row) => row.site.name,
      },
      {
        key: "inspector",
        header: "Inspector",
        sortable: true,
        sortAccessor: (row) => `${row.inspectorName} ${row.inspectorOrg}`,
        render: (row) => (
          <div>
            <div className="font-semibold">{row.inspectorName}</div>
            <div className="text-sm text-[var(--text-muted)]">{row.inspectorOrg}</div>
          </div>
        ),
      },
      {
        key: "actionsDue",
        header: "Actions Due",
        sortable: true,
        sortAccessor: (row) => row.actionsDue ?? "",
        render: (row) => <NumericCell align="left">{toDateInput(row.actionsDue)}</NumericCell>,
      },
      {
        key: "status",
        header: "Status",
        width: 140,
        sortable: true,
        sortAccessor: (row) => inspectionStatus(row),
        render: (row) => {
          const status = inspectionStatus(row);
          return (
            <Badge
              variant={
                status === "OVERDUE" ? "destructive" : status === "COMPLETED" ? "secondary" : "outline"
              }
            >
              {status}
            </Badge>
          );
        },
      },
    ],
    [createdId],
  );

  return (
    <MasterDataPage<InspectionRecord>
      area="compliance"
      title="Compliance Inspections"
      description="Manage inspections, due actions, and completion by responsible staff."
      createLabel="New Inspection"
      onCreate={openCreate}
      columns={columns}
      data={inspections}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      error={pageError}
      emptyLabel="No inspections found."
      banner={banner}
      search={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Inspector, organization, findings"
          aria-label="Search inspections"
          className="h-9 w-full sm:w-64"
        />
      }
      filters={
        <>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="h-9 w-[180px]">
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
          <Select value={overdueFilter} onValueChange={setOverdueFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All inspections</SelectItem>
              <SelectItem value="overdue">Overdue only</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
      renderDetail={(row, close) => {
        const status = inspectionStatus(row);
        return (
          <div className="space-y-4">
            <div className="space-y-3">
              <DetailFact label="Inspection Date">{toDateInput(row.inspectionDate)}</DetailFact>
              <DetailFact label="Site">{row.site.name}</DetailFact>
              <DetailFact label="Inspector">{row.inspectorName}</DetailFact>
              <DetailFact label="Inspector Org">{row.inspectorOrg}</DetailFact>
              <DetailFact label="Findings">{row.findings}</DetailFact>
              {row.actions ? <DetailFact label="Actions">{row.actions}</DetailFact> : null}
              {row.actionsDue ? (
                <DetailFact label="Actions Due">{toDateInput(row.actionsDue)}</DetailFact>
              ) : null}
              {row.completedAt ? (
                <DetailFact label="Completed At">{toDateInput(row.completedAt)}</DetailFact>
              ) : null}
              {row.documentUrl ? (
                <DetailFact label="Document">
                  <a
                    href={row.documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Open document
                  </a>
                </DetailFact>
              ) : null}
              <DetailFact label="Status">
                <Badge
                  variant={
                    status === "OVERDUE"
                      ? "destructive"
                      : status === "COMPLETED"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {status}
                </Badge>
              </DetailFact>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (!window.confirm("Delete this inspection?")) return;
                  deleteMutation.mutate(row.id, { onSuccess: close });
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        );
      }}
    >
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
    </MasterDataPage>
  );
}
