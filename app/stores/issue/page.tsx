"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
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
import { Minus } from "@/lib/icons";

export default function StoresIssuePage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    siteId: "",
    itemId: "",
    quantity: "",
    issuedTo: "",
    requestedById: "",
    approvedById: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState<string[]>([]);

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
    queryKey: ["inventory-items", activeSiteId],
    queryFn: () =>
      fetchInventoryItems({
        siteId: activeSiteId,
        limit: 500,
      }),
    enabled: !!activeSiteId,
  });

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "stores-issue"],
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

  const issueMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ movement?: { id?: string; createdAt?: string } }>("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      setFormErrors([]);
      toast({
        title: "Stock issued",
        description: "Issue recorded successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      const createdId = result?.movement?.id;
      const destination = buildSavedRecordRedirect(
        "/stores/movements",
        {
          createdId,
          createdAt: result?.movement?.createdAt,
          source: "stores-issue",
        },
        { siteId: activeSiteId },
      );
      router.push(destination);
    },
    onError: (error) => {
      setFormErrors([getApiErrorMessage(error)]);
      toast({
        title: "Unable to issue stock",
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
      errors.push("Select an inventory item to issue.");
    }

    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push("Enter a quantity greater than zero.");
    }

    const requestedBy = employeesById.get(form.requestedById);
    if (!requestedBy) {
      errors.push("Select the employee who requested this issue.");
    }

    if (!form.issuedTo.trim()) {
      errors.push("Provide who the stock was issued to.");
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
    if (!selectedItem || !requestedBy) {
      return;
    }

    const approvedBy = form.approvedById
      ? employeesById.get(form.approvedById)
      : undefined;

    const clean = (value: string) => value.trim() || undefined;

    issueMutation.mutate({
      itemId: selectedItem.id,
      movementType: "ISSUE",
      quantity,
      unit: selectedItem.unit,
      issuedTo: clean(form.issuedTo),
      requestedBy,
      approvedBy,
      notes: clean(form.notes),
      movementDate: form.date,
    });
  };

  const pageError = sitesError || inventoryError;

  return (
    <StoresShell activeTab="issue">
      {pageError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load issue form data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      )}
      <ContextHelp href="/help#stores" />

      <FormShell
        title="Issue Stock"
        description="Issue items to equipment or sections"
        onSubmit={handleSubmit}
        errors={formErrors}
        requiredHint="Fields marked * are required. After submit, you will be redirected to the movement log."
        actions={
          <>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              type="submit"
              disabled={issueMutation.isPending}
            >
              <Minus className="mr-2 h-4 w-4" />
              {issueMutation.isPending ? "Saving Issue..." : "Submit Issue"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/stores/dashboard">Cancel</Link>
            </Button>
          </>
        }
      >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            {item.name} ({item.currentStock} {item.unit} available)
                          </SelectItem>
                        ))
                      )}
                      <SelectItem value="__add_item__">
                        + Add new item
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <FieldHelp hint="Choose an item from stock on hand." />
              </div>
              <div>
                <label className="mb-2 block text-field-label">Quantity *</label>
                <Input
                  type="number"
                  placeholder="e.g., 50"
                  value={form.quantity}
                  aria-describedby="issue-quantity-help"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, quantity: event.target.value }))
                  }
                  required
                />
                <FieldHelp id="issue-quantity-help" hint="The quantity must be available in stock." />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-field-label">
                  Issued To (Equipment/Section) *
                </label>
                <Input
                  placeholder="e.g., Generator 1, Mill Section"
                  value={form.issuedTo}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, issuedTo: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-field-label">
                  Requested By *
                </label>
                {employeesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={form.requestedById || undefined}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, requestedById: value }))
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
              <label className="mb-2 block text-field-label">Approved By</label>
              {employeesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={form.approvedById || undefined}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, approvedById: value }))
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

            <div>
              <label className="mb-2 block text-field-label">Notes</label>
              <Textarea
                placeholder="Additional information about this issue..."
                rows={3}
                value={form.notes}
                aria-describedby="issue-notes-help"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
              <FieldHelp id="issue-notes-help" hint="Include purpose or destination details for traceability." />
            </div>
      </FormShell>
    </StoresShell>
  );
}
