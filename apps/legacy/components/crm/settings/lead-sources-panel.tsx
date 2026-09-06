"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadChannel } from "@corelithzw/db";

import {
  ReportTable,
  amt,
  node,
  num,
  type ReportRow,
} from "@corelithzw/ui/components/report-table";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Info } from "@corelithzw/ui/lib/icons";
import { CRM_CHANNEL_LABELS, CRM_LEAD_CHANNELS } from "@/lib/crm/sources";
import { CRM_CHANNEL_COLOR } from "@/lib/crm/tones";
import { cn } from "@corelithzw/ui/lib/utils";

import { SetupNote, SetupPanel, SetupStat } from "./setup-chrome";

export type LeadSourceRecord = {
  id: string;
  name: string;
  channel: CrmLeadChannel;
  isActive: boolean;
  /** Added by the list endpoint — see app/api/v2/crm/lead-sources/route.ts. */
  leads30d: number;
  won: number;
  valueWon: number;
};

const money = (value: number) =>
  value === 0 ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * Where enquiries come from, and what each one has been worth.
 *
 * The artboard leads with a card per channel and then a table of sources
 * carrying Leads 30d, Won and Value won — because the question this page
 * answers is not "what sources exist" but "which of these is worth keeping".
 * A list of names cannot answer that, and a list of names is what this panel
 * used to be.
 *
 * The channel cards double as the filter: pressing one narrows the table to
 * that channel, pressing it again clears it.
 */
export function LeadSourcesPanel({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [channelFilter, setChannelFilter] = useState<CrmLeadChannel | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CrmLeadChannel>("OTHER");
  const [error, setError] = useState<string | null>(null);

  const sources = useQuery({
    queryKey: ["crm-lead-sources"],
    queryFn: () =>
      fetchJson<{ data: LeadSourceRecord[]; windowDays: number }>("/api/v2/crm/lead-sources"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["crm-lead-sources"] });

  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/lead-sources", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), channel }),
      }),
    onSuccess: () => {
      setName("");
      setChannel("OTHER");
      setError(null);
      onCreateOpenChange(false);
      invalidate();
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; channel?: CrmLeadChannel; isActive?: boolean }) =>
      fetchJson(`/api/v2/crm/lead-sources/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ channel: input.channel, isActive: input.isActive }),
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  const all = useMemo(() => sources.data?.data ?? [], [sources.data]);

  /** One card per channel, whether or not a source has been filed under it. */
  const channels = useMemo(
    () =>
      CRM_LEAD_CHANNELS.map((value) => {
        const mine = all.filter((source) => source.channel === value);
        const leads = mine.reduce((sum, source) => sum + source.leads30d, 0);
        return {
          value,
          label: CRM_CHANNEL_LABELS[value],
          leads,
          note:
            mine.length === 0 ? "no sources" : `${mine.length} source${mine.length === 1 ? "" : "s"}`,
        };
      }),
    [all],
  );

  const visible = channelFilter ? all.filter((source) => source.channel === channelFilter) : all;

  const rows: ReportRow[] = visible.map((source) => ({
    id: source.id,
    cells: [
      node(
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-[7px] shrink-0 rounded-[2px]",
              CRM_CHANNEL_COLOR[source.channel]?.dot ?? CRM_CHANNEL_COLOR.OTHER.dot,
            )}
          />
          <span
            className={cn(
              "truncate text-sm font-semibold",
              source.isActive
                ? "text-[var(--text-strong)]"
                : "text-[var(--text-subtle)] line-through",
            )}
          >
            {source.name}
          </span>
        </span>,
      ),
      // The channel is editable in the row: it is the one field on a source
      // that gets filed wrong, and it is what every insight counts by.
      node(
        <Select
          value={source.channel}
          disabled={update.isPending}
          onValueChange={(value) =>
            update.mutate({ id: source.id, channel: value as CrmLeadChannel })
          }
        >
          <SelectTrigger
            className="h-[26px] w-full text-sm"
            aria-label={`Channel for ${source.name}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRM_LEAD_CHANNELS.map((value) => (
              <SelectItem key={value} value={value}>
                {CRM_CHANNEL_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      ),
      num(String(source.leads30d)),
      num(String(source.won)),
      amt(money(source.valueWon)),
      node(
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2.5 text-sm"
          disabled={update.isPending}
          onClick={() => update.mutate({ id: source.id, isActive: !source.isActive })}
        >
          {source.isActive ? "Deactivate" : "Reactivate"}
        </Button>,
        { align: "right" },
      ),
    ],
  }));

  return (
    <div className="min-w-0">
      <div className="mb-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {channels.map((entry) => (
          <SetupStat
            key={entry.value}
            label={entry.label}
            dot={CRM_CHANNEL_COLOR[entry.value]?.dot}
            value={entry.leads}
            note={entry.note}
            active={channelFilter === entry.value}
            onSelect={() =>
              setChannelFilter((current) => (current === entry.value ? null : entry.value))
            }
          />
        ))}
      </div>

      {sources.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <SetupPanel title="Sources" hint="the channel is what Insights counts" flush>
          <ReportTable
            label="Lead sources"
            tracks="minmax(0,1fr) 170px 100px 100px 110px 110px"
            columns={[
              { label: "Source" },
              { label: "Channel" },
              { label: `Leads, ${sources.data?.windowDays ?? 30}d`, align: "right" },
              { label: "Won", align: "right" },
              { label: "Value won", align: "right" },
              { label: "Status", align: "right" },
            ]}
            rows={rows}
            emptyLabel={
              channelFilter
                ? "No sources on this channel yet."
                : "No sources yet. Leads from webhooks and intake forms still get a channel automatically."
            }
          />
        </SetupPanel>
      )}

      {error ? (
        <p className="mt-2 text-sm text-[var(--status-error-text)]" role="alert">
          {error}
        </p>
      ) : null}

      <SetupNote icon={Info}>
        A source is a suggestion reps pick from; the{" "}
        <b className="font-semibold text-[var(--text-body)]">channel</b> is what gets counted. Leads
        arriving by webhook or intake form are given a channel automatically, so attribution still
        works with no sources defined at all.
      </SetupNote>

      <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a lead source</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Facebook, Walk-in, Trade counter"
              maxLength={80}
              aria-label="Source name"
            />
            <Select value={channel} onValueChange={(value) => setChannel(value as CrmLeadChannel)}>
              <SelectTrigger aria-label="Channel">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onCreateOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Adding…" : "Add source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
