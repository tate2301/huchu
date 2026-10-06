"use client";

/**
 * The questions a rep answers on site, for the things actually being quoted.
 *
 * A visit opens a section per product — epoxy for the floor, branded mats for
 * the entrance — and each section asks that product's own questions. The rep
 * picks what is being quoted; nobody is made to scroll past 152 questions to
 * find the eleven that apply.
 *
 * Answers save per section rather than per keystroke or per whole visit. Per
 * keystroke floods a bad connection; per visit means an interrupted afternoon
 * loses everything.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Stack } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";
import { formatMoney } from "@/components/crm/money/money";
import { FieldInput } from "@/components/forms/field-input";
import {
  answerValue,
  fieldFromQuestion,
  quoteLinesOf,
  type QuestionRow,
  type StoredAnswer,
} from "@/lib/crm/site-visits/fields";
import { DISPLAY_FIELD_TYPES, isShown, type FieldDefinition } from "@/lib/forms/fields";
import { draftQuote, draftSubtotal, type DraftedLine } from "@/lib/forms/quote";

type Question = QuestionRow & { id: string; needsReview: boolean };

type Answer = StoredAnswer & {
  questionKey: string;
  notes: string | null;
  notApplicable: boolean;
};

type Section = {
  id: string;
  name: string;
  kind: "PRODUCT" | "EVIDENCE" | "CLOSEOUT";
  answers: Answer[];
  questionSet: { questions: Question[]; quoteLines: unknown } | null;
};

type SetSummary = {
  id: string;
  key: string;
  name: string;
  kind: string;
  questionCount: number;
};

type SectionsResponse = {
  available: { product: SetSummary[]; evidence: SetSummary[]; closeout: SetSummary[] };
  sections: Section[];
};

/** The value a question currently holds, in the shape the input wants. */
type Draft = Record<string, unknown>;

