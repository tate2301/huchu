"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadChannel } from "@corelithzw/db";

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
import { CopyLink, Lock, TriangleAlert } from "@/lib/icons";
import { CRM_CHANNEL_LABELS, CRM_LEAD_CHANNELS } from "@/lib/crm/sources";
import { cn } from "@/lib/utils";

import { SetupNote, SetupPanel } from "./setup-chrome";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  defaultChannel: CrmLeadChannel | null;
  defaultSourceLabel: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;

/**
 * Credentials for the webhook and intake-form integrations.
 *
 * Two things the artboard puts above the table and the old panel buried in
 * prose: where to send a lead, and what a key does to the leads sent with it.
 * Both are facts somebody needs while configuring the *other* system, so the
 * endpoint is drawn as itself rather than described in a sentence.
 *
 * The revealed key is a band rather than a line inside a card. It is the only
 * moment the full credential exists on screen, and it has to be impossible to
 * scroll past.
 */
export function ApiKeysPanel({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [defaultChannel, setDefaultChannel] = useState<string>("");
  const [defaultSourceLabel, setDefaultSourceLabel] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ["crm-api-keys"],
    queryFn: () => fetchJson<{ data: ApiKey[] }>("/api/v2/crm/api-keys").then((r) => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["crm-api-keys"] });

  const create = useMutation({
    mutationFn: () =>
      fetchJson<{ key: string }>("/api/v2/crm/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          defaultChannel: defaultChannel || undefined,
          defaultSourceLabel: defaultSourceLabel.trim() || undefined,
        }),
      }),
    onSuccess: (data) => {
      setRevealed(data.key);
      setName("");
      setDefaultChannel("");
      setDefaultSourceLabel("");
      onCreateOpenChange(false);
      invalidate();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/crm/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Key revoked" });
      invalidate();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const rows: ReportRow[] = (keys.data ?? []).map((key) => {
    const live = !key.revokedAt;
    return {
      id: key.id,
      cells: [
        node(
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "size-[7px] shrink-0 rounded-full",
                live ? "bg-[var(--tone-success)]" : "bg-[var(--tone-danger)]",
              )}
            />
            <span
              className={cn(
                "truncate text-sm font-semibold",
                live ? "text-[var(--text-strong)]" : "text-[var(--text-subtle)]",
              )}
            >
              {key.name}
            </span>
            {live ? null : (
              <span className="acct-badge shrink-0" data-tone="bad">
                Revoked
              </span>
            )}
          </span>,
        ),
        txt(`${key.keyPrefix}…`, { mono: true, tone: "subtle" }),
        key.defaultChannel
          ? txt(CRM_CHANNEL_LABELS[key.defaultChannel])
          : txt("auto-detect", { tone: "dim" }),
        key.defaultSourceLabel
          ? txt(key.defaultSourceLabel, { mono: true, tone: "subtle" })
          : txt("—", { tone: "dim" }),
        txt(day(key.createdAt) ?? "—", { tone: "subtle" }),
        // A key that has never been used is a key whose integration was never
        // finished — worth telling apart from one used this morning.
        key.lastUsedAt
          ? txt(day(key.lastUsedAt) ?? "—", { tone: "subtle" })
          : txt("never", { tone: "dim" }),
        node(
          live ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2.5 text-sm text-[var(--status-error-text)]"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(key.id)}
            >
              Revoke
            </Button>
          ) : null,
          { align: "right" },
        ),
      ],
    };
  });

  return (
    <div className="min-w-0">
      {/* Where to send leads. The endpoint and the header are what somebody
          needs in the *other* system's configuration screen, so they are drawn
          as the thing itself rather than described in a sentence. */}
      <div className="mb-2.5 rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface-base)] px-[13px] py-3">
        <p className="mb-2 text-sm font-bold text-[var(--text-strong)]">Where to send leads</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="acct-badge" data-tone="ok">
            POST
          </span>
          <code className="rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-2 py-0.5 font-mono text-sm text-[var(--text-strong)]">
            /api/public/crm/webhook/leads
          </code>
          <span className="text-sm text-[var(--text-subtle)]">with header</span>
          <code className="rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-2 py-0.5 font-mono text-sm text-[var(--text-strong)]">
            x-api-key
          </code>
        </div>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
          Every lead captured with a key inherits that key&rsquo;s channel and source label — a
          &ldquo;Facebook Lead Ads&rdquo; key labels its leads{" "}
          <b className="font-semibold text-[var(--text-body)]">Paid ads / facebook</b> without the
          sender having to say so.
        </p>
      </div>

      {revealed ? (
        <div className="mb-2.5 rounded-[var(--card-radius)] border border-[var(--tone-warn-bd)] bg-[var(--tone-warn-bg)] px-[13px] py-3">
          <div className="mb-2 flex items-center gap-2">
            <Lock aria-hidden="true" className="size-4 shrink-0 text-[var(--badge-warn-fg)]" />
            <span className="text-sm font-bold text-[var(--badge-warn-fg)]">
              Copy this key now — it will not be shown again
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 px-2.5 text-sm"
              onClick={() => setRevealed(null)}
            >
              Done
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] border border-[var(--tone-warn-bd)] bg-[var(--surface-base)] px-2.5 py-2 font-mono text-sm text-[var(--text-strong)]">
              {revealed}
            </code>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={() => {
                void navigator.clipboard
                  .writeText(revealed)
                  .then(() => toast({ title: "Key copied" }))
                  .catch(() => toast({ title: "Could not copy the key", variant: "destructive" }));
              }}
            >
              <CopyLink aria-hidden="true" className="size-3.5" />
              Copy
            </Button>
          </div>
        </div>
      ) : null}

      {keys.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <SetupPanel title="Keys" hint="a revoked key stops working immediately" flush>
          <ReportTable
            label="Webhook API keys"
            tracks="minmax(0,1fr) 170px 150px 130px 120px 130px 100px"
            columns={[
              { label: "Name" },
              { label: "Prefix" },
              { label: "Default channel" },
              { label: "Source label" },
              { label: "Created" },
              { label: "Last used" },
              { label: "", align: "right" },
            ]}
            rows={rows}
            emptyLabel="No keys yet. Create one to start receiving leads from another system."
          />
        </SetupPanel>
      )}

      <SetupNote icon={TriangleAlert}>
        The full key is shown once, at creation, and only its prefix is stored afterwards. If a key
        is lost, revoke it and issue a new one — there is no way to read it back.
      </SetupNote>

      <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an API key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Facebook Lead Ads"
              maxLength={80}
              aria-label="Key name"
            />
            <Select
              value={defaultChannel || "AUTO"}
              onValueChange={(value) => setDefaultChannel(value === "AUTO" ? "" : value)}
            >
              <SelectTrigger aria-label="Default channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">Channel: auto-detect</SelectItem>
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
              placeholder="facebook"
              maxLength={80}
              aria-label="Source label"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onCreateOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
