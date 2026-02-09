"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StoresShell } from "@/components/stores/stores-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Plus } from "lucide-react";

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
  const employees = employeesData?.data ?? [];

  const employeesById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      map.set(employee.id, employee.name);
    });
    return map;
  }, [employees]);

  const receiveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ movement?: { id?: string } }>("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      toast({
        title: "Stock received",
        description: "Receipt recorded successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      const createdId = result?.movement?.id;
      const query = new URLSearchParams();
      if (activeSiteId) query.set("siteId", activeSiteId);
      if (createdId) query.set("createdId", createdId);
      query.set("source", "stores-receipt");
      router.push(`/stores/movements?${query.toString()}`);
    },
    onError: (error) => {
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

    const selectedItem = inventoryItems.find((item) => item.id === form.itemId);
    if (!selectedItem) {
      toast({
        title: "Missing item",
        description: "Select an inventory item to receive.",
        variant: "destructive",
      });
      return;
    }

    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({
        title: "Invalid quantity",
        description: "Enter a positive quantity.",
        variant: "destructive",
      });
      return;
    }

    const receivedBy = employeesById.get(form.receivedById);
    if (!receivedBy) {
      toast({
        title: "Missing receiver",
        description: "Select who received this stock.",
        variant: "destructive",
      });
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

      <Card>
        <CardHeader>
          <CardTitle>Receive Stock</CardTitle>
          <CardDescription>Record new stock receipts</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Date *</label>
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
                <label className="block text-sm font-semibold mb-2">Site *</label>
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
                <label className="block text-sm font-semibold mb-2">Item *</label>
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
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Quantity *</label>
                <Input
                  type="number"
                  placeholder="e.g., 1500"
                  value={form.quantity}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, quantity: event.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Supplier *</label>
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
                <label className="block text-sm font-semibold mb-2">
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
                <label className="block text-sm font-semibold mb-2">Unit Cost</label>
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
                <label className="block text-sm font-semibold mb-2">
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
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Textarea
                placeholder="Delivery notes, condition, etc..."
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </div>

            <div className="flex gap-3">
              <Button
                className="bg-green-600 hover:bg-green-700"
                type="submit"
                disabled={receiveMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Submit Receipt
              </Button>
              <Button variant="outline" asChild>
                <Link href="/stores/dashboard">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </StoresShell>
  );
}
