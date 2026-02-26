"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NumberChart } from "@rtcamp/frappe-ui-react";
import { useRouter, useSearchParams } from "next/navigation";
import { differenceInMinutes, format } from "date-fns";
import {
  Download,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from "@/lib/icons";

import { MaintenanceShell } from "@/components/maintenance/maintenance-shell";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchEmployees,
  fetchEquipment,
  fetchSites,
  fetchStockLocations,
  fetchWorkOrders,
} from "@/lib/api";
import { buildNumberMetricConfig } from "@/lib/charts/frappe-config-builders";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import { EmployeePosition } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReservedId } from "@/hooks/use-reserved-id";

export const maintenanceViews = [
  "dashboard",
  "equipment",
  "work-orders",
  "breakdown",
  "schedule",
] as const;

export type MaintenanceView = (typeof maintenanceViews)[number];

const maintenanceRoutes: Record<MaintenanceView, string> = {
  dashboard: "/maintenance",
  equipment: "/maintenance/equipment",
  "work-orders": "/maintenance/work-orders",
  breakdown: "/maintenance/breakdown",
  schedule: "/maintenance/schedule",
};

const equipmentCategories = [
  "CRUSHER",
  "MILL",
  "PUMP",
  "GENERATOR",
  "VEHICLE",
  "OTHER",
] as const;
const measurementUnits = ["tonnes", "trips", "wheelbarrows"] as const;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return format(new Date(value), "yyyy-MM-dd");
};

const getDowntimeHours = (start: string, end?: string | null) => {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const minutes = Math.max(0, differenceInMinutes(endDate, startDate));
  return (minutes / 60).toFixed(1);
};

const formatDateInput = (value?: string | null) => {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd");
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  return format(new Date(value), "yyyy-MM-dd HH:mm");
};

const buildEquipmentQrPayload = (item: {
  id: string;
  equipmentCode: string;
  name: string;
  category: string;
  siteId?: string;
  locationId: string;
  numberOfItems: number;
}) =>
  JSON.stringify({
    type: "equipment-item",
    version: 1,
    id: item.id,
    equipmentCode: item.equipmentCode,
    name: item.name,
    category: item.category,
    siteId: item.siteId ?? "",
    locationId: item.locationId,
    numberOfItems: item.numberOfItems,
  });

