"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ArrowRight, Check } from "@corelithzw/ui/lib/icons";
import type { DuplicateConfidence } from "@/lib/crm/duplicates";
import { DUPLICATE_CONFIDENCE_TONE } from "@/lib/crm/tones";
import { cn } from "@corelithzw/ui/lib/utils";

type DuplicateMatch = {
  record: Record<string, unknown> & { id: string };
  confidence: DuplicateConfidence;
  reasons: string[];
};

type ConvertPayload = {
  lead: {
    id: string;
    leadNo: string;
    title: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    estimatedValue: number | null;
    currency: string;
    convertedAt: string | null;
    convertedDealId: string | null;
    client: { id: string; name: string } | null;
  };
  suggested: {
    personFirstName: string;
    personLastName: string | null;
    dealTitle: string;
    companyName: string;
  };
  personDuplicates: DuplicateMatch[];
  companyDuplicates: DuplicateMatch[];
};

const CONFIDENCE_LABELS: Record<DuplicateConfidence, string> = {
  EXACT: "Almost certainly the same",
  STRONG: "Probably the same",
  POSSIBLE: "Might be the same",
};

/** One candidate the user can pick instead of creating a new record. */
function CandidateRow({
  title,
  subtitle,
  reasons,
  confidence,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string | null;
  reasons: string[];
  confidence: DuplicateConfidence;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start justify-between gap-2 rounded-[var(--card-radius)] border p-2.5 text-left",
        selected
          ? "border-[var(--action-primary-bg)] bg-[var(--surface-subtle)]"
          : "border-[var(--border)] hover:bg-[var(--surface-hover)]",
      )}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{title}</span>
          <Badge tone={DUPLICATE_CONFIDENCE_TONE[confidence] ?? "neutral"} size="sm">
            {CONFIDENCE_LABELS[confidence]}
          </Badge>
        </span>
        {subtitle ? (
          <span className="block truncate text-sm text-[var(--text-muted)]">{subtitle}</span>
        ) : null}
        <span className="block text-sm text-[var(--text-muted)]">{reasons.join(" · ")}</span>
      </span>
      {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
    </button>
  );
}

/**
 * Qualifying a lead into a deal.
 *
 * Duplicate candidates are shown before anything is created, because reusing
 * the right person here is far cheaper than merging two records later.
 */
