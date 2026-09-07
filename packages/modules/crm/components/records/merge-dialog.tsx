"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  commitCrmMerge,
  fetchCrmCompanies,
  fetchCrmPeople,
  previewCrmMerge,
  type CrmMergePreview,
} from "../../crm-v2";
import type { FieldChoice, MergeableValue } from "../../merge";
import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";
import { cn } from "@corelithzw/ui/lib/utils";

import { Stack } from "@corelithzw/react";

/** Only the two fields the picker renders; people and companies both have them. */
type MergeCandidate = {
  id: string;
  fullName?: string;
  name?: string;
  personNo?: string;
  clientNo?: string;
};

function display(value: MergeableValue): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Merge two records, one field at a time.
 *
 * The loser is kept and pointed at the survivor rather than deleted, so a
 * wrong call here costs a conversation, not somebody's history — which is why
 * the dialog can afford to be this direct about it.
 */
export function MergeDialog({
  entity,
  survivorId,
  survivorLabel,
  open,
  onOpenChange,
}: {
  entity: "PERSON" | "COMPANY";
  survivorId: string;
  survivorLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [loserId, setLoserId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});
  const [plan, setPlan] = useState<CrmMergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset during render as the dialog opens rather than in an effect.
  // Starts at `false`, not `open`: a sheet that mounts already open would
  // otherwise record itself as having always been open, the transition below
  // would never fire, and the form would never seed.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch("");
      setLoserId(null);
      setChoices({});
      setPlan(null);
      setError(null);
    }
  }

  const candidates = useQuery({
    queryKey: ["crm-merge-candidates", entity, debounced],
    enabled: open && debounced.length >= 2,
    // Both fetchers return the same shape to the picker; only the two fields
    // it renders matter here.
    queryFn: async (): Promise<{ data: MergeCandidate[] }> =>
      entity === "PERSON"
        ? await fetchCrmPeople({ filters: { q: debounced }, limit: 8 })
        : await fetchCrmCompanies({ filters: { q: debounced }, limit: 8 }),
  });

  const preview = useMutation({
    mutationFn: (id: string) => previewCrmMerge(entity, survivorId, id),
    onSuccess: (result) => {
      setPlan(result);
      setChoices({});
      setError(null);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const commit = useMutation({
    mutationFn: () => commitCrmMerge(entity, survivorId, loserId!, choices),
    onSuccess: () => {
      toast({ title: "Records merged" });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      onOpenChange(false);
      router.refresh();
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const options = (candidates.data?.data ?? []).filter((record) => record.id !== survivorId);
  const conflicts = plan?.fields.filter((field) => field.conflict) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge into {survivorLabel}</DialogTitle>
          <DialogDescription>
            The other record is kept and pointed here, so nothing is lost if this
            turns out to be wrong.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Can&apos;t merge these</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!plan ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="merge-search">Which record is the duplicate?</Label>
              <Input
                id="merge-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or email"
                autoFocus
              />
            </div>

            {debounced.length < 2 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Type at least two characters.
              </p>
            ) : candidates.isLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Searching…</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Nothing matched.</p>
            ) : (
              <Stack as="ul" gap="xs">
                {options.map((record) => {
                  const label = record.fullName ?? record.name ?? "Untitled";
                  const reference = record.personNo ?? record.clientNo ?? "";
                  return (
                    <li key={record.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                        onClick={() => {
                          setLoserId(record.id);
                          preview.mutate(record.id);
                        }}
                      >
                        <span>{label}</span>
                        <span className="font-mono text-sm text-[var(--text-muted)]">
                          {reference}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </Stack>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {conflicts.length ? (
              <Alert>
                <AlertTitle>
                  {conflicts.length} field{conflicts.length === 1 ? "" : "s"} disagree
                </AlertTitle>
                <AlertDescription>
                  Pick which value to keep. Everything else fills gaps without
                  overwriting what {survivorLabel} already has.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 bg-[var(--surface-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-muted)]">
                <span>Field</span>
                <span>{plan.survivor.label}</span>
                <span>{plan.loser.label}</span>
              </div>

              {plan.fields.map((field) => {
                const chosen = choices[field.field] ?? field.chosen;
                const pick = (choice: FieldChoice) =>
                  setChoices((previous) => ({ ...previous, [field.field]: choice }));

                return (
                  <div
                    key={field.field}
                    className={cn(
                      "grid grid-cols-[1fr_1fr_1fr] items-center gap-2 border-t border-[var(--border-subtle)] px-3 py-2 text-sm",
                      field.conflict ? "bg-[var(--surface-subtle)]" : "",
                    )}
                  >
                    <span className="text-[var(--text-muted)]">{field.label}</span>
                    <button
                      type="button"
                      onClick={() => pick("SURVIVOR")}
                      className={cn(
                        "truncate rounded px-2 py-1 text-left",
                        chosen === "SURVIVOR"
                          ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                          : "hover:bg-[var(--surface-hover)]",
                      )}
                    >
                      {display(field.survivorValue)}
                    </button>
                    <button
                      type="button"
                      onClick={() => pick("LOSER")}
                      className={cn(
                        "truncate rounded px-2 py-1 text-left",
                        chosen === "LOSER"
                          ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                          : "hover:bg-[var(--surface-hover)]",
                      )}
                    >
                      {display(field.loserValue)}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-[var(--text-muted)]">
              Activities, tasks, comments, deals and links move to{" "}
              {plan.survivor.label}. Tags and alternate contact details from both
              are kept.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {plan ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPlan(null)}>
                Pick a different record
              </Button>
              <Button type="button" disabled={commit.isPending} onClick={() => commit.mutate()}>
                {commit.isPending ? "Merging…" : `Merge ${plan.loser.label}`}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
