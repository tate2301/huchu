"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { ContextHelp } from "@/components/shared/context-help";
import { StoresShell } from "@/components/stores/stores-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchEmployees, fetchInventoryItems, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";
import { Plus } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type NotesPayload = {
  supplier?: string;
  invoiceNo?: string;
  notes?: string;
};

export default function StoresReceivePage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    siteId: "",
    itemId: "",
    quantity: "",
    supplier: "",
    invoiceNo: "",
    unitCost: "",
    receivedById: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const {
    reservedId: movementReferenceId,
    isReserving: reservingMovementReferenceId,
    error: reserveMovementReferenceError,
  } = useReservedId({
    entity: "STOCK_MOVEMENT",
    enabled: true,
  });

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });
  const activeSiteId = form.siteId || sites?.[0]?.id || "";

  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery({
    queryKey: ["inventory-items", activeSiteId, "receive"],
    queryFn: () =>
      fetchInventoryItems({
        siteId: activeSiteId,
        limit: 500,
      }),
    enabled: !!activeSiteId,
  });

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "stores-receive"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const inventoryItems = inventoryData?.data ?? [];
  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);

  const employeesById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      map.set(employee.id, employee.name);
    });
    return map;
  }, [employees]);

  const receiveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ movement?: { id?: string; createdAt?: string } }>("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result, variables) => {
      setFormErrors([]);
      toast({
        title: "Stock received",
        description: "Receipt recorded successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      const createdId = result?.movement?.id;
      const destination = buildSavedRecordRedirect(
        "/stores/movements",
        {
          createdId,
          createdAt:
            result?.movement?.createdAt ??
            String(variables.movementDate ?? "").slice(0, 10),
          source: "stores-receipt",
        },
        { siteId: activeSiteId },
      );
      router.push(destination);
    },
    onError: (error) => {
      setFormErrors([getApiErrorMessage(error)]);
      toast({
        title: "Unable to receive stock",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const handleSiteChange = (value: string) => {
    setForm((prev) => ({ ...prev, siteId: value, itemId: "" }));
  };

  const handleItemChange = (value: string) => {
    if (value === "__add_item__") {
      router.push("/stores/inventory");
      return;
    }
    setForm((prev) => ({ ...prev, itemId: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormErrors([]);

    const errors: string[] = [];

    const selectedItem = inventoryItems.find((item) => item.id === form.itemId);
    if (!selectedItem) {
      errors.push("Select an inventory item to receive.");
    }

    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push("Enter a quantity greater than zero.");
    }

    const receivedBy = employeesById.get(form.receivedById);
    if (!receivedBy) {
      errors.push("Select the employee who received this stock.");
    }
    if (!movementReferenceId) {
      errors.push(
        reserveMovementReferenceError ??
          "Please wait for movement reference reservation to complete.",
      );
    }

    if (!form.supplier.trim()) {
      errors.push("Provide the supplier name.");
    }

    if (errors.length) {
      setFormErrors(errors);
      toast({
        title: "Please fix the form",
        description: errors[0],
        variant: "destructive",
      });
      return;
    }
    if (!selectedItem || !receivedBy) {
      return;
    }

    const clean = (value: string) => value.trim() || undefined;
    const unitCost = form.unitCost.trim()
      ? Number(form.unitCost)
      : undefined;

    const notesPayload: NotesPayload = {
      supplier: clean(form.supplier),
      invoiceNo: clean(form.invoiceNo),
      notes: clean(form.notes),
    };
    const notesString = Object.values(notesPayload).some(Boolean)
      ? JSON.stringify(notesPayload)
      : undefined;

    receiveMutation.mutate({
      referenceId: movementReferenceId,
      itemId: selectedItem.id,
      movementType: "RECEIPT",
      quantity,
      unit: selectedItem.unit,
      requestedBy: receivedBy,
      notes: notesString,
      unitCost: Number.isFinite(unitCost) ? unitCost : undefined,
      movementDate: form.date,
    });
  };

  const pageError = sitesError || inventoryError;

  return (
    <StoresShell activeTab="receive">
      {pageError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load receipt form data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      )}
      <ContextHelp href="/help#stores" />
      <PageIntro
        title="Receive stock in 3 steps"
        purpose="Step 1: select site and item. Step 2: capture supplier, quantity, and receiver details. Step 3: submit and review the saved movement."
        nextStep="Start with date, site, and item."
      />

      <FormShell
        title="Receive Stock"
        description="Record new stock receipts"
        onSubmit={handleSubmit}
        errors={formErrors}
        requiredHint="Fields marked * are required. After submit, you will be redirected to the movement log."
        actions={
          <>
            <Button
              className="bg-green-600 hover:bg-green-700"
              type="submit"
              disabled={
                receiveMutation.isPending ||
                reservingMovementReferenceId ||
                !movementReferenceId
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {receiveMutation.isPending ? "Saving Receipt..." : "Submit Receipt"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/stores/dashboard">Cancel</Link>
            </Button>
          </>
        }
      >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="mb-2 block text-field-label">Date *</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-field-label">Site *</label>
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={activeSiteId || undefined}
                    onValueChange={handleSiteChange}
                  >
                    <SelectTrigger className="w-full">
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
                  )}
              </div>
              <div>
                <label className="mb-2 block text-field-label">
                  Movement Reference *
                </label>
                <Input
                  value={movementReferenceId}
                  readOnly
                  placeholder={reservingMovementReferenceId ? "Reserving..." : "Auto-generated"}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-field-label">Item *</label>
                {inventoryLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={form.itemId || undefined}
                    onValueChange={handleItemChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems.length === 0 ? (
                        <SelectItem value="__no_items__" disabled>
                          No items available
                        </SelectItem>
                      ) : (
                        inventoryItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} (Current: {item.currentStock} {item.unit})
                          </SelectItem>
                        ))
                      )}
                      <SelectItem value="__add_item__">
                        + Add new item
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <FieldHelp hint="Choose an existing stock item or add a new one." />
              </div>
              <div>
                <label className="mb-2 block text-field-label">Quantity *</label>
                <Input
                  type="number"
                  placeholder="e.g., 1500"
                  value={form.quantity}
                  aria-describedby="receive-quantity-help"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, quantity: event.target.value }))
                  }
                  required
                />
                <FieldHelp id="receive-quantity-help" hint="Use the same unit shown for the selected item." />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-field-label">Supplier *</label>
                <Input
                  placeholder="Supplier name"
                  value={form.supplier}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, supplier: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-field-label">
                  Invoice/Delivery Number
                </label>
                <Input
                  placeholder="e.g., INV-2401"
                  value={form.invoiceNo}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, invoiceNo: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-field-label">Unit Cost</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Cost per unit"
                  value={form.unitCost}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, unitCost: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-field-label">
                  Received By *
                </label>
                {employeesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={form.receivedById || undefined}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, receivedById: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name} ({employee.employeeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-field-label">Notes</label>
              <Textarea
                placeholder="Delivery notes, condition, etc..."
                rows={3}
                value={form.notes}
                aria-describedby="receive-notes-help"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
              <FieldHelp id="receive-notes-help" hint="Include delivery condition or any discrepancy." />
            </div>
      </FormShell>
    </StoresShell>
  );
}
