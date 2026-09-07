"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Field, Input } from "@corelithzw/react";

import { useToast } from "@corelithzw/ui/components/use-toast";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

type EndpointRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  pendingDeliveries: number;
};

type EventEntry = { type: string; description: string };

type DeliveryRow = {
  id: string;
  status: "PENDING" | "DELIVERED" | "FAILED";
  attemptCount: number;
  nextAttemptAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  event: { id: string; type: string; createdAt: string };
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * A workspace's webhook endpoints: register one against the events the
 * composed modules announce, read the secret once, watch what was delivered,
 * deactivate it when it is done.
 */
export function WebhooksPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [url, setUrl] = React.useState("");
  const [events, setEvents] = React.useState<string[]>(["*"]);
  const [revealed, setRevealed] = React.useState<{ url: string; secret: string } | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);

  const endpointsQuery = useQuery({
    queryKey: ["preferences", "organization", "webhooks"],
    queryFn: () => fetchJson<{ data: EndpointRow[]; events: EventEntry[] }>("/api/v2/webhooks"),
  });
  const deliveriesQuery = useQuery({
    queryKey: ["preferences", "organization", "webhooks", selected, "deliveries"],
    queryFn: () => fetchJson<{ data: DeliveryRow[] }>(`/api/v2/webhooks/${selected}/deliveries`),
    enabled: Boolean(selected),
  });

  const createMutation = useMutation({
    mutationFn: (input: { url: string; events: string[] }) =>
      fetchJson<{ data: EndpointRow & { secret: string } }>("/api/v2/webhooks", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (result) => {
      setRevealed({ url: result.data.url, secret: result.data.secret });
      setUrl("");
      setEvents(["*"]);
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "webhooks"] });
    },
    onError: (error) => toast({ title: "Could not register the endpoint", description: getApiErrorMessage(error), variant: "destructive" }),
  });
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => fetchJson<{ data: { id: string } }>(`/api/v2/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Endpoint deactivated" });
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "webhooks"] });
    },
    onError: (error) => toast({ title: "Could not deactivate the endpoint", description: getApiErrorMessage(error), variant: "destructive" }),
  });
  const deliverMutation = useMutation({
    mutationFn: () => fetchJson<{ data: { claimed: number; delivered: number } }>("/api/v2/webhooks/deliver", { method: "POST" }),
    onSuccess: (result) => {
      toast({ title: `Delivery pass: ${result.data.delivered} of ${result.data.claimed} delivered` });
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "webhooks"] });
    },
    onError: (error) => toast({ title: "Delivery pass failed", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  async function deactivate(row: EndpointRow) {
    const confirmed = await dsConfirm({
      title: "Deactivate endpoint",
      description: `${row.url} stops receiving events; its deliveries stay on record.`,
      variant: "warning",
      confirmLabel: "Deactivate",
    });
    if (confirmed) deactivateMutation.mutate(row.id);
  }

  const knownEvents = endpointsQuery.data?.events ?? [];
  const rows = endpointsQuery.data?.data ?? [];
  const choices: Array<{ type: string; description: string }> = [{ type: "*", description: "Every event this host announces." }, ...knownEvents];

  return (
    <div className="space-y-6">
      {revealed ? (
        <Alert tone="success" title={`Endpoint registered: ${revealed.url}`}>
          <p className="text-sm">Copy the signing secret now. It is shown once; verify each request's X-Corelith-Signature with it.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-sm">{revealed.secret}</code>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(revealed.secret);
                toast({ title: "Copied" });
              }}
            >
              Copy
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </div>
        </Alert>
      ) : null}

      <form
        className="space-y-4 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim() || events.length === 0) {
            toast({ title: "An https URL and at least one event are required", variant: "destructive" });
            return;
          }
          createMutation.mutate({ url: url.trim(), events });
        }}
      >
        <Field label="Endpoint URL" required>
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/corelith" required />
        </Field>
        <Field label="Events" required>
          <div className="space-y-1 rounded border border-border p-2">
            {choices.map((choice) => (
              <label key={choice.type} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={events.includes(choice.type)}
                  onChange={(event) =>
                    setEvents((current) =>
                      event.target.checked ? [...current, choice.type] : current.filter((item) => item !== choice.type),
                    )
                  }
                />
                <span>
                  <code>{choice.type}</code> <span className="text-muted-foreground">— {choice.description}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Registering…" : "Register endpoint"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => deliverMutation.mutate()} disabled={deliverMutation.isPending}>
            {deliverMutation.isPending ? "Delivering…" : "Deliver pending now"}
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">URL</th>
              <th className="py-2 pr-4 font-medium">Events</th>
              <th className="py-2 pr-4 font-medium">Pending</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-muted-foreground" colSpan={5}>
                  {endpointsQuery.isPending ? "Loading…" : "No endpoints yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2 pr-4">
                    <code className="break-all">{row.url}</code>
                  </td>
                  <td className="py-2 pr-4">{row.events.join(", ")}</td>
                  <td className="py-2 pr-4">{row.pendingDeliveries}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={row.active ? "success" : "outline"}>{row.active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setSelected(selected === row.id ? null : row.id)}>
                        {selected === row.id ? "Hide deliveries" : "Deliveries"}
                      </Button>
                      {row.active ? (
                        <Button type="button" variant="secondary" onClick={() => void deactivate(row)} disabled={deactivateMutation.isPending}>
                          Deactivate
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="overflow-x-auto rounded-lg border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Recent deliveries</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Attempts</th>
                <th className="py-2 pr-4 font-medium">Last answer</th>
                <th className="py-2 pr-4 font-medium">Next attempt</th>
                <th className="py-2 pr-4 font-medium">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {(deliveriesQuery.data?.data ?? []).length === 0 ? (
                <tr>
                  <td className="py-3 text-muted-foreground" colSpan={6}>
                    {deliveriesQuery.isPending ? "Loading…" : "Nothing delivered to this endpoint yet."}
                  </td>
                </tr>
              ) : (
                (deliveriesQuery.data?.data ?? []).map((delivery) => (
                  <tr key={delivery.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      <code>{delivery.event.type}</code>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={delivery.status === "DELIVERED" ? "success" : delivery.status === "FAILED" ? "danger" : "outline"}>
                        {delivery.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">{delivery.attemptCount}</td>
                    <td className="py-2 pr-4">{delivery.lastStatusCode ?? "—"}{delivery.lastError ? ` · ${delivery.lastError}` : ""}</td>
                    <td className="py-2 pr-4">{formatDate(delivery.nextAttemptAt)}</td>
                    <td className="py-2 pr-4">{formatDate(delivery.deliveredAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
