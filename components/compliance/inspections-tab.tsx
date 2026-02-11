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
import { fetchInspections, fetchSites, fetchUsers, type InspectionRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  const [search, setSearch] = useState("");
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
    queryKey: ["compliance", "inspections", siteFilter, overdueFilter, search],
    queryFn: () =>
      fetchInspections({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        overdue: overdueFilter === "overdue" ? true : undefined,
        search: search || undefined,
        limit: 500,
      }),
  });

  const inspections = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "inspections");
    params.set("createdId", id);
    params.set("source", "inspection");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance?${params.toString()}`);
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Inspections</CardTitle>
              <CardDescription>Track findings and closure actions</CardDescription>
            </div>
            <Button onClick={openCreate}>New Inspection</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pageError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load inspections</AlertTitle>
              <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
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
              <label className="mb-2 block text-sm font-semibold">Scope</label>
              <Select value={overdueFilter} onValueChange={setOverdueFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All inspections</SelectItem>
                  <SelectItem value="overdue">Overdue only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Search</label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Inspector, organization, findings"
              />
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : inspections.length === 0 ? (
            <div className="text-sm text-muted-foreground">No inspections found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Inspector</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Actions Due</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((inspection) => {
                    const overdue =
                      Boolean(inspection.actionsDue) &&
                      !inspection.completedAt &&
                      toDateInput(inspection.actionsDue) < TODAY_ISO;
                    return (
                      <TableRow
                        key={inspection.id}
                        className={`border-b ${createdId === inspection.id ? "bg-[var(--status-success-bg)]" : ""}`}
                      >
                        <TableCell className="p-3">{toDateInput(inspection.inspectionDate)}</TableCell>
                        <TableCell className="p-3">{inspection.site.name}</TableCell>
                        <TableCell className="p-3">
                          <div className="font-semibold">{inspection.inspectorName}</div>
                          <div className="text-xs text-muted-foreground">{inspection.inspectorOrg}</div>
                        </TableCell>
                        <TableCell className="p-3">{toDateInput(inspection.actionsDue)}</TableCell>
                        <TableCell className="p-3">
                          <Badge variant={overdue ? "destructive" : inspection.completedAt ? "secondary" : "outline"}>
                            {overdue ? "OVERDUE" : inspection.completedAt ? "COMPLETED" : "OPEN"}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setForm({
                                  id: inspection.id,
                                  siteId: inspection.siteId,
                                  inspectionDate: toDateInput(inspection.inspectionDate),
                                  inspectorName: inspection.inspectorName,
                                  inspectorOrg: inspection.inspectorOrg,
                                  findings: inspection.findings,
                                  actions: inspection.actions ?? "",
                                  actionsDue: toDateInput(inspection.actionsDue),
                                  completedById: inspection.completedById ?? "",
                                  completedAt: toDateInput(inspection.completedAt),
                                  documentUrl: inspection.documentUrl ?? "",
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
                                deleteMutation.mutate(inspection.id);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-full sm:max-w-lg">
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


