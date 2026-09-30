"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadChannel } from "@prisma/client";

import { ReportTable, node, txt, type ReportRow } from "@/components/accounting/report-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plug, TriangleAlert } from "@/lib/icons";
import { CRM_CHANNEL_LABELS } from "@/lib/crm/sources";
import { cn } from "@/lib/utils";

import { SetupNote, SetupPanel } from "./setup-chrome";

type Connection = {
  id: string;
  pageId: string;
  pageName: string | null;
  authorizedByName: string | null;
  formIds: string[];
  defaultChannel: CrmLeadChannel;
  defaultSourceLabel: string | null;
  isActive: boolean;
  verifiedAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
};

type PickablePage = {
  id: string;
  name: string;
  alreadyConnected: boolean;
  unavailable: boolean;
};

type DeliveryEvent = {
  id: string;
  leadgenId: string;
  formId: string | null;
  status: "RECEIVED" | "INGESTED" | "DUPLICATE" | "IGNORED" | "FAILED";
  leadId: string | null;
  error: string | null;
  createdAt: string;
};

const moment = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

const STATUS_TONE: Record<DeliveryEvent["status"], "ok" | "bad" | "warn" | undefined> = {
  INGESTED: "ok",
  DUPLICATE: undefined,
  IGNORED: undefined,
  RECEIVED: "warn",
  FAILED: "bad",
};

/**
 * Facebook Lead Ads, set up by pressing one button.
 *
 * Everything Meta needs — the app, its secret, the webhook, the access token —
 * belongs to the deployment and is handled by the connect flow. What is left
 * for a person to decide is which Page, so that is the only thing this screen
 * asks. No credential appears anywhere on it, in either direction.
 */
