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
import { useToast } from "@/components/ui/use-toast";
import { fetchPermits, fetchSites, type PermitRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type PermitForm = {
  id?: string;
  permitType: string;
  permitNumber: string;
  siteId: string;
  issueDate: string;
  expiryDate: string;
  responsiblePerson: string;
  documentUrl: string;
  status: string;
};

const emptyForm: PermitForm = {
  permitType: "",
  permitNumber: "",
  siteId: "",
  issueDate: "",
  expiryDate: "",
  responsiblePerson: "",
  documentUrl: "",
  status: "ACTIVE",
};

const badgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "ACTIVE") return "secondary";
  if (status === "EXPIRED") return "destructive";
  return "outline";
};

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");

export function PermitsTab({ createdId }: { createdId: string | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PermitForm>(emptyForm);

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "permits", siteFilter, statusFilter, search],
    queryFn: () =>
      fetchPermits({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search || undefined,
        limit: 500,
      }),
  });

  const permits = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "permits");
    params.set("createdId", id);
    params.set("source", "permit");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance?${params.toString()}`);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: PermitForm) => {
      const method = payload.id ? "PATCH" : "POST";
      const url = payload.id ? `/api/compliance/permits/${payload.id}` : "/api/compliance/permits";
      return fetchJson<PermitRecord>(url, {
        method,
        body: JSON.stringify({
          permitType: payload.permitType,
          permitNumber: payload.permitNumber,
          siteId: payload.siteId,
          issueDate: payload.issueDate,
          expiryDate: payload.expiryDate,
          responsiblePerson: payload.responsiblePerson,
          documentUrl: payload.documentUrl || undefined,
          status: payload.status,
        }),
      });
    },
    onSuccess: (permit) => {
      toast({
        title: form.id ? "Permit updated" : "Permit created",
        description: "Permit record saved successfully.",
        variant: "success",
      });
      setDialogOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["compliance", "permits"] });
      pushSaved(permit.id, permit.createdAt);
    },
    onError: (saveError) => {
      toast({
        title: "Unable to save permit",
        description: getApiErrorMessage(saveError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compliance/permits/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Permit deleted",
        description: "Permit was removed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["compliance", "permits"] });
    },
    onError: (deleteError) => {
      toast({
        title: "Unable to delete permit",
        description: getApiErrorMessage(deleteError),
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setForm({
      ...emptyForm,
      siteId: siteFilter !== "all" ? siteFilter : sites?.[0]?.id ?? "",
      issueDate: new Date().toISOString().slice(0, 10),
    });
    setDialogOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Permits</CardTitle>
              <CardDescription>Track permit numbers and expiry deadlines</CardDescription>
            </div>
            <Button onClick={openCreate}>New Permit</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pageError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load permits</AlertTitle>
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
              <label className="mb-2 block text-sm font-semibold">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="EXPIRING_SOON">EXPIRING_SOON</SelectItem>
                  <SelectItem value="EXPIRED">EXPIRED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Search</label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Type, number, responsible person"
              />
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : permits.length === 0 ? (
            <div className="text-sm text-muted-foreground">No permits found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Permit</th>
                    <th className="p-3 text-left font-semibold">Site</th>
                    <th className="p-3 text-left font-semibold">Issue</th>
                    <th className="p-3 text-left font-semibold">Expiry</th>
                    <th className="p-3 text-left font-semibold">Status</th>
                    <th className="p-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map((permit) => (
                    <tr
                      key={permit.id}
                      className={`border-b ${createdId === permit.id ? "bg-[var(--status-success-bg)]" : ""}`}
                    >
                      <td className="p-3">
                        <div className="font-semibold">{permit.permitType}</div>
                        <div className="text-xs text-muted-foreground">{permit.permitNumber}</div>
                      </td>
                      <td className="p-3">{permit.site.name}</td>
                      <td className="p-3">{toDateInput(permit.issueDate)}</td>
                      <td className="p-3">{toDateInput(permit.expiryDate)}</td>
                      <td className="p-3">
                        <Badge variant={badgeVariant(permit.status)}>{permit.status}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setForm({
                                id: permit.id,
                                permitType: permit.permitType,
                                permitNumber: permit.permitNumber,
                                siteId: permit.siteId,
                                issueDate: toDateInput(permit.issueDate),
                                expiryDate: toDateInput(permit.expiryDate),
                                responsiblePerson: permit.responsiblePerson,
                                documentUrl: permit.documentUrl ?? "",
                                status: permit.status,
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
                              if (!window.confirm("Delete this permit?")) return;
                              deleteMutation.mutate(permit.id);
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
            <DialogTitle>{form.id ? "Edit Permit" : "New Permit"}</DialogTitle>
            <DialogDescription>Capture permit details and expiry dates.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Permit Type *</label>
                <Input
                  value={form.permitType}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, permitType: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Permit Number *</label>
                <Input
                  value={form.permitNumber}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, permitNumber: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
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
                <label className="mb-2 block text-sm font-semibold">Issue Date *</label>
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, issueDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Expiry Date *</label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, expiryDate: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Responsible Person *</label>
              <Input
                value={form.responsiblePerson}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, responsiblePerson: event.target.value }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                    <SelectItem value="EXPIRING_SOON">EXPIRING_SOON</SelectItem>
                    <SelectItem value="EXPIRED">EXPIRED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
