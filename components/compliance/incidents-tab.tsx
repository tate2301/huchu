"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchIncidents, fetchSites, type IncidentRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

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

export function IncidentsTab({ createdId }: { createdId: string | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<IncidentForm>(emptyForm);

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "incidents", siteFilter, statusFilter, severityFilter, search],
    queryFn: () =>
      fetchIncidents({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        severity: severityFilter === "all" ? undefined : severityFilter,
        search: search || undefined,
        limit: 500,
      }),
  });

  const incidents = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;

  const pushSaved = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "incidents");
    params.set("createdId", id);
    params.set("source", "incident");
    router.push(`/compliance?${params.toString()}`);
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
      pushSaved(incident.id);
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Incidents</CardTitle>
              <CardDescription>Track incident severity, status, and responses</CardDescription>
            </div>
            <Button onClick={openCreate}>New Incident</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pageError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load incidents</AlertTitle>
              <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Site</label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                  <SelectTrigger>
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
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="OPEN">OPEN</SelectItem>
                  <SelectItem value="INVESTIGATING">INVESTIGATING</SelectItem>
                  <SelectItem value="CLOSED">CLOSED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Severity</label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
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
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Search</label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Description, actions, reporter"
              />
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : incidents.length === 0 ? (
            <div className="text-sm text-muted-foreground">No incidents found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Date</th>
                    <th className="p-3 text-left font-semibold">Site</th>
                    <th className="p-3 text-left font-semibold">Type</th>
                    <th className="p-3 text-left font-semibold">Severity</th>
                    <th className="p-3 text-left font-semibold">Status</th>
                    <th className="p-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((incident) => (
                    <tr key={incident.id} className={`border-b ${createdId === incident.id ? "bg-emerald-50" : ""}`}>
                      <td className="p-3">{toDateInput(incident.incidentDate)}</td>
                      <td className="p-3">{incident.site.name}</td>
                      <td className="p-3">{incident.incidentType}</td>
                      <td className="p-3">
                        <Badge variant={badgeVariant(incident.severity)}>{incident.severity}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={badgeVariant(incident.status)}>{incident.status}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              let photoUrls = "";
                              if (incident.photoUrls) {
                                try {
                                  const parsed = JSON.parse(incident.photoUrls) as string[];
                                  photoUrls = Array.isArray(parsed) ? parsed.join(", ") : "";
                                } catch {
                                  photoUrls = "";
                                }
                              }
                              setForm({
                                id: incident.id,
                                siteId: incident.siteId,
                                incidentDate: toDateInput(incident.incidentDate),
                                incidentType: incident.incidentType,
                                severity: incident.severity,
                                description: incident.description,
                                actionsTaken: incident.actionsTaken ?? "",
                                reportedBy: incident.reportedBy,
                                photoUrls,
                                status: incident.status,
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
                              if (!window.confirm("Delete this incident?")) return;
                              deleteMutation.mutate(incident.id);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-full sm:max-w-lg">
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
    </>
  );
}
