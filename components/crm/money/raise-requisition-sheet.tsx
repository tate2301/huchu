"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { CATEGORIES, CATEGORY_LABELS, UNPROJECTED, type Category } from "./money";

type ProjectOption = { id: string; projectNo: string; name: string };

/** Radix refuses `value=""` on an item, and "not for a project" is an answer. */
const NO_PROJECT = "none";

/**
 * Asking for money.
 *
 * Opened from a project it already knows what the money is for, and the
 * project is set. Anywhere else the project is asked for — except on fuel and
 * airtime, where asking would either block the request or invent an
 * attribution that makes every project's cost figure wrong.
 *
 * Sent straight for approval: a requisition sitting in draft is money
 * somebody thinks they asked for.
 */
export function RaiseRequisitionSheet({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when raised from a project's own page. */
  project?: { id: string; label: string; currency: string } | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<Category>(project ? "MATERIALS" : "FUEL");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState(NO_PROJECT);
  const [errors, setErrors] = useState<string[]>([]);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCategory(project ? "MATERIALS" : "FUEL");
      setAmount("");
      setPurpose("");
      setNotes("");
      setProjectId(NO_PROJECT);
      setErrors([]);
    }
  }

  // Projects still taking work. A finished project is not somewhere money is
  // being spent.
  const projectsQuery = useQuery({
    queryKey: ["crm", "projects", "open-picker"],
    queryFn: () =>
      fetchJson<{ data: ProjectOption[] }>("/api/v2/crm/projects?open=true&costs=false&limit=100"),
    staleTime: 5 * 60_000,
    enabled: open && !project,
  });

  const raise = useMutation({
    mutationFn: () =>
      fetchJson<{ requisition: { id: string } }>("/api/v2/crm/requisitions", {
        method: "POST",
        body: JSON.stringify({
          category,
          amount: Number(amount),
          purpose: purpose.trim(),
          notes: notes.trim() || null,
          projectId: project?.id ?? (projectId === NO_PROJECT ? null : projectId),
          currency: project?.currency ?? "USD",
          submit: true,
        }),
      }),
    onSuccess: ({ requisition }) => {
      queryClient.invalidateQueries({ queryKey: ["crm", "requisitions"] });
      if (project) queryClient.invalidateQueries({ queryKey: ["crm", "project", project.id] });
      onOpenChange(false);
      // Its own page is where the answer arrives and where the spend is
      // reported, so that is where the requester is taken.
      router.push(`/crm/requisitions/${requisition.id}`);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const expectsProject = !project && !UNPROJECTED.includes(category);

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ask for money"
      description="It goes straight to whoever approves requisitions."
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const problems: string[] = [];
        if (!(Number(amount) > 0)) problems.push("Say how much.");
        if (!purpose.trim()) problems.push("Say what it is for, in one line.");
        setErrors(problems);
        if (problems.length === 0) raise.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={raise.isPending}>
            {raise.isPending ? "Sending…" : "Send for approval"}
          </Button>
        </>
      }
    >
      {project ? (
        <div className="space-y-1.5">
          <Label>Project</Label>
          <p className="text-sm font-medium text-[var(--text-strong)]">{project.label}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="req-category">What for</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
            <SelectTrigger id="req-category">
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
        <div className="space-y-1.5">
          <Label htmlFor="req-amount">How much</Label>
          <Input
            id="req-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="font-mono"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="req-purpose">In one line</Label>
        <Input
          id="req-purpose"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="Diesel for the Kadoma run"
        />
      </div>

      {expectsProject ? (
        <div className="space-y-1.5">
          <Label htmlFor="req-project">Which project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="req-project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>Not for a project</SelectItem>
              {(projectsQuery.data?.data ?? []).map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {`${option.projectNo} — ${option.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="req-notes">Anything else</Label>
        <Textarea id="req-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
    </RecordDialog>
  );
}
