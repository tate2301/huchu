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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Stack } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

type QuestionType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "BOOLEAN"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "DATE"
  | "DIMENSION"
  | "PHOTO_EVIDENCE";

type Question = {
  id: string;
  key: string;
  label: string;
  helpText: string | null;
  type: QuestionType;
  options: Array<{ value: string; label: string }> | null;
  unit: string | null;
  isRequired: boolean;
  needsReview: boolean;
};

type Answer = {
  questionKey: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueOptions: string[];
  valueDate: string | null;
  valueJson: { widthM?: number | null; heightM?: number | null } | null;
  notes: string | null;
  notApplicable: boolean;
};

type Section = {
  id: string;
  name: string;
  kind: "PRODUCT" | "EVIDENCE" | "CLOSEOUT";
  answers: Answer[];
  questionSet: { questions: Question[] } | null;
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
    if (answer.valueJson) draft[answer.questionKey] = answer.valueJson;
    else if (answer.valueOptions.length > 0) draft[answer.questionKey] = answer.valueOptions;
    else if (answer.valueBool !== null) draft[answer.questionKey] = answer.valueBool;
    else if (answer.valueNumber !== null) draft[answer.questionKey] = answer.valueNumber;
    else if (answer.valueDate) draft[answer.questionKey] = answer.valueDate.slice(0, 10);
    else if (answer.valueText !== null) draft[answer.questionKey] = answer.valueText;
  }
  return draft;
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

  const questions = section.questionSet?.questions ?? [];

  const save = useMutation({
    mutationFn: () =>
      fetchJson(
        `/api/v2/crm/appointments/${appointmentId}/sections/${section.id}/answers`,
        {
          method: "PUT",
          body: JSON.stringify({
            answers: questions.map((question) => ({
              questionKey: question.key,
              value: draft[question.key] ?? null,
              notApplicable: notApplicable[question.key] ?? false,
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

  const answered = questions.filter(
    (question) =>
      notApplicable[question.key] ||
      (draft[question.key] !== undefined && draft[question.key] !== null && draft[question.key] !== ""),
  ).length;

  return (
    <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
      <header className="flex items-baseline justify-between gap-3">
        <h4 className="text-base font-semibold text-[var(--text-strong)]">{section.name}</h4>
        <span className="text-sm text-[var(--text-muted)]">
          {answered} of {questions.length}
        </span>
      </header>

      <Stack gap="sm">
        {questions.map((question) => (
          <QuestionField
            key={question.key}
            question={question}
            value={draft[question.key]}
            notApplicable={notApplicable[question.key] ?? false}
            onChange={(value) => setDraft((current) => ({ ...current, [question.key]: value }))}
            onNotApplicable={(value) =>
              setNotApplicable((current) => ({ ...current, [question.key]: value }))
            }
          />
        ))}
      </Stack>

      <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : `Save ${section.name}`}
      </Button>
    </section>
  );
}

function QuestionField({
  question,
  value,
  notApplicable,
  onChange,
  onNotApplicable,
}: {
  question: Question;
  value: unknown;
  notApplicable: boolean;
  onChange: (value: unknown) => void;
  onNotApplicable: (value: boolean) => void;
}) {
  const id = `q-${question.key}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-normal">
        {question.label}
        {question.isRequired ? <span aria-hidden> *</span> : null}
      </Label>
      {question.helpText ? (
        <p className="text-sm text-[var(--text-muted)]">{question.helpText}</p>
      ) : null}

      {notApplicable ? null : <QuestionInput id={id} question={question} value={value} onChange={onChange} />}

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

function QuestionInput({
  id,
  question,
  value,
  onChange,
}: {
  id: string;
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (question.type) {
    case "BOOLEAN":
    case "PHOTO_EVIDENCE":
      return (
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          <span>{question.type === "PHOTO_EVIDENCE" ? "Captured" : "Yes"}</span>
        </label>
      );

    case "LONG_TEXT":
      return (
        <Textarea
          id={id}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "NUMBER":
      return (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(event) => onChange(event.target.value)}
          />
          {question.unit ? (
            <span className="text-sm text-[var(--text-muted)]">{question.unit}</span>
          ) : null}
        </div>
      );

    case "DATE":
      return (
        <Input
          id={id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "DIMENSION": {
      const dimension = (value ?? {}) as { widthM?: number | null; heightM?: number | null };
      return (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            placeholder="Width"
            value={dimension.widthM ?? ""}
            onChange={(event) =>
              onChange({ ...dimension, widthM: Number(event.target.value) || null })
            }
          />
          <span aria-hidden className="text-[var(--text-muted)]">×</span>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Height"
            aria-label={`${question.label} height`}
            value={dimension.heightM ?? ""}
            onChange={(event) =>
              onChange({ ...dimension, heightM: Number(event.target.value) || null })
            }
          />
          <span className="text-sm text-[var(--text-muted)]">m</span>
        </div>
      );
    }

    case "SINGLE_SELECT":
      return (
        <div className="flex flex-wrap gap-2">
          {(question.options ?? []).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={value === option.value ? "default" : "outline"}
              onClick={() => onChange(value === option.value ? null : option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      );

    case "MULTI_SELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(question.options ?? []).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={selected.includes(option.value) ? "default" : "outline"}
              onClick={() =>
                onChange(
                  selected.includes(option.value)
                    ? selected.filter((entry) => entry !== option.value)
                    : [...selected, option.value],
                )
              }
            >
              {option.label}
            </Button>
          ))}
        </div>
      );
    }

    default:
      return (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
