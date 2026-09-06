"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import type { DataTableColumn } from "@corelithzw/react";
import {
  DetailFact,
  MasterDataPage,
} from "@/components/management/master-data/master-data-page";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@corelithzw/ui/components/dialog";
import { Input } from "@corelithzw/ui/components/input";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@corelithzw/ui/components/select";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchPermits, fetchSites, type PermitRecord } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

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

export function PermitsTab({ createdId, banner }: { createdId: string | null; banner?: ReactNode }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side filter; deferring keeps one request per pause, not keystroke.
  const deferredSearch = useDeferredValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PermitForm>(emptyForm);

  const { data: sites, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "permits", siteFilter, statusFilter, deferredSearch],
    queryFn: () =>
      fetchPermits({
        siteId: siteFilter === "all" ? undefined : siteFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: deferredSearch || undefined,
        limit: 500,
      }),
  });

  const permits = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createdId", id);
    params.set("source", "permit");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance/permits?${params.toString()}`);
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

  const openEdit = (row: PermitRecord) => {
    setForm({
      id: row.id,
      permitType: row.permitType,
      permitNumber: row.permitNumber,
      siteId: row.siteId,
      issueDate: toDateInput(row.issueDate),
      expiryDate: toDateInput(row.expiryDate),
      responsiblePerson: row.responsiblePerson,
      documentUrl: row.documentUrl ?? "",
      status: row.status,
    });
    setDialogOpen(true);
  };

  // No actions column: a row is picked, and what can be done to it lives in
  // the detail pane.
  const columns = useMemo<DataTableColumn<PermitRecord>[]>(
    () => [
      {
        key: "permit",
        header: "Permit",
        sortable: true,
        sortAccessor: (row) => `${row.permitType} ${row.permitNumber}`,
        render: (row) => (
          <div>
            <div className="font-semibold">{row.permitType}</div>
            <div className="text-sm text-[var(--text-muted)]">{row.permitNumber}</div>
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
        key: "issueDate",
        header: "Issue",
        sortable: true,
        sortAccessor: (row) => row.issueDate,
        render: (row) => <NumericCell align="left">{toDateInput(row.issueDate)}</NumericCell>,
      },
      {
        key: "expiryDate",
        header: "Expiry",
        sortable: true,
        sortAccessor: (row) => row.expiryDate,
        render: (row) => <NumericCell align="left">{toDateInput(row.expiryDate)}</NumericCell>,
      },
      {
        key: "status",
        header: "Status",
        width: 140,
        render: (row) => <Badge variant={badgeVariant(row.status)}>{row.status}</Badge>,
      },
    ],
    [createdId],
  );

  return (
    <MasterDataPage<PermitRecord>
      area="compliance"
      title="Compliance Permits"
      description="Track permit status, expiry windows, and ownership by site."
      createLabel="New Permit"
      onCreate={openCreate}
      columns={columns}
      data={permits}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      error={pageError}
      emptyLabel="No permits found."
      banner={banner}
      search={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Type, number, responsible person"
          aria-label="Search permits"
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
            <SelectTrigger className="h-9 w-[170px]">
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
      renderDetail={(row, close) => (
        <div className="space-y-4">
          <div className="space-y-3">
            <DetailFact label="Permit Type">{row.permitType}</DetailFact>
            <DetailFact label="Permit Number">
              <span className="font-mono">{row.permitNumber}</span>
            </DetailFact>
            <DetailFact label="Site">{row.site.name}</DetailFact>
            <DetailFact label="Issue Date">{toDateInput(row.issueDate)}</DetailFact>
            <DetailFact label="Expiry Date">{toDateInput(row.expiryDate)}</DetailFact>
            <DetailFact label="Responsible Person">{row.responsiblePerson}</DetailFact>
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
                if (!window.confirm("Delete this permit?")) return;
                deleteMutation.mutate(row.id, { onSuccess: close });
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md" className="w-full">
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
    </MasterDataPage>
  );
}
