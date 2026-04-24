"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  OFFLINE_ENTITIES_CHANGED_EVENT,
  OFFLINE_OUTBOX_CHANGED_EVENT,
} from "@/lib/offline/events";
import { hasRole } from "@/lib/roles";
import {
  listPendingPurchaseTickets,
  listPendingSaleTickets,
  type PendingPurchaseTicketRecord,
  type PendingSaleTicketRecord,
} from "@/lib/scrap-metal/offline-ticket";
import type { LocalScrapTicketPhoto } from "@/lib/scrap-metal/offline-runtime";

type HeldPurchase = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  sellerName?: string | null;
  category: string;
  weight: number;
  totalAmount: number;
  currency: string;
  status: string;
};

type HeldSale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  buyerName: string;
  soldWeight: number;
  totalAmount: number;
  currency: string;
  status: string;
};

type HeldInboundRow = {
  id: string;
  ticketNumber: string;
  ticketDate: string;
  sellerName: string;
  category: string;
  weight: number;
  totalAmount: number;
  currency: string;
  status: string;
  source: "server" | "local";
  queueStatus?: string;
  lastError?: string;
  attachments: LocalScrapTicketPhoto[];
  serverId?: string;
  localTicketId?: string;
};

type HeldOutboundRow = {
  id: string;
  ticketNumber: string;
  ticketDate: string;
  buyerName: string;
  soldWeight: number;
  totalAmount: number;
  currency: string;
  status: string;
  source: "server" | "local";
  queueStatus?: string;
  lastError?: string;
  attachments: LocalScrapTicketPhoto[];
  serverId?: string;
  localTicketId?: string;
};

function formatMoney(currency: string, amount: number) {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatQueueStatus(status?: string) {
  if (!status) return "Queued";
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

function PhotoPreviewStrip({ attachments }: { attachments: LocalScrapTicketPhoto[] }) {
  if (attachments.length === 0) {
    return <p className="text-xs text-muted-foreground">No photos attached.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.slice(0, 4).map((attachment, index) => (
        <a
          key={`${attachment.pathname ?? attachment.url}-${index}`}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className="overflow-hidden rounded-lg border border-[var(--edge-subtle)]"
        >
          <img
            src={attachment.url}
            alt={`Ticket photo ${index + 1}`}
            className="h-14 w-14 object-cover"
          />
        </a>
      ))}
      {attachments.length > 4 ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-muted)] text-xs font-medium text-muted-foreground">
          +{attachments.length - 4}
        </div>
      ) : null}
    </div>
  );
}