const buildQrImageUrl = (payload: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(payload)}`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function MaintenanceContent({
  activeView,
}: {
  activeView: MaintenanceView;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const equipmentPdfRef = useRef<HTMLDivElement | null>(null);
  const workOrdersPdfRef = useRef<HTMLDivElement | null>(null);
  const schedulePdfRef = useRef<HTMLDivElement | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(
    () => searchParams.get("siteId") ?? "",
  );
  const [breakdownForm, setBreakdownForm] = useState({
    equipmentId: "",
    issue: "",
    downtimeStart: "",
    technicianId: "",
  });
  const [breakdownFormOpen, setBreakdownFormOpen] = useState(false);
  const [breakdownNestedTarget, setBreakdownNestedTarget] = useState<
    "equipment" | "technician" | null
  >(null);
  const [siteFormOpen, setSiteFormOpen] = useState(false);
  const [technicianFormOpen, setTechnicianFormOpen] = useState(false);
  const [siteForm, setSiteForm] = useState({
    name: "",
    code: "",
    location: "",
    measurementUnit: "tonnes",
  });
  const [technicianForm, setTechnicianForm] = useState({
    name: "",
    phone: "",
    nextOfKinName: "",
    nextOfKinPhone: "",
    passportPhotoUrl: "",
    villageOfOrigin: "",
  });
  const [equipmentFormOpen, setEquipmentFormOpen] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(
    null,
  );
  const [qrPreviewEquipment, setQrPreviewEquipment] = useState<{
    id: string;
    equipmentCode: string;
    name: string;
    category: string;
    siteId?: string;
    site?: { name: string; code: string };
    locationId: string;
    location?: { id: string; code: string; name: string };
    numberOfItems: number;
  } | null>(null);
  const [equipmentForm, setEquipmentForm] = useState({
    equipmentCode: "",
    name: "",
    category: "OTHER",
    siteId: "",
    locationId: "",
    numberOfItems: "1",
    lastServiceDate: "",
    nextServiceDue: "",
    serviceHours: "",
    serviceDays: "",
    isActive: true,
  });

  const changeView = (view: MaintenanceView) => {
    router.push(maintenanceRoutes[view]);
  };

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = selectedSiteId || sites?.[0]?.id || "";
  const createdWorkOrderId = searchParams.get("createdId");
  const activeSiteName =
    sites?.find((site) => site.id === activeSiteId)?.name ??
    sites?.[0]?.name ??
    "All sites";
  const {
    reservedId: reservedSiteCode,
    isReserving: reservingSiteCode,
    error: reserveSiteCodeError,
  } = useReservedId({
    entity: "SITE",
    enabled: siteFormOpen,
  });
  const {
    reservedId: reservedEquipmentCode,
    isReserving: reservingEquipmentCode,
    error: reserveEquipmentCodeError,
  } = useReservedId({
    entity: "EQUIPMENT",
    enabled:
      equipmentFormOpen &&
      !editingEquipmentId &&
      Boolean(equipmentForm.siteId),
    siteId: equipmentForm.siteId || undefined,
  });

  const {
    data: equipmentData,
    isLoading: equipmentLoading,
    error: equipmentError,
  } = useQuery({
    queryKey: ["equipment", activeSiteId],
    queryFn: () => fetchEquipment({ siteId: activeSiteId, limit: 200 }),
    enabled: !!activeSiteId,
  });

  const {
    data: workOrdersData,
    isLoading: workOrdersLoading,
    error: workOrdersError,
  } = useQuery({
    queryKey: ["work-orders", activeSiteId],
    queryFn: () => fetchWorkOrders({ siteId: activeSiteId, limit: 200 }),
    enabled: !!activeSiteId,
  });

  const stockLocationSiteId = equipmentForm.siteId || activeSiteId;
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

  const {
    data: employeesData,
    isLoading: employeesLoading,
    error: employeesError,
  } = useQuery({
    queryKey: ["employees", "technicians"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const equipment = equipmentData?.data ?? [];
  const workOrders = workOrdersData?.data ?? [];
  const stockLocations = stockLocationsData?.data ?? [];
  const technicians = employeesData?.data ?? [];
  const hasSites = (sites?.length ?? 0) > 0;
  const hasEquipment = equipment.length > 0;
  const hasTechnicians = technicians.length > 0;
  const equipmentExportDisabled = equipmentLoading || equipment.length === 0;
  const workOrdersExportDisabled = workOrdersLoading || workOrders.length === 0;
  const qrPreviewPayload = qrPreviewEquipment
    ? buildEquipmentQrPayload(qrPreviewEquipment)
    : "";
  const qrPreviewImageUrl = qrPreviewPayload ? buildQrImageUrl(qrPreviewPayload) : "";

  const resetEquipmentForm = (
    overrides: Partial<typeof equipmentForm> = {},
  ) => {
    setEquipmentForm({
      equipmentCode: "",
      name: "",
      category: "OTHER",
      siteId: "",
      locationId: "",
      numberOfItems: "1",
      lastServiceDate: "",
      nextServiceDue: "",
      serviceHours: "",
      serviceDays: "",
      isActive: true,
      ...overrides,
    });
  };

  const resetBreakdownForm = (
    overrides: Partial<typeof breakdownForm> = {},
  ) => {
    setBreakdownForm({
      equipmentId: "",
      issue: "",
      downtimeStart: "",
      technicianId: "",
      ...overrides,
    });
  };

  const resetSiteForm = (overrides: Partial<typeof siteForm> = {}) => {
    setSiteForm({
      name: "",
      code: "",
      location: "",
      measurementUnit: "tonnes",
      ...overrides,
    });
  };

  const resetTechnicianForm = (
    overrides: Partial<typeof technicianForm> = {},
  ) => {
    setTechnicianForm({
      name: "",
      phone: "",
      nextOfKinName: "",
      nextOfKinPhone: "",
      passportPhotoUrl: "",
      villageOfOrigin: "",
      ...overrides,
    });
  };

  const toOptionalNumber = (value: string) => {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const toRequiredInteger = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed;
  };

  const openBreakdownForm = () => {
    if (!selectedSiteId && sites?.[0]?.id) {
      setSelectedSiteId(sites[0].id);
    }
    setBreakdownFormOpen(true);
  };

  const openSiteForm = () => {
    resetSiteForm();
    setSiteFormOpen(true);
  };

  const openTechnicianForm = () => {
    resetTechnicianForm();
    setTechnicianFormOpen(true);
  };

  const openNewEquipmentForm = () => {
    const defaultSiteId = selectedSiteId || sites?.[0]?.id || "";
    setEditingEquipmentId(null);
    resetEquipmentForm({ siteId: defaultSiteId });
    setEquipmentFormOpen(true);
  };

  const openEditEquipmentForm = (item: (typeof equipment)[number]) => {
    setEditingEquipmentId(item.id);
    resetEquipmentForm({
      equipmentCode: item.equipmentCode ?? "",
      name: item.name ?? "",
      category: item.category ?? "OTHER",
      siteId: item.siteId ?? selectedSiteId,
      locationId: item.locationId ?? "",
      numberOfItems: String(item.numberOfItems ?? 1),
      lastServiceDate: formatDateInput(item.lastServiceDate),
      nextServiceDue: formatDateInput(item.nextServiceDue),
      serviceHours:
        item.serviceHours !== null && item.serviceHours !== undefined
          ? String(item.serviceHours)
          : "",
      serviceDays:
        item.serviceDays !== null && item.serviceDays !== undefined
          ? String(item.serviceDays)
          : "",
      isActive: item.isActive,
    });
    setEquipmentFormOpen(true);
  };

  const handleEquipmentChange =
    (field: keyof typeof equipmentForm) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEquipmentForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSiteFilterChange = (value: string) => {
    if (value === "__add_site__") {
      openSiteForm();
      return;
    }
    setSelectedSiteId(value);
  };

  const handleEquipmentSelect =
    (field: "category" | "siteId") => (value: string) => {
      setEquipmentForm((prev) => ({
        ...prev,
        [field]: value,
        ...(field === "siteId"
          ? {
              locationId: "",
              ...(!editingEquipmentId ? { equipmentCode: "" } : {}),
            }
          : {}),
      }));
    };

  const handleEquipmentSiteSelect = (value: string) => {
    if (value === "__add_site__") {
      openSiteForm();
      return;
    }
    handleEquipmentSelect("siteId")(value);
  };

  const handleBreakdownEquipmentSelect = (value: string) => {
    if (value === "__add_equipment__") {
      setBreakdownNestedTarget("equipment");
      openNewEquipmentForm();
      return;
    }
    setBreakdownForm((prev) => ({ ...prev, equipmentId: value }));
  };

  const handleBreakdownTechnicianSelect = (value: string) => {
    if (value === "__add_technician__") {
      setBreakdownNestedTarget("technician");
      openTechnicianForm();
      return;
    }
    setBreakdownForm((prev) => ({ ...prev, technicianId: value }));
  };

  const handleSiteFormChange =
    (field: keyof typeof siteForm) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSiteForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSiteUnitChange = (value: string) => {
    setSiteForm((prev) => ({ ...prev, measurementUnit: value }));
  };

  const handleTechnicianChange =
    (field: keyof typeof technicianForm) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTechnicianForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleEquipmentStatus = (value: string) => {
    setEquipmentForm((prev) => ({ ...prev, isActive: value === "active" }));
  };

  const handleEquipmentOpenChange = (open: boolean) => {
    setEquipmentFormOpen(open);
    if (!open) {
      setEditingEquipmentId(null);
      resetEquipmentForm();
      if (breakdownNestedTarget === "equipment") {
        setBreakdownNestedTarget(null);
      }
    }
  };

  const handleBreakdownOpenChange = (open: boolean) => {
    setBreakdownFormOpen(open);
    if (!open) {
      resetBreakdownForm();
      setBreakdownNestedTarget(null);
    }
  };

  const handleSiteOpenChange = (open: boolean) => {
    setSiteFormOpen(open);
    if (!open) {
      resetSiteForm();
    }
  };

  const handleTechnicianOpenChange = (open: boolean) => {
    setTechnicianFormOpen(open);
    if (!open) {
      resetTechnicianForm();
      if (breakdownNestedTarget === "technician") {
        setBreakdownNestedTarget(null);
      }
    }
  };

  const createEquipmentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ id: string }>("/api/equipment", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (equipment) => {
      toast({
        title: "Equipment added",
        description: "Equipment saved to the register.",
        variant: "success",
      });
      if (breakdownNestedTarget === "equipment" && equipment?.id) {
        setBreakdownForm((prev) => ({ ...prev, equipmentId: equipment.id }));
        setBreakdownNestedTarget(null);
      }
      setEquipmentFormOpen(false);
      resetEquipmentForm();
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to add equipment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      data: Record<string, unknown>;
    }) =>
      fetchJson(`/api/equipment/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      toast({
        title: "Equipment updated",
        description: "Changes saved successfully.",
        variant: "success",
      });
      setEquipmentFormOpen(false);
      setEditingEquipmentId(null);
      resetEquipmentForm();
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update equipment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/equipment/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Equipment deleted",
        description: "Equipment removed from the register.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to delete equipment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const createSiteMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      code?: string;
      location?: string;
      measurementUnit?: string;
    }) =>
      fetchJson<{ id: string }>("/api/sites", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (site) => {
      toast({
        title: "Site added",
        description: "New site is ready for maintenance tracking.",
        variant: "success",
      });
      setSelectedSiteId(site.id);
      if (equipmentFormOpen) {
        setEquipmentForm((prev) => ({ ...prev, siteId: site.id, locationId: "" }));
      }
      setSiteFormOpen(false);
      resetSiteForm();
      queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to add site",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const createTechnicianMutation = useMutation({
    mutationFn: async (payload: typeof technicianForm) =>
      fetchJson<{ id: string }>("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          position: "ENGINEERS" as EmployeePosition,
        }),
      }),
    onSuccess: (technician) => {
      toast({
        title: "Technician added",
        description: "Technician is now available for work orders.",
        variant: "success",
      });
      if (breakdownNestedTarget === "technician" && technician?.id) {
        setBreakdownForm((prev) => ({ ...prev, technicianId: technician.id }));
        setBreakdownNestedTarget(null);
      }
      setTechnicianFormOpen(false);
      resetTechnicianForm();
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to add technician",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const handleEquipmentSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const resolvedEquipmentCode = editingEquipmentId
      ? equipmentForm.equipmentCode
      : reservedEquipmentCode;
    const numberOfItems = toRequiredInteger(equipmentForm.numberOfItems);

    if (
      !equipmentForm.name.trim() ||
      !equipmentForm.siteId ||
      !equipmentForm.locationId
    ) {
      toast({
        title: "Missing details",
        description: "Name, site, and location are required.",
        variant: "destructive",
      });
      return;
    }

    if (!numberOfItems || numberOfItems < 1) {
      toast({
        title: "Invalid item count",
        description: "Number of items must be an integer of 1 or more.",
        variant: "destructive",
      });
      return;
    }

    if (!editingEquipmentId && !resolvedEquipmentCode.trim()) {
      toast({
        title: "Unable to reserve equipment code",
        description:
          reserveEquipmentCodeError ??
          "Please wait for the equipment code reservation to complete.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: equipmentForm.name.trim(),
      category: equipmentForm.category,
      siteId: equipmentForm.siteId,
      locationId: equipmentForm.locationId,
      numberOfItems,
      lastServiceDate: equipmentForm.lastServiceDate || undefined,
      nextServiceDue: equipmentForm.nextServiceDue || undefined,
      serviceHours: toOptionalNumber(equipmentForm.serviceHours),
      serviceDays: toOptionalNumber(equipmentForm.serviceDays),
      isActive: equipmentForm.isActive,
    };

    if (editingEquipmentId) {
      updateEquipmentMutation.mutate({ id: editingEquipmentId, data: payload });
    } else {
      createEquipmentMutation.mutate({
        ...payload,
        equipmentCode: resolvedEquipmentCode.trim(),
      });
    }
  };

  const handleEquipmentDelete = (id: string) => {
    if (!window.confirm("Delete this equipment?")) return;
    deleteEquipmentMutation.mutate(id);
  };

  const handleQrPreviewOpenChange = (open: boolean) => {
    if (!open) setQrPreviewEquipment(null);
  };

  const handleQrPrint = () => {
    if (!qrPreviewEquipment) return;
    const payload = buildEquipmentQrPayload(qrPreviewEquipment);
    const imageUrl = buildQrImageUrl(payload);
    const printWindow = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=460,height=640",
    );

    if (!printWindow) {
      toast({
        title: "Unable to open print preview",
        description: "Allow popups and try again.",
        variant: "destructive",
      });
      return;
    }

    const locationName = qrPreviewEquipment.location?.name ?? "-";
    const siteName = qrPreviewEquipment.site?.name ?? "-";

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Equipment QR Label</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #111827; }
            .label { border: 1px solid #d1d5db; border-radius: 12px; padding: 16px; max-width: 380px; margin: 0 auto; }
            .meta { margin: 0 0 10px; font-size: 12px; line-height: 1.45; }
            .meta strong { display: inline-block; min-width: 95px; }
            .qr-wrap { display: flex; justify-content: center; margin: 12px 0; }
            .qr { width: 260px; height: 260px; object-fit: contain; }
            .payload { margin-top: 8px; font-size: 10px; word-break: break-all; color: #4b5563; }
            @media print { body { padding: 0; } .label { border: none; max-width: 100%; } }
          </style>
        </head>
        <body>
          <div class="label">
            <p class="meta"><strong>Code:</strong> ${escapeHtml(qrPreviewEquipment.equipmentCode)}</p>
            <p class="meta"><strong>Name:</strong> ${escapeHtml(qrPreviewEquipment.name)}</p>
            <p class="meta"><strong>Site:</strong> ${escapeHtml(siteName)}</p>
            <p class="meta"><strong>Location:</strong> ${escapeHtml(locationName)}</p>
            <p class="meta"><strong>Items:</strong> ${escapeHtml(String(qrPreviewEquipment.numberOfItems))}</p>
            <div class="qr-wrap">
              <img id="qr-image" class="qr" src="${imageUrl}" alt="QR code" />
            </div>
            <div class="payload">${escapeHtml(payload)}</div>
          </div>
          <script>
            (function () {
              var img = document.getElementById("qr-image");
              var printed = false;
              function runPrint() {
                if (printed) return;
                printed = true;
                window.focus();
                window.print();
                window.close();
              }
              if (!img || img.complete) {
                setTimeout(runPrint, 120);
                return;
              }
              img.addEventListener("load", function () { setTimeout(runPrint, 120); });
              img.addEventListener("error", function () { setTimeout(runPrint, 120); });
            })();
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const workOrderStatusInfo = (status: string) => {
    switch (status) {
      case "OPEN":
        return { label: "Open", variant: "destructive" as const };
      case "IN_PROGRESS":
        return { label: "In Progress", variant: "secondary" as const };
      case "COMPLETED":
        return { label: "Completed", variant: "default" as const };
      case "CANCELLED":
        return { label: "Cancelled", variant: "outline" as const };
      default:
        return { label: status, variant: "outline" as const };
    }
  };

  const equipmentStatus = (item: {
    isActive: boolean;
    nextServiceDue?: string | null;
  }) => {
    if (!item.isActive) {
      return { label: "Down", className: "bg-destructive/10 text-destructive" };
    }
    if (item.nextServiceDue && new Date(item.nextServiceDue) < new Date()) {
      return {
        label: "Needs Service",
        className: "bg-amber-100 text-amber-800",
      };
    }
    return {
      label: "Operational",
      className: "bg-emerald-100 text-emerald-800",
    };
  };

  const totalEquipment = equipment.length;
  const operationalCount = equipment.filter(
    (item) => equipmentStatus(item).label === "Operational",
  ).length;
  const downCount = equipment.filter(
    (item) => equipmentStatus(item).label === "Down",
  ).length;
  const needsServiceCount = equipment.filter(
    (item) => equipmentStatus(item).label === "Needs Service",
  ).length;
  const activeWorkOrders = workOrders.filter(
    (order) => order.status !== "COMPLETED",
  );
  const openWorkOrders = workOrders.filter(
    (order) => order.status === "OPEN" || order.status === "IN_PROGRESS",
  ).length;

  const upcomingMaintenance = useMemo(() => {
    return equipment
      .filter((item) => item.nextServiceDue)
      .map((item) => {
        const dueDate = new Date(item.nextServiceDue as string);
        const daysUntil = Math.floor(
          (dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          equipment: item,
          dueDate: format(dueDate, "yyyy-MM-dd"),
          daysUntil,
        };
      })
      .filter((item) => item.daysUntil >= 0 && item.daysUntil <= 90)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [equipment]);

  const nextPmDue =
    upcomingMaintenance.length > 0 ? upcomingMaintenance[0].daysUntil : null;
  const scheduleExportDisabled =
    equipmentLoading || upcomingMaintenance.length === 0;
  const equipmentHealthPercent =
    totalEquipment > 0
      ? Math.round((operationalCount / totalEquipment) * 100)
      : 0;
  const servicePressurePercent =
    totalEquipment > 0
      ? Math.round(((needsServiceCount + downCount) / totalEquipment) * 100)
      : 0;
  const openWorkOrderPercent =
    workOrders.length > 0
      ? Math.round((openWorkOrders / workOrders.length) * 100)
      : 0;

  const createWorkOrderMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ id?: string; createdAt?: string }>("/api/work-orders", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (workOrder) => {
      toast({
        title: "Work order created",
        description: "Breakdown logged and added to the work order list.",
        variant: "success",
      });
      setBreakdownForm((prev) => ({
        ...prev,
        equipmentId: "",
        issue: "",
        downtimeStart: "",
        technicianId: "",
      }));
      setBreakdownFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      const params = new URLSearchParams();
      if (workOrder?.id) params.set("createdId", workOrder.id);
      if (workOrder?.createdAt) params.set("createdAt", workOrder.createdAt);
      if (activeSiteId) params.set("siteId", activeSiteId);
      params.set("source", "maintenance-work-order");
      router.push(`/maintenance/work-orders?${params.toString()}`);
    },
    onError: (error) => {
      toast({
        title: "Unable to log breakdown",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateWorkOrderMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      data: Record<string, unknown>;
    }) =>
      fetchJson(`/api/work-orders/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({
        title: "Work order updated",
        description: "Work order status and details were updated.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to update work order",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteWorkOrderMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/work-orders/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({
        title: "Work order deleted",
        description: "Work order removed successfully.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to delete work order",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const handleWorkOrderStatusChange = (
    order: (typeof workOrders)[number],
    status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  ) => {
    const data: Record<string, unknown> = { status };
    if (status === "COMPLETED") {
      const workDone = window.prompt(
        "Describe work done (optional):",
        order.workDone ?? "",
      );
      if (workDone !== null && workDone.trim()) {
        data.workDone = workDone.trim();
      }
      data.downtimeEnd = new Date().toISOString();
    }
    updateWorkOrderMutation.mutate({ id: order.id, data });
  };

  const handleWorkOrderDelete = (order: (typeof workOrders)[number]) => {
    if (!window.confirm("Delete this work order? This cannot be undone.")) {
      return;
    }
    deleteWorkOrderMutation.mutate(order.id);
  };

  const handleBreakdownSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (
      !breakdownForm.equipmentId ||
      !breakdownForm.issue ||
      !breakdownForm.downtimeStart
    ) {
      toast({
        title: "Missing details",
        description: "Equipment, issue, and downtime start are required.",
        variant: "destructive",
      });
      return;
    }

    createWorkOrderMutation.mutate({
      equipmentId: breakdownForm.equipmentId,
      issue: breakdownForm.issue,
      downtimeStart: breakdownForm.downtimeStart,
      technicianId: breakdownForm.technicianId || undefined,
      status: "OPEN",
    });
  };

  const handleSiteSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!siteForm.name.trim()) {
      toast({
        title: "Missing details",
        description: "Site name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!reservedSiteCode.trim()) {
      toast({
        title: "Unable to reserve site code",
        description:
          reserveSiteCodeError ??
          "Please wait for the site code reservation to complete.",
        variant: "destructive",
      });
      return;
    }

    createSiteMutation.mutate({
      name: siteForm.name.trim(),
      code: reservedSiteCode.trim(),
      location: siteForm.location.trim() || undefined,
      measurementUnit: siteForm.measurementUnit,
    });
  };

  const handleTechnicianSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createTechnicianMutation.mutate(technicianForm);
  };

  const error =
    sitesError ||
    equipmentError ||
    workOrdersError ||
    employeesError ||
    createWorkOrderMutation.error;

  return (
    <MaintenanceShell
      activeTab={activeView}
      actions={
        <>
          <Button size="sm" onClick={openBreakdownForm}>
            <Plus className="h-4 w-4" />
            Log Breakdown
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => changeView("work-orders")}
          >
            Work Orders
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load maintenance data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {activeView === "work-orders" ? (
        <RecordSavedBanner entityLabel="work order" />
      ) : null}

      <Tabs
        value={activeView}
        onValueChange={(value) => changeView(value as MaintenanceView)}
        className="space-y-6"
      >
        <TabsContent value="dashboard" className="mt-0">
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-[1.1rem]">
                      Maintenance Command Center
                    </CardTitle>
                    <CardDescription>
                      Equipment availability, PM readiness, and active repairs by
                      site.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">{activeSiteName}</Badge>
                    <Badge
                      variant={
                        downCount > 0 || needsServiceCount > 0
                          ? "warning"
                          : "success"
                      }
                    >
                      Service Pressure: {servicePressurePercent}%
                    </Badge>
                    <Badge
                      variant={openWorkOrders > 0 ? "warning" : "success"}
                    >
                      Open Work Orders: {openWorkOrders}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border border-border/60 bg-card/70">
                    {equipmentLoading ? (
                      <Skeleton className="h-[140px] w-full" />
                    ) : (
                      <NumberChart
                        config={buildNumberMetricConfig({
                          title: "Total Equipment",
                          value: totalEquipment,
                        })}
                        subtitle={() => (
                          <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                            {totalEquipment.toLocaleString()}
                          </div>
                        )}
                      />
                    )}
                  </div>

                  <div className="rounded-md border border-border/60 bg-emerald-50/80">
                    {equipmentLoading ? (
                      <Skeleton className="h-[140px] w-full" />
                    ) : (
                      <NumberChart
                        config={buildNumberMetricConfig({
                          title: "Operational",
                          value: operationalCount,
                        })}
                        subtitle={() => (
                          <div className="flex flex-col gap-1">
                            <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                              {operationalCount.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Fleet health {equipmentHealthPercent}%
                            </div>
                          </div>
                        )}
                      />
                    )}
                  </div>

                  <div className="rounded-md border border-border/60 bg-amber-50/80">
                    {equipmentLoading ? (
                      <Skeleton className="h-[140px] w-full" />
                    ) : (
                      <NumberChart
                        config={buildNumberMetricConfig({
                          title: "Needs Service",
                          value: needsServiceCount,
                          negativeIsBetter: true,
                        })}
                        subtitle={() => (
                          <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                            {needsServiceCount.toLocaleString()}
                          </div>
                        )}
                      />
                    )}
                  </div>

                  <div className="rounded-md border border-border/60 bg-rose-50/80">
                    {equipmentLoading ? (
                      <Skeleton className="h-[140px] w-full" />
                    ) : (
                      <NumberChart
                        config={buildNumberMetricConfig({
                          title: "Equipment Down",
                          value: downCount,
                          negativeIsBetter: true,
                        })}
                        subtitle={() => (
                          <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                            {downCount.toLocaleString()}
                          </div>
                        )}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-12">
              <Card className="overflow-hidden xl:col-span-7">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="text-base">Active Work Orders</CardTitle>
                  <CardDescription>
                    Open and in-progress tasks requiring technician attention.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {workOrdersLoading ? (
                      <>
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                      </>
                    ) : activeWorkOrders.length === 0 ? (
                      <div className="surface-framed rounded-lg bg-[var(--surface-subtle)] p-3 text-sm text-muted-foreground">
                        No active work orders.
                      </div>
                    ) : (
                      activeWorkOrders.slice(0, 6).map((order) => {
                        const statusInfo = workOrderStatusInfo(order.status);
                        return (
                          <div
                            key={order.id}
                            className="surface-framed flex items-start justify-between gap-3 rounded-lg bg-[var(--surface-subtle)] p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {order.equipment.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {order.issue}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {order.equipment.equipmentCode} |{" "}
                                {formatDateTime(order.downtimeStart)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <Badge variant={statusInfo.variant}>
                                {statusInfo.label}
                              </Badge>
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                {getDowntimeHours(
                                  order.downtimeStart,
                                  order.downtimeEnd,
                                )}
                                h
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden xl:col-span-5">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="text-base">
                    Upcoming Maintenance
                  </CardTitle>
                  <CardDescription>
                    Preventive maintenance due within the next 90 days.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {equipmentLoading ? (
                      <>
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                      </>
                    ) : upcomingMaintenance.length === 0 ? (
                      <div className="surface-framed rounded-lg bg-[var(--surface-subtle)] p-3 text-sm text-muted-foreground">
                        No upcoming services.
                      </div>
                    ) : (
                      upcomingMaintenance.slice(0, 6).map((item) => (
                        <div
                          key={item.equipment.id}
                          className="surface-framed flex items-start justify-between gap-3 rounded-lg bg-[var(--surface-subtle)] p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {item.equipment.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.equipment.equipmentCode} |{" "}
                              {item.equipment.site?.code ?? "-"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-xs font-semibold">
                              {item.dueDate}
                            </span>
                            <Badge
                              variant={
                                item.daysUntil <= 14
                                  ? "danger"
                                  : item.daysUntil <= 30
                                    ? "warning"
                                    : "success"
                              }
                            >
                              {item.daysUntil} days
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Card className="overflow-hidden xl:col-span-6">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="text-base">
                    Equipment Status Mix
                  </CardTitle>
                  <CardDescription>
                    Service pressure and availability distribution.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="surface-framed space-y-1.5 rounded-lg bg-[var(--surface-subtle)] p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">
                        Operational
                      </span>
                      <span className="font-mono tabular-nums">
                        {operationalCount}/{totalEquipment}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-background">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${equipmentHealthPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="surface-framed space-y-1.5 rounded-lg bg-[var(--surface-subtle)] p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">
                        Needs Service
                      </span>
                      <span className="font-mono tabular-nums">
                        {needsServiceCount}/{totalEquipment}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-background">
                      <div
                        className="h-2 rounded-full bg-amber-500"
                        style={{
                          width: `${
                            totalEquipment > 0
                              ? Math.round(
                                  (needsServiceCount / totalEquipment) * 100,
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="surface-framed space-y-1.5 rounded-lg bg-[var(--surface-subtle)] p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">
                        Down
                      </span>
                      <span className="font-mono tabular-nums">
                        {downCount}/{totalEquipment}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-background">
                      <div
                        className="h-2 rounded-full bg-rose-500"
                        style={{
                          width: `${
                            totalEquipment > 0
                              ? Math.round((downCount / totalEquipment) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden xl:col-span-6">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="text-base">
                    Preventive Maintenance Outlook
                  </CardTitle>
                  <CardDescription>
                    Near-term PM load and work-order closure pressure.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
                  <FrappeStatCard
                    label="Upcoming PM (90 days)"
                    value={upcomingMaintenance.length}
                    valueLabel={upcomingMaintenance.length.toLocaleString()}
                  />
                  <FrappeStatCard
                    label="Next Service Due"
                    value={nextPmDue ?? 0}
                    valueLabel={nextPmDue !== null ? `${nextPmDue}d` : "None"}
                  />
                  <FrappeStatCard
                    label="Open Work Orders"
                    value={openWorkOrders}
                    valueLabel={openWorkOrders.toLocaleString()}
                  />
                  <FrappeStatCard
                    label="Open Ratio"
                    value={openWorkOrderPercent}
                    valueLabel={`${openWorkOrderPercent}%`}
                    negativeIsBetter
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="equipment" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Equipment Register</CardTitle>
                  <CardDescription>
                    All tracked equipment across sites
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={openNewEquipmentForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Equipment
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (equipmentPdfRef.current) {
                        exportElementToPdf(
                          equipmentPdfRef.current,
                          `maintenance-equipment-${activeSiteId || "all-sites"}.pdf`,
                        );
                      }
                    }}
                    disabled={equipmentExportDisabled}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={activeSiteId}
                    onValueChange={handleSiteFilterChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {hasSites ? (
                        sites?.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no_sites__" disabled>
                          No sites available
                        </SelectItem>
                      )}
                      <SelectSeparator />
                      <SelectItem
                        value="__add_site__"
                        className="sticky bottom-0 z-10 bg-popover font-semibold text-primary"
                      >
                        + Add site
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="overflow-x-auto">
                <Table className="w-full">
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Code
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Equipment Name
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Category
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Location
                      </TableHead>
                      <TableHead className="text-right p-3 text-sm font-semibold">
                        Items
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        QR Code
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Last Service
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Next Service
                      </TableHead>
                      <TableHead className="text-right p-3 text-sm font-semibold">
                        Hours
                      </TableHead>
                      <TableHead className="text-center p-3 text-sm font-semibold">
                        Status
                      </TableHead>
                      <TableHead className="text-right p-3 text-sm font-semibold">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipmentLoading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="p-3">
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : equipment.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={11}
                          className="p-3 text-sm text-muted-foreground"
                        >
                          No equipment found for this site.
                        </TableCell>
                      </TableRow>
                    ) : (
                      equipment.map((item) => {
                        const statusInfo = equipmentStatus(item);
                        return (
                          <TableRow
                            key={item.id}
                            className="border-b hover:bg-muted/60"
                          >
                            <TableCell className="p-3 text-sm font-mono">
                              {item.equipmentCode}
                            </TableCell>
                            <TableCell className="p-3 text-sm font-semibold">
                              {item.name}
                            </TableCell>
                            <TableCell className="p-3 text-sm">{item.category}</TableCell>
                            <TableCell className="p-3 text-sm">
                              {item.location?.name ?? "-"}
                            </TableCell>
                            <TableCell className="p-3 text-sm text-right font-semibold">
                              {item.numberOfItems}
                            </TableCell>
                            <TableCell className="p-3 text-sm">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2"
                                onClick={() => setQrPreviewEquipment(item)}
                              >
                                <QrCode className="h-4 w-4" />
                                Preview
                              </Button>
                            </TableCell>
                            <TableCell className="p-3 text-sm">
                              {formatDate(item.lastServiceDate)}
                            </TableCell>
                            <TableCell className="p-3 text-sm">
                              {formatDate(item.nextServiceDue)}
                            </TableCell>
                            <TableCell className="p-3 text-sm text-right font-semibold">
                              {item.serviceHours
                                ? `${item.serviceHours}h`
                                : "—"}
                            </TableCell>
                            <TableCell className="p-3 text-center">
                              <Badge className={statusInfo.className}>
                                {statusInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="p-3 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditEquipmentForm(item)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleEquipmentDelete(item.id)}
                                  disabled={deleteEquipmentMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
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

              <Dialog
                open={Boolean(qrPreviewEquipment)}
                onOpenChange={handleQrPreviewOpenChange}
              >
                <DialogContent size="md" className="w-full p-6">
                  <DialogHeader>
                    <DialogTitle>Equipment QR Label</DialogTitle>
                    <DialogDescription>
                      Preview the generated QR code and print a label.
                    </DialogDescription>
                  </DialogHeader>
                  {qrPreviewEquipment ? (
                    <div className="space-y-4">
                      <div className="rounded-md border p-4 space-y-2">
                        <p className="text-sm">
                          <span className="font-semibold">Code:</span>{" "}
                          {qrPreviewEquipment.equipmentCode}
                        </p>
                        <p className="text-sm">
                          <span className="font-semibold">Name:</span>{" "}
                          {qrPreviewEquipment.name}
                        </p>
                        <p className="text-sm">
                          <span className="font-semibold">Location:</span>{" "}
                          {qrPreviewEquipment.location?.name ?? "-"}
                        </p>
                        <p className="text-sm">
                          <span className="font-semibold">Items:</span>{" "}
                          {qrPreviewEquipment.numberOfItems}
                        </p>
                        <div className="flex justify-center py-2">
                          <img
                            src={qrPreviewImageUrl}
                            alt={`QR code for ${qrPreviewEquipment.name}`}
                            className="h-64 w-64 rounded border object-contain"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground break-all">
                          {qrPreviewPayload}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" className="flex-1" onClick={handleQrPrint}>
                          Print Label
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setQrPreviewEquipment(null)}
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>

              <Dialog
                open={equipmentFormOpen}
                onOpenChange={handleEquipmentOpenChange}
              >
                <DialogContent size="md" className="w-full p-6">
                  <DialogHeader>
                    <DialogTitle>
                      {editingEquipmentId ? "Edit Equipment" : "Add Equipment"}
                    </DialogTitle>
                    <DialogDescription>
                      Track equipment details and service windows.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={handleEquipmentSubmit}
                    className="mt-6 space-y-4"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Equipment Code *
                        </label>
                        <Input
                          value={
                            editingEquipmentId
                              ? equipmentForm.equipmentCode
                              : reservedEquipmentCode
                          }
                          readOnly
                          placeholder={
                            reservingEquipmentCode
                              ? "Reserving..."
                              : "Auto-generated"
                          }
                          required
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {editingEquipmentId
                            ? "Equipment code is immutable."
                            : reserveEquipmentCodeError ??
                              "Code is auto-generated and cannot be edited."}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Name *
                        </label>
                        <Input
                          value={equipmentForm.name}
                          onChange={handleEquipmentChange("name")}
                          placeholder="Crusher 1"
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
                          value={equipmentForm.category}
                          onValueChange={handleEquipmentSelect("category")}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {equipmentCategories.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Site *
                        </label>
                        {sitesLoading ? (
                          <Skeleton className="h-9 w-full" />
                        ) : (
                          <Select
                            value={equipmentForm.siteId || undefined}
                            onValueChange={handleEquipmentSiteSelect}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select site" />
                            </SelectTrigger>
                            <SelectContent>
                              {hasSites ? (
                                sites?.map((site) => (
                                  <SelectItem key={site.id} value={site.id}>
                                    {site.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="__no_sites__" disabled>
                                  No sites available
                                </SelectItem>
                              )}
                              <SelectSeparator />
                              <SelectItem
                                value="__add_site__"
                                className="sticky bottom-0 z-10 bg-popover font-semibold text-primary"
                              >
                                + Add site
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Location *
                        </label>
                        {stockLocationsLoading ? (
                          <Skeleton className="h-9 w-full" />
                        ) : (
                          <Select
                            value={equipmentForm.locationId || undefined}
                            onValueChange={(value) =>
                              setEquipmentForm((prev) => ({ ...prev, locationId: value }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                            <SelectContent>
                              {stockLocations.length === 0 ? (
                                <SelectItem value="__no_locations__" disabled>
                                  No active stock locations
                                </SelectItem>
                              ) : (
                                stockLocations.map((location) => (
                                  <SelectItem key={location.id} value={location.id}>
                                    {location.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Number of Items *
                        </label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={equipmentForm.numberOfItems}
                          onChange={handleEquipmentChange("numberOfItems")}
                          placeholder="1"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Last Service
                        </label>
                        <Input
                          type="date"
                          value={equipmentForm.lastServiceDate}
                          onChange={handleEquipmentChange("lastServiceDate")}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Next Service Due
                        </label>
                        <Input
                          type="date"
                          value={equipmentForm.nextServiceDue}
                          onChange={handleEquipmentChange("nextServiceDue")}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Service Hours
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={equipmentForm.serviceHours}
                          onChange={handleEquipmentChange("serviceHours")}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Service Days
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={equipmentForm.serviceDays}
                          onChange={handleEquipmentChange("serviceDays")}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2">
                        Status
                      </label>
                      <Select
                        value={equipmentForm.isActive ? "active" : "inactive"}
                        onValueChange={handleEquipmentStatus}
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
                          createEquipmentMutation.isPending ||
                          updateEquipmentMutation.isPending ||
                          (!editingEquipmentId &&
                            (reservingEquipmentCode ||
                              !reservedEquipmentCode))
                        }
                      >
                        {editingEquipmentId ? "Save Changes" : "Save Equipment"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleEquipmentOpenChange(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work-orders" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Work Orders</CardTitle>
                  <CardDescription>
                    Current breakdowns and maintenance tasks
                  </CardDescription>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <div className="w-full sm:w-64">
                    {sitesLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select
                        value={activeSiteId}
                        onValueChange={handleSiteFilterChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select site" />
                        </SelectTrigger>
                        <SelectContent>
                          {hasSites ? (
                            sites?.map((site) => (
                              <SelectItem key={site.id} value={site.id}>
                                {site.name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="__no_sites__" disabled>
                              No sites available
                            </SelectItem>
                          )}
                          <SelectSeparator />
                          <SelectItem
                            value="__add_site__"
                            className="sticky bottom-0 z-10 bg-popover font-semibold text-primary"
                          >
                            + Add site
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (workOrdersPdfRef.current) {
                        exportElementToPdf(
                          workOrdersPdfRef.current,
                          `maintenance-work-orders-${activeSiteId || "all-sites"}.pdf`,
                        );
                      }
                    }}
                    disabled={workOrdersExportDisabled}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="w-full">
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Equipment
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Issue
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Technician
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Status
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Started
                      </TableHead>
                      <TableHead className="text-right p-3 text-sm font-semibold">
                        Downtime
                      </TableHead>
                      <TableHead className="text-right p-3 text-sm font-semibold">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrdersLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="p-3">
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : workOrders.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="p-3 text-sm text-muted-foreground"
                        >
                          No work orders logged for this site.
                        </TableCell>
                      </TableRow>
                    ) : (
                      workOrders.map((order) => {
                        const statusInfo = workOrderStatusInfo(order.status);
                        return (
                          <TableRow
                            key={order.id}
                            className={`border-b hover:bg-muted/60 ${
                              createdWorkOrderId === order.id
                                ? "bg-[var(--status-success-bg)]"
                                : ""
                            }`}
                          >
                            <TableCell className="p-3 text-sm">
                              <div className="font-semibold">
                                {order.equipment.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {order.equipment.equipmentCode} |{" "}
                                {order.equipment.site.code}
                              </div>
                            </TableCell>
                            <TableCell className="p-3 text-sm">{order.issue}</TableCell>
                            <TableCell className="p-3 text-sm">
                              {order.technician?.name || "-"}
                            </TableCell>
                            <TableCell className="p-3 text-sm">
                              <Badge variant={statusInfo.variant}>
                                {statusInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="p-3 text-sm">
                              {formatDateTime(order.downtimeStart)}
                            </TableCell>
                            <TableCell className="p-3 text-sm text-right">
                              {getDowntimeHours(
                                order.downtimeStart,
                                order.downtimeEnd,
                              )}
                              h
                            </TableCell>
                            <TableCell className="p-3 text-right">
                              <div className="flex flex-wrap justify-end gap-2">
                                {order.status === "OPEN" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleWorkOrderStatusChange(
                                        order,
                                        "IN_PROGRESS",
                                      )
                                    }
                                    disabled={updateWorkOrderMutation.isPending}
                                  >
                                    Start
                                  </Button>
                                ) : null}
                                {order.status !== "COMPLETED" &&
                                order.status !== "CANCELLED" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleWorkOrderStatusChange(
                                        order,
                                        "COMPLETED",
                                      )
                                    }
                                    disabled={updateWorkOrderMutation.isPending}
                                  >
                                    Complete
                                  </Button>
                                ) : null}
                                {order.status !== "CANCELLED" &&
                                order.status !== "COMPLETED" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleWorkOrderStatusChange(
                                        order,
                                        "CANCELLED",
                                      )
                                    }
                                    disabled={updateWorkOrderMutation.isPending}
                                  >
                                    Cancel
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleWorkOrderStatusChange(order, "OPEN")
                                    }
                                    disabled={updateWorkOrderMutation.isPending}
                                  >
                                    Reopen
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleWorkOrderDelete(order)}
                                  disabled={deleteWorkOrderMutation.isPending}
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Log Breakdown</CardTitle>
              <CardDescription>
                Capture equipment downtime and create a work order.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Use the breakdown form to log failures and assign technicians.
                </p>
                <Button size="sm" onClick={openBreakdownForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log Breakdown
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <FrappeStatCard
                  label="Open Work Orders"
                  value={openWorkOrders}
                  valueLabel={openWorkOrders.toLocaleString()}
                  detail="Awaiting technician action"
                  className="border-dashed"
                />
                <FrappeStatCard
                  label="Equipment Down"
                  value={downCount}
                  valueLabel={downCount.toLocaleString()}
                  detail="Currently out of service"
                  className="border-dashed"
                  tone={downCount > 0 ? "warning" : "success"}
                  negativeIsBetter
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>PM Schedule</CardTitle>
                  <CardDescription>
                    Upcoming preventive maintenance windows
                  </CardDescription>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <div className="w-full sm:w-64">
                    {sitesLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : (
                      <Select
                        value={activeSiteId}
                        onValueChange={handleSiteFilterChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select site" />
                        </SelectTrigger>
                        <SelectContent>
                          {hasSites ? (
                            sites?.map((site) => (
                              <SelectItem key={site.id} value={site.id}>
                                {site.name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="__no_sites__" disabled>
                              No sites available
                            </SelectItem>
                          )}
                          <SelectSeparator />
                          <SelectItem
                            value="__add_site__"
                            className="sticky bottom-0 z-10 bg-popover font-semibold text-primary"
                          >
                            + Add site
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (schedulePdfRef.current) {
                        exportElementToPdf(
                          schedulePdfRef.current,
                          `maintenance-schedule-${activeSiteId || "all-sites"}.pdf`,
                        );
                      }
                    }}
                    disabled={scheduleExportDisabled}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="w-full">
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Equipment
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Category
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Site
                      </TableHead>
                      <TableHead className="text-left p-3 text-sm font-semibold">
                        Due Date
                      </TableHead>
                      <TableHead className="text-right p-3 text-sm font-semibold">
                        Days Left
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipmentLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="p-3">
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : upcomingMaintenance.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="p-3 text-sm text-muted-foreground"
                        >
                          No upcoming maintenance within the next 90 days.
                        </TableCell>
                      </TableRow>
                    ) : (
                      upcomingMaintenance.map((item) => (
                        <TableRow
                          key={item.equipment.id}
                          className="border-b hover:bg-muted/60"
                        >
                          <TableCell className="p-3 text-sm">
                            <div className="font-semibold">
                              {item.equipment.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.equipment.equipmentCode}
                            </div>
                          </TableCell>
                          <TableCell className="p-3 text-sm">
                            {item.equipment.category}
                          </TableCell>
                          <TableCell className="p-3 text-sm">
                            {item.equipment.site.code}
                          </TableCell>
                          <TableCell className="p-3 text-sm">{item.dueDate}</TableCell>
                          <TableCell className="p-3 text-sm text-right">
                            <Badge
                              variant={
                                item.daysUntil < 14
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {item.daysUntil} days
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="absolute left-[-9999px] top-0">
        <div ref={equipmentPdfRef}>
          <PdfTemplate
            title="Equipment Register"
            subtitle={activeSiteName}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Total equipment", value: String(totalEquipment) },
              { label: "Operational", value: String(operationalCount) },
              { label: "Down", value: String(downCount) },
              { label: "Needs service", value: String(needsServiceCount) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Code</th>
                  <th className="py-2">Equipment</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Location</th>
                  <th className="py-2 text-right">Items</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Last Service</th>
                  <th className="py-2">Next Service</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((item) => {
                  const statusInfo = equipmentStatus(item);
                  return (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 font-mono">{item.equipmentCode}</td>
                      <td className="py-2 font-semibold">{item.name}</td>
                      <td className="py-2">{item.category}</td>
                      <td className="py-2">{item.location?.name ?? "-"}</td>
                      <td className="py-2 text-right">{item.numberOfItems}</td>
                      <td className="py-2">{item.site?.code ?? "-"}</td>
                      <td className="py-2">
                        {formatDate(item.lastServiceDate)}
                      </td>
                      <td className="py-2">
                        {formatDate(item.nextServiceDue)}
                      </td>
                      <td className="py-2">{statusInfo.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PdfTemplate>
        </div>

        <div ref={workOrdersPdfRef}>
          <PdfTemplate
            title="Work Orders"
            subtitle={activeSiteName}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Total orders", value: String(workOrders.length) },
              { label: "Open orders", value: String(openWorkOrders) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Equipment</th>
                  <th className="py-2">Issue</th>
                  <th className="py-2">Technician</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Started</th>
                  <th className="py-2 text-right">Downtime</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.map((order) => {
                  const statusInfo = workOrderStatusInfo(order.status);
                  return (
                    <tr key={order.id} className="border-b border-gray-100">
                      <td className="py-2">
                        <div className="font-semibold">
                          {order.equipment.name}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {order.equipment.equipmentCode} |{" "}
                          {order.equipment.site.code}
                        </div>
                      </td>
                      <td className="py-2">{order.issue}</td>
                      <td className="py-2">{order.technician?.name || "-"}</td>
                      <td className="py-2">{statusInfo.label}</td>
                      <td className="py-2">
                        {formatDateTime(order.downtimeStart)}
                      </td>
                      <td className="py-2 text-right">
                        {getDowntimeHours(
                          order.downtimeStart,
                          order.downtimeEnd,
                        )}
                        h
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PdfTemplate>
        </div>

        <div ref={schedulePdfRef}>
          <PdfTemplate
            title="PM Schedule"
            subtitle={activeSiteName}
            meta={[
              { label: "Site", value: activeSiteName },
              {
                label: "Upcoming tasks",
                value: String(upcomingMaintenance.length),
              },
              {
                label: "Next due",
                value:
                  nextPmDue !== null ? `${nextPmDue} days` : "No upcoming PM",
              },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Equipment</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Due Date</th>
                  <th className="py-2 text-right">Days Left</th>
                </tr>
              </thead>
              <tbody>
                {upcomingMaintenance.map((item) => (
                  <tr
                    key={item.equipment.id}
                    className="border-b border-gray-100"
                  >
                    <td className="py-2">
                      <div className="font-semibold">{item.equipment.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {item.equipment.equipmentCode}
                      </div>
                    </td>
                    <td className="py-2">{item.equipment.category}</td>
                    <td className="py-2">{item.equipment.site.code}</td>
                    <td className="py-2">{item.dueDate}</td>
                    <td className="py-2 text-right">{item.daysUntil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>

      <Dialog open={breakdownFormOpen} onOpenChange={handleBreakdownOpenChange}>
        <DialogContent size="md" className="w-full p-6">
          <DialogHeader>
            <DialogTitle>Log Breakdown</DialogTitle>
            <DialogDescription>
              Record downtime and create a work order.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBreakdownSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Site *
                </label>
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={activeSiteId}
                    onValueChange={handleSiteFilterChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {hasSites ? (
                        sites?.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no_sites__" disabled>
                          No sites available
                        </SelectItem>
                      )}
                      <SelectSeparator />
                      <SelectItem
                        value="__add_site__"
                        className="sticky bottom-0 z-10 bg-popover font-semibold text-primary"
                      >
                        + Add site
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Equipment *
                </label>
                {equipmentLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={breakdownForm.equipmentId || undefined}
                    onValueChange={handleBreakdownEquipmentSelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      {hasEquipment ? (
                        equipment.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.equipmentCode})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no_equipment__" disabled>
                          No equipment available
                        </SelectItem>
                      )}
                      <SelectSeparator />
                      <SelectItem
                        value="__add_equipment__"
                        className="sticky bottom-0 z-10 bg-popover font-semibold text-primary"
                      >
                        + Add equipment
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Issue *
              </label>
              <Textarea
                value={breakdownForm.issue}
                onChange={(event) =>
                  setBreakdownForm((prev) => ({
                    ...prev,
                    issue: event.target.value,
                  }))
                }
                placeholder="Describe the issue"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Downtime Start *
                </label>
                <Input
                  type="datetime-local"
                  value={breakdownForm.downtimeStart}
                  onChange={(event) =>
                    setBreakdownForm((prev) => ({
                      ...prev,
                      downtimeStart: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Technician
                </label>
                {employeesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={breakdownForm.technicianId || undefined}
                    onValueChange={handleBreakdownTechnicianSelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Assign technician" />
                    </SelectTrigger>
                    <SelectContent>
                      {hasTechnicians ? (
                        technicians.map((technician) => (
                          <SelectItem key={technician.id} value={technician.id}>
                            {technician.name} ({technician.employeeId})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no_technicians__" disabled>
                          No technicians available
                        </SelectItem>
                      )}
                      <SelectSeparator />
                      <SelectItem
                        value="__add_technician__"
                        className="sticky bottom-0 z-10 bg-popover font-semibold text-primary"
                      >
                        + Add technician
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createWorkOrderMutation.isPending}
              >
                {createWorkOrderMutation.isPending
                  ? "Saving..."
                  : "Create Work Order"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleBreakdownOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={siteFormOpen} onOpenChange={handleSiteOpenChange}>
        <DialogContent size="md" className="w-full p-6">
          <DialogHeader>
            <DialogTitle>Add Site</DialogTitle>
            <DialogDescription>
              Create a new site for maintenance tracking.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSiteSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Site Name *
                </label>
                <Input
                  value={siteForm.name}
                  onChange={handleSiteFormChange("name")}
                  placeholder="Mine Site"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Site Code *
                </label>
                <Input
                  value={reservedSiteCode}
                  readOnly
                  placeholder={reservingSiteCode ? "Reserving..." : "Auto-generated"}
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {reserveSiteCodeError ?? "Code is auto-generated and cannot be edited."}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Location
              </label>
              <Input
                value={siteForm.location}
                onChange={handleSiteFormChange("location")}
                placeholder="Location details"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Measurement Unit
              </label>
              <Select
                value={siteForm.measurementUnit}
                onValueChange={handleSiteUnitChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {measurementUnits.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={
                  createSiteMutation.isPending ||
                  reservingSiteCode ||
                  !reservedSiteCode
                }
              >
                {createSiteMutation.isPending ? "Saving..." : "Save Site"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSiteOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={technicianFormOpen}
        onOpenChange={handleTechnicianOpenChange}
      >
        <DialogContent size="md" className="w-full p-6">
          <DialogHeader>
            <DialogTitle>Add Technician</DialogTitle>
            <DialogDescription>
              Capture technician details for work orders.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTechnicianSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Name *
                </label>
                <Input
                  value={technicianForm.name}
                  onChange={handleTechnicianChange("name")}
                  placeholder="Full name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Phone *
                </label>
                <Input
                  type="tel"
                  value={technicianForm.phone}
                  onChange={handleTechnicianChange("phone")}
                  placeholder="07xx xxx xxx"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Next of Kin Name *
                </label>
                <Input
                  value={technicianForm.nextOfKinName}
                  onChange={handleTechnicianChange("nextOfKinName")}
                  placeholder="Next of kin"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Next of Kin Phone *
                </label>
                <Input
                  type="tel"
                  value={technicianForm.nextOfKinPhone}
                  onChange={handleTechnicianChange("nextOfKinPhone")}
                  placeholder="07xx xxx xxx"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Village of Origin *
                </label>
                <Input
                  value={technicianForm.villageOfOrigin}
                  onChange={handleTechnicianChange("villageOfOrigin")}
                  placeholder="Village"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Passport Photo URL *
                </label>
                <Input
                  type="url"
                  value={technicianForm.passportPhotoUrl}
                  onChange={handleTechnicianChange("passportPhotoUrl")}
                  placeholder="https://"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createTechnicianMutation.isPending}
              >
                {createTechnicianMutation.isPending
                  ? "Saving..."
                  : "Save Technician"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleTechnicianOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </MaintenanceShell>
  );
}

