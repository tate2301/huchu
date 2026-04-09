"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MasterDataShell } from "@/components/management/master-data/master-data-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type SellerRecord = {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  _count: {
    purchases: number;
  };
};

type SellerForm = {
  fullName: string;
  phone: string;
  nationalId: string;
  address: string;
  notes: string;
  isActive: "true" | "false";
};

const emptyForm: SellerForm = {
  fullName: "",
  phone: "",
  nationalId: "",
  address: "",
  notes: "",
  isActive: "true",
};

async function fetchSellers(search?: string) {
  const query = new URLSearchParams();
  query.set("limit", "500");
  if (search) query.set("search", search);
  return fetchJson<{ data: SellerRecord[] }>(`/api/scrap-metal/sellers?${query.toString()}`);
}

export default function ScrapSellersMasterDataPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SellerRecord | null>(null);
  const [editing, setEditing] = useState<SellerRecord | null>(null);
  const [form, setForm] = useState<SellerForm>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "scrap-sellers", queryState.search],
    queryFn: () => fetchSellers(queryState.search),
  });

  const sellers = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (payload: SellerForm) => {
      const body = {
        fullName: payload.fullName,
        phone: payload.phone,
        nationalId: payload.nationalId,
        address: payload.address || undefined,
        notes: payload.notes || undefined,
        isActive: payload.isActive === "true",
      };

      if (editing) {
        return fetchJson(`/api/scrap-metal/sellers/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/scrap-metal/sellers", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Supplier updated" : "Supplier created", variant: "success" });
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "scrap-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-seller-profiles"] });
    },
    onError: (mutationError) => {
      toast({
        title: "Unable to save supplier",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => fetchJson(`/api/scrap-metal/sellers/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast({
        title: "Supplier updated",
        description:
          typeof result === "object" && result && "archived" in result
            ? "Supplier had purchase history, so the profile was archived instead of deleted."
            : "Supplier removed.",
        variant: "success",
      });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "scrap-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-seller-profiles"] });
    },
    onError: (mutationError) => {
      toast({
        title: "Unable to remove supplier",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<SellerRecord>[]>(
    () => [
      {
        id: "seller",
        header: "Supplier (Seller)",
        accessorFn: (row) => `${row.fullName} ${row.phone} ${row.nationalId}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.fullName}</div>
            <div className="text-xs text-muted-foreground">{row.original.phone}</div>
          </div>
        ),
      },
      {
        id: "nationalId",
        header: "National ID / Passport",
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.nationalId}</span>,
        size: 160,
      },
      {
        id: "address",
        header: "Address",
        accessorFn: (row) => row.address ?? "",
      },
      {
        id: "purchases",
        header: "Purchases",
        cell: ({ row }) => <span className="font-mono text-sm">{row.original._count.purchases}</span>,
        size: 90,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 100,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                setForm({
                  fullName: row.original.fullName,
                  phone: row.original.phone,
                  nationalId: row.original.nationalId,
                  address: row.original.address ?? "",
                  notes: row.original.notes ?? "",
                  isActive: row.original.isActive ? "true" : "false",
                });
                setFormOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="destructive"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        size: 96,
      },
    ],
    [],
  );

  return (
    <MasterDataShell
      activeTab="scrap-sellers"
      title="Scrap Suppliers"
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New Supplier
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load suppliers</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={sellers}
        columns={columns}
        queryState={queryState}
        onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search supplier, phone, ID/passport, or address"
        tableClassName="text-sm"
        emptyState={isLoading ? "Loading suppliers..." : "No suppliers created yet"}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle>
            <DialogDescription>Capture the identity details required for supplier intake.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} placeholder="Full name" required />
              <Input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Phone" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input value={form.nationalId} onChange={(event) => setForm((prev) => ({ ...prev, nationalId: event.target.value }))} placeholder="National ID / Passport" required />
              <Select value={form.isActive} onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value as "true" | "false" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} placeholder="Address or locality" />
            <Textarea rows={4} value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove Supplier</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Remove ${deleteTarget.fullName}? Suppliers with purchase history will be archived instead.`
                : "Remove this supplier?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending || !deleteTarget} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MasterDataShell>
  );
}
