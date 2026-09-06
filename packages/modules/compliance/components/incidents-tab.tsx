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
import { fetchIncidents, type IncidentRecord } from "../api-client";
import { fetchSites } from "@corelithzw/platform/client/sites";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

type IncidentForm = {
  id?: string;
  siteId: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  description: string;
  actionsTaken: string;
  reportedBy: string;
  photoUrls: string;
  status: string;
};

const emptyForm: IncidentForm = {
  siteId: "",
  incidentDate: "",
  incidentType: "",
  severity: "MEDIUM",
  description: "",
  actionsTaken: "",
  reportedBy: "",
  photoUrls: "",
  status: "OPEN",
};

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");

const badgeVariant = (value: string): "default" | "secondary" | "destructive" | "outline" => {
  const v = value.toUpperCase();
  if (v === "LOW" || v === "CLOSED") return "secondary";
  if (v === "HIGH" || v === "CRITICAL" || v === "OPEN") return "destructive";
  return "outline";
};

const parsePhotoUrls = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function IncidentsTab({ createdId, banner }: { createdId: string | null; banner?: ReactNode }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side filter; deferring keeps one request per pause, not keystroke.
  const deferredSearch = useDeferredValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<IncidentForm>(emptyForm);

  const { data: sites, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "incidents", siteFilter, statusFilter, severityFilter, deferredSearch],
    queryFn: () =>
      fetchIncidents({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        severity: severityFilter === "all" ? undefined : severityFilter,
        search: deferredSearch || undefined,
        limit: 500,
      }),
  });

  const incidents = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createdId", id);
    params.set("source", "incident");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance/incidents?${params.toString()}`);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: IncidentForm) => {
      const method = payload.id ? "PATCH" : "POST";
      const url = payload.id ? `/api/compliance/incidents/${payload.id}` : "/api/compliance/incidents";
      const photoUrls = payload.photoUrls
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return fetchJson<IncidentRecord>(url, {
        method,
        body: JSON.stringify({
          siteId: payload.siteId,
          incidentDate: payload.incidentDate,
          incidentType: payload.incidentType,
          severity: payload.severity,
          description: payload.description,
          actionsTaken: payload.actionsTaken || undefined,
          reportedBy: payload.reportedBy,
          photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
          status: payload.status,
        }),
      });
    },
    onSuccess: (incident) => {
      toast({
        title: form.id ? "Incident updated" : "Incident created",
        description: "Incident record saved successfully.",
        variant: "success",
      });
      setDialogOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["compliance", "incidents"] });
      pushSaved(incident.id, incident.createdAt);
    },
    onError: (saveError) => {
      toast({
        title: "Unable to save incident",
        description: getApiErrorMessage(saveError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compliance/incidents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Incident deleted",
        description: "Incident was removed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["compliance", "incidents"] });
    },
    onError: (deleteError) => {
      toast({
        title: "Unable to delete incident",
        description: getApiErrorMessage(deleteError),
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setForm({
      ...emptyForm,
      siteId: siteFilter !== "all" ? siteFilter : sites?.[0]?.id ?? "",
      incidentDate: new Date().toISOString().slice(0, 10),
    });
    setDialogOpen(true);
  };

  const openEdit = (row: IncidentRecord) => {
    setForm({
      id: row.id,
      siteId: row.siteId,
      incidentDate: toDateInput(row.incidentDate),
      incidentType: row.incidentType,
      severity: row.severity,
      description: row.description,
      actionsTaken: row.actionsTaken ?? "",
      reportedBy: row.reportedBy,
      photoUrls: parsePhotoUrls(row.photoUrls).join(", "),
      status: row.status,
    });
    setDialogOpen(true);
  };

  // No actions column: a row is picked, and what can be done to it lives in
  // the detail pane.
  const columns = useMemo<DataTableColumn<IncidentRecord>[]>(
    () => [
      {
        key: "date",
        header: "Date",
        sortable: true,
        sortAccessor: (row) => row.incidentDate,
        render: (row) => (
          <div>
            <NumericCell align="left">{toDateInput(row.incidentDate)}</NumericCell>
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
        key: "type",
        header: "Type",
        sortable: true,
        sortAccessor: (row) => row.incidentType,
        render: (row) => row.incidentType,
      },
      {
        key: "severity",
        header: "Severity",
        width: 130,
        sortable: true,
        sortAccessor: (row) => row.severity,
        render: (row) => <Badge variant={badgeVariant(row.severity)}>{row.severity}</Badge>,
      },
      {
        key: "status",
        header: "Status",
        width: 150,
        sortable: true,
        sortAccessor: (row) => row.status,
        render: (row) => <Badge variant={badgeVariant(row.status)}>{row.status}</Badge>,
      },
    ],
    [createdId],
  );

  return (
    <MasterDataPage<IncidentRecord>
      area="compliance"
      title="Compliance Incidents"
      description="Log incidents, severity trends, and mitigation updates."
      createLabel="New Incident"
      onCreate={openCreate}
      columns={columns}
      data={incidents}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      error={pageError}
      emptyLabel="No incidents found."
      banner={banner}
      search={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Description, actions, reporter"
          aria-label="Search incidents"
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="OPEN">OPEN</SelectItem>
              <SelectItem value="INVESTIGATING">INVESTIGATING</SelectItem>
              <SelectItem value="CLOSED">CLOSED</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="All severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severity</SelectItem>
              <SelectItem value="LOW">LOW</SelectItem>
              <SelectItem value="MEDIUM">MEDIUM</SelectItem>
              <SelectItem value="HIGH">HIGH</SelectItem>
              <SelectItem value="CRITICAL">CRITICAL</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
      renderDetail={(row, close) => {
        const photos = parsePhotoUrls(row.photoUrls);
        return (
          <div className="space-y-4">
            <div className="space-y-3">
              <DetailFact label="Incident Date">{toDateInput(row.incidentDate)}</DetailFact>
              <DetailFact label="Site">{row.site.name}</DetailFact>
              <DetailFact label="Type">{row.incidentType}</DetailFact>
              <DetailFact label="Severity">
                <Badge variant={badgeVariant(row.severity)}>{row.severity}</Badge>
              </DetailFact>
              <DetailFact label="Description">{row.description}</DetailFact>
              {row.actionsTaken ? (
                <DetailFact label="Actions Taken">{row.actionsTaken}</DetailFact>
              ) : null}
              <DetailFact label="Reported By">{row.reportedBy}</DetailFact>
              {photos.length > 0 ? (
                <DetailFact label="Photos">
                  <div className="flex flex-col gap-1">
                    {photos.map((url, index) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        Photo {index + 1}
                      </a>
                    ))}
                  </div>
                </DetailFact>
              ) : null}
              <DetailFact label="Status">
                <Badge variant={badgeVariant(row.status)}>{row.status}</Badge>
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
                  if (!window.confirm("Delete this incident?")) return;
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
            <DialogTitle>{form.id ? "Edit Incident" : "New Incident"}</DialogTitle>
            <DialogDescription>Capture incident context and corrective actions.</DialogDescription>
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
                <label className="mb-2 block text-sm font-semibold">Incident Date *</label>
                <Input
                  type="date"
                  value={form.incidentDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, incidentDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Reported By *</label>
                <Input
                  value={form.reportedBy}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, reportedBy: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Type *</label>
                <Input
                  value={form.incidentType}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, incidentType: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Severity *</label>
                <Select
                  value={form.severity}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, severity: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                    <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Description *</label>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Actions Taken</label>
              <Textarea
                value={form.actionsTaken}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, actionsTaken: event.target.value }))
                }
                rows={2}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Photo URLs (comma separated)</label>
              <Input
                value={form.photoUrls}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, photoUrls: event.target.value }))
                }
                placeholder="https://..., https://..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Status</label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">OPEN</SelectItem>
                  <SelectItem value="INVESTIGATING">INVESTIGATING</SelectItem>
                  <SelectItem value="CLOSED">CLOSED</SelectItem>
                </SelectContent>
              </Select>
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
