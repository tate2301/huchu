"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { FieldHelp } from "@/components/shared/field-help";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
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
import { BarChart3, Pencil, Plus, Trash2, Wallet } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type Promotion = {
  id: string;
  promoCode: string;
  name: string;
  type: string;
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  notes: string | null;
};

type PromotionForm = {
  name: string;
  type: string;
  value: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string;
};

function emptyForm(): PromotionForm {
  return {
    name: "",
    type: "PERCENT",
    value: "",
    startsAt: "",
    endsAt: "",
    status: "ACTIVE",
    notes: "",
  };
}

export default function RetailPromotionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [form, setForm] = useState<PromotionForm>(emptyForm);

  const promotionsQuery = useQuery({
    queryKey: ["retail-promotions"],
    queryFn: () => fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions"),
  });

  const {
    reservedId: promoCode,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "RETAIL_PROMOTION",
    enabled: dialogOpen && !editing,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: PromotionForm) => {
      const body = {
        promoCode: editing ? undefined : promoCode || undefined,
        name: payload.name,
        type: payload.type,
        value: Number(payload.value),
        startsAt: payload.startsAt ? new Date(payload.startsAt).toISOString() : undefined,
        endsAt: payload.endsAt ? new Date(payload.endsAt).toISOString() : undefined,
        status: payload.status,
        notes: payload.notes.trim() || undefined,
      };

      if (editing) {
        return fetchJson(`/api/v2/retail/promotions/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/v2/retail/promotions", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Promotion updated" : "Promotion created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm());
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update promotion" : "Unable to create promotion",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/retail/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Promotion removed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-promotions"] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Unable to remove promotion",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<Promotion>[]>(
    () => [
      {
        id: "promoCode",
        header: "Promo",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.promoCode}</div>
          </div>
        ),
      },
      { id: "type", header: "Type", cell: ({ row }) => row.original.type },
      { id: "value", header: "Value", cell: ({ row }) => <NumericCell>{row.original.value.toFixed(2)}</NumericCell> },
      {
        id: "window",
        header: "Window",
        cell: ({ row }) => (
          <div className="text-xs">
            <div>{row.original.startsAt ? new Date(row.original.startsAt).toLocaleDateString() : "Always on"}</div>
            <div className="text-[var(--text-muted)]">{row.original.endsAt ? new Date(row.original.endsAt).toLocaleDateString() : "No end"}</div>
          </div>
        ),
      },
      { id: "status", header: "Status", cell: ({ row }) => row.original.status },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                setForm({
                  name: row.original.name,
                  type: row.original.type,
                  value: String(row.original.value),
                  startsAt: row.original.startsAt ? row.original.startsAt.slice(0, 16) : "",
                  endsAt: row.original.endsAt ? row.original.endsAt.slice(0, 16) : "",
                  status: row.original.status,
                  notes: row.original.notes ?? "",
                });
                setDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteTarget(row.original)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <RetailShell
      title="Promotions"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm(emptyForm());
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New promotion
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/merchandising/pricing">
              <Wallet className="h-4 w-4" />
              Pricing
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/reports">
              <BarChart3 className="h-4 w-4" />
              Reports
            </Link>
          </Button>
        </div>
      }
    >
      <DataTable
        data={promotionsQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search promotions"
        emptyState={promotionsQuery.isLoading ? "Loading promotions..." : "No promotions yet"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Active and upcoming campaigns</span>}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit promotion" : "New promotion"}</DialogTitle>
            <DialogDescription>Keep promotions short, clear, and immediately actionable.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Promo code</label>
                <Input value={editing ? editing.promoCode : promoCode} readOnly disabled={isReserving && !editing} />
                <FieldHelp error={reserveError ?? undefined} hint={reserveError ? undefined : "Generated automatically."} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Name</label>
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Type</label>
                <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Percent</SelectItem>
                    <SelectItem value="AMOUNT">Amount</SelectItem>
                    <SelectItem value="BUY_X_GET_Y">Buy X Get Y</SelectItem>
                    <SelectItem value="BUNDLE">Bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Value</label>
                <Input value={form.value} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Starts</label>
                <Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Ends</label>
                <Input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Status</label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || !form.name}>Save promotion</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove promotion</DialogTitle>
            <DialogDescription>{deleteTarget?.name}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
