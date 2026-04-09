"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

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
    paymentMethod: "",
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
    paymentMethod: "",
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
  const role = (session?.user as { role?: string } | undefined)?.role;
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

  const sitesQuery = useQuery({ queryKey: ["sites", "scrap-tickets"], queryFn: fetchSites });
  const employeesQuery = useQuery({ queryKey: ["employees", "scrap-tickets"], queryFn: () => fetchEmployees({ active: true, limit: 500 }) });
  const materialsQuery = useQuery({ queryKey: ["scrap-materials", "tickets"], queryFn: () => fetchJson<{ data: Material[] }>("/api/scrap-metal/materials?active=true&limit=500") });
  const sellersQuery = useQuery({ queryKey: ["scrap-sellers", "tickets"], queryFn: () => fetchJson<{ data: Seller[] }>("/api/scrap-metal/sellers?active=true&limit=500") });
  const pricesQuery = useQuery({ queryKey: ["scrap-prices", "tickets"], queryFn: () => fetchJson<{ data: Price[] }>("/api/scrap-metal/pricing?limit=500") });
  const batchesQuery = useQuery({ queryKey: ["scrap-batches", "tickets"], queryFn: () => fetchJson<{ data: Batch[] }>("/api/scrap-metal/batches?limit=500") });
  const heldInboundQuery = useQuery({ queryKey: ["scrap-held-inbound-total"], queryFn: () => fetchJson<{ pagination?: { total?: number } }>("/api/scrap-metal/purchases?status=DRAFT&limit=1") });
  const heldOutboundQuery = useQuery({ queryKey: ["scrap-held-outbound-total"], queryFn: () => fetchJson<{ pagination?: { total?: number } }>("/api/scrap-metal/sales?status=DRAFT&limit=1") });

  const materials = materialsQuery.data?.data ?? [];
  const sellers = sellersQuery.data?.data ?? [];
  const prices = pricesQuery.data?.data ?? [];
  const batches = useMemo(() => (batchesQuery.data?.data ?? []).filter((x) => ["COLLECTING", "READY"].includes(x.status)), [batchesQuery.data?.data]);
  const selectedBatch = batches.find((x) => x.id === outbound.batchId) ?? null;
  const inboundRequirementsQuery = useQuery({
    queryKey: ["scrap-inbound-requirements", inbound.materialId || "__none", inbound.category],
    queryFn: () =>
      fetchJson<ComplianceRequirements>(
        `/api/scrap-metal/compliance-rules/resolve?direction=INBOUND&materialId=${encodeURIComponent(inbound.materialId)}&category=${encodeURIComponent(inbound.category)}`,
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
    return {
      purchaseDate: toIsoStringOrNow(form.date),
      siteId: form.siteId,
      employeeId: form.employeeId,
      sellerProfileId: form.sellerId,
      materialId: form.materialId,
      category: form.category,
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
      setInbound((prev) => ({ ...emptyInbound(), siteId: prev.siteId, employeeId: prev.employeeId }));
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

  function applyPriceSuggestion(next: InboundForm): InboundForm {
    const date = new Date(next.date);
    if (Number.isNaN(date.getTime())) return next;
    const candidates = prices
      .filter((p) => p.category === next.category && new Date(p.effectiveDate) <= date)
      .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
    const chosen = (next.materialId ? candidates.find((p) => p.materialId === next.materialId) : null) ?? candidates.find((p) => !p.materialId);
    if (!chosen || next.pricePerKg) return next;
    return { ...next, pricePerKg: String(chosen.pricePerKg), currency: next.currency || chosen.currency };
  }

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
        if (validateInbound()) inboundMutation.mutate("finalize_print");
        return;
      }
      if (validateOutbound()) {
        outboundMutation.mutate(canCreateOutbound ? "submit_print" : "request_approval");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canCreateOutbound, inbound, outbound, view, inboundRequirements, outboundRequirements]);

  return (
    <>
      <ScrapShell
        title="Ticketing Workbench"
        description="Supplier -> Material -> Weight -> Price -> Photos -> Payment -> Export PDF in one place."
        actions={
          <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button className="w-full sm:w-auto" size="sm" variant={view === "inbound" ? "default" : "outline"} onClick={() => setView("inbound")}>
              Inbound Ticket
            </Button>
            <Button className="w-full sm:w-auto" size="sm" variant={view === "outbound" ? "default" : "outline"} onClick={() => setView("outbound")}>
              Outbound Ticket
            </Button>
            <Button className="w-full sm:w-auto" size="sm" variant="outline" asChild>
              <Link href="/scrap-metal/tickets/held">Held Tickets ({heldInbound + heldOutbound})</Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Inbound Held: {heldInbound}</Badge>
              <Badge variant="outline">Outbound Held: {heldOutbound}</Badge>
              <Badge variant="outline">Offline Queue: {offlineQueueCount}</Badge>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              variant="outline"
              disabled={syncingOfflineQueue || offlineQueueCount === 0}
              onClick={() => void syncOfflineTickets()}
            >
              {syncingOfflineQueue ? "Syncing..." : "Sync Offline Queue"}
            </Button>
          </div>
        }
      >
        {view === "inbound" ? (
          <Card>
            <CardHeader>
              <CardTitle>New Inbound Ticket</CardTitle>
              <CardDescription>Simplified for small operators: fill key fields, hold/finalize, and export PDF instantly.</CardDescription>
              
            </CardHeader>
            <CardContent className="space-y-4 pb-28 md:pb-2">
              {inboundErrors.form ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {inboundErrors.form}
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-3">
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
                  <label className="text-sm font-semibold">Buyer / Cashier</label>
                  <Select value={inbound.employeeId} onValueChange={(value) => setInbound((prev) => ({ ...prev, employeeId: value }))}>
                    <SelectTrigger aria-invalid={Boolean(inboundErrors.employeeId)} aria-describedby={inboundErrors.employeeId ? "inbound-employee-error" : undefined}>
                      <SelectValue placeholder="Select buyer" />
                    </SelectTrigger>
                    <SelectContent>
                      {(employeesQuery.data?.data ?? []).map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldHelp id="inbound-employee-error" error={inboundErrors.employeeId} />
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
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Supplier (Seller)</label>
                  <Select value={inbound.sellerId} onValueChange={(value) => setInbound((prev) => ({ ...prev, sellerId: value }))}>
                    <SelectTrigger aria-invalid={Boolean(inboundErrors.sellerId)} aria-describedby={inboundErrors.sellerId ? "inbound-seller-error" : undefined}>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((seller) => (
                        <SelectItem key={seller.id} value={seller.id}>{seller.fullName} ({seller.phone})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldHelp id="inbound-seller-error" error={inboundErrors.sellerId} />
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuickCreateOpen(true)}>Quick-create Supplier</Button>
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
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Category</label>
                  <Select value={inbound.category} onValueChange={(value) => setInbound((prev) => applyPriceSuggestion({ ...prev, category: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"].map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="inbound-weight">Weight (kg)</label>
                  <Input id="inbound-weight" type="number" min="0" step="0.01" value={inbound.weight} aria-invalid={Boolean(inboundErrors.weight)} aria-describedby={inboundErrors.weight ? "inbound-weight-error" : undefined} onChange={(e) => setInbound((prev) => ({ ...prev, weight: e.target.value }))} />
                  <FieldHelp id="inbound-weight-error" error={inboundErrors.weight} />
                  <Button type="button" size="sm" variant="outline" onClick={() => void readInboundWeightFromScale()}>Read Scale</Button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="inbound-price">Price / kg</label>
                  <Input id="inbound-price" type="number" min="0" step="0.01" value={inbound.pricePerKg} aria-invalid={Boolean(inboundErrors.pricePerKg)} aria-describedby={inboundErrors.pricePerKg ? "inbound-price-error" : undefined} onChange={(e) => setInbound((prev) => ({ ...prev, pricePerKg: e.target.value }))} />
                  <FieldHelp id="inbound-price-error" error={inboundErrors.pricePerKg} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Currency</label>
                  <Input value={inbound.currency} onChange={(e) => setInbound((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="inbound-payment-method">Payment method</label>
                  <Input
                    id="inbound-payment-method"
                    placeholder="Cash / EcoCash / Transfer"
                    value={inbound.paymentMethod}
                    aria-invalid={Boolean(inboundErrors.paymentMethod)}
                    aria-describedby={inboundErrors.paymentMethod ? "inbound-payment-method-error" : undefined}
                    onChange={(e) => setInbound((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                  />
                  <FieldHelp id="inbound-payment-method-error" error={inboundErrors.paymentMethod} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="inbound-payment-reference">Payment reference</label>
                  <Input
                    id="inbound-payment-reference"
                    placeholder="Reference / Receipt"
                    value={inbound.paymentReference}
                    aria-invalid={Boolean(inboundErrors.paymentReference)}
                    aria-describedby={inboundErrors.paymentReference ? "inbound-payment-reference-error" : undefined}
                    onChange={(e) => setInbound((prev) => ({ ...prev, paymentReference: e.target.value }))}
                  />
                  <FieldHelp id="inbound-payment-reference-error" error={inboundErrors.paymentReference} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="inbound-notes">Notes</label>
                <Textarea
                  id="inbound-notes"
                  rows={3}
                  placeholder="Add ticket notes"
                  value={inbound.notes}
                  aria-invalid={Boolean(inboundErrors.notes)}
                  aria-describedby={inboundErrors.notes ? "inbound-notes-error" : undefined}
                  onChange={(e) => setInbound((prev) => ({ ...prev, notes: e.target.value }))}
                />
                <FieldHelp id="inbound-notes-error" error={inboundErrors.notes} />
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
                <p className="text-xs text-muted-foreground">{inbound.attachments.length} photo(s) attached.</p>
                <FieldHelp id="inbound-attachments-error" error={inboundErrors.attachments} />
              </div>

              <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:static md:mx-0 md:bg-transparent md:px-0 md:pt-4">
                <div className="grid gap-2 md:flex md:flex-wrap md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full md:w-auto"
                  disabled={busy}
                  onClick={() => {
                    saveLocalTicketDraft("inbound", inbound);
                    toast({ title: "Inbound draft saved locally", variant: "success" });
                  }}
                >
                  Save Local Draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full md:w-auto"
                  disabled={busy}
                  onClick={() => {
                    const localDraft = loadLocalTicketDraft<InboundForm>("inbound");
                    if (!localDraft) {
                      toast({ title: "No local inbound draft found", variant: "destructive" });
                      return;
                    }
                    setInbound(localDraft.payload);
                    toast({ title: `Inbound draft restored (${new Date(localDraft.savedAt).toLocaleString()})`, variant: "success" });
                  }}
                >
                  Load Local Draft
                </Button>
                <Button className="w-full md:w-auto" type="button" variant="outline" disabled={busy} onClick={() => validateInbound() && inboundMutation.mutate("hold")}>Hold Ticket</Button>
                <Button className="w-full md:w-auto" type="button" variant="outline" disabled={busy} onClick={() => validateInbound() && inboundMutation.mutate("finalize")}>Finalize</Button>
                <Button className="w-full md:w-auto" type="button" disabled={busy} onClick={() => validateInbound() && inboundMutation.mutate("finalize_print")}>Finalize & Export PDF</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>New Outbound Ticket</CardTitle>
              <CardDescription>Choose lot, capture accepted weight, submit for approval, and export PDF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-28 md:pb-2">
              {outboundErrors.form ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {outboundErrors.form}
                </div>
              ) : null}
              {!canCreateOutbound ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Managers and Superadmins can submit outbound tickets directly. Operators can save a draft as a Request Approval.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Lot</label>
                  <Select
                    value={outbound.batchId}
                    onValueChange={(value) => {
                      const batch = batches.find((x) => x.id === value);
                      setOutbound((prev) => ({ ...prev, batchId: value, recordedWeight: String(batch?.totalWeight ?? ""), soldWeight: prev.soldWeight || String(batch?.totalWeight ?? "") }));
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
                  <Input
                    id="outbound-recorded"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Recorded kg"
                    value={outbound.recordedWeight}
                    onChange={(e) => setOutbound((prev) => ({ ...prev, recordedWeight: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-buyer-name">Buyer name</label>
                  <Input id="outbound-buyer-name" placeholder="Buyer name" value={outbound.buyerName} aria-invalid={Boolean(outboundErrors.buyerName)} aria-describedby={outboundErrors.buyerName ? "outbound-buyer-error" : undefined} onChange={(e) => setOutbound((prev) => ({ ...prev, buyerName: e.target.value }))} />
                  <FieldHelp id="outbound-buyer-error" error={outboundErrors.buyerName} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-buyer-contact">Buyer contact</label>
                  <Input id="outbound-buyer-contact" placeholder="Buyer contact" value={outbound.buyerContact} onChange={(e) => setOutbound((prev) => ({ ...prev, buyerContact: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-sold-weight">Accepted kg</label>
                  <Input id="outbound-sold-weight" type="number" min="0" step="0.01" placeholder="Accepted kg" value={outbound.soldWeight} aria-invalid={Boolean(outboundErrors.soldWeight)} aria-describedby={outboundErrors.soldWeight ? "outbound-weight-error" : undefined} onChange={(e) => setOutbound((prev) => ({ ...prev, soldWeight: e.target.value }))} />
                  <FieldHelp id="outbound-weight-error" error={outboundErrors.soldWeight} />
                  <Button type="button" size="sm" variant="outline" onClick={() => void readOutboundWeightFromScale()}>Read Scale</Button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-price">Price / kg</label>
                  <Input id="outbound-price" type="number" min="0" step="0.01" placeholder="Price / kg" value={outbound.pricePerKg} aria-invalid={Boolean(outboundErrors.pricePerKg)} aria-describedby={outboundErrors.pricePerKg ? "outbound-price-error" : undefined} onChange={(e) => setOutbound((prev) => ({ ...prev, pricePerKg: e.target.value }))} />
                  <FieldHelp id="outbound-price-error" error={outboundErrors.pricePerKg} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-currency">Currency</label>
                  <Input id="outbound-currency" placeholder="Currency" value={outbound.currency} onChange={(e) => setOutbound((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-payment-method">Payment method</label>
                  <Input
                    id="outbound-payment-method"
                    placeholder="Payment method"
                    value={outbound.paymentMethod}
                    aria-invalid={Boolean(outboundErrors.paymentMethod)}
                    aria-describedby={outboundErrors.paymentMethod ? "outbound-payment-method-error" : undefined}
                    onChange={(e) => setOutbound((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                  />
                  <FieldHelp id="outbound-payment-method-error" error={outboundErrors.paymentMethod} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="outbound-payment-reference">Payment reference</label>
                  <Input
                    id="outbound-payment-reference"
                    placeholder="Payment reference"
                    value={outbound.paymentReference}
                    aria-invalid={Boolean(outboundErrors.paymentReference)}
                    aria-describedby={outboundErrors.paymentReference ? "outbound-payment-reference-error" : undefined}
                    onChange={(e) => setOutbound((prev) => ({ ...prev, paymentReference: e.target.value }))}
                  />
                  <FieldHelp id="outbound-payment-reference-error" error={outboundErrors.paymentReference} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="outbound-notes">Notes</label>
                <Textarea
                  id="outbound-notes"
                  rows={3}
                  placeholder="Notes"
                  value={outbound.notes}
                  aria-invalid={Boolean(outboundErrors.notes)}
                  aria-describedby={outboundErrors.notes ? "outbound-notes-error" : undefined}
                  onChange={(e) => setOutbound((prev) => ({ ...prev, notes: e.target.value }))}
                />
                <FieldHelp id="outbound-notes-error" error={outboundErrors.notes} />
              </div>
              {selectedBatch ? <p className="text-xs text-muted-foreground">Selected lot: {selectedBatch.batchNumber} at {selectedBatch.site.name}.</p> : null}

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
                <p className="text-xs text-muted-foreground">{outbound.attachments.length} photo(s) attached.</p>
                <FieldHelp id="outbound-attachments-error" error={outboundErrors.attachments} />
              </div>

              <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:static md:mx-0 md:bg-transparent md:px-0 md:pt-4">
                <div className="grid gap-2 md:flex md:flex-wrap md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full md:w-auto"
                  disabled={busy}
                  onClick={() => {
                    saveLocalTicketDraft("outbound", outbound);
                    toast({ title: "Outbound draft saved locally", variant: "success" });
                  }}
                >
                  Save Local Draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full md:w-auto"
                  disabled={busy}
                  onClick={() => {
                    const localDraft = loadLocalTicketDraft<OutboundForm>("outbound");
                    if (!localDraft) {
                      toast({ title: "No local outbound draft found", variant: "destructive" });
                      return;
                    }
                    setOutbound(localDraft.payload);
                    toast({ title: `Outbound draft restored (${new Date(localDraft.savedAt).toLocaleString()})`, variant: "success" });
                  }}
                >
                  Load Local Draft
                </Button>
                <Button className="w-full md:w-auto" type="button" variant="outline" disabled={busy} onClick={() => validateOutbound() && outboundMutation.mutate("hold")}>Hold Ticket</Button>
                {canCreateOutbound ? (
                  <>
                    <Button className="w-full md:w-auto" type="button" variant="outline" disabled={busy} onClick={() => validateOutbound() && outboundMutation.mutate("submit")}>Submit</Button>
                    <Button className="w-full md:w-auto" type="button" disabled={busy} onClick={() => validateOutbound() && outboundMutation.mutate("submit_print")}>Submit & Export PDF</Button>
                  </>
                ) : (
                  <Button className="w-full md:w-auto" type="button" disabled={busy} onClick={() => validateOutbound() && outboundMutation.mutate("request_approval")}>Request Approval</Button>
                )}
                </div>
              </div>
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
