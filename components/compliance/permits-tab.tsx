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
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PermitForm>(emptyForm);

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "permits", siteFilter, statusFilter, queryState.search],
    queryFn: () =>
      fetchPermits({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: queryState.search || undefined,
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

  const columns = useMemo<ColumnDef<PermitRecord>[]>(
    () => [
      {
        id: "permit",
        header: "Permit",
        accessorFn: (row) => `${row.permitType} ${row.permitNumber}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.permitType}</div>
            <div className="text-xs text-muted-foreground">{row.original.permitNumber}</div>
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
        id: "issueDate",
        header: "Issue",
        accessorFn: (row) => row.issueDate,
        cell: ({ row }) => <NumericCell align="left">{toDateInput(row.original.issueDate)}</NumericCell>,
      },
      {
        id: "expiryDate",
        header: "Expiry",
        accessorFn: (row) => row.expiryDate,
        cell: ({ row }) => <NumericCell align="left">{toDateInput(row.original.expiryDate)}</NumericCell>,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <Badge variant={badgeVariant(row.original.status)}>{row.original.status}</Badge>
        ),
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
                  permitType: row.original.permitType,
                  permitNumber: row.original.permitNumber,
                  siteId: row.original.siteId,
                  issueDate: toDateInput(row.original.issueDate),
                  expiryDate: toDateInput(row.original.expiryDate),
                  responsiblePerson: row.original.responsiblePerson,
                  documentUrl: row.original.documentUrl ?? "",
                  status: row.original.status,
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
            <h2 className="text-section-title text-foreground font-bold tracking-tight">Permits</h2>
            <p className="text-sm text-muted-foreground">Track permit numbers and expiry deadlines</p>
          </div>
          <Button onClick={openCreate}>New Permit</Button>
        </header>
          {pageError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load permits</AlertTitle>
              <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
            </Alert>
          ) : null}

          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : permits.length === 0 ? (
            <div className="text-sm text-muted-foreground">No permits found.</div>
          ) : (
            <DataTable
              data={permits}
              columns={columns}
              queryState={queryState}
              onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
              searchPlaceholder="Type, number, responsible person"
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
                    value={statusFilter}
                    onValueChange={(value) => {
                      setStatusFilter(value);
                      setQueryState((prev) => ({ ...prev, page: 1 }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[170px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                      <SelectItem value="EXPIRING_SOON">EXPIRING_SOON</SelectItem>
                      <SelectItem value="EXPIRED">EXPIRED</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              }
            />
          )}
      </section>

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