export function ConvertLeadSheet({
  open,
  onOpenChange,
  leadId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [personId, setPersonId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [createCompany, setCreateCompany] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [dealTitle, setDealTitle] = useState("");
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const prepQuery = useQuery({
    queryKey: ["crm", "lead-convert", leadId],
    queryFn: () => fetchJson<ConvertPayload>(`/api/v2/crm/leads/${leadId}/convert`),
    enabled: open,
  });

  const prep = prepQuery.data;

  // Seed the form from the preparation payload the first time it arrives,
  // adjusting state during render so the fields are already filled on the
  // frame the sheet stops loading.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (prep && seededFor !== prep.lead.id) {
    setSeededFor(prep.lead.id);
    setPersonId(null);
    setClientId(prep.lead.client?.id ?? null);
    setCreateCompany(!prep.lead.client);
    setCompanyName(prep.suggested.companyName);
    setDealTitle(prep.suggested.dealTitle);
    setValue(prep.lead.estimatedValue !== null ? String(prep.lead.estimatedValue) : "");
    setErrors([]);
  }

  const convert = useMutation({
    mutationFn: () =>
      fetchJson<{ dealId: string; dealNo: string }>(
        `/api/v2/crm/leads/${leadId}/convert`,
        {
          method: "POST",
          body: JSON.stringify({
            personId,
            clientId,
            createCompany: !clientId && createCompany && companyName.trim().length > 0,
            companyName: companyName.trim() || undefined,
            dealTitle: dealTitle.trim(),
            value: value.trim() ? Number(value) : null,
          }),
        },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm-lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["crm", "deals"] });
      toast({
        title: "Lead converted",
        description: `Deal ${result.dealNo} is ready.`,
      });
      onOpenChange(false);
      router.push(`/crm/deals/${result.dealId}`);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const alreadyConverted = Boolean(prep?.lead.convertedAt);

  // The dialog is one of three things depending on where the lead is, and only
  // the third is a form — so the submit handler and the buttons come and go
  // with it rather than sitting under a screen that has nothing to submit.
  const showForm = !prepQuery.isLoading && !alreadyConverted && Boolean(prep);

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Convert lead"
      description="Turn a qualified enquiry into a deal, reusing the people and companies you already have."
      errors={showForm ? errors : undefined}
      onSubmit={
        showForm
          ? (event) => {
              event.preventDefault();
              if (!dealTitle.trim()) {
                setErrors(["Give the deal a title."]);
                return;
              }
              setErrors([]);
              convert.mutate();
            }
          : undefined
      }
      footer={
        showForm ? (
          <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={convert.isPending}>
              {convert.isPending ? "Converting…" : "Convert to deal"}
            </Button>
          </>
        ) : null
      }
    >
      {prepQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : alreadyConverted ? (
        <div className="space-y-3 rounded-[var(--card-radius)] border border-[var(--border)] p-4">
          <p className="text-sm">
            This lead was already converted. Its deal carries the work from here.
          </p>
          {prep?.lead.convertedDealId ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                onOpenChange(false);
                router.push(`/crm/deals/${prep.lead.convertedDealId}`);
              }}
            >
              Open the deal
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ) : prep ? (
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">
              Person
            </h3>
            {prep.personDuplicates.length > 0 ? (
              <>
                <p className="text-sm text-[var(--text-muted)]">
                  {prep.personDuplicates.length === 1
                    ? "Someone on file looks like this contact."
                    : `${prep.personDuplicates.length} people on file look like this contact.`}
                </p>
                <div className="space-y-1.5">
                  {prep.personDuplicates.map((match) => (
                    <CandidateRow
                      key={match.record.id}
                      title={String(match.record.fullName ?? "Unnamed")}
                      subtitle={
                        [
                          match.record.jobTitle,
                          (match.record.client as { name?: string } | null)?.name,
                          match.record.email,
                        ]
                          .filter(Boolean)
                          .join(" · ") || null
                      }
                      reasons={match.reasons}
                      confidence={match.confidence}
                      selected={personId === match.record.id}
                      onSelect={() =>
                        setPersonId(personId === match.record.id ? null : match.record.id)
                      }
                    />
                  ))}
                </div>
              </>
            ) : null}
            <p className="text-sm text-[var(--text-muted)]">
              {personId
                ? "That existing person will be used."
                : `A new person will be created: ${prep.suggested.personFirstName}${
                    prep.suggested.personLastName ? ` ${prep.suggested.personLastName}` : ""
                  }.`}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">
              Company
            </h3>
            {prep.companyDuplicates.length > 0 ? (
              <div className="space-y-1.5">
                {prep.companyDuplicates.map((match) => (
                  <CandidateRow
                    key={match.record.id}
                    title={String(match.record.name ?? "Unnamed")}
                    subtitle={
                      [match.record.city, match.record.website].filter(Boolean).join(" · ") ||
                      null
                    }
                    reasons={match.reasons}
                    confidence={match.confidence}
                    selected={clientId === match.record.id}
                    onSelect={() =>
                      setClientId(clientId === match.record.id ? null : match.record.id)
                    }
                  />
                ))}
              </div>
            ) : null}

            {!clientId ? (
              <div className="space-y-1.5">
                <Label htmlFor="convert-company">New company name</Label>
                <Input
                  id="convert-company"
                  value={companyName}
                  onChange={(event) => {
                    setCompanyName(event.target.value);
                    setCreateCompany(event.target.value.trim().length > 0);
                  }}
                  placeholder="Leave blank for an individual customer"
                  maxLength={200}
                />
                <p className="text-sm text-[var(--text-muted)]">
                  Plenty of jobs are for a person rather than a business — leaving this empty is
                  fine.
                </p>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">
              Deal
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="convert-title">Title *</Label>
              <Input
                id="convert-title"
                value={dealTitle}
                onChange={(event) => setDealTitle(event.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="convert-value">Value ({prep.lead.currency})</Label>
              <Input
                id="convert-value"
                inputMode="decimal"
                className="font-mono"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="0.00"
              />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Notes, calls, tasks and documents from lead {prep.lead.leadNo} carry across to the
              deal. The lead stays as the record of where this came from.
            </p>
          </section>
        </div>
      ) : null}
    </RecordDialog>
  );
}
