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
import { Minus } from "lucide-react";

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
  const employees = employeesData?.data ?? [];

  const employeesById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      map.set(employee.id, employee.name);
    });
    return map;
  }, [employees]);

  const issueMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Stock issued",
        description: "Issue recorded successfully.",
        variant: "success",
      });
      setForm((prev) => ({
        ...prev,
        itemId: "",
        quantity: "",
        issuedTo: "",
        requestedById: "",
        approvedById: "",
        notes: "",
      }));
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    },
    onError: (error) => {
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

    const selectedItem = inventoryItems.find((item) => item.id === form.itemId);
    if (!selectedItem) {
      toast({
        title: "Missing item",
        description: "Select an inventory item to issue.",
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

    const requestedBy = employeesById.get(form.requestedById);
    if (!requestedBy) {
      toast({
        title: "Missing requester",
        description: "Select who requested this issue.",
        variant: "destructive",
      });
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

      <Card>
        <CardHeader>
          <CardTitle>Issue Stock</CardTitle>
          <CardDescription>Issue items to equipment or sections</CardDescription>
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
                      {inventoryItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ({item.currentStock} {item.unit} available)
                        </SelectItem>
                      ))}
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
                  placeholder="e.g., 50"
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
                <label className="block text-sm font-semibold mb-2">
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
                <label className="block text-sm font-semibold mb-2">
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
              <label className="block text-sm font-semibold mb-2">Approved By</label>
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
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Textarea
                placeholder="Additional information about this issue..."
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </div>

            <div className="flex gap-3">
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                type="submit"
                disabled={issueMutation.isPending}
              >
                <Minus className="h-4 w-4 mr-2" />
                Submit Issue
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
