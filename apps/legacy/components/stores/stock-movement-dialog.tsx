"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { FormShell } from "@/components/shared/form-shell";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchEmployees, fetchInventoryItems, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useReservedId } from "@/hooks/use-reserved-id";

export type StockMovementKind = "ISSUE" | "RECEIPT";

const COPY: Record<
  StockMovementKind,
  { title: string; description: string; submit: string; done: string }
> = {
  ISSUE: {
    title: "Issue stock",
    description: "Take something out of a store and say where it went.",
    submit: "Issue stock",
    done: "Stock issued",
  },
  RECEIPT: {
    title: "Receive stock",
    description: "Book something in, with what it cost and who it came from.",
    submit: "Receive stock",
    done: "Stock received",
  },
};

type FormState = {
  date: string;
  siteId: string;
  itemId: string;
  quantity: string;
  /** Issue only. */
  issuedTo: string;
  requestedById: string;
  approvedById: string;
  /** Receipt only. */
  supplier: string;
  invoiceNo: string;
  unitCost: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    date: new Date().toISOString().split("T")[0],
    siteId: "",
    itemId: "",
    quantity: "",
    issuedTo: "",
    requestedById: "",
    approvedById: "",
    supplier: "",
    invoiceNo: "",
    unitCost: "",
    notes: "",
  };
}

/**
 * Issuing and receiving stock, as a dialog.
 *
 * Both were full pages you navigated away to, filled in, and were redirected
 * out of — which is the wrong shape for a thirty-second job you do while
 * looking at the stock list. They are now one dialog opened from the top bar,
 * so the list you were reading is still behind it and still there afterwards.
 *
 * One component for both directions because they differ in four fields, and
 * two files that share a site picker, an item picker and a quantity box drift
 * apart the first time one of them is fixed.
 */
