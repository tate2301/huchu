"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchEmployees, fetchInventoryItems, fetchSites, fetchStockLocations } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Package,
  Fuel,
  AlertTriangle,
  Plus,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Home,
} from "lucide-react";

const storesViews = [
  "dashboard",
  "inventory",
  "fuel",
  "issue",
  "receive",
] as const;
type StoresView = (typeof storesViews)[number];

// Mock data
const mockInventory = [
  {
    id: "1",
    code: "FUEL-001",
    name: "Diesel",
    category: "FUEL",
    unit: "litres",
    currentStock: 450,
    minStock: 500,
    maxStock: 2000,
    location: "Main Store",
    unitCost: 1.65,
    status: "low",
  },
  {
    id: "2",
    code: "SPARE-012",
    name: "Crusher Jaw Plates",
    category: "SPARES",
    unit: "pieces",
    currentStock: 4,
    minStock: 2,
    maxStock: 10,
    location: "Workshop",
    unitCost: 450,
    status: "ok",
  },
  {
    id: "3",
    code: "CONS-008",
    name: "Grinding Media (Balls)",
    category: "CONSUMABLES",
    unit: "kg",
    currentStock: 180,
    minStock: 200,
    maxStock: 1000,
    location: "Mill Store",
    unitCost: 2.5,
    status: "low",
  },
  {
    id: "4",
    code: "PPE-015",
    name: "Safety Helmets",
    category: "PPE",
    unit: "pieces",
    currentStock: 25,
    minStock: 15,
    maxStock: 50,
    location: "Main Store",
    unitCost: 12,
    status: "ok",
  },
  {
    id: "5",
    code: "REAG-003",
    name: "Cyanide (NaCN)",
    category: "REAGENTS",
    unit: "kg",
    currentStock: 85,
    minStock: 50,
    maxStock: 200,
    location: "Secure Store",
    unitCost: 8.5,
    status: "ok",
  },
  {
    id: "6",
    code: "SPARE-024",
    name: "Pump Impellers",
    category: "SPARES",
    unit: "pieces",
    currentStock: 1,
    minStock: 3,
    maxStock: 10,
    location: "Workshop",
    unitCost: 180,
    status: "critical",
  },
];

const mockFuelLedger = [
  {
    date: "2026-01-08",
    type: "issue",
    equipment: "Generator 1",
    quantity: 120,
    opening: 570,
    closing: 450,
    requestedBy: "Night Shift",
    approvedBy: "Site Manager",
  },
  {
    date: "2026-01-07",
    type: "receipt",
    supplier: "Delta Fuels",
    quantity: 1500,
    opening: 70,
    closing: 1570,
    receivedBy: "Stores Clerk",
    invoiceNo: "INV-2401",
  },
  {
    date: "2026-01-07",
    type: "issue",
    equipment: "Crusher",
    quantity: 85,
    opening: 1570,
    closing: 1485,
    requestedBy: "Day Shift",
    approvedBy: "Site Manager",
  },
  {
    date: "2026-01-07",
    type: "issue",
    equipment: "Haul Trucks",
    quantity: 915,
    opening: 1485,
    closing: 570,
    requestedBy: "Day Shift",
    approvedBy: "Supervisor",
  },
];

const mockRecentMovements = [
  {
    id: "1",
    item: "Grinding Media (Balls)",
    type: "issue",
    quantity: 50,
    unit: "kg",
    issuedTo: "Mill Section",
    requestedBy: "J. Moyo",
    timestamp: "2026-01-08 14:30",
  },
  {
    id: "2",
    item: "Diesel",
    type: "issue",
    quantity: 120,
    unit: "litres",
    issuedTo: "Generator 1",
    requestedBy: "Night Shift",
    timestamp: "2026-01-08 06:00",
  },
  {
    id: "3",
    item: "Safety Helmets",
    type: "issue",
    quantity: 3,
    unit: "pieces",
    issuedTo: "New Hires",
    requestedBy: "HR",
    timestamp: "2026-01-07 10:15",
  },
  {
    id: "4",
    item: "Diesel",
    type: "receipt",
    quantity: 1500,
    unit: "litres",
    issuedTo: "Main Store",
    requestedBy: "Stores Clerk",
    timestamp: "2026-01-07 09:00",
  },
];

