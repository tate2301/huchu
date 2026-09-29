"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FormField } from "@/components/management/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchEmployees, fetchInventoryItems, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useReservedId } from "@/hooks/use-reserved-id";
import { formatQuantity } from "@/lib/retail/words";

export type StockMovementKind = "ISSUE" | "RECEIPT";

const COPY: Record<StockMovementKind, { title: string; done: string; failed: string }> = {
  ISSUE: { title: "Issue stock", done: "Stock issued", failed: "That stock was not issued" },
  RECEIPT: { title: "Receive stock", done: "Stock received", failed: "That stock was not received" },
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
 * Issuing and receiving stock, as a dialog. The title and the submit are the
 * same words as the button that opened it.
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
    onError: (error) => setErrors([`${COPY[kind].failed}: ${getApiErrorMessage(error)}`]),
  });

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

  const validate = (): string[] => {
    const found: string[] = [];
    const item = items.find((candidate) => candidate.id === form.itemId);
    if (!item) found.push("Choose the stock item.");

    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      found.push("Enter a quantity greater than zero.");
    }
    if (!reservedId) {
      found.push(
        reserveError
          ? `No reference was reserved for it: ${reserveError}`
          : "Its reference is still being reserved.",
      );
    }

    if (kind === "ISSUE") {
      if (!form.issuedTo.trim()) found.push("Say who the stock went to.");
      if (!nameOf(form.requestedById)) found.push("Choose who asked for it.");
    } else if (!nameOf(form.requestedById)) {
      found.push("Choose who took it in.");
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
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      size="md"
      onSubmit={submit}
      errors={errors}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || isReserving}>
            {copy.title}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Date">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.date}
              onChange={(event) => patch({ date: event.target.value })}
            />
          )}
        </FormField>
        <FormField label="Reference">
          {(id) => (
            <Input
              id={id}
              value={reservedId || (isReserving ? "Reserving…" : "")}
              readOnly
              className="font-mono"
            />
          )}
        </FormField>
      </div>

      <FormField label="Site">
        {(id) => (
          <Select
            value={activeSiteId}
            onValueChange={(value) => patch({ siteId: value, itemId: "" })}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder={sitesQuery.isLoading ? "Loading…" : "Choose a site"} />
            </SelectTrigger>
            <SelectContent>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField label="Stock item">
        {(id) => (
          <Select value={form.itemId} onValueChange={(value) => patch({ itemId: value })}>
            <SelectTrigger id={id}>
              <SelectValue
                placeholder={inventoryQuery.isLoading ? "Loading…" : "Choose a stock item"}
              />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} · {formatQuantity(item.currentStock, item.unit)} on hand
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Quantity">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              className="font-mono"
              value={form.quantity}
              onChange={(event) => patch({ quantity: event.target.value })}
            />
          )}
        </FormField>
        {kind === "RECEIPT" ? (
          <FormField label="Unit cost">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                className="font-mono"
                value={form.unitCost}
                onChange={(event) => patch({ unitCost: event.target.value })}
              />
            )}
          </FormField>
        ) : (
          <FormField label="Issued to">
            {(id) => (
              <Input
                id={id}
                value={form.issuedTo}
                onChange={(event) => patch({ issuedTo: event.target.value })}
                placeholder="Night shift crew"
              />
            )}
          </FormField>
        )}
      </div>

      {kind === "RECEIPT" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Supplier">
            {(id) => (
              <Input
                id={id}
                value={form.supplier}
                onChange={(event) => patch({ supplier: event.target.value })}
              />
            )}
          </FormField>
          <FormField label="Invoice number">
            {(id) => (
              <Input
                id={id}
                className="font-mono"
                value={form.invoiceNo}
                onChange={(event) => patch({ invoiceNo: event.target.value })}
              />
            )}
          </FormField>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={kind === "ISSUE" ? "Requested by" : "Received by"}>
          {(id) => (
            <Select
              value={form.requestedById}
              onValueChange={(value) => patch({ requestedById: value })}
            >
              <SelectTrigger id={id}>
                <SelectValue
                  placeholder={employeesQuery.isLoading ? "Loading…" : "Choose someone"}
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
          )}
        </FormField>

        {kind === "ISSUE" ? (
          <FormField label="Approved by">
            {(id) => (
              <Select
                value={form.approvedById}
                onValueChange={(value) => patch({ approvedById: value })}
              >
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Nobody yet" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}
      </div>

      <FormField label="Notes">
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
          />
        )}
      </FormField>
    </RecordDialog>
  );
}
