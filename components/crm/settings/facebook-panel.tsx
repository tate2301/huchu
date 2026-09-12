"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadChannel } from "@prisma/client";

import { ReportTable, node, txt, type ReportRow } from "@/components/accounting/report-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CopyLink, Plug, TriangleAlert } from "@/lib/icons";
import { CRM_CHANNEL_LABELS, CRM_LEAD_CHANNELS } from "@/lib/crm/sources";
import { cn } from "@/lib/utils";

import { SetupNote, SetupPanel } from "./setup-chrome";

type Connection = {
  id: string;
  callbackToken: string;
  callbackUrl: string;
  pageId: string;
  pageName: string | null;
  appId: string;
  verifyToken: string;
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
 * Facebook Lead Ads, which is not another API key however much it looks like
 * one in the Meta dashboard.
 *
 * The two things this screen exists to hand over are the callback URL and the
 * verify token, because both are needed in a *different* system's form and
 * neither can be worked out from anywhere else — so they are drawn as
 * copyable facts at the top rather than described. Everything below is the
 * answer to the only question anyone asks afterwards: a lead came in on
 * Facebook, did it reach the CRM, and if not, why not.
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

  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [defaultChannel, setDefaultChannel] = useState<string>("ADS");
  const [defaultSourceLabel, setDefaultSourceLabel] = useState("Facebook Lead Ads");
  const [openEvents, setOpenEvents] = useState<string | null>(null);

  const connections = useQuery({
    queryKey: ["crm-facebook-connections"],
    queryFn: () =>
      fetchJson<{ data: Connection[]; encryptionConfigured: boolean }>(
        "/api/v2/crm/integrations/facebook",
      ),
  });

  const events = useQuery({
    queryKey: ["crm-facebook-events", openEvents],
    enabled: Boolean(openEvents),
    queryFn: () =>
      fetchJson<{ data: DeliveryEvent[] }>(
        `/api/v2/crm/integrations/facebook/${openEvents}/events`,
      ).then((r) => r.data),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["crm-facebook-connections"] });

  const copy = (value: string, label: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => toast({ title: `${label} copied` }))
      .catch(() => toast({ title: `Could not copy the ${label.toLowerCase()}`, variant: "destructive" }));
  };

  const create = useMutation({
    mutationFn: () =>
      fetchJson<Connection>("/api/v2/crm/integrations/facebook", {
        method: "POST",
        body: JSON.stringify({
          pageId: pageId.trim(),
          pageName: pageName.trim() || undefined,
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          pageAccessToken: pageAccessToken.trim(),
          defaultChannel,
          defaultSourceLabel: defaultSourceLabel.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setPageId("");
      setPageName("");
      setAppId("");
      setAppSecret("");
      setPageAccessToken("");
      onCreateOpenChange(false);
      toast({ title: "Page connected — now paste the callback URL into Meta" });
      invalidate();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const verify = useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ ok: boolean; pageName: string | null; subscribed: boolean; error: string | null }>(
        `/api/v2/crm/integrations/facebook/${id}/verify`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      toast(
        result.ok
          ? { title: `Connected to ${result.pageName ?? "the Page"} and subscribed to leadgen` }
          : { title: result.error ?? "The connection could not be checked", variant: "destructive" },
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
  const encryptionConfigured = connections.data?.encryptionConfigured ?? true;

  const rows: ReportRow[] = list.map((connection) => {
    // Three states, not two. "Configured but never verified" is the one that
    // matters: the Meta dashboard shows a green tick the moment its own
    // handshake passes, so an operator who stops there believes they are done
    // while nothing is subscribed and no lead will ever arrive.
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
                Awaiting Meta
              </span>
            ) : null}
          </span>,
        ),
        txt(connection.pageId, { mono: true, tone: "subtle" }),
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
              {openEvents === connection.id ? "Hide" : "Deliveries"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2.5 text-sm"
              disabled={verify.isPending}
              onClick={() => verify.mutate(connection.id)}
            >
              Check
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

  return (
    <div className="min-w-0">
      {/* The two values Meta asks for, drawn as themselves. Neither can be
          derived anywhere else, and both are typed into a form on another
          screen — so they are copyable, not described. */}
      {list.length ? (
        <div className="mb-2.5 space-y-2.5">
          {list.map((connection) => (
            <div
              key={connection.id}
              className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface-base)] px-[13px] py-3"
            >
              <p className="mb-2 text-sm font-bold text-[var(--text-strong)]">
                Meta webhook settings — {connection.pageName ?? `Page ${connection.pageId}`}
              </p>
              <div className="space-y-1.5">
                <CopyRow
                  label="Callback URL"
                  value={connection.callbackUrl}
                  onCopy={() => copy(connection.callbackUrl, "Callback URL")}
                />
                <CopyRow
                  label="Verify token"
                  value={connection.verifyToken}
                  onCopy={() => copy(connection.verifyToken, "Verify token")}
                />
              </div>
              {connection.lastError ? (
                <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--status-error-text)]">
                  {connection.lastError}
                  {connection.lastErrorAt ? ` (${moment(connection.lastErrorAt)})` : null}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {encryptionConfigured ? null : (
        <div className="mb-2.5 rounded-[var(--card-radius)] border border-[var(--tone-warn-bd)] bg-[var(--tone-warn-bg)] px-[13px] py-3">
          <div className="flex items-center gap-2">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-[var(--badge-warn-fg)]" />
            <span className="text-sm font-bold text-[var(--badge-warn-fg)]">
              This deployment cannot store a Page access token yet
            </span>
          </div>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
            Set <code className="font-mono">CRM_INTEGRATION_ENCRYPTION_KEY</code> to 32 random bytes
            (<code className="font-mono">openssl rand -base64 32</code>) and restart, then connect a
            Page.
          </p>
        </div>
      )}

      {connections.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <SetupPanel title="Connected Pages" hint="a paused Page keeps its leads on Meta, it does not queue them" flush>
          <ReportTable
            label="Facebook Lead Ads connections"
            tracks="minmax(0,1fr) 170px 140px 160px 340px"
            columns={[
              { label: "Page" },
              { label: "Page id" },
              { label: "Channel" },
              { label: "Last lead" },
              { label: "", align: "right" },
            ]}
            rows={rows}
            emptyLabel="No Pages connected. Connect one to receive Lead Ads leads straight into the pipeline."
          />
        </SetupPanel>
      )}

      {selected ? (
        <div className="mt-2.5">
          <SetupPanel
            title={`Deliveries — ${selected.pageName ?? selected.pageId}`}
            hint="Meta serves a lead's answers for 90 days; a retry after that returns nothing"
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
                  { label: "Status" },
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
                          onClick={() =>
                            retry.mutate({ connectionId: selected.id, eventId: event.id })
                          }
                        >
                          Retry
                        </Button>
                      ) : null,
                      { align: "right" },
                    ),
                  ],
                }))}
                emptyLabel="Nothing delivered yet. Use Meta's Lead Ads Testing Tool to send a test lead."
              />
            )}
          </SetupPanel>
        </div>
      ) : null}

      <SetupNote icon={Plug}>
        Pasting the callback URL into Meta is only half of it — a Page sends nothing until it is
        subscribed to the app&rsquo;s <code className="font-mono">leadgen</code> field.{" "}
        <b className="font-semibold text-[var(--text-body)]">Check</b> does that subscription for
        you and reports what Meta says.
      </SetupNote>

      <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect a Facebook Page</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={pageId}
              onChange={(event) => setPageId(event.target.value)}
              placeholder="Page ID — 1234567890"
              inputMode="numeric"
              maxLength={32}
              aria-label="Facebook Page ID"
            />
            <Input
              value={pageName}
              onChange={(event) => setPageName(event.target.value)}
              placeholder="Page name (optional — filled in by Check)"
              maxLength={200}
              aria-label="Facebook Page name"
            />
            <Input
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              placeholder="Meta app ID"
              inputMode="numeric"
              maxLength={32}
              aria-label="Meta app ID"
            />
            <Input
              type="password"
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
              placeholder="Meta app secret"
              maxLength={200}
              aria-label="Meta app secret"
            />
            <Input
              type="password"
              value={pageAccessToken}
              onChange={(event) => setPageAccessToken(event.target.value)}
              placeholder="Long-lived Page access token"
              maxLength={600}
              aria-label="Page access token"
            />
            <Select value={defaultChannel} onValueChange={setDefaultChannel}>
              <SelectTrigger aria-label="Default channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRM_LEAD_CHANNELS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CRM_CHANNEL_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={defaultSourceLabel}
              onChange={(event) => setDefaultSourceLabel(event.target.value)}
              placeholder="Facebook Lead Ads"
              maxLength={80}
              aria-label="Source label"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onCreateOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={
                !pageId.trim() ||
                !appId.trim() ||
                !appSecret.trim() ||
                !pageAccessToken.trim() ||
                create.isPending
              }
            >
              {create.isPending ? "Connecting…" : "Connect Page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A label, the value as a monospace field, and a copy button — the shape the
 *  API-keys panel uses for its endpoint, repeated because both of these are
 *  going into somebody else's form. */
function CopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-sm text-[var(--text-subtle)]">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-2 py-1 font-mono text-sm text-[var(--text-strong)]">
        {value}
      </code>
      <Button size="sm" variant="outline" className="shrink-0 gap-1.5 h-6 px-2.5 text-sm" onClick={onCopy}>
        <CopyLink aria-hidden="true" className="size-3.5" />
        Copy
      </Button>
    </div>
  );
}
