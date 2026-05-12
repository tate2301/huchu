"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { fetchEmployees, fetchSites } from "@/lib/api";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  OFFLINE_ENTITIES_CHANGED_EVENT,
  OFFLINE_OUTBOX_CHANGED_EVENT,
} from "@/lib/offline/events";
import {
  ScrapMobileCard,
  ScrapMobileCardActions,
  ScrapMobileMetricStrip,
} from "@/components/scrap-metal/mobile-list-card";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { FieldHelp } from "@/components/shared/field-help";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { SplitButton } from "@/components/ui/split-button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Calendar, Pencil, Plus, Scale, Trash2, User, Wallet } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";
import type { ScrapTicketPhoto } from "@/lib/scrap-metal/attachments";
import {
  formatTicketTime,
  groupMobileRowsByDate,
} from "@/lib/scrap-metal/mobile-ticket-date-groups";
import {
  listPendingPurchaseTickets,
  type PendingPurchaseTicketRecord,
} from "@/lib/scrap-metal/offline-ticket";
import { exportTicketPdf } from "@/lib/scrap-metal/print-adapter";

type Purchase = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  category: string;
  weight: number;
  pricePerKg: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  sellerName?: string;
  sellerPhone?: string;
  notes?: string | null;
  attachments?: ScrapTicketPhoto[];
  sellerProfile?: {
    id: string;
    fullName: string;
    phone: string;
    nationalId: string;
  } | null;
  material?: { id: string; code: string; name: string; category: string } | null;
  employee: {
    id: string;
    name: string;
    employeeId: string;
  };
  site: {
    id: string;
    name: string;
    code: string;
  };
};

type PurchaseRow = Purchase & {
  source: "server" | "local";
  localTicketId?: string;
  queueStatus?: string;
  lastError?: string;
};

type MaterialOption = {
  id: string;
  code: string;
  name: string;
  category: string;
};

type PriceRecord = {
  id: string;
  materialId?: string | null;
  category: string;
  effectiveDate: string;
  pricePerKg: number;
  currency: string;
};

type SellerProfileOption = {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string;
  isActive: boolean;
};

type PurchaseForm = {
  purchaseDate: string;
  siteId: string;
  employeeId: string;
  sellerProfileId: string;
  materialId: string;
  category: string;
  weight: string;
  pricePerKg: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  overrideReason: string;
  notes: string;
  attachments: ScrapTicketPhoto[];
};

const CATEGORY_OPTIONS = ["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"];

function getEmptyForm(): PurchaseForm {
  return {
    purchaseDate: new Date().toISOString().slice(0, 16),
    siteId: "",
    employeeId: "",
    sellerProfileId: "__none",
    materialId: "__none",
    category: "MIXED",
    weight: "",
    pricePerKg: "",
    currency: "USD",
    paymentMethod: "Cash",
    paymentReference: "",
    overrideReason: "",
    notes: "",
    attachments: [],
  };
}

const PAYMENT_METHOD_OPTIONS = ["Cash", "EcoCash", "Bank Transfer", "Mobile Money", "Card", "Other"] as const;

