"use client";

/**
 * My day: what I received, what I spent, and closing the day.
 *
 * Built for somebody standing at a fuel pump on a phone, which decides most of
 * what is here. The form is four fields and a button, not a modal. The running
 * balance is at the top where a thumb-scroll starts. Submitting is one press
 * and it is what sends the day's report to management — there is no second
 * "send report" step to forget.
 *
 * The date can be moved back, because the day being written up is not always
 * today. It cannot be moved forward: a log for Friday written on Wednesday is
 * a guess, and a guess in the cost figures is worse than a gap.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Stack } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus, Trash2 } from "@/lib/icons";

import {
  CATEGORIES,
  CATEGORY_LABELS,
  UNPROJECTED,
  formatDay,
  formatMoney,
  todayKey,
  type Category,
} from "./money";

type Entry = {
  id: string;
  direction: "RECEIVED" | "SPENT";
  category: Category;
  amount: string;
  currency: string;
  description: string;
  projectId: string | null;
  receiptUrl: string | null;
  project: { id: string; name: string; projectNo: string } | null;
  requisition: { id: string; requisitionNo: string } | null;
};

type LogResponse = {
  log: {
    id: string;
    logDate: string;
    notes: string | null;
    submittedAt: string | null;
    entries: Entry[];
  };
  totals: {
    received: string;
    spent: string;
    balance: string;
    entryCount: number;
    unattributed: number;
    missingReceipts: number;
  };
};

type ProjectOption = { id: string; name: string; projectNo: string };

export function MyDayContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayKey());

  const queryKey = ["crm", "daily-log", date];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchJson<LogResponse>(`/api/v2/crm/daily-logs?date=${date}`),
  });

  const projectsQuery = useQuery({
    queryKey: ["crm", "projects", "picker"],
    queryFn: () =>
      fetchJson<{ data: ProjectOption[] }>("/api/v2/crm/projects?status=ACTIVE&limit=100"),
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const removeEntry = useMutation({
    mutationFn: (entryId: string) =>
      fetchJson(`/api/v2/crm/daily-logs/${data!.log.id}/entries?entryId=${entryId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
    onError: (error) =>
      toast({ title: "Could not remove that", description: getApiErrorMessage(error) }),
  });

  const saveNote = useMutation({
    mutationFn: (notes: string) =>
      fetchJson("/api/v2/crm/daily-logs", {
        method: "PATCH",
        body: JSON.stringify({ logDate: date, notes }),
      }),
    onSuccess: invalidate,
    onError: (error) =>
      toast({ title: "Could not save the note", description: getApiErrorMessage(error) }),
  });

  const submit = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/daily-logs/${data!.log.id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Day closed", description: "Your report has gone to management." });
      invalidate();
    },
    onError: (error) =>
      toast({ title: "Could not close the day", description: getApiErrorMessage(error) }),
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const { log, totals } = data;
  const closed = Boolean(log.submittedAt);
  const projects = projectsQuery.data?.data ?? [];

  return (
    <Stack gap="md" className="max-w-2xl">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">{formatDay(date)}</h2>
          <Input
            type="date"
            className="w-auto"
            value={date}
            max={todayKey()}
            onChange={(event) => setDate(event.target.value)}
            aria-label="Which day"
          />
        </div>

        <dl className="grid grid-cols-3 gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <Figure label="Received" value={formatMoney(totals.received)} />
          <Figure label="Spent" value={formatMoney(totals.spent)} />
          {/* What should still be in their pocket. The number a supervisor
              counts against at the end of the week. */}
          <Figure label="In hand" value={formatMoney(totals.balance)} strong />
        </dl>

        {closed ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-muted)]">
            Submitted. Ask a manager to reopen this day if something is missing.
          </p>
        ) : null}
      </header>

      {log.entries.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing recorded yet. Add what you were given and what you spent.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {log.entries.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--text-strong)]">
                  {entry.description}
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  {CATEGORY_LABELS[entry.category]}
                  {entry.project ? ` · ${entry.project.name}` : ""}
                  {entry.requisition ? ` · ${entry.requisition.requisitionNo}` : ""}
                  {entry.direction === "SPENT" && !entry.receiptUrl ? " · no receipt" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    entry.direction === "RECEIVED"
                      ? "text-sm font-medium text-[var(--text-strong)]"
                      : "text-sm font-medium text-[var(--text-muted)]"
                  }
                >
                  {entry.direction === "RECEIVED" ? "+" : "−"}
                  {formatMoney(entry.amount, entry.currency)}
                </span>
                {closed ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${entry.description}`}
                    disabled={removeEntry.isPending}
                    onClick={() => removeEntry.mutate(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {closed ? null : (
        <EntryForm logId={log.id} projects={projects} onSaved={invalidate} />
      )}

      <section className="space-y-2">
        <Label htmlFor="day-note">Anything worth saying about the day</Label>
        <Textarea
          id="day-note"
          rows={2}
          defaultValue={log.notes ?? ""}
          disabled={closed}
          onBlur={(event) => {
            if (event.target.value !== (log.notes ?? "")) saveNote.mutate(event.target.value);
          }}
        />
      </section>

      {closed ? null : (
        <div className="space-y-2">
          {totals.missingReceipts > 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              {totals.missingReceipts === 1
                ? "One spend has no receipt. Management will see that."
                : `${totals.missingReceipts} spends have no receipt. Management will see that.`}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Closing…" : "Close the day and send my report"}
          </Button>
        </div>
      )}
    </Stack>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd
        className={
          strong
            ? "text-base font-semibold text-[var(--text-strong)]"
            : "text-base text-[var(--text-strong)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function EntryForm({
  logId,
  projects,
  onSaved,
}: {
  logId: string;
  projects: ProjectOption[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [direction, setDirection] = useState<"RECEIVED" | "SPENT">("SPENT");
  const [category, setCategory] = useState<Category>("FUEL");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("");

  const add = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/daily-logs/${logId}/entries`, {
        method: "POST",
        body: JSON.stringify({
          direction,
          category,
          amount: Number(amount),
          currency: "USD",
          description,
          projectId: projectId || null,
        }),
      }),
    onSuccess: () => {
      setAmount("");
      setDescription("");
      onSaved();
    },
    onError: (error) =>
      toast({ title: "Could not record that", description: getApiErrorMessage(error) }),
  });

  const ready = Number(amount) > 0 && description.trim().length > 0;
  // Fuel and airtime are asked for by people who are not on a project that
  // day. Asking anyway produces a fictional attribution, which makes every
  // project's cost figure wrong.
  const expectsProject = !UNPROJECTED.includes(category);

  return (
    <form
      className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) add.mutate();
      }}
    >
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={direction === "SPENT" ? "default" : "outline"}
          onClick={() => setDirection("SPENT")}
        >
          I spent
        </Button>
        <Button
          type="button"
          size="sm"
          variant={direction === "RECEIVED" ? "default" : "outline"}
          onClick={() => setDirection("RECEIVED")}
        >
          I was given
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="entry-amount">Amount</Label>
          <Input
            id="entry-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="entry-category">What for</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
            <SelectTrigger id="entry-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {CATEGORY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="entry-description">Description</Label>
        <Input
          id="entry-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Diesel, 40 litres"
        />
      </div>

      {expectsProject && projects.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="entry-project">Which project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="entry-project">
              <SelectValue placeholder="Not for a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <Button type="submit" size="sm" disabled={!ready || add.isPending}>
        <Plus className="mr-1 h-4 w-4" aria-hidden />
        {add.isPending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
