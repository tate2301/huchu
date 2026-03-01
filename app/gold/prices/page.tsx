"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  createGoldPrice,
  fetchGoldPrices,
  updateGoldPrice,
  type GoldPriceRecord,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

type PriceFormState = {
  effectiveDate: string;
  priceUsdPerGram: string;
  note: string;
};

const emptyForm: PriceFormState = {
  effectiveDate: new Date().toISOString().slice(0, 10),
  priceUsdPerGram: "",
  note: "",
};

export default function GoldPricesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<GoldPriceRecord | null>(null);
  const [form, setForm] = useState<PriceFormState>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-prices"],
    queryFn: () => fetchGoldPrices({ limit: 300 }),
  });

  const rows = useMemo(
    () =>
      (data?.data ?? [])
        .slice()
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)),
    [data],
  );

  const createMutation = useMutation({
    mutationFn: (payload: PriceFormState) =>
      createGoldPrice({
        effectiveDate: payload.effectiveDate,
        priceUsdPerGram: Number(payload.priceUsdPerGram),
        note: payload.note.trim() || undefined,
      }),
    onSuccess: () => {
      toast({
        title: "Gold price added",
        description:
          "New effective price is now available for snapshot valuation.",
        variant: "success",
      });
      setCreateOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["gold-prices"] });
    },
    onError: (mutationError) => {
      toast({
        title: "Unable to add gold price",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; formState: PriceFormState }) =>
      updateGoldPrice(payload.id, {
        effectiveDate: payload.formState.effectiveDate,
        priceUsdPerGram: Number(payload.formState.priceUsdPerGram),
        note: payload.formState.note.trim() || null,
      }),
    onSuccess: () => {
      toast({
        title: "Gold price updated",
        description:
          "Future valuation snapshots will use the updated effective rate.",
        variant: "success",
      });
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["gold-prices"] });
    },
    onError: (mutationError) => {
      toast({
        title: "Unable to update gold price",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<GoldPriceRecord>[]>(
    () => [
      {
        id: "effectiveDate",
        header: "Effective Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.effectiveDate).toLocaleDateString()}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "priceUsdPerGram",
        header: "USD / g",
        cell: ({ row }) => (
          <NumericCell>${row.original.priceUsdPerGram.toFixed(4)}</NumericCell>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "note",
        header: "Note",
        cell: ({ row }) => row.original.note ?? "-",
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "updatedAt",
        header: "Updated",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.updatedAt).toLocaleString()}
          </NumericCell>
        ),
        size: 180,
        minSize: 180,
        maxSize: 180,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                setForm({
                  effectiveDate: row.original.effectiveDate.slice(0, 10),
                  priceUsdPerGram: String(row.original.priceUsdPerGram),
                  note: row.original.note ?? "",
                });
              }}
            >
              Edit
            </Button>
          </div>
        ),
        size: 108,
        minSize: 108,
        maxSize: 108,
      },
    ],
    [],
  );

  const canSubmit = Number(form.priceUsdPerGram) > 0 && !!form.effectiveDate;

  const formBody = (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        if (editing) {
          updateMutation.mutate({ id: editing.id, formState: form });
          return;
        }
        createMutation.mutate(form);
      }}
    >
      <div>
        <label className="mb-2 block text-sm font-semibold">
          Effective Date
        </label>
        <Input
          type="date"
          value={form.effectiveDate}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, effectiveDate: event.target.value }))
          }
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold">
          Price (USD per gram)
        </label>
        <Input
          type="number"
          min="0"
          step="0.0001"
          value={form.priceUsdPerGram}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              priceUsdPerGram: event.target.value,
            }))
          }
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold">Note</label>
        <Textarea
          rows={3}
          value={form.note}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, note: event.target.value }))
          }
          placeholder="Optional context for this rate."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCreateOpen(false);
            setEditing(null);
            setForm(emptyForm);
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            !canSubmit || createMutation.isPending || updateMutation.isPending
          }
        >
          {editing ? "Save Changes" : "Add Price"}
        </Button>
      </div>
    </form>
  );

  return (
    <GoldShell
      activeTab="prices"
      title="Pricing"
      description="Daily gold valuation rates used for historical snapshot calculations."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setCreateOpen(true);
          }}
        >
          Add Price
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load gold prices</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <p className="text-section-title font-bold tracking-tight">
          Gold Price Board
        </p>
      </div>
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search by date or note"
        searchSubmitLabel="Search"
        tableClassName="text-sm"
        pagination={{ enabled: true }}
        emptyState={
          isLoading ? "Loading gold prices..." : "No gold prices configured."
        }
      />

      <Dialog
        open={createOpen || Boolean(editing)}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setCreateOpen(false);
          setEditing(null);
          setForm(emptyForm);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Gold Price" : "Add Gold Price"}
            </DialogTitle>
            <DialogDescription>
              This effective rate is used for all future valuation snapshots on
              matching dates.
            </DialogDescription>
          </DialogHeader>
          {formBody}
        </DialogContent>
      </Dialog>
    </GoldShell>
  );
}