async function uploadScrapTicketPhoto(
  file: File,
  context: "scrap-purchase-ticket-photo" | "scrap-sale-ticket-photo",
): Promise<ScrapTicketPhoto> {
  const formData = new FormData();
  formData.append("context", context);
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : "Upload failed";
    throw new Error(message);
  }

  if (!data || typeof data.url !== "string" || typeof data.contentType !== "string") {
    throw new Error("Upload response missing file metadata");
  }

  return {
    url: data.url,
    pathname: typeof data.pathname === "string" ? data.pathname : undefined,
    contentType: data.contentType,
    size: typeof data.size === "number" ? data.size : file.size,
    context,
    uploadedAt: new Date().toISOString(),
  };
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function toIsoStringOrNow(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

type ApiIssue = { message?: string };

function getApiIssueMessage(error: unknown) {
  if (!(error instanceof ApiError) || typeof error.details !== "object" || !error.details) {
    return getApiErrorMessage(error);
  }

  const payload = error.details as { details?: unknown };
  if (!Array.isArray(payload.details) || payload.details.length === 0) {
    return getApiErrorMessage(error);
  }

  const firstDetail = payload.details[0];
  if (typeof firstDetail === "string") return firstDetail;
  if (firstDetail && typeof firstDetail === "object" && "message" in firstDetail) {
    const issue = firstDetail as ApiIssue;
    if (typeof issue.message === "string" && issue.message.trim()) return issue.message;
  }

  return getApiErrorMessage(error);
}

async function fetchPurchases(): Promise<Purchase[]> {
  const response = await fetchJson<{ data: Purchase[] }>("/api/scrap-metal/purchases?limit=200");
  return response.data;
}

function findSuggestedPrice(form: PurchaseForm, prices: PriceRecord[]) {
  const purchaseDate = new Date(form.purchaseDate);
  if (Number.isNaN(purchaseDate.getTime())) return null;

  const eligible = prices
    .filter((row) => row.category === form.category && new Date(row.effectiveDate) <= purchaseDate)
    .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

  const materialSpecific =
    form.materialId !== "__none"
      ? eligible.find((row) => row.materialId === form.materialId)
      : null;

  return materialSpecific ?? eligible.find((row) => !row.materialId) ?? null;
}

function applySuggestedPrice(nextForm: PurchaseForm, prices: PriceRecord[], priceTouched: boolean) {
  if (priceTouched) return nextForm;
  const suggestion = findSuggestedPrice(nextForm, prices);
  if (!suggestion) return nextForm;
  return {
    ...nextForm,
    pricePerKg: nextForm.pricePerKg || String(suggestion.pricePerKg),
    currency: nextForm.currency || suggestion.currency,
  };
}

export default function ScrapMetalPurchasesPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { tenantKey } = useOfflineRuntime();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [form, setForm] = useState<PurchaseForm>(getEmptyForm);
  const [submitIntent, setSubmitIntent] = useState<"hold" | "finalize" | "finalize_print">("finalize");
  const [priceTouched, setPriceTouched] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  function submitWithIntent(intent: "hold" | "finalize" | "finalize_print") {
    setSubmitIntent(intent);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  const {
    reservedId: purchaseNumber,
    isReserving: reservingPurchaseNumber,
    error: reservePurchaseNumberError,
  } = useReservedId({
    entity: "SCRAP_METAL_PURCHASE",
    enabled: formOpen && !editing && Boolean(form.siteId),
    siteId: form.siteId || undefined,
  });

  const purchasesQuery = useQuery({
    queryKey: ["scrap-metal-purchases"],
    queryFn: fetchPurchases,
  });
  const sitesQuery = useQuery({
    queryKey: ["sites", "scrap-purchases"],
    queryFn: fetchSites,
  });
  const employeesQuery = useQuery({
    queryKey: ["employees", "scrap-purchases"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });
  const materialsQuery = useQuery({
    queryKey: ["scrap-materials", "purchase-form"],
    queryFn: () => fetchJson<{ data: MaterialOption[] }>("/api/scrap-metal/materials?active=true&limit=500"),
  });
  const sellerProfilesQuery = useQuery({
    queryKey: ["scrap-seller-profiles", "purchase-form"],
    queryFn: () => fetchJson<{ data: SellerProfileOption[] }>("/api/scrap-metal/sellers?active=true&limit=500"),
  });
  const pricesQuery = useQuery({
    queryKey: ["scrap-prices", "purchase-form"],
    queryFn: () => fetchJson<{ data: PriceRecord[] }>("/api/scrap-metal/pricing?limit=500"),
  });
  const localPurchasesQuery = useQuery({
    queryKey: ["scrap-local-purchases", tenantKey],
    queryFn: () => (tenantKey ? listPendingPurchaseTickets(tenantKey) : Promise.resolve([])),
  });

  const materials = useMemo(() => materialsQuery.data?.data ?? [], [materialsQuery.data?.data]);
  const sellerProfiles = useMemo(() => sellerProfilesQuery.data?.data ?? [], [sellerProfilesQuery.data?.data]);
  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const employees = useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data?.data]);
  const serverPurchases = useMemo(() => purchasesQuery.data ?? [], [purchasesQuery.data]);
  const deepLinkEditId = searchParams.get("edit");
  const siteOptions = useMemo<SearchableOption[]>(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        meta: site.code,
      })),
    [sites],
  );
  const employeeOptions = useMemo<SearchableOption[]>(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        meta: employee.employeeId,
      })),
    [employees],
  );
  const sellerOptions = useMemo<SearchableOption[]>(
    () =>
      sellerProfiles.map((sellerProfile) => ({
        value: sellerProfile.id,
        label: sellerProfile.fullName,
        description: sellerProfile.phone,
        meta: sellerProfile.nationalId,
      })),
    [sellerProfiles],
  );
  const materialOptions = useMemo<SearchableOption[]>(
    () => [
      {
        value: "__none",
        label: "Category only",
        description: "Use the selected category without a material profile.",
      },
      ...materials.map((material) => ({
        value: material.id,
        label: material.name,
        description: material.category,
        meta: material.code,
      })),
    ],
    [materials],
  );
  const selectedSellerProfile =
    sellerProfiles.find((sellerProfile) => sellerProfile.id === form.sellerProfileId) ?? null;
  const suggestedPrice = useMemo(
    () => findSuggestedPrice(form, pricesQuery.data?.data ?? []),
    [form, pricesQuery.data?.data],
  );
  const isPurchasesLoading = purchasesQuery.isLoading || localPurchasesQuery.isLoading;
  const purchases = useMemo<PurchaseRow[]>(() => {
    const serverRows = serverPurchases.map((purchase) => ({
      ...purchase,
      source: "server" as const,
    }));
    const localRows = (localPurchasesQuery.data ?? []).map((ticket: PendingPurchaseTicketRecord) => {
      const employee = employees.find((entry) => entry.id === ticket.employeeId);
      const site = sites.find((entry) => entry.id === ticket.siteId);
      const material = ticket.materialId
        ? materials.find((entry) => entry.id === ticket.materialId) ?? null
        : null;
      const sellerProfile = sellerProfiles.find((entry) => entry.id === ticket.sellerId) ?? null;
      return {
        id: `local:${ticket.id}`,
        purchaseNumber: ticket.ticketNumber,
        purchaseDate: ticket.ticketDate,
        category: ticket.category,
        weight: ticket.weight,
        pricePerKg: ticket.pricePerKg,
        totalAmount: ticket.total,
        currency: ticket.currency,
        status: ticket.status,
        paymentMethod: ticket.paymentMethod ?? null,
        paymentReference: ticket.paymentReference ?? null,
        sellerName: ticket.sellerName,
        sellerPhone: sellerProfile?.phone ?? "",
        notes: ticket.notes ?? null,
        attachments: ticket.photos,
        sellerProfile: sellerProfile
          ? {
              id: sellerProfile.id,
              fullName: sellerProfile.fullName,
              phone: sellerProfile.phone,
              nationalId: sellerProfile.nationalId,
            }
          : null,
        material,
        employee: {
          id: employee?.id ?? ticket.employeeId,
          name: employee?.name ?? "Offline buyer",
          employeeId: employee?.employeeId ?? "OFFLINE",
        },
        site: {
          id: site?.id ?? ticket.siteId,
          name: site?.name ?? "Offline site",
          code: site?.code ?? "OFF",
        },
        source: "local" as const,
        localTicketId: ticket.id,
        queueStatus: ticket.outboxStatus.replace(/_/g, " ").toLowerCase().replace(/^\w/, (char) => char.toUpperCase()),
        lastError: ticket.lastError,
      } satisfies PurchaseRow;
    });

    return [...localRows, ...serverRows].sort(
      (left, right) => new Date(right.purchaseDate).getTime() - new Date(left.purchaseDate).getTime(),
    );
  }, [
    employees,
    localPurchasesQuery.data,
    materials,
    sellerProfiles,
    serverPurchases,
    sites,
  ]);

  useEffect(() => {
    const refreshLocalRows = () => {
      queryClient.invalidateQueries({ queryKey: ["scrap-local-purchases"] });
    };

    window.addEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, refreshLocalRows);
    window.addEventListener(OFFLINE_ENTITIES_CHANGED_EVENT, refreshLocalRows);
    window.addEventListener("online", refreshLocalRows);
    return () => {
      window.removeEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, refreshLocalRows);
      window.removeEventListener(OFFLINE_ENTITIES_CHANGED_EVENT, refreshLocalRows);
      window.removeEventListener("online", refreshLocalRows);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!formOpen || editing) return;
    setForm((current) => {
      let next = current;
      if (!current.siteId && sites.length === 1) {
        next = { ...next, siteId: sites[0]?.id ?? "" };
      }
      if (!current.employeeId && employees.length === 1) {
        next = { ...next, employeeId: employees[0]?.id ?? "" };
      }
      return next;
    });
  }, [editing, employees, formOpen, sites]);

  useEffect(() => {
    if (!deepLinkEditId) return;
    if (purchasesQuery.isLoading) return;

    const purchase = serverPurchases.find((row) => row.id === deepLinkEditId);
    if (!purchase) {
      toast({
        title: "Ticket not found",
        description: "The selected draft ticket could not be loaded.",
        variant: "destructive",
      });
      router.replace("/scrap-metal/purchases");
      return;
    }

    setEditing(purchase);
    setPriceTouched(true);
    setForm({
      purchaseDate: purchase.purchaseDate.slice(0, 16),
      siteId: purchase.site.id,
      employeeId: purchase.employee.id,
      sellerProfileId: purchase.sellerProfile?.id ?? "__none",
      materialId: purchase.material?.id ?? "__none",
      category: purchase.material?.category ?? purchase.category,
      weight: String(purchase.weight),
      pricePerKg: String(purchase.pricePerKg),
      currency: purchase.currency,
      paymentMethod: purchase.paymentMethod ?? "",
      paymentReference: purchase.paymentReference ?? "",
      overrideReason: "",
      notes: purchase.notes ?? "",
      attachments: purchase.attachments ?? [],
    });
    setSubmitIntent("finalize");
    setFormOpen(true);
    router.replace("/scrap-metal/purchases");
  }, [deepLinkEditId, purchasesQuery.isLoading, router, serverPurchases, toast]);

  const saveMutation = useMutation({
    mutationFn: async (input: { payload: PurchaseForm; intent: "hold" | "finalize" | "finalize_print" }) => {
      const { payload, intent } = input;
      const hasOverride =
        suggestedPrice && Number(payload.pricePerKg || 0) !== Number(suggestedPrice.pricePerKg);
      if (hasOverride && !payload.overrideReason.trim()) {
        throw new Error("Provide an override reason when the transaction price differs from the board rate.");
      }

      const noteParts = [payload.notes.trim()];
      if (hasOverride) {
        noteParts.push(`Price override: ${payload.overrideReason.trim()}`);
      }

      const body = {
        purchaseNumber: purchaseNumber || undefined,
        purchaseDate: toIsoStringOrNow(payload.purchaseDate),
        siteId: payload.siteId,
        employeeId: payload.employeeId,
        sellerProfileId: payload.sellerProfileId,
        materialId: payload.materialId === "__none" ? undefined : payload.materialId,
        category: payload.category,
        weight: Number(payload.weight),
        pricePerKg: Number(payload.pricePerKg),
        currency: payload.currency,
        paymentMethod: payload.paymentMethod || undefined,
        paymentReference: payload.paymentReference || undefined,
        notes: noteParts.filter(Boolean).join("\n") || undefined,
        attachments: payload.attachments,
        status: intent === "hold" ? "DRAFT" : "POSTED",
      };

      if (editing) {
        return fetchJson(`/api/scrap-metal/purchases/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/scrap-metal/purchases", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (result, variables) => {
      const held = variables.intent === "hold";
      toast({
        title: held
          ? "Inbound ticket held"
          : editing
            ? "Inbound ticket finalized"
            : "Inbound ticket finalized",
        variant: "success",
      });
      setFormOpen(false);
      setEditing(null);
      setPriceTouched(false);
      setSubmitIntent("finalize");
      setForm(getEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-held-inbound-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });

      if (variables.intent === "finalize_print" && typeof result === "object" && result && "id" in result) {
        exportTicketPdf({ ticketType: "purchase", ticketId: String(result.id), download: false });
      }
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update inbound ticket" : "Unable to record inbound ticket",
        description: getApiIssueMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/scrap-metal/purchases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Inbound ticket removed", variant: "success" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to remove inbound ticket",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<PurchaseRow>[]>(
    () => [
      {
        id: "purchaseNumber",
        header: "Ticket #",
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.purchaseNumber}</div>
            {row.original.source === "local" ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Queued Offline</Badge>
                <span className="text-xs text-muted-foreground">
                  {row.original.queueStatus ?? "Queued"}
                </span>
              </div>
            ) : null}
          </div>
        ),
        size: 120,
      },
      {
        id: "purchaseDate",
        header: "Ticket Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.purchaseDate).toLocaleString()}
          </NumericCell>
        ),
        size: 180,
      },
      {
        id: "material",
        header: "Material",
        accessorFn: (row) => `${row.material?.name ?? row.category} ${row.employee.name}`,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.material?.name ?? row.original.category}</div>
            <div className="text-xs text-muted-foreground">{row.original.material?.code ?? row.original.category}</div>
          </div>
        ),
      },
      {
        id: "employee",
        header: "Buyer / Cashier",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.employee.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{row.original.employee.employeeId}</div>
          </div>
        ),
        size: 180,
      },
      {
        id: "sellerName",
        header: "Supplier (Seller)",
        accessorKey: "sellerName",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.sellerName || "-"}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.sellerProfile?.nationalId ?? row.original.sellerPhone ?? "No profile"}
            </div>
            {row.original.lastError ? (
              <div className="text-xs text-destructive">{row.original.lastError}</div>
            ) : null}
          </div>
        ),
        size: 150,
      },
      {
        id: "weight",
        header: "Weight (kg)",
        cell: ({ row }) => <NumericCell>{row.original.weight.toFixed(2)}</NumericCell>,
        size: 100,
      },
      {
        id: "pricePerKg",
        header: "Price/kg",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.pricePerKg.toFixed(2)}
          </NumericCell>
        ),
        size: 100,
      },
      {
        id: "totalAmount",
        header: "Total",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.totalAmount.toFixed(2)}
          </NumericCell>
        ),
        size: 110,
      },
      {
        id: "paymentStatus",
        header: "Supplier Payment Status",
        cell: ({ row }) =>
          row.original.source === "local"
            ? row.original.status === "POSTED"
              ? "Queued finalization"
              : "Queued draft"
            : row.original.status === "POSTED"
              ? "Finalized"
              : "Held / Draft",
        size: 150,
      },
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => <Badge variant="outline">{row.original.site.code}</Badge>,
        size: 80,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {row.original.source === "local" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  row.original.localTicketId &&
                  router.push(
                    `/scrap-metal/tickets?queuedType=inbound&queuedTicketId=${encodeURIComponent(row.original.localTicketId)}`,
                  )
                }
              >
                Resume Offline
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(row.original);
                    setPriceTouched(true);
                    setForm({
                      purchaseDate: row.original.purchaseDate.slice(0, 16),
                      siteId: row.original.site.id,
                      employeeId: row.original.employee.id,
                      sellerProfileId: row.original.sellerProfile?.id ?? "__none",
                      materialId: row.original.material?.id ?? "__none",
                      category: row.original.material?.category ?? row.original.category,
                      weight: String(row.original.weight),
                      pricePerKg: String(row.original.pricePerKg),
                      currency: row.original.currency,
                      paymentMethod: row.original.paymentMethod ?? "",
                      paymentReference: row.original.paymentReference ?? "",
                      overrideReason: "",
                      notes: row.original.notes ?? "",
                      attachments: row.original.attachments ?? [],
                    });
                    setSubmitIntent("finalize");
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ),
        size: 96,
      },
    ],
    [router],
  );

  return (
    <ScrapShell
      title="Inbound Tickets"
      actions={
        <SplitButton
          size="sm"
          onClick={() => router.push("/scrap-metal/tickets")}
          menuContent={
            <>
              <DropdownMenuItem asChild>
                <Link href="/scrap-metal/tickets">New Inbound Ticket</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/management/master-data/operations/scrap-materials">Materials</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/management/master-data/operations/scrap-sellers">Suppliers</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/scrap-metal/tickets/held">Held / Draft Tickets</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/stores/inventory">Stock on hand</Link>
              </DropdownMenuItem>
            </>
          }
        >
          <Plus className="h-4 w-4" />
          New Inbound Ticket
        </SplitButton>
      }
    >
      {purchasesQuery.error && purchases.length === 0 ? (
        <StatusState
          variant="error"
          title="Unable to load inbound tickets"
         
          action={
            <Button onClick={() => purchasesQuery.refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <DataTable
          data={purchases}
          columns={columns}
          searchPlaceholder="Search ticket, buyer, supplier, or material"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={
            isPurchasesLoading && purchases.length === 0
              ? "Loading inbound tickets..."
              : "No inbound tickets yet"
          }
          mobileListRenderer={({ rows }) => {
            const groups = groupMobileRowsByDate(
              rows.map((entry) => entry.row),
              (purchase) => purchase.purchaseDate,
            );

            return (
              <div className="space-y-4">
                {groups.map((group) => (
                  <section key={group.key} className="space-y-2">
                    <div className="px-1 text-sm font-semibold text-[var(--text-strong)]">
                      {group.label}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((purchase) => (
                        <div
                          key={purchase.id}
                          className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-3 py-2.5 shadow-[var(--surface-frame-shadow)]"
                        >
                          <ScrapMobileCard>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-base font-semibold text-foreground">
                                  {purchase.sellerName || "Unknown supplier"}
                                </div>
                                <div className="truncate font-mono text-[11px] text-muted-foreground">
                                  {purchase.purchaseNumber}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="font-mono text-xs font-semibold text-foreground">
                                  {formatTicketTime(purchase.purchaseDate)}
                                </div>
                                <div className="mt-1">
                                  <Badge variant={purchase.source === "local" ? "secondary" : "outline"}>
                                    {purchase.source === "local"
                                      ? purchase.queueStatus ?? "Queued"
                                      : purchase.site.code}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="text-xs font-medium text-muted-foreground">
                              {purchase.material?.name ?? purchase.category}
                            </div>
                            <ScrapMobileMetricStrip
                              items={[
                                { icon: Calendar, value: purchase.site.code, srLabel: "Site" },
                                { icon: User, value: purchase.employee.name, srLabel: "Buyer" },
                                { icon: Scale, value: `${purchase.weight.toFixed(2)} kg`, srLabel: "Weight" },
                                {
                                  icon: Wallet,
                                  value: `${purchase.currency} ${purchase.totalAmount.toFixed(2)}`,
                                  srLabel: "Total",
                                },
                              ]}
                            />
                            {purchase.lastError ? (
                              <div className="text-xs text-destructive">{purchase.lastError}</div>
                            ) : null}
                            <ScrapMobileCardActions>
                              {purchase.source === "local" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    purchase.localTicketId &&
                                    router.push(
                                      `/scrap-metal/tickets?queuedType=inbound&queuedTicketId=${encodeURIComponent(purchase.localTicketId)}`,
                                    )
                                  }
                                >
                                  Resume Offline
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditing(purchase);
                                      setPriceTouched(true);
                                      setForm({
                                        purchaseDate: purchase.purchaseDate.slice(0, 16),
                                        siteId: purchase.site.id,
                                        employeeId: purchase.employee.id,
                                        sellerProfileId: purchase.sellerProfile?.id ?? "__none",
                                        materialId: purchase.material?.id ?? "__none",
                                        category: purchase.material?.category ?? purchase.category,
                                        weight: String(purchase.weight),
                                        pricePerKg: String(purchase.pricePerKg),
                                        currency: purchase.currency,
                                        paymentMethod: purchase.paymentMethod ?? "",
                                        paymentReference: purchase.paymentReference ?? "",
                                        overrideReason: "",
                                        notes: purchase.notes ?? "",
                                        attachments: purchase.attachments ?? [],
                                      });
                                      setSubmitIntent("finalize");
                                      setFormOpen(true);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setDeleteTarget(purchase)}
                                  >
                                    Remove
                                  </Button>
                                </>
                              )}
                            </ScrapMobileCardActions>
                          </ScrapMobileCard>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            );
          }}
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="full" tabletBehavior="fullscreen" className="max-h-[100dvh] sm:max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Inbound Ticket" : "New Inbound Ticket"}</DialogTitle>
          </DialogHeader>
          <form
            ref={formRef}
            className="max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto pb-20 sm:max-h-[calc(92vh-8rem)]"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate({ payload: form, intent: submitIntent });
            }}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Ticket Number</label>
                <Input
                  value={editing?.purchaseNumber ?? purchaseNumber}
                  readOnly
                  aria-readonly="true"
                  placeholder={editing ? "Ticket number" : reservingPurchaseNumber ? "Reserving..." : "Auto-generated"}
                />
                <FieldHelp
                  hint={
                    editing
                      ? "Ticket number stays locked after creation."
                      : reservePurchaseNumberError ?? "Ticket number is generated automatically after site selection."
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Ticket Date</label>
                <Input
                  type="datetime-local"
                  value={form.purchaseDate}
                  onChange={(event) =>
                    setForm((current) =>
                      applySuggestedPrice(
                        { ...current, purchaseDate: event.target.value },
                        pricesQuery.data?.data ?? [],
                        priceTouched,
                      ),
                    )
                  }
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <SearchableSelect
                label="Site *"
                value={form.siteId || undefined}
                options={siteOptions}
                placeholder={sitesQuery.isLoading ? "Loading sites..." : "Select site"}
                searchPlaceholder="Search sites..."
                onValueChange={(value) => setForm((current) => ({ ...current, siteId: value }))}
                onAddOption={() => router.push("/management/master-data/operations/sites")}
                addLabel="Add new site"
              />
              <SearchableSelect
                label="Buyer / Cashier *"
                value={form.employeeId || undefined}
                options={employeeOptions}
                placeholder={employeesQuery.isLoading ? "Loading buyers..." : "Select buyer"}
                searchPlaceholder="Search buyers..."
                onValueChange={(value) => setForm((current) => ({ ...current, employeeId: value }))}
                onAddOption={() => router.push("/human-resources")}
                addLabel="Add new buyer"
              />
              <SearchableSelect
                label="Supplier Profile *"
                value={form.sellerProfileId === "__none" ? undefined : form.sellerProfileId}
                options={sellerOptions}
                placeholder={sellerProfilesQuery.isLoading ? "Loading supplier profiles..." : "Select supplier profile"}
                searchPlaceholder="Search suppliers..."
                onValueChange={(value) => setForm((current) => ({ ...current, sellerProfileId: value }))}
                onAddOption={() => router.push("/management/master-data/operations/scrap-sellers")}
                addLabel="Add new supplier"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SearchableSelect
                label="Material"
                value={form.materialId}
                options={materialOptions}
                placeholder={materialsQuery.isLoading ? "Loading materials..." : "Select material"}
                searchPlaceholder="Search materials..."
                onValueChange={(value) => {
                  const material = materials.find((entry) => entry.id === value);
                  setPriceTouched(false);
                  setForm((current) =>
                    applySuggestedPrice(
                      {
                        ...current,
                        materialId: value,
                        category: material?.category ?? current.category,
                        pricePerKg: "",
                      },
                      pricesQuery.data?.data ?? [],
                      false,
                    ),
                  );
                }}
                onAddOption={() => router.push("/management/master-data/operations/scrap-materials")}
                addLabel="Add new material"
              />
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Category *</label>
                <Select
                  value={form.category}
                  onValueChange={(value) => {
                    setPriceTouched(false);
                    setForm((current) =>
                      applySuggestedPrice(
                        { ...current, category: value, pricePerKg: "" },
                        pricesQuery.data?.data ?? [],
                        false,
                      ),
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Supplier phone</label>
                <Input value={selectedSellerProfile?.phone ?? ""} readOnly placeholder="Supplier phone" />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">National ID / Passport</label>
                <Input value={selectedSellerProfile?.nationalId ?? ""} readOnly placeholder="National ID / Passport" />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Weight (kg) *</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.weight}
                  onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
                  placeholder="Weight (kg)"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-semibold">Price per kg *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pricePerKg}
                  onChange={(event) => {
                    setPriceTouched(true);
                    setForm((current) => ({ ...current, pricePerKg: event.target.value }));
                  }}
                  placeholder="Price per kg"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {suggestedPrice
                    ? `Board rate ${suggestedPrice.currency} ${suggestedPrice.pricePerKg.toFixed(2)}`
                    : "No board rate found for this selection"}
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Currency *</label>
                <Input
                  value={form.currency}
                  onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                  placeholder="Currency"
                  required
                />
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Locked total</div>
                <div className="font-mono font-semibold">
                  {form.currency || "USD"}{" "}
                  {((Number(form.weight) || 0) * (Number(form.pricePerKg) || 0)).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Paid out by</label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(value) => setForm((current) => ({ ...current, paymentMethod: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Payment reference</label>
                <Input
                  value={form.paymentReference}
                  onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))}
                  placeholder="Payment reference"
                />
              </div>
            </div>

            {suggestedPrice && Number(form.pricePerKg || 0) !== Number(suggestedPrice.pricePerKg) ? (
              <Input
                value={form.overrideReason}
                onChange={(event) => setForm((current) => ({ ...current, overrideReason: event.target.value }))}
                placeholder="Override reason"
                required
              />
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-semibold">Ticket Photos</label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    disabled={isUploadingPhoto}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;

                      try {
                        setIsUploadingPhoto(true);
                        const uploaded = await uploadScrapTicketPhoto(file, "scrap-purchase-ticket-photo");
                        setForm((current) => ({
                          ...current,
                          attachments: [...current.attachments, uploaded].slice(0, 12),
                        }));
                        toast({ title: "Ticket photo uploaded", variant: "success" });
                      } catch (error) {
                        toast({
                          title: "Unable to upload ticket photo",
                          description: getApiErrorMessage(error),
                          variant: "destructive",
                        });
                      } finally {
                        setIsUploadingPhoto(false);
                        event.target.value = "";
                      }
                    }}
                  />
                  {isUploadingPhoto ? "Uploading..." : "Add Photo"}
                </label>
              </div>
              {form.attachments.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-[var(--edge-subtle)] p-3">
                  {form.attachments.map((attachment, index) => (
                    <div key={`${attachment.url}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-[var(--primary-600)] underline"
                      >
                        Photo {index + 1}
                      </a>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">{formatFileSize(attachment.size)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No photos attached yet.</p>
              )}
            </div>

            <Textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Notes"
            />
            <DialogFooter className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 px-1 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 !flex-row">
              <Button className="flex-1 sm:flex-none" type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <SplitButton
                className="flex-1 sm:flex-none"
                onClick={() => submitWithIntent("finalize")}
                disabled={
                  saveMutation.isPending ||
                  (!editing && (!purchaseNumber || reservingPurchaseNumber)) ||
                  !form.siteId ||
                  !form.employeeId ||
                  form.sellerProfileId === "__none" ||
                  !form.weight ||
                  !form.pricePerKg ||
                  isUploadingPhoto
                }
                menuContent={
                  <>
                    <DropdownMenuItem onClick={() => submitWithIntent("hold")}>Hold Ticket</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => submitWithIntent("finalize_print")}>Finalize & Export PDF</DropdownMenuItem>
                  </>
                }
              >
                {saveMutation.isPending ? "Saving..." : "Finalize Ticket"}
              </SplitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove Inbound Ticket</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {deleteTarget ? `Remove ${deleteTarget.purchaseNumber}?` : "Remove this inbound ticket?"}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrapShell>
  );
}