export function StockMovementDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: StockMovementKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<string[]>([]);

  // Reset as the dialog opens rather than in an effect, so there is no flash
  // of the last movement's details. Starts false so a dialog that mounts open
  // still counts as a transition.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(emptyForm());
      setErrors([]);
    }
  }

  const { reservedId, isReserving, error: reserveError } = useReservedId({
    entity: "STOCK_MOVEMENT",
    enabled: open,
  });

  const sitesQuery = useQuery({ queryKey: ["sites"], queryFn: fetchSites, enabled: open });
  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const activeSiteId = form.siteId || sites[0]?.id || "";

  const inventoryQuery = useQuery({
    queryKey: ["inventory-items", activeSiteId],
    queryFn: () => fetchInventoryItems({ siteId: activeSiteId, limit: 500 }),
    enabled: open && Boolean(activeSiteId),
  });
  const items = useMemo(() => inventoryQuery.data?.data ?? [], [inventoryQuery.data]);

  const employeesQuery = useQuery({
    queryKey: ["employees", "stock-movement"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
    enabled: open,
  });
  const employees = useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data]);
  const nameOf = (id: string) => employees.find((employee) => employee.id === id)?.name;

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetchJson<{ movement?: { id?: string } }>("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      toast({ title: COPY[kind].done, variant: "success" });
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

  const validate = (): string[] => {
    const found: string[] = [];
    const item = items.find((candidate) => candidate.id === form.itemId);
    if (!item) found.push("Pick the item this movement is about.");

    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      found.push("Enter a quantity greater than zero.");
    }
    if (!reservedId) {
      found.push(reserveError ?? "Still reserving a reference number — one moment.");
    }

    if (kind === "ISSUE") {
      if (!form.issuedTo.trim()) found.push("Say who the stock went to.");
      if (!nameOf(form.requestedById)) found.push("Pick who asked for it.");
    } else if (!nameOf(form.requestedById)) {
      found.push("Pick who took delivery.");
    }

    return found;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (found.length > 0) return;

    const item = items.find((candidate) => candidate.id === form.itemId)!;
    const clean = (value: string) => value.trim() || undefined;
    const quantity = Number(form.quantity);

    if (kind === "ISSUE") {
      save.mutate({
        referenceId: reservedId,
        itemId: item.id,
        movementType: "ISSUE",
        quantity,
        unit: item.unit,
        issuedTo: clean(form.issuedTo),
        requestedBy: nameOf(form.requestedById),
        approvedBy: form.approvedById ? nameOf(form.approvedById) : undefined,
        notes: clean(form.notes),
        movementDate: form.date,
      });
      return;
    }

    // The receipt route has no supplier or invoice column, so those travel in
    // the note the same way the old page sent them.
    const unitCost = Number(form.unitCost);
    const noteParts = [
      form.supplier.trim() ? `Supplier: ${form.supplier.trim()}` : null,
      form.invoiceNo.trim() ? `Invoice: ${form.invoiceNo.trim()}` : null,
      clean(form.notes),
    ].filter(Boolean);

    save.mutate({
      referenceId: reservedId,
      itemId: item.id,
      movementType: "RECEIPT",
      quantity,
      unit: item.unit,
      requestedBy: nameOf(form.requestedById),
      notes: noteParts.length ? noteParts.join(" · ") : undefined,
      unitCost: Number.isFinite(unitCost) && form.unitCost.trim() ? unitCost : undefined,
      movementDate: form.date,
    });
  };

  const copy = COPY[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <FormShell
          variant="bare"
          errors={errors}
          onSubmit={submit}
          requiredHint="Everything marked * has to be filled in."
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending || isReserving}>
                {save.isPending ? "Saving…" : copy.submit}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="movement-date">Date *</Label>
              <Input
                id="movement-date"
                type="date"
                value={form.date}
                onChange={(event) => patch({ date: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="movement-reference">Reference</Label>
              <Input
                id="movement-reference"
                value={reservedId ?? (isReserving ? "Reserving…" : "")}
                readOnly
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Store *</Label>
            <Select
              value={activeSiteId}
              onValueChange={(value) => patch({ siteId: value, itemId: "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder={sitesQuery.isLoading ? "Loading…" : "Pick a store"} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Item *</Label>
            <Select value={form.itemId} onValueChange={(value) => patch({ itemId: value })}>
              <SelectTrigger>
                <SelectValue
                  placeholder={inventoryQuery.isLoading ? "Loading…" : "Pick an item"}
                />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · {item.currentStock} {item.unit} on hand
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="movement-quantity">Quantity *</Label>
              <Input
                id="movement-quantity"
                inputMode="decimal"
                className="font-mono"
                value={form.quantity}
                onChange={(event) => patch({ quantity: event.target.value })}
              />
            </div>
            {kind === "RECEIPT" ? (
              <div className="space-y-1.5">
                <Label htmlFor="movement-cost">Unit cost</Label>
                <Input
                  id="movement-cost"
                  inputMode="decimal"
                  className="font-mono"
                  value={form.unitCost}
                  onChange={(event) => patch({ unitCost: event.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="movement-to">Issued to *</Label>
                <Input
                  id="movement-to"
                  value={form.issuedTo}
                  onChange={(event) => patch({ issuedTo: event.target.value })}
                  placeholder="Crew, machine or department"
                />
              </div>
            )}
          </div>

          {kind === "RECEIPT" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="movement-supplier">Supplier</Label>
                <Input
                  id="movement-supplier"
                  value={form.supplier}
                  onChange={(event) => patch({ supplier: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="movement-invoice">Invoice no.</Label>
                <Input
                  id="movement-invoice"
                  className="font-mono"
                  value={form.invoiceNo}
                  onChange={(event) => patch({ invoiceNo: event.target.value })}
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{kind === "ISSUE" ? "Requested by *" : "Received by *"}</Label>
              <Select
                value={form.requestedById}
                onValueChange={(value) => patch({ requestedById: value })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={employeesQuery.isLoading ? "Loading…" : "Pick someone"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {kind === "ISSUE" ? (
              <div className="space-y-1.5">
                <Label>Approved by</Label>
                <Select
                  value={form.approvedById}
                  onValueChange={(value) => patch({ approvedById: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="movement-notes">Notes</Label>
            <Textarea
              id="movement-notes"
              rows={2}
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </div>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