function draftFromAnswers(section: Section): Draft {
  const draft: Draft = {};
  for (const answer of section.answers) {
    const value = answerValue(answer);
    if (value !== undefined) draft[answer.questionKey] = value;
  }
  return draft;
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function VisitQuestionSections({ appointmentId }: { appointmentId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["crm", "visit-sections", appointmentId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      fetchJson<SectionsResponse>(`/api/v2/crm/appointments/${appointmentId}/sections`),
  });

  const addSection = useMutation({
    mutationFn: (questionSetId: string) =>
      fetchJson(`/api/v2/crm/appointments/${appointmentId}/sections`, {
        method: "POST",
        body: JSON.stringify({ questionSetId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) =>
      toast({ title: "Could not add that", description: getApiErrorMessage(error) }),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;

  const unopened = [...data.available.product, ...data.available.evidence, ...data.available.closeout]
    .filter((set) => !data.sections.some((section) => section.name === set.name));

  return (
    <Stack gap="md">
      {data.sections.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Add what you are quoting and its questions will appear here.
        </p>
      ) : null}

      {data.sections.map((section) => (
        <QuestionSection
          key={section.id}
          appointmentId={appointmentId}
          section={section}
          onSaved={() => queryClient.invalidateQueries({ queryKey })}
        />
      ))}

      {unopened.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text-strong)]">
            What else are you quoting?
          </h4>
          <div className="flex flex-wrap gap-2">
            {unopened.map((set) => (
              <Button
                key={set.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={addSection.isPending}
                onClick={() => addSection.mutate(set.id)}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                {set.name}
                <span className="ml-1.5 text-[var(--text-muted)]">{set.questionCount}</span>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </Stack>
  );
}

function QuestionSection({
  appointmentId,
  section,
  onSaved,
}: {
  appointmentId: string;
  section: Section;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftFromAnswers(section));
  const [notApplicable, setNotApplicable] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(section.answers.map((a) => [a.questionKey, a.notApplicable])),
  );

  const fields = useMemo(() => (section.questionSet?.questions ?? []).map(fieldFromQuestion), [section.questionSet]);
  const quoteLines = useMemo(() => quoteLinesOf(section.questionSet?.quoteLines), [section.questionSet]);
  // What is asked depends on what has been answered: damp found, the primer question appears.
  const given = useMemo(
    () => Object.fromEntries(Object.entries(draft).filter(([key]) => !notApplicable[key])),
    [draft, notApplicable],
  );
  const asked = fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type) && isShown(field, fields, given));
  const drafted = useMemo(() => draftQuote(quoteLines, fields, given), [fields, given, quoteLines]);

  const save = useMutation({
    mutationFn: () =>
      fetchJson(
        `/api/v2/crm/appointments/${appointmentId}/sections/${section.id}/answers`,
        {
          method: "PUT",
          body: JSON.stringify({
            answers: fields
              .filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type))
              .map((field) => ({
                questionKey: field.key,
                // A question not asked with these answers keeps nothing.
                value: isShown(field, fields, given) ? (draft[field.key] ?? null) : null,
                notApplicable: notApplicable[field.key] ?? false,
              })),
          }),
        },
      ),
    onSuccess: () => {
      toast({ title: `${section.name} saved` });
      onSaved();
    },
    onError: (error) =>
      toast({ title: "Could not save", description: getApiErrorMessage(error) }),
  });

  const answered = asked.filter((field) => notApplicable[field.key] || !blank(draft[field.key])).length;

  return (
    <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
      <header className="flex items-baseline justify-between gap-3">
        <h4 className="text-base font-semibold text-[var(--text-strong)]">{section.name}</h4>
        <span className="text-sm text-[var(--text-muted)]">
          {answered} of {asked.length}
        </span>
      </header>

      <Stack gap="md">
        {fields.map((field) =>
          isShown(field, fields, given) ? (
            <QuestionField
              key={field.key}
              field={field}
              idPrefix={`q-${section.id}`}
              value={draft[field.key]}
              notApplicable={notApplicable[field.key] ?? false}
              onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
              onNotApplicable={(value) =>
                setNotApplicable((current) => ({ ...current, [field.key]: value }))
              }
            />
          ) : null,
        )}
      </Stack>

      {quoteLines.length > 0 ? <DraftedQuote drafted={drafted} /> : null}

      <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : `Save ${section.name}`}
      </Button>
    </section>
  );
}

/** What these answers put on the quote, as they are given. */
function DraftedQuote({ drafted }: { drafted: DraftedLine[] }) {
  return (
    <div className="space-y-1.5 rounded-[var(--radius-sm)] bg-[var(--canvas)] p-3 text-sm">
      <p className="font-semibold text-[var(--text-strong)]">The quote so far</p>
      {drafted.length === 0 ? (
        <p className="text-[var(--text-muted)]">Measure the site and the quote is drafted here.</p>
      ) : (
        <>
          {drafted.map((line) => (
            <div key={line.lineId} className="flex items-baseline justify-between gap-3">
              <span>
                {line.description}
                <span className="block text-sm text-[var(--text-muted)]">{line.source}</span>
              </span>
              <span className="font-mono tabular-nums whitespace-nowrap">{formatMoney(line.amount)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)] pt-1.5 font-semibold text-[var(--text-strong)]">
            <span>Before tax</span>
            <span className="font-mono tabular-nums">{formatMoney(draftSubtotal(drafted))}</span>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionField({
  field,
  idPrefix,
  value,
  notApplicable,
  onChange,
  onNotApplicable,
}: {
  field: FieldDefinition;
  idPrefix: string;
  value: unknown;
  notApplicable: boolean;
  onChange: (value: unknown) => void;
  onNotApplicable: (value: boolean) => void;
}) {
  // A heading or a note is read, not answered.
  if (DISPLAY_FIELD_TYPES.includes(field.type)) return <FieldInput field={field} />;

  return (
    <div className="space-y-1.5">
      {notApplicable ? (
        <p className="text-[15px] font-semibold text-[var(--text-muted)] line-through">{field.label}</p>
      ) : (
        <FieldInput field={field} value={value} onChange={onChange} idPrefix={idPrefix} uploadUrl="/api/v2/crm/uploads" />
      )}

      {/* Not every question applies to every site, and a rep who cannot say so
          leaves it blank — which reads as "not asked" rather than "asked, and
          it does not apply here". */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
        <Checkbox
          checked={notApplicable}
          onCheckedChange={(checked) => onNotApplicable(checked === true)}
        />
        <span>Not applicable</span>
      </label>
    </div>
  );
}