export default function HeldTicketsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { tenantKey } = useOfflineRuntime();
  const canManageSales = hasRole(
    (session?.user as { role?: string } | undefined)?.role,
    ["SUPERADMIN", "MANAGER"],
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState("inbound");

  const heldPurchasesQuery = useQuery({
    queryKey: ["scrap-held-inbound-tickets"],
    queryFn: async () => {
      const response = await fetchJson<{ data: HeldPurchase[] }>(
        "/api/scrap-metal/purchases?status=DRAFT&limit=300",
      );
      return response.data;
    },
  });

  const heldSalesQuery = useQuery({
    queryKey: ["scrap-held-outbound-tickets"],
    queryFn: async () => {
      const response = await fetchJson<{ data: HeldSale[] }>(
        "/api/scrap-metal/sales?status=DRAFT&limit=300",
      );
      return response.data;
    },
  });

  const localInboundQuery = useQuery({
    queryKey: ["scrap-local-held-inbound", tenantKey],
    queryFn: () => (tenantKey ? listPendingPurchaseTickets(tenantKey) : Promise.resolve([])),
  });

  const localOutboundQuery = useQuery({
    queryKey: ["scrap-local-held-outbound", tenantKey],
    queryFn: () => (tenantKey ? listPendingSaleTickets(tenantKey) : Promise.resolve([])),
  });

  useEffect(() => {
    const onEntitiesChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["scrap-local-held-inbound"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-local-held-outbound"] });
    };

    window.addEventListener(OFFLINE_ENTITIES_CHANGED_EVENT, onEntitiesChanged);
    window.addEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, onEntitiesChanged);
    window.addEventListener("online", onEntitiesChanged);

    return () => {
      window.removeEventListener(OFFLINE_ENTITIES_CHANGED_EVENT, onEntitiesChanged);
      window.removeEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, onEntitiesChanged);
      window.removeEventListener("online", onEntitiesChanged);
    };
  }, [queryClient]);

  const finalizeInboundMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/scrap-metal/purchases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "POSTED" }),
      }),
    onSuccess: () => {
      toast({ title: "Inbound ticket finalized", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-held-inbound-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to finalize inbound ticket",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const finalizeOutboundMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/scrap-metal/sales/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "PENDING_APPROVAL" }),
      }),
    onSuccess: () => {
      toast({ title: "Outbound ticket submitted for approval", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-held-outbound-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to submit outbound ticket",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const inboundRows = useMemo<HeldInboundRow[]>(() => {
    const serverRows = (heldPurchasesQuery.data ?? []).map((ticket) => ({
      id: `server:${ticket.id}`,
      ticketNumber: ticket.purchaseNumber,
      ticketDate: ticket.purchaseDate,
      sellerName: ticket.sellerName || "-",
      category: ticket.category,
      weight: ticket.weight,
      totalAmount: ticket.totalAmount,
      currency: ticket.currency,
      status: ticket.status,
      source: "server" as const,
      attachments: [],
      serverId: ticket.id,
    }));

    const localRows = (localInboundQuery.data ?? [])
      .filter((ticket: PendingPurchaseTicketRecord) => ticket.status === "DRAFT")
      .map((ticket: PendingPurchaseTicketRecord) => ({
      id: `local:${ticket.id}`,
      ticketNumber: ticket.ticketNumber,
      ticketDate: ticket.ticketDate,
      sellerName: ticket.sellerName,
      category: ticket.category,
      weight: ticket.weight,
      totalAmount: ticket.total,
      currency: ticket.currency,
      status: ticket.status,
      source: "local" as const,
      queueStatus: formatQueueStatus(ticket.outboxStatus),
      lastError: ticket.lastError,
      attachments: ticket.photos,
      localTicketId: ticket.id,
    }));

    return [...localRows, ...serverRows].sort(
      (left, right) => new Date(right.ticketDate).getTime() - new Date(left.ticketDate).getTime(),
    );
  }, [heldPurchasesQuery.data, localInboundQuery.data]);

  const outboundRows = useMemo<HeldOutboundRow[]>(() => {
    const serverRows = (heldSalesQuery.data ?? []).map((ticket) => ({
      id: `server:${ticket.id}`,
      ticketNumber: ticket.saleNumber,
      ticketDate: ticket.saleDate,
      buyerName: ticket.buyerName,
      soldWeight: ticket.soldWeight,
      totalAmount: ticket.totalAmount,
      currency: ticket.currency,
      status: ticket.status,
      source: "server" as const,
      attachments: [],
      serverId: ticket.id,
    }));

    const localRows = (localOutboundQuery.data ?? [])
      .filter((ticket: PendingSaleTicketRecord) => ticket.status === "DRAFT")
      .map((ticket: PendingSaleTicketRecord) => ({
      id: `local:${ticket.id}`,
      ticketNumber: ticket.ticketNumber,
      ticketDate: ticket.ticketDate,
      buyerName: ticket.buyerName,
      soldWeight: ticket.soldWeight,
      totalAmount: ticket.total,
      currency: ticket.currency,
      status: ticket.status,
      source: "local" as const,
      queueStatus: formatQueueStatus(ticket.outboxStatus),
      lastError: ticket.lastError,
      attachments: ticket.photos,
      localTicketId: ticket.id,
    }));

    return [...localRows, ...serverRows].sort(
      (left, right) => new Date(right.ticketDate).getTime() - new Date(left.ticketDate).getTime(),
    );
  }, [heldSalesQuery.data, localOutboundQuery.data]);

  const openQueuedTicket = useCallback((
    type: "inbound" | "outbound",
    clientRequestId?: string,
  ) => {
    if (!clientRequestId) return;
    router.push(
      `/scrap-metal/tickets?queuedType=${type}&queuedTicketId=${encodeURIComponent(clientRequestId)}`,
    );
  }, [router]);

  const inboundColumns = useMemo<ColumnDef<HeldInboundRow>[]>(
    () => [
      {
        id: "ticket",
        header: "Ticket #",
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.ticketNumber}</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={row.original.source === "local" ? "secondary" : "outline"}>
                {row.original.source === "local" ? "Queued Offline" : "Server Draft"}
              </Badge>
              {row.original.queueStatus ? (
                <span className="text-xs text-muted-foreground">{row.original.queueStatus}</span>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => new Date(row.original.ticketDate).toLocaleString(),
      },
      { id: "supplier", header: "Supplier", accessorKey: "sellerName" },
      { id: "material", header: "Material", accessorKey: "category" },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => formatMoney(row.original.currency, row.original.totalAmount),
      },
      {
        id: "photos",
        header: "Photos",
        cell: ({ row }) =>
          row.original.attachments.length > 0 ? (
            <PhotoPreviewStrip attachments={row.original.attachments} />
          ) : (
            <span className="text-xs text-muted-foreground">No photos</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {row.original.source === "local" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openQueuedTicket("inbound", row.original.localTicketId)}
                >
                  Resume Offline
                </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/scrap-metal/purchases?edit=${row.original.serverId}`}>Resume</Link>
                </Button>
                <Button
                  size="sm"
                  onClick={() => row.original.serverId && finalizeInboundMutation.mutate(row.original.serverId)}
                  disabled={finalizeInboundMutation.isPending}
                >
                  Finalize
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [finalizeInboundMutation, openQueuedTicket],
  );

  const outboundColumns = useMemo<ColumnDef<HeldOutboundRow>[]>(
    () => [
      {
        id: "ticket",
        header: "Ticket #",
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.ticketNumber}</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={row.original.source === "local" ? "secondary" : "outline"}>
                {row.original.source === "local" ? "Queued Offline" : "Server Draft"}
              </Badge>
              {row.original.queueStatus ? (
                <span className="text-xs text-muted-foreground">{row.original.queueStatus}</span>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => new Date(row.original.ticketDate).toLocaleString(),
      },
      { id: "buyer", header: "Buyer", accessorKey: "buyerName" },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => formatMoney(row.original.currency, row.original.totalAmount),
      },
      {
        id: "photos",
        header: "Photos",
        cell: ({ row }) =>
          row.original.attachments.length > 0 ? (
            <PhotoPreviewStrip attachments={row.original.attachments} />
          ) : (
            <span className="text-xs text-muted-foreground">No photos</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {row.original.source === "local" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openQueuedTicket("outbound", row.original.localTicketId)}
                >
                  Resume Offline
                </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/scrap-metal/sales?edit=${row.original.serverId}`}>Resume</Link>
                </Button>
                <Button
                  size="sm"
                  onClick={() => row.original.serverId && finalizeOutboundMutation.mutate(row.original.serverId)}
                  disabled={finalizeOutboundMutation.isPending || !canManageSales}
                  title={!canManageSales ? "Manager approval is required to submit outbound tickets." : undefined}
                >
                  {canManageSales ? "Submit" : "Manager Needed"}
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [canManageSales, finalizeOutboundMutation, openQueuedTicket],
  );

  const views = [
    { id: "inbound", label: "Inbound Drafts", count: inboundRows.length },
    { id: "outbound", label: "Outbound Drafts", count: outboundRows.length },
  ];

  const isInboundLoading = heldPurchasesQuery.isLoading || localInboundQuery.isLoading;
  const isOutboundLoading = heldSalesQuery.isLoading || localOutboundQuery.isLoading;

  return (
    <ScrapShell
      title="Held / Draft Tickets"
      actions={
        <div className="grid w-full gap-2 sm:flex sm:flex-wrap">
          <Button className="w-full sm:w-auto" asChild size="sm" variant="outline">
            <Link href="/scrap-metal/purchases">Inbound Tickets</Link>
          </Button>
          <Button className="w-full sm:w-auto" asChild size="sm" variant="outline">
            <Link href="/scrap-metal/sales">Outbound Tickets</Link>
          </Button>
          {canManageSales ? (
            <Button className="w-full sm:w-auto" asChild size="sm" variant="outline">
              <Link href="/scrap-metal/sales/approval-requests">Approval Requests</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <VerticalDataViews items={views} value={activeView} onValueChange={setActiveView} railLabel="Ticket Type">
        {activeView === "inbound" ? (
          heldPurchasesQuery.error && inboundRows.length === 0 ? (
            <StatusState variant="error" title="Unable to load held inbound tickets" />
          ) : (
            <>
              <div className="hidden md:block">
                <DataTable
                  data={inboundRows}
                  columns={inboundColumns}
                  searchPlaceholder="Search inbound held tickets"
                  pagination={{ enabled: true }}
                  emptyState={isInboundLoading ? "Loading held tickets..." : "No held inbound tickets."}
                />
              </div>
              <div className="space-y-3 md:hidden">
                {inboundRows.map((ticket) => (
                  <article key={ticket.id} className="rounded-2xl border border-[var(--edge-subtle)] bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{ticket.ticketNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(ticket.ticketDate).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant={ticket.source === "local" ? "secondary" : "outline"}>
                        {ticket.source === "local" ? ticket.queueStatus ?? "Queued" : ticket.category}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div>Supplier: {ticket.sellerName}</div>
                      <div>Weight: {ticket.weight.toFixed(2)} kg</div>
                      <div className="font-mono">{formatMoney(ticket.currency, ticket.totalAmount)}</div>
                      {ticket.lastError ? (
                        <div className="text-xs text-destructive">{ticket.lastError}</div>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <PhotoPreviewStrip attachments={ticket.attachments} />
                    </div>
                    <div className="mt-4 grid gap-2">
                      {ticket.source === "local" ? (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => openQueuedTicket("inbound", ticket.localTicketId)}
                        >
                          Resume Offline
                        </Button>
                      ) : (
                        <>
                          <Button className="w-full" variant="outline" asChild>
                            <Link href={`/scrap-metal/purchases?edit=${ticket.serverId}`}>Resume</Link>
                          </Button>
                          <Button
                            className="w-full"
                            onClick={() => ticket.serverId && finalizeInboundMutation.mutate(ticket.serverId)}
                            disabled={finalizeInboundMutation.isPending}
                          >
                            Finalize
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
                {!isInboundLoading && inboundRows.length === 0 ? (
                  <StatusState variant="empty" title="No held inbound tickets" />
                ) : null}
              </div>
            </>
          )
        ) : heldSalesQuery.error && outboundRows.length === 0 ? (
          <StatusState variant="error" title="Unable to load held outbound tickets" />
        ) : (
          <>
            <div className="hidden md:block">
              <DataTable
                data={outboundRows}
                columns={outboundColumns}
                searchPlaceholder="Search outbound held tickets"
                pagination={{ enabled: true }}
                emptyState={isOutboundLoading ? "Loading held tickets..." : "No held outbound tickets."}
              />
            </div>
            <div className="space-y-3 md:hidden">
              {outboundRows.map((ticket) => (
                <article key={ticket.id} className="rounded-2xl border border-[var(--edge-subtle)] bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{ticket.ticketNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(ticket.ticketDate).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant={ticket.source === "local" ? "secondary" : "outline"}>
                      {ticket.source === "local" ? ticket.queueStatus ?? "Queued" : "Outbound"}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div>Buyer: {ticket.buyerName}</div>
                    <div>Accepted: {ticket.soldWeight.toFixed(2)} kg</div>
                    <div className="font-mono">{formatMoney(ticket.currency, ticket.totalAmount)}</div>
                    {ticket.lastError ? (
                      <div className="text-xs text-destructive">{ticket.lastError}</div>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <PhotoPreviewStrip attachments={ticket.attachments} />
                  </div>
                  <div className="mt-4 grid gap-2">
                    {ticket.source === "local" ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => openQueuedTicket("outbound", ticket.localTicketId)}
                      >
                        Resume Offline
                      </Button>
                    ) : (
                      <>
                        <Button className="w-full" variant="outline" asChild>
                          <Link href={`/scrap-metal/sales?edit=${ticket.serverId}`}>Resume</Link>
                        </Button>
                        <Button
                          className="w-full"
                          onClick={() => ticket.serverId && finalizeOutboundMutation.mutate(ticket.serverId)}
                          disabled={finalizeOutboundMutation.isPending || !canManageSales}
                          title={!canManageSales ? "Manager approval is required to submit outbound tickets." : undefined}
                        >
                          {canManageSales ? "Submit" : "Manager Needed"}
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              ))}
              {!isOutboundLoading && outboundRows.length === 0 ? (
                <StatusState variant="empty" title="No held outbound tickets" />
              ) : null}
            </div>
          </>
        )}
      </VerticalDataViews>
    </ScrapShell>
  );
}