export function FacebookPanel({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openEvents, setOpenEvents] = useState<string | null>(null);

  const connections = useQuery({
    queryKey: ["crm-facebook-connections"],
    queryFn: () =>
      fetchJson<{ data: Connection[]; available: boolean }>("/api/v2/crm/integrations/facebook"),
  });

  const events = useQuery({
    queryKey: ["crm-facebook-events", openEvents],
    enabled: Boolean(openEvents),
    queryFn: () =>
      fetchJson<{ data: DeliveryEvent[] }>(
        `/api/v2/crm/integrations/facebook/${openEvents}/events`,
      ).then((r) => r.data),
  });

  /*
    Coming back from Facebook.

    The callback redirects here with ?facebook=pick once it holds the
    customer's Pages, so the picker is *derived* from the URL rather than
    copied into state: opening it is the continuation of the click they made a
    few seconds ago, and closing it is a navigation that drops the parameter.
    Keeping it in the URL also means a refresh mid-choice reopens the picker
    instead of stranding them.
  */
  const outcome = searchParams.get("facebook");
  const outcomeError = searchParams.get("facebookError");
  const pickerOpen = outcome === "pick";

  const clearOutcome = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("facebook");
    params.delete("facebookError");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // The two outcomes that are only a message. Said once, then cleared, so a
  // refresh does not repeat a failure the customer has already read.
  useEffect(() => {
    if (outcome !== "cancelled" && outcome !== "error") return;

    toast(
      outcome === "cancelled"
        ? { title: "Facebook connection cancelled" }
        : { title: outcomeError ?? "Could not connect to Facebook", variant: "destructive" },
    );
    clearOutcome();
  }, [clearOutcome, outcome, outcomeError, toast]);

  const pages = useQuery({
    queryKey: ["crm-facebook-pages"],
    enabled: pickerOpen,
    retry: false,
    queryFn: () =>
      fetchJson<{ data: PickablePage[]; authorizedByName: string | null }>(
        "/api/v2/crm/integrations/facebook/pages",
      ),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["crm-facebook-connections"] });

  const choose = useMutation({
    mutationFn: (pageId: string) =>
      fetchJson<{ data: Connection; check: { ok: boolean; error: string | null } }>(
        "/api/v2/crm/integrations/facebook/pages",
        { method: "POST", body: JSON.stringify({ pageId }) },
      ),
    onSuccess: (result) => {
      clearOutcome();
      toast(
        result.check.ok
          ? { title: `${result.data.pageName ?? "Page"} connected — leads will arrive here from now on` }
          : {
              title: result.check.error ?? "Connected, but Facebook has not confirmed it yet",
              variant: "destructive",
            },
      );
      invalidate();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const verify = useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ ok: boolean; pageName: string | null; error: string | null }>(
        `/api/v2/crm/integrations/facebook/${id}/verify`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      toast(
        result.ok
          ? { title: `${result.pageName ?? "This Page"} is connected and receiving leads` }
          : { title: result.error ?? "Facebook could not confirm this Page", variant: "destructive" },
      );
      invalidate();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetchJson(`/api/v2/crm/integrations/facebook/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => invalidate(),
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/crm/integrations/facebook/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Page disconnected" });
      setOpenEvents(null);
      invalidate();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const retry = useMutation({
    mutationFn: ({ connectionId, eventId }: { connectionId: string; eventId: string }) =>
      fetchJson<{ status: string; error?: string }>(
        `/api/v2/crm/integrations/facebook/${connectionId}/events/${eventId}`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      toast(
        result.status === "INGESTED"
          ? { title: "Lead created" }
          : { title: result.error ?? `Retry finished as ${result.status}`, variant: "destructive" },
      );
      void queryClient.invalidateQueries({ queryKey: ["crm-facebook-events"] });
      invalidate();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const list = connections.data?.data ?? [];
  const available = connections.data?.available ?? false;

  /** Starting the flow is a full-page navigation to a route that redirects to
   *  Facebook — an action, not a link to a page in this app. */
  const startConnect = useCallback(() => {
    window.location.href = "/api/v2/crm/integrations/facebook/connect";
  }, []);

  // The page band's "Connect Page" action opens the same flow as the button.
  useEffect(() => {
    if (!createOpen) return;
    onCreateOpenChange(false);
    if (available) startConnect();
  }, [available, createOpen, onCreateOpenChange, startConnect]);

  const rows: ReportRow[] = list.map((connection) => {
    // Three states, not two. "Connected but not confirmed" is the one that
    // matters: it is what a Page looks like when Facebook has not actually
    // agreed to send us its leads, and it must never read as working.
    const live = connection.isActive && Boolean(connection.verifiedAt) && !connection.lastError;
    const broken = Boolean(connection.lastError);

    return {
      id: connection.id,
      cells: [
        node(
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "size-[7px] shrink-0 rounded-full",
                live
                  ? "bg-[var(--tone-success)]"
                  : broken
                    ? "bg-[var(--tone-danger)]"
                    : "bg-[var(--tone-warn)]",
              )}
            />
            <span
              className={cn(
                "truncate text-sm font-semibold",
                connection.isActive ? "text-[var(--text-strong)]" : "text-[var(--text-subtle)]",
              )}
            >
              {connection.pageName ?? `Page ${connection.pageId}`}
            </span>
            {connection.isActive ? null : (
              <span className="acct-badge shrink-0" data-tone="bad">
                Paused
              </span>
            )}
            {connection.isActive && !connection.verifiedAt ? (
              <span className="acct-badge shrink-0" data-tone="warn">
                Not confirmed
              </span>
            ) : null}
          </span>,
        ),
        connection.authorizedByName
          ? txt(connection.authorizedByName, { tone: "subtle" })
          : txt("—", { tone: "dim" }),
        txt(CRM_CHANNEL_LABELS[connection.defaultChannel]),
        connection.lastEventAt
          ? txt(moment(connection.lastEventAt) ?? "—", { tone: "subtle" })
          : txt("no leads yet", { tone: "dim" }),
        node(
          <span className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2.5 text-sm"
              onClick={() => setOpenEvents(openEvents === connection.id ? null : connection.id)}
            >
              {openEvents === connection.id ? "Hide" : "Leads"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2.5 text-sm"
              disabled={verify.isPending}
              onClick={() => verify.mutate(connection.id)}
            >
              Test
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2.5 text-sm"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ id: connection.id, isActive: !connection.isActive })}
            >
              {connection.isActive ? "Pause" : "Resume"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2.5 text-sm text-[var(--status-error-text)]"
              disabled={remove.isPending}
              onClick={() => remove.mutate(connection.id)}
            >
              Disconnect
            </Button>
          </span>,
          { align: "right" },
        ),
      ],
    };
  });

  const selected = list.find((connection) => connection.id === openEvents) ?? null;
  const broken = list.filter((connection) => connection.lastError);
  const pickable = pages.data?.data ?? [];

  return (
    <div className="min-w-0">
      {available ? (
        <div className="mb-2.5 flex flex-wrap items-center gap-3 rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface-base)] px-[13px] py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text-strong)]">
              {list.length ? "Connect another Page" : "Connect your Facebook Page"}
            </p>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
              You&rsquo;ll sign in to Facebook and choose which Page to use. Leads from that
              Page&rsquo;s ads start arriving here straight away.
            </p>
          </div>
          <Button className="shrink-0" onClick={startConnect}>
            Connect Facebook
          </Button>
        </div>
      ) : (
        <div className="mb-2.5 rounded-[var(--card-radius)] border border-[var(--tone-warn-bd)] bg-[var(--tone-warn-bg)] px-[13px] py-3">
          <div className="flex items-center gap-2">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-[var(--badge-warn-fg)]" />
            <span className="text-sm font-bold text-[var(--badge-warn-fg)]">
              Facebook is not set up on this deployment yet
            </span>
          </div>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
            Ask your administrator to set <code className="font-mono">FACEBOOK_APP_ID</code>,{" "}
            <code className="font-mono">FACEBOOK_APP_SECRET</code>,{" "}
            <code className="font-mono">FACEBOOK_WEBHOOK_VERIFY_TOKEN</code> and{" "}
            <code className="font-mono">CRM_INTEGRATION_ENCRYPTION_KEY</code>. See
            docs/crm/facebook-lead-ads.md.
          </p>
        </div>
      )}

      {broken.map((connection) => (
        <div
          key={connection.id}
          className="mb-2.5 rounded-[var(--card-radius)] border border-[var(--tone-danger-bd)] bg-[var(--tone-danger-bg)] px-[13px] py-3"
        >
          <p className="text-sm font-bold text-[var(--status-error-text)]">
            {connection.pageName ?? `Page ${connection.pageId}`} needs attention
          </p>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
            {connection.lastError}
            {connection.lastErrorAt ? ` (${moment(connection.lastErrorAt)})` : null}
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={startConnect}>
            Reconnect this Page
          </Button>
        </div>
      ))}

      {connections.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <SetupPanel
          title="Connected Pages"
          hint="a paused Page keeps its leads on Facebook, it does not queue them"
          flush
        >
          <ReportTable
            label="Facebook Lead Ads connections"
            tracks="minmax(0,1fr) 160px 140px 160px 320px"
            columns={[
              { label: "Page" },
              { label: "Connected by" },
              { label: "Channel" },
              { label: "Last lead" },
              { label: "", align: "right" },
            ]}
            rows={rows}
            emptyLabel="No Pages connected yet. Press Connect Facebook to bring your lead ads into the pipeline."
          />
        </SetupPanel>
      )}

      {selected ? (
        <div className="mt-2.5">
          <SetupPanel
            title={`Leads from ${selected.pageName ?? selected.pageId}`}
            hint="Facebook keeps a lead's answers for 90 days; a retry after that returns nothing"
            flush
          >
            {events.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <ReportTable
                label="Recent Facebook deliveries"
                tracks="180px 130px minmax(0,1fr) 160px 110px"
                columns={[
                  { label: "Received" },
                  { label: "Result" },
                  { label: "Detail" },
                  { label: "Lead form" },
                  { label: "", align: "right" },
                ]}
                rows={(events.data ?? []).map((event) => ({
                  id: event.id,
                  cells: [
                    txt(moment(event.createdAt) ?? "—", { tone: "subtle" }),
                    node(
                      <span className="acct-badge" data-tone={STATUS_TONE[event.status]}>
                        {event.status.toLowerCase()}
                      </span>,
                    ),
                    event.error
                      ? txt(event.error, { tone: "subtle" })
                      : event.leadId
                        ? txt("Lead created", { tone: "subtle" })
                        : txt("—", { tone: "dim" }),
                    event.formId ? txt(event.formId, { mono: true, tone: "subtle" }) : txt("—", { tone: "dim" }),
                    node(
                      event.status === "FAILED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2.5 text-sm"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate({ connectionId: selected.id, eventId: event.id })}
                        >
                          Retry
                        </Button>
                      ) : null,
                      { align: "right" },
                    ),
                  ],
                }))}
                emptyLabel="Nothing yet. Send yourself a test lead with Facebook's Lead Ads Testing Tool."
              />
            )}
          </SetupPanel>
        </div>
      ) : null}

      <SetupNote icon={Plug}>
        <b className="font-semibold text-[var(--text-body)]">Test</b> asks Facebook to confirm it is
        still sending this Page&rsquo;s leads here. Press it if leads stop arriving — it usually says
        exactly what is wrong.
      </SetupNote>

      <Dialog open={pickerOpen} onOpenChange={(open) => { if (!open) clearOutcome(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose your Page</DialogTitle>
          </DialogHeader>

          {pages.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : pages.isError ? (
            <p className="text-pretty text-sm leading-relaxed text-[var(--status-error-text)]">
              {getApiErrorMessage(pages.error)}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
                Signed in as{" "}
                <b className="font-semibold text-[var(--text-body)]">
                  {pages.data?.authorizedByName ?? "your Facebook account"}
                </b>
                . Pick the Page your ads run from.
              </p>
              <div className="flex flex-col gap-1.5">
                {pickable.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    disabled={page.unavailable || choose.isPending}
                    onClick={() => choose.mutate(page.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2.5 text-left transition-colors",
                      page.unavailable
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">
                        {page.name}
                      </span>
                      <span className="block text-sm text-[var(--text-subtle)]">
                        {page.unavailable
                          ? "Already connected to another workspace"
                          : page.alreadyConnected
                            ? "Already connected — choose it again to refresh the connection"
                            : "Ready to connect"}
                      </span>
                    </span>
                    {page.alreadyConnected ? (
                      <span className="acct-badge shrink-0" data-tone="ok">
                        Connected
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={clearOutcome}>
              {choose.isPending ? "Connecting…" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
