"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchEmployees, fetchSites } from "@/lib/api";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { hasRole } from "@/lib/roles";
import type { ScrapTicketPhoto } from "@/lib/scrap-metal/attachments";
import { loadLocalTicketDraft, saveLocalTicketDraft } from "@/lib/scrap-metal/offline-draft-adapter";
import {
  bumpQueuedScrapTicketRetry,
  loadQueuedScrapTicketOperations,
  makeScrapTicketRequestId,
  queueScrapTicketOperation,
  removeQueuedScrapTicketOperation,
} from "@/lib/scrap-metal/offline-ticket-queue";
import { printTicketWithBridge } from "@/lib/scrap-metal/print-adapter";
import { fetchScaleReadingFromLocalHelper } from "@/lib/scrap-metal/scale-adapter";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { FieldHelp } from "@/components/shared/field-help";
import { PrimaryActionBar } from "@/components/shared/primary-action-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "@/lib/icons";

type Material = { id: string; code: string; name: string; category: string };
type Seller = { id: string; fullName: string; phone: string; nationalId: string };
type Price = { materialId?: string | null; category: string; effectiveDate: string; pricePerKg: number; currency: string };
type Batch = {
  id: string;
  batchNumber: string;
  category: string;
  totalWeight: number;
  status: string;
  material?: { id: string; name: string } | null;
  site: { id: string; name: string; code: string };
};

type InboundForm = {
  siteId: string;
  employeeId: string;
  date: string;
  sellerId: string;
  materialId: string;
  category: string;
  weight: string;
  pricePerKg: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  attachments: ScrapTicketPhoto[];
};

type OutboundForm = {
  date: string;
  batchId: string;
  buyerName: string;
  buyerContact: string;
  recordedWeight: string;
  soldWeight: string;
  pricePerKg: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  attachments: ScrapTicketPhoto[];
};

type InboundIntent = "hold" | "finalize" | "finalize_print";
type OutboundIntent = "hold" | "submit" | "submit_print" | "request_approval";
const QUICK_CREATE_SUPPLIER_VALUE = "__quick_create_supplier__";
const PAYMENT_METHOD_OPTIONS = ["Cash", "EcoCash", "Bank Transfer", "Mobile Money", "Card", "Other"] as const;
type ComplianceRequirements = {
  requirePhotos: boolean;
  requirePaymentMethod: boolean;
  requirePaymentReference: boolean;
  requireNotes: boolean;
  matchedRuleIds: string[];
};

function nowLocal() {
  return new Date().toISOString().slice(0, 16);
}

function emptyInbound(): InboundForm {
  return {
    siteId: "",
    employeeId: "",
    date: nowLocal(),
    sellerId: "",
    materialId: "",
    category: "MIXED",
    weight: "",
    pricePerKg: "",
    currency: "USD",
    paymentMethod: "Cash",
    paymentReference: "",
    notes: "",
    attachments: [],
  };
}

function emptyOutbound(): OutboundForm {
  return {
    date: nowLocal(),
    batchId: "",
    buyerName: "",
    buyerContact: "",
    recordedWeight: "",
    soldWeight: "",
    pricePerKg: "",
    currency: "USD",
    paymentMethod: "Cash",
    paymentReference: "",
    notes: "",
    attachments: [],
  };
}

async function uploadPhoto(file: File, context: "scrap-purchase-ticket-photo" | "scrap-sale-ticket-photo"): Promise<ScrapTicketPhoto> {
  const body = new FormData();
  body.append("context", context);
  body.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", credentials: "include", body });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data && data.error) || "Upload failed");
  return {
    url: data.url,
    pathname: data.pathname,
    contentType: data.contentType,
    size: typeof data.size === "number" ? data.size : file.size,
    context,
    uploadedAt: new Date().toISOString(),
  };
}

