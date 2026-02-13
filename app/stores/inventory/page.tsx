"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StoresShell } from "@/components/stores/stores-shell";
import { PdfTemplate } from "@/components/pdf/pdf-template";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchInventoryItems,
  fetchSites,
  fetchStockLocations,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import { Download, Plus } from "@/lib/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function StoresInventoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inventoryPdfRef = useRef<HTMLDivElement | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [inventoryFormOpen, setInventoryFormOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [inventoryForm, setInventoryForm] = useState({
    itemCode: "",
    name: "",
    category: "CONSUMABLES",
    siteId: "",
    locationId: "",
    unit: "",
    currentStock: "",
    minStock: "",
    maxStock: "",
    unitCost: "",
  });
  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null,
  );
  const [locationForm, setLocationForm] = useState({
    name: "",
    siteId: "",
    isActive: true,
  });

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });
  const activeSiteId = selectedSiteId || sites?.[0]?.id || "";

  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery({
    queryKey: ["inventory-items", activeSiteId, selectedCategory],
    queryFn: () =>
      fetchInventoryItems({
        siteId: activeSiteId,
        category: selectedCategory === "all" ? undefined : selectedCategory,
        limit: 500,
      }),
    enabled: !!activeSiteId,
  });

  const stockLocationSiteId = inventoryForm.siteId || activeSiteId;
  const { data: stockLocationsData, isLoading: stockLocationsLoading } =
    useQuery({
      queryKey: ["stock-locations", "active", stockLocationSiteId],
      queryFn: () =>
        fetchStockLocations({
          siteId: stockLocationSiteId,
          active: true,
          limit: 200,
        }),
      enabled: !!stockLocationSiteId,
    });

  const { data: stockLocationsAllData, isLoading: stockLocationsAllLoading } =
    useQuery({
      queryKey: ["stock-locations", "all", activeSiteId],
      queryFn: () =>
        fetchStockLocations({
          siteId: activeSiteId,
          limit: 200,
        }),
      enabled: !!activeSiteId,
    });

  const inventoryItems = inventoryData?.data ?? [];
  const stockLocations = stockLocationsData?.data ?? [];
  const stockLocationsAll = stockLocationsAllData?.data ?? [];
  const activeSiteName =
    sites?.find((site) => site.id === activeSiteId)?.name ??
    (sites?.[0]?.name ?? "All sites");
  const categoryLabel =
    selectedCategory === "all" ? "All categories" : selectedCategory;
  const totalValue = inventoryItems.reduce(
    (sum, item) => sum + (item.unitCost ?? 0) * item.currentStock,
    0,
  );

  const handleSiteChange = (value: string) => {
    setSelectedSiteId(value);
    setInventoryForm((prev) => ({ ...prev, siteId: value }));
  };

  const resetInventoryForm = (
    overrides: Partial<typeof inventoryForm> = {},
  ) => {
    setInventoryForm({
      itemCode: "",
      name: "",
      category: selectedCategory === "all" ? "CONSUMABLES" : selectedCategory,
      siteId: activeSiteId,
      locationId: "",
      unit: "",
      currentStock: "",
      minStock: "",
      maxStock: "",
      unitCost: "",
      ...overrides,
    });
  };

  const resetLocationForm = (overrides: Partial<typeof locationForm> = {}) => {
    setLocationForm({
      name: "",
      siteId: activeSiteId,
      isActive: true,
      ...overrides,
    });
  };

  const toOptionalNumber = (value: string) => {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const openNewInventoryItem = () => {
    setEditingItemId(null);
    resetInventoryForm();
    setInventoryFormOpen(true);
  };

  const openNewLocation = (siteId?: string) => {
    setEditingLocationId(null);
    resetLocationForm({ siteId: siteId ?? activeSiteId });
    setLocationFormOpen(true);
  };

  const openEditInventoryItem = (item: (typeof inventoryItems)[number]) => {
    setEditingItemId(item.id);
    resetInventoryForm({
      itemCode: item.itemCode ?? "",
      name: item.name ?? "",
      category: item.category ?? "CONSUMABLES",
      siteId: item.siteId ?? activeSiteId,
      locationId: item.locationId ?? "",
      unit: item.unit ?? "",
      currentStock:
        item.currentStock !== null && item.currentStock !== undefined
          ? String(item.currentStock)
          : "",
      minStock:
        item.minStock !== null && item.minStock !== undefined
          ? String(item.minStock)
          : "",
      maxStock:
        item.maxStock !== null && item.maxStock !== undefined
          ? String(item.maxStock)
          : "",
      unitCost:
        item.unitCost !== null && item.unitCost !== undefined
          ? String(item.unitCost)
          : "",
    });
    setInventoryFormOpen(true);
  };

  const openEditLocation = (location: (typeof stockLocationsAll)[number]) => {
    setEditingLocationId(location.id);
    resetLocationForm({
      name: location.name ?? "",
      siteId: location.siteId ?? activeSiteId,
      isActive: location.isActive ?? true,
    });
    setLocationFormOpen(true);
  };

  const handleInventoryChange =
    (field: keyof typeof inventoryForm) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInventoryForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleInventorySelect =
    (field: "category" | "siteId") => (value: string) => {
      if (field === "siteId") {
        setInventoryForm((prev) => ({
          ...prev,
          siteId: value,
          locationId: "",
        }));
        return;
      }
      setInventoryForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleLocationSelect = (value: string) => {
    if (value === "__add_location__") {
      openNewLocation(inventoryForm.siteId || activeSiteId);
      return;
    }
    setInventoryForm((prev) => ({ ...prev, locationId: value }));
  };

  const handleInventoryOpenChange = (open: boolean) => {
    setInventoryFormOpen(open);
    if (!open) {
      setEditingItemId(null);
      resetInventoryForm();
    }
  };

  const handleLocationOpenChange = (open: boolean) => {
    setLocationFormOpen(open);
    if (!open) {
      setEditingLocationId(null);
      resetLocationForm();
    }
  };

  const handleLocationNameChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setLocationForm((prev) => ({ ...prev, name: event.target.value }));
  };

  const handleLocationSiteChange = (value: string) => {
    setLocationForm((prev) => ({ ...prev, siteId: value }));
  };

  const handleLocationStatusChange = (value: string) => {
    setLocationForm((prev) => ({ ...prev, isActive: value === "active" }));
  };

  const createInventoryMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/inventory/items", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Item created",
        description: "Inventory item saved successfully.",
        variant: "success",
      });
      setInventoryFormOpen(false);
      resetInventoryForm();
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create item",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateInventoryMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      data: Record<string, unknown>;
    }) =>
      fetchJson(`/api/inventory/items/${payload.id}` as const, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      toast({
        title: "Item updated",
        description: "Inventory changes saved.",
        variant: "success",
      });
      setInventoryFormOpen(false);
      setEditingItemId(null);
      resetInventoryForm();
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update item",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteInventoryMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/inventory/items/${id}` as const, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Item deleted",
        description: "Inventory item removed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to delete item",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const createLocationMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      siteId: string;
      isActive: boolean;
    }) =>
      fetchJson<{ id: string; siteId: string } | null>("/api/stock-locations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (location: { id: string; siteId: string } | null) => {
      toast({
        title: "Location created",
        description: "Stock location saved successfully.",
        variant: "success",
      });
      if (
        inventoryFormOpen &&
        location &&
        location.id &&
        location.siteId === inventoryForm.siteId
      ) {
        setInventoryForm((prev) => ({ ...prev, locationId: location.id }));
      }
      handleLocationOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create location",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      data: { name: string; isActive: boolean };
    }) =>
      fetchJson(`/api/stock-locations/${payload.id}` as const, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      toast({
        title: "Location updated",
        description: "Stock location changes saved.",
        variant: "success",
      });
      handleLocationOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update location",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/stock-locations/${id}` as const, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Location deleted",
        description: "Stock location removed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to delete location",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const handleInventorySubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (
      !inventoryForm.name ||
      !inventoryForm.siteId ||
      !inventoryForm.locationId ||
      !inventoryForm.unit
    ) {
      toast({
        title: "Missing details",
        description: "Name, site, location, and unit are required.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: inventoryForm.name,
      category: inventoryForm.category,
      siteId: inventoryForm.siteId,
      locationId: inventoryForm.locationId,
      unit: inventoryForm.unit,
      currentStock: toOptionalNumber(inventoryForm.currentStock),
      minStock: toOptionalNumber(inventoryForm.minStock),
      maxStock: toOptionalNumber(inventoryForm.maxStock),
      unitCost: toOptionalNumber(inventoryForm.unitCost),
    };

    if (editingItemId) {
      updateInventoryMutation.mutate({ id: editingItemId, data: payload });
    } else {
      createInventoryMutation.mutate(payload);
    }
  };

  const handleInventoryDelete = (id: string) => {
    if (!window.confirm("Delete this inventory item?")) return;
    deleteInventoryMutation.mutate(id);
  };

  const handleLocationSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!locationForm.name || !locationForm.siteId) {
      toast({
        title: "Missing details",
        description: "Location name and site are required.",
        variant: "destructive",
      });
      return;
    }

    if (editingLocationId) {
      updateLocationMutation.mutate({
        id: editingLocationId,
        data: {
          name: locationForm.name,
          isActive: locationForm.isActive,
        },
      });
    } else {
      createLocationMutation.mutate({
        name: locationForm.name,
        siteId: locationForm.siteId,
        isActive: locationForm.isActive,
      });
    }
  };

  const handleLocationDelete = (id: string) => {
    if (!window.confirm("Delete this stock location?")) return;
    deleteLocationMutation.mutate(id);
  };

  const pageError = sitesError || inventoryError;

  return (
    <StoresShell activeTab="inventory">
      {pageError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load inventory data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Stock on Hand</CardTitle>
              <CardDescription>
                Current inventory across all locations
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openNewInventoryItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (inventoryPdfRef.current) {
                    exportElementToPdf(
                      inventoryPdfRef.current,
                      `inventory-${activeSiteId || "all-sites"}.pdf`,
                    );
                  }
                }}
                disabled={inventoryLoading || inventoryItems.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
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
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="FUEL">Fuel</SelectItem>
                <SelectItem value="SPARES">Spares</SelectItem>
                <SelectItem value="CONSUMABLES">Consumables</SelectItem>
                <SelectItem value="PPE">PPE</SelectItem>
                <SelectItem value="REAGENTS">Reagents</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="text-left p-3 text-sm font-semibold">Code</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">
                    Item Name
                  </TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">
                    Category
                  </TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">
                    Current Stock
                  </TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">Min</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">
                    Location
                  </TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">Value</TableHead>
                  <TableHead className="text-center p-3 text-sm font-semibold">
                    Status
                  </TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-3">
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ) : inventoryItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="p-3 text-sm text-muted-foreground"
                    >
                      No inventory items found.
                    </TableCell>
                  </TableRow>
                ) : (
                  inventoryItems.map((item) => {
                    const isLow =
                      item.minStock !== null &&
                      item.minStock !== undefined &&
                      item.currentStock <= item.minStock;
                    return (
                      <TableRow key={item.id} className="border-b hover:bg-muted/60">
                        <TableCell className="p-3 text-sm font-mono">
                          {item.itemCode}
                        </TableCell>
                        <TableCell className="p-3 text-sm font-semibold">
                          {item.name}
                        </TableCell>
                        <TableCell className="p-3 text-sm">{item.category}</TableCell>
                        <TableCell className="p-3 text-sm text-right font-semibold">
                          {item.currentStock} {item.unit}
                        </TableCell>
                        <TableCell className="p-3 text-sm text-right text-muted-foreground">
                          {item.minStock !== null &&
                          item.minStock !== undefined
                            ? `${item.minStock} ${item.unit}`
                            : "-"}
                        </TableCell>
                        <TableCell className="p-3 text-sm">
                          {item.location?.name ?? "-"}
                        </TableCell>
                        <TableCell className="p-3 text-sm text-right">
                          {item.unitCost !== null &&
                          item.unitCost !== undefined
                            ? `$${(item.currentStock * item.unitCost).toFixed(2)}`
                            : "-"}
                        </TableCell>
                        <TableCell className="p-3 text-center">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              isLow
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {isLow ? "Low" : "OK"}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEditInventoryItem(item)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => handleInventoryDelete(item.id)}
                              disabled={deleteInventoryMutation.isPending}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <Sheet
            open={inventoryFormOpen}
            onOpenChange={handleInventoryOpenChange}
          >
            <SheetContent className="w-full sm:max-w-lg p-6">
              <SheetHeader>
                <SheetTitle>
                  {editingItemId ? "Edit Item" : "Add Inventory Item"}
                </SheetTitle>
                <SheetDescription>
                  Manage consumables and stock details.
                </SheetDescription>
              </SheetHeader>
              <form
                onSubmit={handleInventorySubmit}
                className="mt-6 space-y-4"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {editingItemId ? (
                    <div>
                      <label className="block text-sm font-semibold mb-2">
                        Item Code
                      </label>
                      <Input value={inventoryForm.itemCode} disabled />
                    </div>
                  ) : (
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold mb-2">
                        Item Code
                      </label>
                      <p className="text-sm text-muted-foreground">
                        Item codes are generated automatically after saving.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Name *
                    </label>
                    <Input
                      value={inventoryForm.name}
                      onChange={handleInventoryChange("name")}
                      placeholder="Grinding Media"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Category *
                    </label>
                    <Select
                      value={inventoryForm.category}
                      onValueChange={handleInventorySelect("category")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FUEL">Fuel</SelectItem>
                        <SelectItem value="SPARES">Spares</SelectItem>
                        <SelectItem value="CONSUMABLES">Consumables</SelectItem>
                        <SelectItem value="PPE">PPE</SelectItem>
                        <SelectItem value="REAGENTS">Reagents</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Unit *
                    </label>
                    <Input
                      value={inventoryForm.unit}
                      onChange={handleInventoryChange("unit")}
                      placeholder="kg, litres, pieces"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Site *
                    </label>
                    {sitesLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select
                        value={inventoryForm.siteId || undefined}
                        onValueChange={handleInventorySelect("siteId")}
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
                    <label className="block text-sm font-semibold mb-2">
                      Location *
                    </label>
                    {stockLocationsLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select
                        value={inventoryForm.locationId || undefined}
                        onValueChange={handleLocationSelect}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                      <SelectContent>
                          {stockLocations.length === 0 ? (
                            <SelectItem value="__no_locations__" disabled>
                              No locations available
                            </SelectItem>
                          ) : (
                            stockLocations.map((location) => (
                              <SelectItem key={location.id} value={location.id}>
                                {location.name}
                              </SelectItem>
                            ))
                          )}
                          <SelectItem value="__add_location__">
                            + Add new location
                          </SelectItem>
                      </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Current Stock
                    </label>
                    <Input
                      type="number"
                      value={inventoryForm.currentStock}
                      onChange={handleInventoryChange("currentStock")}
                      placeholder="0"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Unit Cost
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={inventoryForm.unitCost}
                      onChange={handleInventoryChange("unitCost")}
                      placeholder="0.00"
                      min={0}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Minimum Stock
                    </label>
                    <Input
                      type="number"
                      value={inventoryForm.minStock}
                      onChange={handleInventoryChange("minStock")}
                      placeholder="0"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Maximum Stock
                    </label>
                    <Input
                      type="number"
                      value={inventoryForm.maxStock}
                      onChange={handleInventoryChange("maxStock")}
                      placeholder="0"
                      min={0}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={
                      createInventoryMutation.isPending ||
                      updateInventoryMutation.isPending
                    }
                  >
                    {editingItemId ? "Save Changes" : "Save Item"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleInventoryOpenChange(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </SheetContent>
          </Sheet>
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={inventoryPdfRef}>
          <PdfTemplate
            title="Stock on Hand"
            subtitle="Stores inventory summary"
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Category", value: categoryLabel },
              { label: "Total items", value: String(inventoryItems.length) },
              { label: "Total value", value: `$${totalValue.toFixed(2)}` },
            ]}
          >
            <div className="space-y-6 text-xs">
              <div>
                <h2 className="text-sm font-semibold mb-2">Inventory Items</h2>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2">Code</th>
                      <th className="py-2">Item</th>
                      <th className="py-2">Category</th>
                      <th className="py-2 text-right">Stock</th>
                      <th className="py-2 text-right">Min</th>
                      <th className="py-2">Location</th>
                      <th className="py-2 text-right">Value</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryItems.map((item) => {
                      const isLow =
                        item.minStock !== null &&
                        item.minStock !== undefined &&
                        item.currentStock <= item.minStock;
                      const value =
                        item.unitCost !== null && item.unitCost !== undefined
                          ? item.currentStock * item.unitCost
                          : null;
                      return (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="py-2 font-mono">
                            {item.itemCode ?? "-"}
                          </td>
                          <td className="py-2 font-semibold">{item.name}</td>
                          <td className="py-2">{item.category}</td>
                          <td className="py-2 text-right">
                            {item.currentStock} {item.unit}
                          </td>
                          <td className="py-2 text-right">
                            {item.minStock !== null &&
                            item.minStock !== undefined
                              ? `${item.minStock} ${item.unit}`
                              : "-"}
                          </td>
                          <td className="py-2">{item.location?.name ?? "-"}</td>
                          <td className="py-2 text-right">
                            {value !== null ? `$${value.toFixed(2)}` : "-"}
                          </td>
                          <td className="py-2">{isLow ? "Low" : "OK"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <h2 className="text-sm font-semibold mb-2">Stock Locations</h2>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2">Name</th>
                      <th className="py-2">Site</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockLocationsAll.map((location) => (
                      <tr key={location.id} className="border-b border-gray-100">
                        <td className="py-2 font-semibold">{location.name}</td>
                        <td className="py-2">{location.site?.name ?? "-"}</td>
                        <td className="py-2">
                          {location.isActive ? "Active" : "Inactive"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </PdfTemplate>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Stock Locations</CardTitle>
              <CardDescription>
                Manage store rooms and storage bays.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => openNewLocation(activeSiteId)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="text-left p-3 text-sm font-semibold">Name</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Site</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Status</TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockLocationsAllLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="p-3">
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ) : stockLocationsAll.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="p-3 text-sm text-muted-foreground"
                    >
                      No stock locations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  stockLocationsAll.map((location) => (
                    <TableRow
                      key={location.id}
                      className="border-b hover:bg-muted/60"
                    >
                      <TableCell className="p-3 text-sm font-semibold">
                        {location.name}
                      </TableCell>
                      <TableCell className="p-3 text-sm">
                        {location.site?.name ?? "-"}
                      </TableCell>
                      <TableCell className="p-3 text-sm">
                        {location.isActive ? "Active" : "Inactive"}
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEditLocation(location)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => handleLocationDelete(location.id)}
                            disabled={deleteLocationMutation.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Sheet
            open={locationFormOpen}
            onOpenChange={handleLocationOpenChange}
          >
            <SheetContent className="w-full sm:max-w-lg p-6">
              <SheetHeader>
                <SheetTitle>
                  {editingLocationId ? "Edit Location" : "Add Location"}
                </SheetTitle>
                <SheetDescription>
                  Store rooms, bays, and bins.
                </SheetDescription>
              </SheetHeader>
              <form onSubmit={handleLocationSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Location Name *
                  </label>
                  <Input
                    value={locationForm.name}
                    onChange={handleLocationNameChange}
                    placeholder="Main Store"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Site *</label>
                  {sitesLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select
                      value={locationForm.siteId || undefined}
                      onValueChange={handleLocationSiteChange}
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
                  <label className="block text-sm font-semibold mb-2">
                    Status
                  </label>
                  <Select
                    value={locationForm.isActive ? "active" : "inactive"}
                    onValueChange={handleLocationStatusChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={
                      createLocationMutation.isPending ||
                      updateLocationMutation.isPending
                    }
                  >
                    {editingLocationId ? "Save Changes" : "Save Location"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleLocationOpenChange(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </SheetContent>
          </Sheet>
        </CardContent>
      </Card>
    </StoresShell>
  );
}


