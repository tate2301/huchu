"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/react";
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

/** A deal a project could be started from, as the deals route answers it. */
type DealOption = {
  id: string;
  dealNo: string;
  title: string;
  value: number | string | null;
  currency: string;
  status: string;
  assignedTo: { id: string; name: string | null } | null;
  client: { id: string; name: string } | null;
};

/** The deal the project delivers, when the page already knows it. */
type GivenDeal = {
  id: string;
  title: string;
  value: number | null;
  currency: string;
  ownerId: string | null;
};

/** Radix refuses `value=""` on an item, and "nobody owns it" is an option. */
const NO_OWNER = "none";

/**
 * Start a deal's project.
 *
 * A project is what a deal turns into once it is sold, so it always starts
 * from one. Opened from the deal, the deal is given; opened from the projects
 * register, it is the first question, and the answers are the deals with no
 * project yet — the won ones first, since those are the ones waiting on one.
 *
 * Everything else the project needs is already on the deal — its customer and
 * its site — and the server carries it across. The owner defaults to whoever
 * owned the deal, who usually sees the work through; the name to the deal's
 * own, so the two are recognisable as the same piece of work.
 *
 * The deal's value sits under the budget as the figure the budget is set
 * against. It is not offered as the budget itself: a budget equal to the price
 * is a project planned to make nothing.
 *
 * A deal has one project. Asked for a second, the server hands back the one it
 * has, and the dialog says so and goes there instead of announcing a start.
 */
export function StartProjectDialog({
  open,
  onOpenChange,
  deal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The deal it is started from. Left off on the register, which asks. */
  deal?: GivenDeal | null;
}) {
  const id = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dealId, setDealId] = useState(deal?.id ?? "");
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
      setDealId(deal?.id ?? "");
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

  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ["crm", "deals", "without-project"],
    queryFn: () =>
      fetchJson<{ data: DealOption[] }>(
        "/api/v2/crm/deals?withoutProject=true&statuses=WON,OPEN&limit=100",
      ),
    enabled: open && !deal,
  });
  // Won first: a won deal with no project is work sold and not yet started.
  const options = [...(candidates?.data ?? [])].sort(
    (a, b) => Number(b.status === "WON") - Number(a.status === "WON"),
  );
  const picked = deal
    ? { title: deal.title, value: deal.value, currency: deal.currency }
    : options.find((option) => option.id === dealId);
  const pickedValue = picked?.value == null ? null : Number(picked.value);

  const pickDeal = (next: string) => {
    const option = options.find((candidate) => candidate.id === next);
    const previous = options.find((candidate) => candidate.id === dealId);
    setDealId(next);
    // The name follows the deal until somebody has typed one of their own.
    if (option && (!name.trim() || name === previous?.title)) setName(option.title);
    if (option && ownerId === NO_OWNER && option.assignedTo) setOwnerId(option.assignedTo.id);
  };

  const start = useMutation({
    mutationFn: () =>
      fetchJson<{ project: { id: string; name: string }; created: boolean }>("/api/v2/crm/projects", {
        method: "POST",
        body: JSON.stringify({
          dealId,
          name: name.trim(),
          managerId: ownerId === NO_OWNER ? null : ownerId,
          // Left null rather than sent as zero: nobody has set a budget is not
          // the same as the budget is nothing.
          budget: budget.trim() === "" ? null : Number(budget),
          startDate: startDate || null,
          targetEndDate: targetEndDate || null,
        }),
      }),
    onSuccess: ({ project, created }) => {
      toast(
        created
          ? { title: "Project started", description: "Raise the first job in it." }
          : { title: "That deal already has its project", description: project.name },
      );
      queryClient.invalidateQueries({ queryKey: ["crm", "deal", dealId] });
      queryClient.invalidateQueries({ queryKey: ["crm", "deals"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "projects"] });
      onOpenChange(false);
      router.push(`/crm/projects/${project.id}`);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!dealId) problems.push("Choose the deal this project delivers.");
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

  const noCandidates = !deal && !candidatesLoading && options.length === 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={deal ? "Start the project" : "New project"}
      description={
        deal ? "The customer and site come across from the deal." : "A project delivers a deal. Choose which."
      }
      size="md"
      errors={errors}
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={start.isPending || noCandidates}>
            {start.isPending ? "Starting…" : "Start the project"}
          </Button>
        </>
      }
    >
      {deal ? null : (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-deal`}>Deal</Label>
          {noCandidates ? (
            <p id={`${id}-deal`} className="text-sm text-[var(--text-muted)]">
              Every open and won deal already has its project.
            </p>
          ) : (
            <Select value={dealId} onValueChange={pickDeal}>
              <SelectTrigger id={`${id}-deal`}>
                <SelectValue placeholder={candidatesLoading ? "Loading deals…" : "Choose a deal"} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {[
                      option.dealNo,
                      option.title,
                      option.client?.name,
                      option.status === "WON" ? "won" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-owner`}>Owner</Label>
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger id={`${id}-owner`}>
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-budget`}>Budget</Label>
          <Input
            id={`${id}-budget`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="font-mono"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
          {picked ? (
            <p className="text-sm text-[var(--text-muted)]">
              {pickedValue === null
                ? "The deal has no value on it."
                : `Sold for ${formatMoney(pickedValue, picked.currency)}.`}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-start`}>Starts</Label>
          <Input
            id={`${id}-start`}
            type="date"
            className="font-mono"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-end`}>Target end</Label>
          <Input
            id={`${id}-end`}
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