export default function ScrapMetalTicketWorkbenchPage() {
  const { data: session } = useSession();
  const sessionUser = (session?.user as { id?: string; userId?: string; role?: string; name?: string } | undefined) ?? undefined;
  const role = sessionUser?.role;
  const sessionUserId = sessionUser?.id ?? sessionUser?.userId ?? null;
  const canCreateOutbound = hasRole(role, ["SUPERADMIN", "MANAGER"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"inbound" | "outbound">("inbound");
  const [inbound, setInbound] = useState<InboundForm>(emptyInbound);
  const [outbound, setOutbound] = useState<OutboundForm>(emptyOutbound);
  const [inboundErrors, setInboundErrors] = useState<Record<string, string>>({});
  const [outboundErrors, setOutboundErrors] = useState<Record<string, string>>({});
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [newSeller, setNewSeller] = useState({ fullName: "", phone: "", nationalId: "" });
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncingOfflineQueue, setSyncingOfflineQueue] = useState(false);
  const [inboundMetaOpen, setInboundMetaOpen] = useState(false);
  const [outboundMetaOpen, setOutboundMetaOpen] = useState(false);

  const sitesQuery = useQuery({ queryKey: ["sites", "scrap-tickets"], queryFn: fetchSites });
  const employeesQuery = useQuery({ queryKey: ["employees", "scrap-tickets"], queryFn: () => fetchEmployees({ active: true, limit: 500 }) });
  const materialsQuery = useQuery({ queryKey: ["scrap-materials", "tickets"], queryFn: () => fetchJson<{ data: Material[] }>("/api/scrap-metal/materials?active=true&limit=500") });
  const sellersQuery = useQuery({ queryKey: ["scrap-sellers", "tickets"], queryFn: () => fetchJson<{ data: Seller[] }>("/api/scrap-metal/sellers?active=true&limit=500") });
  const pricesQuery = useQuery({ queryKey: ["scrap-prices", "tickets"], queryFn: () => fetchJson<{ data: Price[] }>("/api/scrap-metal/pricing?limit=500") });
  const batchesQuery = useQuery({ queryKey: ["scrap-batches", "tickets"], queryFn: () => fetchJson<{ data: Batch[] }>("/api/scrap-metal/batches?limit=500") });
  const heldInboundQuery = useQuery({ queryKey: ["scrap-held-inbound-total"], queryFn: () => fetchJson<{ pagination?: { total?: number } }>("/api/scrap-metal/purchases?status=DRAFT&limit=1") });
  const heldOutboundQuery = useQuery({ queryKey: ["scrap-held-outbound-total"], queryFn: () => fetchJson<{ pagination?: { total?: number } }>("/api/scrap-metal/sales?status=DRAFT&limit=1") });

  const materials = useMemo(() => materialsQuery.data?.data ?? [], [materialsQuery.data?.data]);
  const employees = useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data?.data]);
  const sellers = sellersQuery.data?.data ?? [];
  const prices = useMemo(() => pricesQuery.data?.data ?? [], [pricesQuery.data?.data]);
  const batches = useMemo(() => (batchesQuery.data?.data ?? []).filter((x) => ["COLLECTING", "READY"].includes(x.status)), [batchesQuery.data?.data]);
  const selectedBatch = batches.find((x) => x.id === outbound.batchId) ?? null;
  const selectedInboundMaterial = useMemo(
    () => materials.find((material) => material.id === inbound.materialId) ?? null,
    [materials, inbound.materialId],
  );
  const derivedInboundCategory = selectedInboundMaterial?.category ?? inbound.category;
  const selectedInboundBuyer = useMemo(
    () => employees.find((employee) => employee.id === inbound.employeeId) ?? null,
    [employees, inbound.employeeId],
  );
  const defaultBuyerId = useMemo(() => {
    if (!sessionUserId) return "";
    const linkedEmployee = employees.find((employee) => employee.userId === sessionUserId);
    return linkedEmployee?.id ?? "";
  }, [employees, sessionUserId]);
  const canOverrideBuyer = hasRole(role, ["OPERATOR", "MANAGER", "SUPERADMIN"]);
  const showBuyerOverride = canOverrideBuyer || !defaultBuyerId;
  const inboundRequirementsQuery = useQuery({
    queryKey: ["scrap-inbound-requirements", inbound.materialId || "__none", derivedInboundCategory],
    queryFn: () =>
      fetchJson<ComplianceRequirements>(
        `/api/scrap-metal/compliance-rules/resolve?direction=INBOUND&materialId=${encodeURIComponent(inbound.materialId)}&category=${encodeURIComponent(derivedInboundCategory)}`,
      ),
  });
  const outboundRequirementsQuery = useQuery({
    queryKey: [
      "scrap-outbound-requirements",
      selectedBatch?.material?.id || "__none",
      selectedBatch?.category || "__none",
    ],
    queryFn: () =>
      fetchJson<ComplianceRequirements>(
        `/api/scrap-metal/compliance-rules/resolve?direction=OUTBOUND&materialId=${encodeURIComponent(selectedBatch?.material?.id ?? "")}&category=${encodeURIComponent(selectedBatch?.category ?? "")}`,
      ),
    enabled: Boolean(selectedBatch?.category),
  });
  const heldInbound = heldInboundQuery.data?.pagination?.total ?? 0;
  const heldOutbound = heldOutboundQuery.data?.pagination?.total ?? 0;
  const inboundRequirements = inboundRequirementsQuery.data;
  const outboundRequirements = outboundRequirementsQuery.data;
  const applyPriceSuggestion = useCallback((next: InboundForm): InboundForm => {
    const date = new Date(next.date);
    if (Number.isNaN(date.getTime())) return next;
    const candidates = prices
      .filter((p) => p.category === next.category && new Date(p.effectiveDate) <= date)
      .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
    const chosen =
      (next.materialId ? candidates.find((p) => p.materialId === next.materialId) : null) ??
      candidates.find((p) => !p.materialId);
    if (!chosen || next.pricePerKg) return next;
    return { ...next, pricePerKg: String(chosen.pricePerKg), currency: next.currency || chosen.currency };
  }, [prices]);

  useEffect(() => {
    if (!defaultBuyerId) return;
    const selectedIsValid = inbound.employeeId && employees.some((employee) => employee.id === inbound.employeeId);
    if (selectedIsValid) return;
    setInbound((prev) => ({ ...prev, employeeId: defaultBuyerId }));
  }, [defaultBuyerId, inbound.employeeId, employees]);

  useEffect(() => {
    if (!selectedInboundMaterial) return;
    if (inbound.category === selectedInboundMaterial.category) return;
    setInbound((prev) => applyPriceSuggestion({ ...prev, category: selectedInboundMaterial.category }));
  }, [applyPriceSuggestion, selectedInboundMaterial, inbound.category]);

  useEffect(() => {
    const hasMetadataError =
      Boolean(inboundErrors.paymentMethod) ||
      Boolean(inboundErrors.paymentReference) ||
      Boolean(inboundErrors.notes) ||
      Boolean(inboundErrors.attachments);
    if (hasMetadataError) setInboundMetaOpen(true);
  }, [inboundErrors]);

  useEffect(() => {
    const hasMetadataError =
      Boolean(outboundErrors.paymentMethod) ||
      Boolean(outboundErrors.paymentReference) ||
      Boolean(outboundErrors.notes) ||
      Boolean(outboundErrors.attachments);
    if (hasMetadataError) setOutboundMetaOpen(true);
  }, [outboundErrors]);

  function refreshOfflineQueueCount() {
    setOfflineQueueCount(loadQueuedScrapTicketOperations().length);
  }

  useEffect(() => {
    refreshOfflineQueueCount();
  }, []);

  useEffect(() => {
    const onOnline = () => {
      void syncOfflineTickets();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isOfflineCandidate(error: unknown) {
    const message = getApiErrorMessage(error).toLowerCase();
    const networkish = !(error instanceof ApiError) && /network|failed to fetch|load failed/i.test(message);
    const browserOffline = typeof navigator !== "undefined" && !navigator.onLine;
    return networkish || browserOffline;
  }

  function toIsoStringOrNow(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
    return parsed.toISOString();
  }

  function getComplianceMessages(error: unknown) {
    if (!(error instanceof ApiError) || typeof error.details !== "object" || !error.details) return [];
    const payload = error.details as { details?: unknown };
    if (!Array.isArray(payload.details)) return [];
    return payload.details.filter((message): message is string => typeof message === "string");
  }

  function mapComplianceErrorsToFields(messages: string[]) {
    const errors: Record<string, string> = {};
    for (const message of messages) {
      const normalized = message.toLowerCase();
      if (normalized.includes("photo")) errors.attachments = message;
      if (normalized.includes("payment method")) errors.paymentMethod = message;
      if (normalized.includes("payment reference")) errors.paymentReference = message;
      if (normalized.includes("notes")) errors.notes = message;
    }
    return errors;
  }

  function buildInboundPayload(intent: InboundIntent, form: InboundForm) {
    const materialCategory =
      materials.find((material) => material.id === form.materialId)?.category ??
      form.category;

    return {
      purchaseDate: toIsoStringOrNow(form.date),
      siteId: form.siteId,
      employeeId: form.employeeId,
      sellerProfileId: form.sellerId,
      materialId: form.materialId,
      category: materialCategory,
      weight: Number(form.weight),
      pricePerKg: Number(form.pricePerKg),
      currency: form.currency,
      paymentMethod: form.paymentMethod || undefined,
      paymentReference: form.paymentReference || undefined,
      notes: form.notes || undefined,
      attachments: form.attachments,
      status: intent === "hold" ? "DRAFT" : "POSTED",
    };
  }

  function buildOutboundPayload(intent: OutboundIntent, form: OutboundForm) {
    if (!selectedBatch) throw new Error("Select a lot first.");
    return {
      saleDate: toIsoStringOrNow(form.date),
      siteId: selectedBatch.site.id,
      batchId: form.batchId,
      materialId: selectedBatch.material?.id,
      buyerName: form.buyerName,
      buyerContact: form.buyerContact || undefined,
      recordedWeight: Number(form.recordedWeight),
      soldWeight: Number(form.soldWeight),
      pricePerKg: Number(form.pricePerKg),
      currency: form.currency,
      paymentMethod: form.paymentMethod || undefined,
      paymentReference: form.paymentReference || undefined,
      notes: form.notes || undefined,
      attachments: form.attachments,
      status: intent === "hold" || intent === "request_approval" ? "DRAFT" : "PENDING_APPROVAL",
    };
  }

  async function syncOfflineTickets() {
    setSyncingOfflineQueue(true);
    try {
      const queue = loadQueuedScrapTicketOperations();
      if (queue.length === 0) return;

      let synced = 0;
      let failed = 0;
      for (const entry of queue) {
        try {
          if (entry.payload.operation === "create-inbound-ticket") {
            await fetchJson("/api/scrap-metal/purchases", {
              method: "POST",
              body: JSON.stringify(entry.payload.payload),
            });
          } else {
            await fetchJson("/api/scrap-metal/sales", {
              method: "POST",
              body: JSON.stringify(entry.payload.payload),
            });
          }

          removeQueuedScrapTicketOperation(entry.id);
          synced += 1;
        } catch (error) {
          failed += 1;
          bumpQueuedScrapTicketRetry(entry.id);
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            removeQueuedScrapTicketOperation(entry.id);
          }
        }
      }

      refreshOfflineQueueCount();
      if (synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
        queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
        queryClient.invalidateQueries({ queryKey: ["scrap-held-inbound-total"] });
        queryClient.invalidateQueries({ queryKey: ["scrap-held-outbound-total"] });
        toast({
          title: "Offline tickets synced",
          description: `${synced} queued ticket${synced === 1 ? "" : "s"} posted.`,
          variant: "success",
        });
      }
      if (failed > 0) {
        toast({
          title: "Some offline tickets are still pending",
          description: `${failed} item${failed === 1 ? "" : "s"} will retry on next sync.`,
          variant: "default",
        });
      }
    } finally {
      setSyncingOfflineQueue(false);
    }
  }

  const createSellerMutation = useMutation({
    mutationFn: (payload: { fullName: string; phone: string; nationalId: string }) =>
      fetchJson<Seller>("/api/scrap-metal/sellers", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (seller) => {
      setQuickCreateOpen(false);
      setNewSeller({ fullName: "", phone: "", nationalId: "" });
      setInbound((prev) => ({ ...prev, sellerId: seller.id }));
      queryClient.invalidateQueries({ queryKey: ["scrap-sellers", "tickets"] });
      toast({ title: "Supplier created", variant: "success" });
    },
    onError: (error) => {
      toast({ title: "Unable to create supplier", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const inboundMutation = useMutation({
    mutationFn: (intent: InboundIntent) =>
      fetchJson<{ id: string; purchaseNumber: string }>("/api/scrap-metal/purchases", {
        method: "POST",
        body: JSON.stringify(buildInboundPayload(intent, inbound)),
      }),
    onSuccess: (created, intent) => {
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-held-inbound-total"] });
      setInboundErrors({});
      setInbound((prev) => ({ ...emptyInbound(), siteId: prev.siteId, employeeId: defaultBuyerId || prev.employeeId }));
      if (intent === "finalize_print") {
        printTicketWithBridge({ ticketType: "purchase", ticketId: created.id, download: false, mode: "pdf-only" });
      }
      toast({ title: intent === "hold" ? "Inbound ticket held" : "Inbound ticket finalized", variant: "success" });
    },
    onError: (error, intent) => {
      if (isOfflineCandidate(error)) {
        queueScrapTicketOperation({
          operation: "create-inbound-ticket",
          clientRequestId: makeScrapTicketRequestId(),
          intent,
          payload: buildInboundPayload(intent, inbound),
        });
        refreshOfflineQueueCount();
        toast({
          title: "Inbound ticket queued offline",
          description: "This ticket will auto-sync when the connection is back.",
          variant: "default",
        });
        return;
      }
      const complianceMessages = getComplianceMessages(error);
      if (complianceMessages.length > 0) {
        setInboundErrors((prev) => ({
          ...prev,
          ...mapComplianceErrorsToFields(complianceMessages),
          form: complianceMessages[0],
        }));
      }
      toast({ title: "Unable to save inbound ticket", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const outboundMutation = useMutation({
    mutationFn: (intent: OutboundIntent) => {
      return fetchJson<{ id: string; saleNumber: string }>("/api/scrap-metal/sales", {
        method: "POST",
        body: JSON.stringify(buildOutboundPayload(intent, outbound)),
      });
    },
    onSuccess: (created, intent) => {
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-held-outbound-total"] });
      setOutboundErrors({});
      setOutbound(emptyOutbound());
      if (intent === "submit_print") {
        printTicketWithBridge({ ticketType: "sale", ticketId: created.id, download: false, mode: "pdf-only" });
      }
      toast({
        title:
          intent === "hold"
            ? "Outbound ticket held"
            : intent === "request_approval"
              ? "Approval request submitted"
              : "Outbound ticket submitted",
        description:
          intent === "request_approval"
            ? "The ticket is saved as draft for manager review."
            : undefined,
        variant: "success",
      });
    },
    onError: (error, intent) => {
      if (isOfflineCandidate(error)) {
        try {
          queueScrapTicketOperation({
            operation: "create-outbound-ticket",
            clientRequestId: makeScrapTicketRequestId(),
            intent,
            payload: buildOutboundPayload(intent, outbound),
          });
          refreshOfflineQueueCount();
          toast({
            title: "Outbound ticket queued offline",
            description: "This ticket will auto-sync when the connection is back.",
            variant: "default",
          });
          return;
        } catch (queueError) {
          toast({
            title: "Unable to queue outbound ticket",
            description: getApiErrorMessage(queueError),
            variant: "destructive",
          });
          return;
        }
      }
      const complianceMessages = getComplianceMessages(error);
      if (complianceMessages.length > 0) {
        setOutboundErrors((prev) => ({
          ...prev,
          ...mapComplianceErrorsToFields(complianceMessages),
          form: complianceMessages[0],
        }));
      }
      toast({ title: "Unable to save outbound ticket", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  function validateInbound() {
    const errors: Record<string, string> = {};
    if (Number.isNaN(new Date(inbound.date).getTime())) errors.date = "Ticket time is required.";
    if (!inbound.siteId) errors.siteId = "Site is required.";
    if (!inbound.employeeId) errors.employeeId = "Buyer / cashier is required.";
    if (!inbound.sellerId) errors.sellerId = "Supplier is required.";
    if (!inbound.materialId) errors.materialId = "Material is required.";
    if (!inbound.weight || Number(inbound.weight) <= 0) errors.weight = "Weight must be greater than zero.";
    if (!inbound.pricePerKg || Number(inbound.pricePerKg) <= 0) errors.pricePerKg = "Price per kg must be greater than zero.";
    if (inboundRequirements?.requirePaymentMethod && !inbound.paymentMethod.trim()) {
      errors.paymentMethod = "Payment method is required by compliance rules.";
    }
    if (inboundRequirements?.requirePaymentReference && !inbound.paymentReference.trim()) {
      errors.paymentReference = "Payment reference is required by compliance rules.";
    }
    if (inboundRequirements?.requireNotes && !inbound.notes.trim()) {
      errors.notes = "Notes are required by compliance rules.";
    }
    if (inboundRequirements?.requirePhotos && inbound.attachments.length === 0) {
      errors.attachments = "At least one photo is required by compliance rules.";
    }
    setInboundErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateOutbound() {
    const errors: Record<string, string> = {};
    if (Number.isNaN(new Date(outbound.date).getTime())) errors.date = "Ticket time is required.";
    if (!outbound.batchId) errors.batchId = "Lot is required.";
    if (!outbound.buyerName.trim()) errors.buyerName = "Buyer name is required.";
    if (!outbound.soldWeight || Number(outbound.soldWeight) <= 0) errors.soldWeight = "Accepted weight must be greater than zero.";
    if (!outbound.pricePerKg || Number(outbound.pricePerKg) <= 0) errors.pricePerKg = "Price per kg must be greater than zero.";
    if (outboundRequirements?.requirePaymentMethod && !outbound.paymentMethod.trim()) {
      errors.paymentMethod = "Payment method is required by compliance rules.";
    }
    if (outboundRequirements?.requirePaymentReference && !outbound.paymentReference.trim()) {
      errors.paymentReference = "Payment reference is required by compliance rules.";
    }
    if (outboundRequirements?.requireNotes && !outbound.notes.trim()) {
      errors.notes = "Notes are required by compliance rules.";
    }
    if (outboundRequirements?.requirePhotos && outbound.attachments.length === 0) {
      errors.attachments = "At least one photo is required by compliance rules.";
    }
    setOutboundErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onUploadInbound(file: File) {
    try {
      const photo = await uploadPhoto(file, "scrap-purchase-ticket-photo");
      setInbound((prev) => ({ ...prev, attachments: [...prev.attachments, photo] }));
      toast({ title: "Photo attached", variant: "success" });
    } catch (error) {
      toast({ title: "Unable to upload photo", description: getApiErrorMessage(error), variant: "destructive" });
    }
  }

  async function onUploadOutbound(file: File) {
    try {
      const photo = await uploadPhoto(file, "scrap-sale-ticket-photo");
      setOutbound((prev) => ({ ...prev, attachments: [...prev.attachments, photo] }));
      toast({ title: "Photo attached", variant: "success" });
    } catch (error) {
      toast({ title: "Unable to upload photo", description: getApiErrorMessage(error), variant: "destructive" });
    }
  }

  const busy = inboundMutation.isPending || outboundMutation.isPending || createSellerMutation.isPending;
  const inboundTotal = useMemo(() => {
    const weight = Number(inbound.weight);
    const price = Number(inbound.pricePerKg);
    if (!Number.isFinite(weight) || !Number.isFinite(price)) return 0;
    return weight * price;
  }, [inbound.weight, inbound.pricePerKg]);
  const outboundTotal = useMemo(() => {
    const weight = Number(outbound.soldWeight);
    const price = Number(outbound.pricePerKg);
    if (!Number.isFinite(weight) || !Number.isFinite(price)) return 0;
    return weight * price;
  }, [outbound.soldWeight, outbound.pricePerKg]);

  async function readInboundWeightFromScale() {
    try {
      const reading = await fetchScaleReadingFromLocalHelper();
      setInbound((prev) => ({ ...prev, weight: String(reading.kg) }));
      toast({ title: `Scale reading loaded: ${reading.kg.toFixed(2)} kg`, variant: "success" });
    } catch (error) {
      toast({ title: "Scale helper unavailable", description: getApiErrorMessage(error), variant: "destructive" });
    }
  }

  async function readOutboundWeightFromScale() {
    try {
      const reading = await fetchScaleReadingFromLocalHelper();
      setOutbound((prev) => ({ ...prev, soldWeight: String(reading.kg) }));
      toast({ title: `Scale reading loaded: ${reading.kg.toFixed(2)} kg`, variant: "success" });
    } catch (error) {
      toast({ title: "Scale helper unavailable", description: getApiErrorMessage(error), variant: "destructive" });
    }
  }

  function saveCurrentDraftLocally() {
    if (view === "inbound") {
      saveLocalTicketDraft("inbound", inbound);
      toast({ title: "Inbound draft saved", variant: "success" });
      return;
    }
    saveLocalTicketDraft("outbound", outbound);
    toast({ title: "Outbound draft saved", variant: "success" });
  }

  function loadCurrentDraftLocally() {
    if (view === "inbound") {
      const localDraft = loadLocalTicketDraft<InboundForm>("inbound");
      if (!localDraft) {
        toast({ title: "No inbound draft found", variant: "destructive" });
        return;
      }
      setInbound(localDraft.payload);
      toast({ title: "Inbound draft loaded", variant: "success" });
      return;
    }
    const localDraft = loadLocalTicketDraft<OutboundForm>("outbound");
    if (!localDraft) {
      toast({ title: "No outbound draft found", variant: "destructive" });
      return;
    }
    setOutbound(localDraft.payload);
    toast({ title: "Outbound draft loaded", variant: "success" });
  }

  function holdCurrentTicket() {
    if (view === "inbound") {
      if (validateInbound()) inboundMutation.mutate("hold");
      return;
    }
    if (validateOutbound()) outboundMutation.mutate("hold");
  }

  function finalizeCurrentTicket() {
    if (view === "inbound") {
      if (validateInbound()) inboundMutation.mutate("finalize");
      return;
    }
    if (validateOutbound()) {
      outboundMutation.mutate(canCreateOutbound ? "submit" : "request_approval");
    }
  }

  function finalizeAndExportCurrentTicket() {
    if (view === "inbound") {
      if (validateInbound()) inboundMutation.mutate("finalize_print");
      return;
    }
    if (validateOutbound()) {
      outboundMutation.mutate(canCreateOutbound ? "submit_print" : "request_approval");
    }
  }

  function cancelCurrentTicket() {
    if (view === "inbound") {
      setInbound((prev) => ({ ...emptyInbound(), siteId: prev.siteId, employeeId: defaultBuyerId || prev.employeeId }));
      setInboundErrors({});
      return;
    }
    setOutbound(emptyOutbound());
    setOutboundErrors({});
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "enter" && key !== "h") return;

      const target = event.target as HTMLElement | null;
      const typingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (!typingTarget) return;

      event.preventDefault();
      if (key === "h") {
        if (view === "inbound") {
          if (validateInbound()) inboundMutation.mutate("hold");
          return;
        }
        if (validateOutbound()) outboundMutation.mutate("hold");
        return;
      }

      if (view === "inbound") {
        if (validateInbound()) inboundMutation.mutate("finalize");
        return;
      }
      if (validateOutbound()) {
        outboundMutation.mutate(canCreateOutbound ? "submit" : "request_approval");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canCreateOutbound, inbound, outbound, view, inboundRequirements, outboundRequirements]);

  return (
    <>
      <ScrapShell
        title="Ticketing Workbench"
        actions={
          <div className="flex w-full flex-wrap items-center gap-2">
            <ButtonGroup className="min-w-0 flex-1">
              <Button
                size="sm"
                className="min-w-0 flex-1 rounded-none"
                variant={view === "inbound" ? "default" : "ghost"}
                onClick={() => setView("inbound")}
              >
                Inbound
              </Button>
              <Button
                size="sm"
                className="min-w-0 flex-1 rounded-none"
                variant={view === "outbound" ? "default" : "ghost"}
                onClick={() => setView("outbound")}
              >
                Outbound
              </Button>
            </ButtonGroup>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="shrink-0">Held {heldInbound + heldOutbound}</Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="outline" className="shrink-0">
                    More
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/scrap-metal/tickets/held">Held Tickets</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void syncOfflineTickets()} disabled={syncingOfflineQueue || offlineQueueCount === 0}>
                    {syncingOfflineQueue ? "Syncing Queue" : `Sync Queue (${offlineQueueCount})`}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={saveCurrentDraftLocally}>Save Local Draft</DropdownMenuItem>
                  <DropdownMenuItem onClick={loadCurrentDraftLocally}>Load Local Draft</DropdownMenuItem>
                  <DropdownMenuItem onClick={holdCurrentTicket}>Hold Ticket</DropdownMenuItem>
                  <DropdownMenuItem onClick={finalizeAndExportCurrentTicket}>
                    {view === "inbound" ? "Finalize + PDF" : canCreateOutbound ? "Submit + PDF" : "Request Approval"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      >
        {view === "inbound" ? (
          <Card>
            <CardHeader>
              <CardTitle>New Inbound Ticket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pb-28 md:pb-3">
              {inboundErrors.form ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {inboundErrors.form}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Supplier</label>
                  <Select
                    value={inbound.sellerId}
                    onValueChange={(value) => {
                      if (value === QUICK_CREATE_SUPPLIER_VALUE) {
                        setQuickCreateOpen(true);
                        return;
                      }
                      setInbound((prev) => ({ ...prev, sellerId: value }));
                    }}
                  >
                    <SelectTrigger aria-invalid={Boolean(inboundErrors.sellerId)} aria-describedby={inboundErrors.sellerId ? "inbound-seller-error" : undefined}>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={QUICK_CREATE_SUPPLIER_VALUE}>+ Quick-create supplier</SelectItem>
                      {sellers.map((seller) => (
                        <SelectItem key={seller.id} value={seller.id}>{seller.fullName} ({seller.phone})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldHelp id="inbound-seller-error" error={inboundErrors.sellerId} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Material</label>
                  <Select
                    value={inbound.materialId}
                    onValueChange={(value) => {
                      const material = materials.find((x) => x.id === value);
                      setInbound((prev) => applyPriceSuggestion({ ...prev, materialId: value, category: material?.category ?? prev.category }));
                    }}
                  >
                    <SelectTrigger aria-invalid={Boolean(inboundErrors.materialId)} aria-describedby={inboundErrors.materialId ? "inbound-material-error" : undefined}>
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((material) => (
                        <SelectItem key={material.id} value={material.id}>{material.code} - {material.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldHelp id="inbound-material-error" error={inboundErrors.materialId} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="inbound-weight">Weight (kg)</label>
                  <div className="flex gap-2">
                    <Input id="inbound-weight" type="number" min="0" step="0.01" value={inbound.weight} aria-invalid={Boolean(inboundErrors.weight)} aria-describedby={inboundErrors.weight ? "inbound-weight-error" : undefined} onChange={(e) => setInbound((prev) => ({ ...prev, weight: e.target.value }))} />
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => void readInboundWeightFromScale()}>
                      Scale
                    </Button>
                  </div>
                  <FieldHelp id="inbound-weight-error" error={inboundErrors.weight} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="inbound-price">Price / kg</label>
                  <Input id="inbound-price" type="number" min="0" step="0.01" value={inbound.pricePerKg} aria-invalid={Boolean(inboundErrors.pricePerKg)} aria-describedby={inboundErrors.pricePerKg ? "inbound-price-error" : undefined} onChange={(e) => setInbound((prev) => ({ ...prev, pricePerKg: e.target.value }))} />
                  <FieldHelp id="inbound-price-error" error={inboundErrors.pricePerKg} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Site</label>
                  <Select value={inbound.siteId} onValueChange={(value) => setInbound((prev) => ({ ...prev, siteId: value }))}>
                    <SelectTrigger aria-invalid={Boolean(inboundErrors.siteId)} aria-describedby={inboundErrors.siteId ? "inbound-site-error" : undefined}>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {(sitesQuery.data ?? []).map((site) => (
                        <SelectItem key={site.id} value={site.id}>{site.name} ({site.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldHelp id="inbound-site-error" error={inboundErrors.siteId} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="inbound-date">Ticket Time</label>
                  <Input
                    id="inbound-date"
                    type="datetime-local"
                    value={inbound.date}
                    aria-invalid={Boolean(inboundErrors.date)}
                    aria-describedby={inboundErrors.date ? "inbound-date-error" : undefined}
                    onChange={(e) => setInbound((prev) => applyPriceSuggestion({ ...prev, date: e.target.value }))}
                  />
                  <FieldHelp id="inbound-date-error" error={inboundErrors.date} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Buyer</label>
                  {showBuyerOverride ? (
                    <Select value={inbound.employeeId} onValueChange={(value) => setInbound((prev) => ({ ...prev, employeeId: value }))}>
                      <SelectTrigger aria-invalid={Boolean(inboundErrors.employeeId)} aria-describedby={inboundErrors.employeeId ? "inbound-employee-error" : undefined}>
                        <SelectValue placeholder="Select buyer" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input readOnly value={selectedInboundBuyer?.name ?? ""} />
                  )}
                  <FieldHelp id="inbound-employee-error" error={inboundErrors.employeeId} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="inbound-currency">Currency</label>
                  <Input id="inbound-currency" value={inbound.currency} onChange={(e) => setInbound((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} />
                </div>
              </div>

              <div className="rounded-md border border-[var(--edge-subtle)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{selectedInboundMaterial?.category ?? "No material selected"}</p>
                  <p className="font-mono text-sm font-semibold">{(inbound.currency || "USD").toUpperCase()} {inboundTotal.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <Button type="button" size="sm" variant="outline" onClick={() => setInboundMetaOpen((prev) => !prev)}>
                  {inboundMetaOpen ? "Hide Details" : "More Details"}
                </Button>
                {inboundMetaOpen ? (
                  <div className="space-y-4 rounded-md border border-[var(--edge-subtle)] p-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Payment method</label>
                        <Select value={inbound.paymentMethod} onValueChange={(value) => setInbound((prev) => ({ ...prev, paymentMethod: value }))}>
                          <SelectTrigger aria-invalid={Boolean(inboundErrors.paymentMethod)} aria-describedby={inboundErrors.paymentMethod ? "inbound-payment-method-error" : undefined}>
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHOD_OPTIONS.map((method) => (
                              <SelectItem key={method} value={method}>{method}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldHelp id="inbound-payment-method-error" error={inboundErrors.paymentMethod} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold" htmlFor="inbound-payment-reference">Payment reference</label>
                        <Input
                          id="inbound-payment-reference"
                          value={inbound.paymentReference}
                          aria-invalid={Boolean(inboundErrors.paymentReference)}
                          aria-describedby={inboundErrors.paymentReference ? "inbound-payment-reference-error" : undefined}
                          onChange={(e) => setInbound((prev) => ({ ...prev, paymentReference: e.target.value }))}
                        />
                        <FieldHelp id="inbound-payment-reference-error" error={inboundErrors.paymentReference} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Photos</label>
                        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
                          Add Photo
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void onUploadInbound(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <p className="text-xs text-muted-foreground">{inbound.attachments.length} attached</p>
                        <FieldHelp id="inbound-attachments-error" error={inboundErrors.attachments} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold" htmlFor="inbound-notes">Notes</label>
                      <Textarea
                        id="inbound-notes"
                        rows={3}
                        value={inbound.notes}
                        aria-invalid={Boolean(inboundErrors.notes)}
                        aria-describedby={inboundErrors.notes ? "inbound-notes-error" : undefined}
                        onChange={(e) => setInbound((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                      <FieldHelp id="inbound-notes-error" error={inboundErrors.notes} />
                    </div>
                  </div>
                ) : null}
              </div>

              <PrimaryActionBar className="-mx-4 border-t border-x-0 border-b-0 rounded-none px-4 pt-4 md:mx-0 md:rounded-xl md:border md:px-4">
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button className="w-full" type="button" variant="outline" disabled={busy} onClick={cancelCurrentTicket}>
                    Cancel
                  </Button>
                  <Button className="w-full" type="button" disabled={busy} onClick={finalizeCurrentTicket}>
                    Finalize
                  </Button>
                </div>
              </PrimaryActionBar>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>New Outbound Ticket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pb-28 md:pb-3">
              {outboundErrors.form ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {outboundErrors.form}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Lot</label>
                  <Select
                    value={outbound.batchId}
                    onValueChange={(value) => {
                      const batch = batches.find((x) => x.id === value);
                      setOutbound((prev) => ({
                        ...prev,
                        batchId: value,
                        recordedWeight: String(batch?.totalWeight ?? ""),
                        soldWeight: prev.soldWeight || String(batch?.totalWeight ?? ""),
                      }));
                    }}
                  >
                    <SelectTrigger aria-invalid={Boolean(outboundErrors.batchId)} aria-describedby={outboundErrors.batchId ? "outbound-batch-error" : undefined}>
                      <SelectValue placeholder="Select lot" />
                    </SelectTrigger>
                    <SelectContent>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>{batch.batchNumber} ({batch.site.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldHelp id="outbound-batch-error" error={outboundErrors.batchId} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-buyer-name">Buyer name</label>
                  <Input id="outbound-buyer-name" value={outbound.buyerName} aria-invalid={Boolean(outboundErrors.buyerName)} aria-describedby={outboundErrors.buyerName ? "outbound-buyer-error" : undefined} onChange={(e) => setOutbound((prev) => ({ ...prev, buyerName: e.target.value }))} />
                  <FieldHelp id="outbound-buyer-error" error={outboundErrors.buyerName} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-sold-weight">Accepted kg</label>
                  <div className="flex gap-2">
                    <Input id="outbound-sold-weight" type="number" min="0" step="0.01" value={outbound.soldWeight} aria-invalid={Boolean(outboundErrors.soldWeight)} aria-describedby={outboundErrors.soldWeight ? "outbound-weight-error" : undefined} onChange={(e) => setOutbound((prev) => ({ ...prev, soldWeight: e.target.value }))} />
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => void readOutboundWeightFromScale()}>
                      Scale
                    </Button>
                  </div>
                  <FieldHelp id="outbound-weight-error" error={outboundErrors.soldWeight} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-price">Price / kg</label>
                  <Input id="outbound-price" type="number" min="0" step="0.01" value={outbound.pricePerKg} aria-invalid={Boolean(outboundErrors.pricePerKg)} aria-describedby={outboundErrors.pricePerKg ? "outbound-price-error" : undefined} onChange={(e) => setOutbound((prev) => ({ ...prev, pricePerKg: e.target.value }))} />
                  <FieldHelp id="outbound-price-error" error={outboundErrors.pricePerKg} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-date">Ticket Time</label>
                  <Input
                    id="outbound-date"
                    type="datetime-local"
                    value={outbound.date}
                    aria-invalid={Boolean(outboundErrors.date)}
                    aria-describedby={outboundErrors.date ? "outbound-date-error" : undefined}
                    onChange={(e) => setOutbound((prev) => ({ ...prev, date: e.target.value }))}
                  />
                  <FieldHelp id="outbound-date-error" error={outboundErrors.date} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-recorded">Recorded kg</label>
                  <Input id="outbound-recorded" type="number" min="0" step="0.01" value={outbound.recordedWeight} onChange={(e) => setOutbound((prev) => ({ ...prev, recordedWeight: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-buyer-contact">Buyer contact</label>
                  <Input id="outbound-buyer-contact" value={outbound.buyerContact} onChange={(e) => setOutbound((prev) => ({ ...prev, buyerContact: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-currency">Currency</label>
                  <Input id="outbound-currency" value={outbound.currency} onChange={(e) => setOutbound((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} />
                </div>
              </div>

              <div className="rounded-md border border-[var(--edge-subtle)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{selectedBatch ? `${selectedBatch.batchNumber} (${selectedBatch.site.code})` : "No lot selected"}</p>
                  <p className="font-mono text-sm font-semibold">{(outbound.currency || "USD").toUpperCase()} {outboundTotal.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <Button type="button" size="sm" variant="outline" onClick={() => setOutboundMetaOpen((prev) => !prev)}>
                  {outboundMetaOpen ? "Hide Details" : "More Details"}
                </Button>
                {outboundMetaOpen ? (
                  <div className="space-y-4 rounded-md border border-[var(--edge-subtle)] p-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Payment method</label>
                        <Select value={outbound.paymentMethod} onValueChange={(value) => setOutbound((prev) => ({ ...prev, paymentMethod: value }))}>
                          <SelectTrigger aria-invalid={Boolean(outboundErrors.paymentMethod)} aria-describedby={outboundErrors.paymentMethod ? "outbound-payment-method-error" : undefined}>
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHOD_OPTIONS.map((method) => (
                              <SelectItem key={method} value={method}>{method}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldHelp id="outbound-payment-method-error" error={outboundErrors.paymentMethod} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold" htmlFor="outbound-payment-reference">Payment reference</label>
                        <Input
                          id="outbound-payment-reference"
                          value={outbound.paymentReference}
                          aria-invalid={Boolean(outboundErrors.paymentReference)}
                          aria-describedby={outboundErrors.paymentReference ? "outbound-payment-reference-error" : undefined}
                          onChange={(e) => setOutbound((prev) => ({ ...prev, paymentReference: e.target.value }))}
                        />
                        <FieldHelp id="outbound-payment-reference-error" error={outboundErrors.paymentReference} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Photos</label>
                        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
                          Add Photo
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void onUploadOutbound(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <p className="text-xs text-muted-foreground">{outbound.attachments.length} attached</p>
                        <FieldHelp id="outbound-attachments-error" error={outboundErrors.attachments} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold" htmlFor="outbound-notes">Notes</label>
                      <Textarea
                        id="outbound-notes"
                        rows={3}
                        value={outbound.notes}
                        aria-invalid={Boolean(outboundErrors.notes)}
                        aria-describedby={outboundErrors.notes ? "outbound-notes-error" : undefined}
                        onChange={(e) => setOutbound((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                      <FieldHelp id="outbound-notes-error" error={outboundErrors.notes} />
                    </div>
                  </div>
                ) : null}
              </div>

              <PrimaryActionBar className="-mx-4 border-t border-x-0 border-b-0 rounded-none px-4 pt-4 md:mx-0 md:rounded-xl md:border md:px-4">
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button className="w-full" type="button" variant="outline" disabled={busy} onClick={cancelCurrentTicket}>
                    Cancel
                  </Button>
                  <Button className="w-full" type="button" disabled={busy} onClick={finalizeCurrentTicket}>
                    {canCreateOutbound ? "Submit" : "Request Approval"}
                  </Button>
                </div>
              </PrimaryActionBar>
            </CardContent>
          </Card>
        )}
      </ScrapShell>

      <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quick-create Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Full name" value={newSeller.fullName} onChange={(e) => setNewSeller((prev) => ({ ...prev, fullName: e.target.value }))} />
            <Input placeholder="Phone" value={newSeller.phone} onChange={(e) => setNewSeller((prev) => ({ ...prev, phone: e.target.value }))} />
            <Input placeholder="National ID / Passport" value={newSeller.nationalId} onChange={(e) => setNewSeller((prev) => ({ ...prev, nationalId: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!newSeller.fullName.trim() || !newSeller.phone.trim() || !newSeller.nationalId.trim()) {
                  toast({ title: "Missing fields", description: "Name, phone, and national ID/passport are required.", variant: "destructive" });
                  return;
                }
                createSellerMutation.mutate({
                  fullName: newSeller.fullName.trim(),
                  phone: newSeller.phone.trim(),
                  nationalId: newSeller.nationalId.trim(),
                });
              }}
            >
              Create Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