export default function StoresPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewParam = searchParams.get("view");
  const initialView = storesViews.includes(viewParam as StoresView)
    ? (viewParam as StoresView)
    : "dashboard";
  const [activeView, setActiveView] = useState<StoresView>(initialView);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("CONSUMABLES");
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
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState({
    name: "",
    siteId: "",
    isActive: true,
  });
  const [issueItemId, setIssueItemId] = useState("");
  const [receiveItemId, setReceiveItemId] = useState("");

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });
  const activeSiteId = selectedSiteId || sites?.[0]?.id || "";

  const { data: inventoryData, isLoading: inventoryLoading, error: inventoryError } = useQuery({
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
  const {
    data: stockLocationsData,
    isLoading: stockLocationsLoading,
  } = useQuery({
    queryKey: ["stock-locations", "active", stockLocationSiteId],
    queryFn: () =>
      fetchStockLocations({
        siteId: stockLocationSiteId,
        active: true,
        limit: 200,
      }),
    enabled: !!stockLocationSiteId,
  });

  const {
    data: stockLocationsAllData,
    isLoading: stockLocationsAllLoading,
  } = useQuery({
    queryKey: ["stock-locations", "all", activeSiteId],
    queryFn: () =>
      fetchStockLocations({
        siteId: activeSiteId,
        limit: 200,
      }),
    enabled: !!activeSiteId,
  });

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "stores-forms"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });
  const employees = employeesData?.data ?? [];
  const inventoryItems = inventoryData?.data ?? [];
  const stockLocations = stockLocationsData?.data ?? [];
  const stockLocationsAll = stockLocationsAllData?.data ?? [];

  const changeView = (view: StoresView) => {
    setActiveView(view);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`/stores?${params.toString()}`);
  };

  const handleSiteChange = (value: string) => {
    setSelectedSiteId(value);
    setIssueItemId("");
    setReceiveItemId("");
    setInventoryForm((prev) => ({ ...prev, siteId: value }));
  };

  const resetInventoryForm = (
    overrides: Partial<typeof inventoryForm> = {},
  ) => {
    setInventoryForm({
      itemCode: "",
      name: "",
      category:
        selectedCategory === "all" ? "CONSUMABLES" : selectedCategory,
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

  const resetLocationForm = (
    overrides: Partial<typeof locationForm> = {},
  ) => {
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

  const handleLocationNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
    mutationFn: async (payload: { id: string; data: Record<string, unknown> }) =>
      fetchJson(`/api/inventory/items/${payload.id}`, {
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
      fetchJson(`/api/inventory/items/${id}`, { method: "DELETE" }),
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
    mutationFn: async (payload: { name: string; siteId: string; isActive: boolean }) =>
      fetchJson("/api/stock-locations", {
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
    mutationFn: async (payload: { id: string; data: { name: string; isActive: boolean } }) =>
      fetchJson(`/api/stock-locations/${payload.id}`, {
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
      fetchJson(`/api/stock-locations/${id}`, { method: "DELETE" }),
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
      !inventoryForm.itemCode ||
      !inventoryForm.name ||
      !inventoryForm.siteId ||
      !inventoryForm.locationId ||
      !inventoryForm.unit
    ) {
      toast({
        title: "Missing details",
        description: "Code, name, site, location, and unit are required.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      itemCode: inventoryForm.itemCode,
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

  const handleIssueItemChange = (value: string) => {
    if (value === "__add_item__") {
      openNewInventoryItem();
      setIssueItemId("");
      return;
    }
    setIssueItemId(value);
  };

  const handleReceiveItemChange = (value: string) => {
    if (value === "__add_item__") {
      openNewInventoryItem();
      setReceiveItemId("");
      return;
    }
    setReceiveItemId(value);
  };

  const filteredInventory = inventoryItems;

  // Calculate stats
  const totalItems = mockInventory.length;
  const lowStockItems = mockInventory.filter(
    (item) => item.status === "low" || item.status === "critical",
  ).length;
  const totalValue = mockInventory.reduce(
    (sum, item) => sum + item.currentStock * item.unitCost,
    0,
  );
  const criticalItems = mockInventory.filter(
    (item) => item.status === "critical",
  ).length;
  const dieselItem = mockInventory.find((item) => item.code === "FUEL-001");
  const dieselStock = dieselItem?.currentStock ?? 0;
  const dieselMin = dieselItem?.minStock ?? 0;
  const dieselVariance = dieselStock - dieselMin;
  const dieselBelowMin = dieselItem ? dieselStock < dieselMin : false;
  const pageError = sitesError || inventoryError;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageActions>
        <Button size="sm" onClick={() => changeView("issue")}>
          <Minus className="h-4 w-4" />
          Issue Stock
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => changeView("receive")}
        >
          <Plus className="h-4 w-4" />
          Receive Stock
        </Button>
      </PageActions>

      <PageHeading
        title="Stores & Fuel Management"
        description="Inventory tracking and fuel ledger"
      />

      {pageError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load inventory data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={activeView}
        onValueChange={(value) => changeView(value as StoresView)}
        className="space-y-6"
      >
        <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 h-auto border-b">
          <TabsTrigger value="dashboard" className="gap-2 ">
            <Home className="size-5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-2">
            <Package className="size-5" />
            Stock on Hand
          </TabsTrigger>
          <TabsTrigger value="fuel" className="gap-2 ">
            <Fuel className="size-5" />
            Fuel Ledger
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-0">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Card className="py-4 gap-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Inventory Snapshot
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Quick totals across stores
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Total Items</span>
                    </div>
                    <span className="text-sm font-semibold">{totalItems}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Inventory Value</span>
                    </div>
                    <span className="text-sm font-semibold">
                      ${totalValue.toLocaleString()}
                    </span>
                  </Button>
                </CardContent>
              </Card>

              <Card className="py-4 gap-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Stock Alerts
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Items below minimums
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Low or Critical</span>
                    </div>
                    <span className="text-sm font-semibold text-destructive">
                      {lowStockItems}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Critical Only</span>
                    </div>
                    <span className="text-sm font-semibold text-destructive">
                      {criticalItems}
                    </span>
                  </Button>
                </CardContent>
              </Card>

              <Card className="py-4 gap-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Fuel Snapshot
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Diesel stock health
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Fuel className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Diesel Stock</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold">
                        {dieselStock} L
                      </span>
                      <Badge
                        variant={dieselBelowMin ? "destructive" : "secondary"}
                      >
                        {dieselBelowMin ? "Below Min" : "On Target"}
                      </Badge>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Minus className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Variance to Min</span>
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        dieselVariance < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {dieselVariance >= 0 ? "+" : ""}
                      {dieselVariance} L
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="py-4 gap-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Reorder Alerts
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Items below minimum stock
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {mockInventory.filter(
                    (item) =>
                      item.status === "low" || item.status === "critical",
                  ).length === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                      disabled
                    >
                      No low stock items
                    </Button>
                  ) : (
                    mockInventory
                      .filter(
                        (item) =>
                          item.status === "low" || item.status === "critical",
                      )
                      .map((item) => (
                        <Button
                          key={item.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                        >
                          <div className="flex flex-col items-start text-left">
                            <span className="text-sm font-medium">
                              {item.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Current: {item.currentStock} {item.unit} | Min:{" "}
                              {item.minStock} {item.unit}
                            </span>
                          </div>
                          <Badge
                            variant={
                              item.status === "critical"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {item.status === "critical" ? "Critical" : "Low"}
                          </Badge>
                        </Button>
                      ))
                  )}
                </CardContent>
              </Card>

              <Card className="py-4 gap-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Recent Movements
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Last 4 transactions
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {mockRecentMovements.map((movement) => (
                    <Button
                      key={movement.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                    >
                      <div className="flex items-start gap-2 text-left">
                        {movement.type === "issue" ? (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        ) : (
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {movement.item}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {movement.type === "issue"
                              ? "Issued to"
                              : "Received to"}
                            : {movement.issuedTo} | {movement.requestedBy}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant={
                            movement.type === "issue"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {movement.type === "issue" ? "Issue" : "Receipt"}
                        </Badge>
                        <span
                          className={`text-xs font-medium ${
                            movement.type === "issue" ? "text-destructive" : ""
                          }`}
                        >
                          {movement.type === "issue" ? "-" : "+"}
                          {movement.quantity} {movement.unit}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {movement.timestamp}
                        </span>
                      </div>
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Inventory View */}
        <TabsContent value="inventory" className="mt-0 space-y-6">
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
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex gap-4 mb-4">
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={activeSiteId || undefined} onValueChange={handleSiteChange}>
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
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
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

              {/* Inventory Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium">
                        Code
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        Item Name
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        Category
                      </th>
                      <th className="text-right p-3 text-sm font-medium">
                        Current Stock
                      </th>
                      <th className="text-right p-3 text-sm font-medium">
                        Min
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        Location
                      </th>
                      <th className="text-right p-3 text-sm font-medium">
                        Value
                      </th>
                      <th className="text-center p-3 text-sm font-medium">
                        Status
                      </th>
                      <th className="text-right p-3 text-sm font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryLoading ? (
                      <tr>
                        <td colSpan={9} className="p-3">
                          <Skeleton className="h-10 w-full" />
                        </td>
                      </tr>
                    ) : filteredInventory.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-3 text-sm text-muted-foreground">
                          No inventory items found.
                        </td>
                      </tr>
                    ) : (
                      filteredInventory.map((item) => {
                        const isLow =
                          item.minStock !== null &&
                          item.minStock !== undefined &&
                          item.currentStock <= item.minStock;
                        return (
                          <tr key={item.id} className="border-b hover:bg-muted/60">
                            <td className="p-3 text-sm font-mono">{item.itemCode}</td>
                            <td className="p-3 text-sm font-medium">{item.name}</td>
                            <td className="p-3 text-sm">{item.category}</td>
                            <td className="p-3 text-sm text-right font-medium">
                              {item.currentStock} {item.unit}
                            </td>
                            <td className="p-3 text-sm text-right text-muted-foreground">
                              {item.minStock !== null && item.minStock !== undefined
                                ? `${item.minStock} ${item.unit}`
                                : "-"}
                            </td>
                            <td className="p-3 text-sm">{item.location?.name ?? "-"}</td>
                            <td className="p-3 text-sm text-right">
                              {item.unitCost !== null && item.unitCost !== undefined
                                ? `$${(item.currentStock * item.unitCost).toFixed(2)}`
                                : "-"}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  isLow ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"
                                }`}
                              >
                                {isLow ? "Low" : "OK"}
                              </span>
                            </td>
                            <td className="p-3 text-right">
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
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <Sheet open={inventoryFormOpen} onOpenChange={handleInventoryOpenChange}>
                <SheetContent className="w-full sm:max-w-lg p-6">
                  <SheetHeader>
                    <SheetTitle>
                      {editingItemId ? "Edit Item" : "Add Inventory Item"}
                    </SheetTitle>
                    <SheetDescription>Manage consumables and stock details.</SheetDescription>
                  </SheetHeader>
                  <form onSubmit={handleInventorySubmit} className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-2">Item Code *</label>
                        <Input
                          value={inventoryForm.itemCode}
                          onChange={handleInventoryChange("itemCode")}
                          placeholder="CONS-001"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Name *</label>
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
                        <label className="block text-sm font-medium mb-2">Category *</label>
                        <Select
                          value={inventoryForm.category}
                          onValueChange={handleInventorySelect("category")}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CONSUMABLES">Consumables</SelectItem>
                            <SelectItem value="FUEL">Fuel</SelectItem>
                            <SelectItem value="SPARES">Spares</SelectItem>
                            <SelectItem value="PPE">PPE</SelectItem>
                            <SelectItem value="REAGENTS">Reagents</SelectItem>
                            <SelectItem value="OTHER">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Site *</label>
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
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-2">Location *</label>
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
                              {stockLocations.map((location) => (
                                <SelectItem key={location.id} value={location.id}>
                                  {location.name}
                                </SelectItem>
                              ))}
                              <SelectItem value="__add_location__">
                                + Add new location
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Unit *</label>
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
                        <label className="block text-sm font-medium mb-2">Current Stock</label>
                        <Input
                          type="number"
                          min="0"
                          value={inventoryForm.currentStock}
                          onChange={handleInventoryChange("currentStock")}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Unit Cost</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={inventoryForm.unitCost}
                          onChange={handleInventoryChange("unitCost")}
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-2">Min Stock</label>
                        <Input
                          type="number"
                          min="0"
                          value={inventoryForm.minStock}
                          onChange={handleInventoryChange("minStock")}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Max Stock</label>
                        <Input
                          type="number"
                          min="0"
                          value={inventoryForm.maxStock}
                          onChange={handleInventoryChange("maxStock")}
                          placeholder="0"
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

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Stock Locations</CardTitle>
                  <CardDescription>Manage store rooms and storage bays.</CardDescription>
                </div>
                <Button size="sm" onClick={() => openNewLocation()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Location
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {stockLocationsAllLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : stockLocationsAll.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No stock locations found for this site.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium">
                          Location
                        </th>
                        <th className="text-center p-3 text-sm font-medium">
                          Status
                        </th>
                        <th className="text-right p-3 text-sm font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockLocationsAll.map((location) => (
                        <tr
                          key={location.id}
                          className="border-b hover:bg-muted/60"
                        >
                          <td className="p-3 text-sm font-medium">
                            {location.name}
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              variant={location.isActive ? "secondary" : "destructive"}
                            >
                              {location.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Sheet open={locationFormOpen} onOpenChange={handleLocationOpenChange}>
            <SheetContent className="w-full sm:max-w-md p-6">
              <SheetHeader>
                <SheetTitle>
                  {editingLocationId ? "Edit Location" : "Add Stock Location"}
                </SheetTitle>
                <SheetDescription>Store rooms, bays, and bins.</SheetDescription>
              </SheetHeader>
              <form onSubmit={handleLocationSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Location Name *</label>
                  <Input
                    value={locationForm.name}
                    onChange={handleLocationNameChange}
                    placeholder="Main Store"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Site *</label>
                  {sitesLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select
                      value={locationForm.siteId || undefined}
                      onValueChange={handleLocationSiteChange}
                      disabled={!!editingLocationId}
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
                  <label className="block text-sm font-medium mb-2">Status</label>
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
        </TabsContent>

        {/* Fuel Ledger View */}
        <TabsContent value="fuel" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Fuel className="h-5 w-5 text-orange-600" />
                    Fuel Ledger
                  </CardTitle>
                  <CardDescription>
                    Diesel receipts and issues with running balance
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Current Balance */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Current Diesel Stock
                    </p>
                    <p className="text-3xl font-bold text-orange-600">
                      450 litres
                    </p>
                    <p className="text-sm text-red-600 mt-1">
                      ⚠️ Below minimum level (500L)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Variance</p>
                    <p className="text-xl font-medium text-red-600">-50 L</p>
                  </div>
                </div>
              </div>

              {/* Fuel Ledger Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium">
                        Date
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        Type
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        Equipment/Supplier
                      </th>
                      <th className="text-right p-3 text-sm font-medium">
                        Quantity
                      </th>
                      <th className="text-right p-3 text-sm font-medium">
                        Opening
                      </th>
                      <th className="text-right p-3 text-sm font-medium">
                        Closing
                      </th>
                      <th className="text-left p-3 text-sm font-medium">
                        Authorized By
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockFuelLedger.map((entry, index) => (
                      <tr key={index} className="border-b hover:bg-muted/60">
                        <td className="p-3 text-sm">{entry.date}</td>
                        <td className="p-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              entry.type === "receipt"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {entry.type === "receipt" ? "Receipt" : "Issue"}
                          </span>
                        </td>
                        <td className="p-3 text-sm">
                          {entry.type === "receipt"
                            ? entry.supplier
                            : entry.equipment}
                        </td>
                        <td
                          className={`p-3 text-sm text-right font-medium ${
                            entry.type === "receipt"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {entry.type === "receipt" ? "+" : "-"}
                          {entry.quantity}L
                        </td>
                        <td className="p-3 text-sm text-right">
                          {entry.opening}L
                        </td>
                        <td className="p-3 text-sm text-right font-medium">
                          {entry.closing}L
                        </td>
                        <td className="p-3 text-sm">
                          {entry.type === "receipt"
                            ? entry.receivedBy
                            : entry.approvedBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Issue Stock Form */}
        <TabsContent value="issue" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Issue Stock</CardTitle>
              <CardDescription>
                Issue items to equipment or sections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Date *
                    </label>
                    <Input
                      type="date"
                      defaultValue={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Site *
                    </label>
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
                    <label className="block text-sm font-medium mb-2">
                      Item *
                    </label>
                    {inventoryLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select value={issueItemId || undefined} onValueChange={handleIssueItemChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select item..." />
                        </SelectTrigger>
                        <SelectContent>
                          {inventoryItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} ({item.currentStock} {item.unit} available)
                            </SelectItem>
                          ))}
                          <SelectItem value="__add_item__">+ Add new item</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Quantity *
                    </label>
                    <Input type="number" placeholder="e.g., 50" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Issued To (Equipment/Section) *
                    </label>
                    <Input placeholder="e.g., Generator 1, Mill Section" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Requested By *
                    </label>
                    {employeesLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select>
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
                  <label className="block text-sm font-medium mb-2">
                    Approved By
                  </label>
                  {employeesLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select>
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
                  <label className="block text-sm font-medium mb-2">
                    Notes
                  </label>
                  <Textarea
                    placeholder="Additional information about this issue..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-3">
                  <Button className="bg-orange-600 hover:bg-orange-700">
                    Submit Issue
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => changeView("dashboard")}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receive Stock Form */}
        <TabsContent value="receive" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Receive Stock</CardTitle>
              <CardDescription>Record new stock receipts</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Date *
                    </label>
                    <Input
                      type="date"
                      defaultValue={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Site *
                    </label>
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
                    <label className="block text-sm font-medium mb-2">
                      Item *
                    </label>
                    {inventoryLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select value={receiveItemId || undefined} onValueChange={handleReceiveItemChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select item..." />
                        </SelectTrigger>
                        <SelectContent>
                          {inventoryItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} (Current: {item.currentStock} {item.unit})
                            </SelectItem>
                          ))}
                          <SelectItem value="__add_item__">+ Add new item</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Quantity *
                    </label>
                    <Input type="number" placeholder="e.g., 1500" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Supplier *
                    </label>
                    <Input placeholder="Supplier name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Invoice/Delivery Number
                    </label>
                    <Input placeholder="e.g., INV-2401" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Unit Cost
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Cost per unit"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Received By *
                    </label>
                    {employeesLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select>
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
                  <label className="block text-sm font-medium mb-2">
                    Notes
                  </label>
                  <Textarea
                    placeholder="Delivery notes, condition, etc..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-3">
                  <Button className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Submit Receipt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => changeView("dashboard")}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
