"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { formatMoney, todayKey } from "./money";

type TeamResponse = { data: { id: string; name: string | null; email: string }[] };

/** Radix refuses `value=""` on an item, and "nobody owns it" is an option. */
const NO_OWNER = "none";

/**
 * Start a project — the one a won deal turns into, or one raised directly for
 * work that never went through the pipeline.
 *
 * Five questions and no more. From a deal, everything else the project needs
 * is already on the deal — its customer, its site — and the server carries
 * those across. The owner defaults to whoever owned the deal, which is who usually
 * sees the work through; the name to the deal's own, so the two are
 * recognisable as the same piece of work.
 *
 * The deal's value sits under the budget as the figure the budget is set
 * against: what the customer is paying, beside what the work may cost. It is
 * not offered as the budget itself, because a budget equal to the price is a
 * project planned to make nothing.
 *
 * Afterwards the page goes to the project, because the next thing anybody does
 * is raise the first job in it.
 */
export function StartProjectSheet({
  open,
  onOpenChange,
  deal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The deal it is started from. Left off on the register's "New project". */
  deal?: {
    id: string;
    title: string;
    value: number | null;
    currency: string;
    ownerId: string | null;
  } | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState(deal?.title ?? "");
  const [ownerId, setOwnerId] = useState(deal?.ownerId ?? NO_OWNER);
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState(todayKey);
  const [targetEndDate, setTargetEndDate] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // Reset whenever it opens, so a second go does not start from the last one.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(deal?.title ?? "");
      setOwnerId(deal?.ownerId ?? NO_OWNER);
      setBudget("");
      setStartDate(todayKey());
      setTargetEndDate("");
      setErrors([]);
    }
  }

  const { data: team } = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<TeamResponse>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const start = useMutation({
    mutationFn: () =>
      fetchJson<{ project: { id: string } }>("/api/v2/crm/projects", {
        method: "POST",
        body: JSON.stringify({
          ...(deal ? { fromDealId: deal.id } : {}),
          name: name.trim(),
          managerId: ownerId === NO_OWNER ? null : ownerId,
          // Left null rather than sent as zero: nobody has set a budget is not
          // the same as the budget is nothing.
          budget: budget.trim() === "" ? null : Number(budget),
          startDate: startDate || null,
          targetEndDate: targetEndDate || null,
        }),
      }),
    onSuccess: ({ project }) => {
      toast({ title: "Project started", description: "Raise the first job in it." });
      if (deal) queryClient.invalidateQueries({ queryKey: ["crm", "deal", deal.id] });
      queryClient.invalidateQueries({ queryKey: ["crm", "projects"] });
      onOpenChange(false);
      router.push(`/crm/projects/${project.id}`);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!name.trim()) problems.push("Give the project a name the team will recognise.");
    if (budget.trim() !== "" && !(Number(budget) >= 0)) {
      problems.push("The budget has to be a number, or left blank.");
    }
    if (startDate && targetEndDate && targetEndDate < startDate) {
      problems.push("The target end is before the start.");
    }
    setErrors(problems);
    if (problems.length === 0) start.mutate();
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={deal ? "Start the project" : "New project"}
      description={
        deal
          ? "The customer and site come across from the deal."
          : "For work that did not come through a deal."
      }
      errors={errors}
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={start.isPending}>
            {start.isPending ? "Starting…" : deal ? "Start the project" : "Create the project"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="project-name">Name *</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Warehouse floor, phase one"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Owner</Label>
        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_OWNER}>Nobody yet</SelectItem>
            {(team?.data ?? []).map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name ?? member.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-[var(--text-muted)]">
          The one person answerable for what it costs.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-budget">Budget</Label>
        <Input
          id="project-budget"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          className="font-mono"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          placeholder="Leave blank if nobody has set one"
        />
        {deal ? (
          <p className="text-sm text-[var(--text-muted)]">
            {deal.value === null
              ? "The deal has no value on it to set this against."
              : `The customer is paying ${formatMoney(deal.value, deal.currency)}.`}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="project-start">Starts</Label>
          <Input
            id="project-start"
            type="date"
            className="font-mono"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-end">Target end</Label>
          <Input
            id="project-end"
            type="date"
            className="font-mono"
            min={startDate || undefined}
            value={targetEndDate}
            onChange={(event) => setTargetEndDate(event.target.value)}
          />
        </div>
      </div>
    </RecordDialog>
  );
}
