"use client";

/**
 * The site-visit questions, as a tenant edits them.
 *
 * Same shape as the intake form builder — a list of sections, each opening
 * into a list of fields — and literally the same row component, so the two
 * screens cannot drift into two different ideas of what a field is. What is
 * not shared is the storage: intake fields are a JSON blob on the form,
 * these are `CrmQuestion` rows that answers and photographs hold foreign keys
 * to. That difference is the reason "which sites showed damp?" is an indexed
 * lookup here rather than a scan.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Stack } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight, Plus } from "@/lib/icons";
import {
  CHOICE_TYPES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from "@/lib/crm/site-visits/question-editing";

import { FieldRow, type EditableField } from "@/components/crm/field-editor/field-row";

type SetSummary = {
  id: string;
  key: string;
  name: string;
  kind: "PRODUCT" | "EVIDENCE" | "CLOSEOUT";
  isActive: boolean;
  product: { id: string; name: string } | null;
  sourceTemplateKey: string | null;
  questionCount: number;
};

type QuestionRecord = {
  id: string;
  key: string;
  label: string;
  helpText: string | null;
  type: QuestionType;
  options: Array<{ value: string; label: string }> | null;
  unit: string | null;
  isRequired: boolean;
  requiresPhoto: boolean;
  needsReview: boolean;
};

type SetDetail = {
  set: {
    id: string;
    key: string;
    name: string;
    kind: "PRODUCT" | "EVIDENCE" | "CLOSEOUT";
    questions: QuestionRecord[];
    product: { id: string; name: string } | null;
  };
  answerCounts: Record<string, number>;
  canEdit: boolean;
};

/** A question in the editor. `id` absent means it has not been saved yet. */
type QuestionDraft = EditableField<QuestionType> & {
  id?: string;
  helpText: string | null;
  unit: string | null;
  requiresPhoto: boolean;
  needsReview: boolean;
};

const KIND_LABELS: Record<SetSummary["kind"], string> = {
  PRODUCT: "Product",
  EVIDENCE: "Photographs",
  CLOSEOUT: "Close-out",
};

export function QuestionSetsContent() {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "question-sets"],
    queryFn: () => fetchJson<{ data: SetSummary[]; canEdit: boolean }>("/api/v2/crm/question-sets"),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return null;

  if (openId) {
    return <SectionEditor setId={openId} onClose={() => setOpenId(null)} />;
  }

  return (
    <Stack gap="md" className="max-w-3xl">
      {!data.canEdit ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-muted)]">
          You can read these but not change them. Ask somebody with CRM settings
          access to edit the questions.
        </p>
      ) : null}

      <p className="text-sm text-[var(--text-muted)]">
        What a rep is asked on site. A visit opens a section per product being
        quoted, so only the questions that apply are asked.
      </p>

      <ul className="divide-y divide-[var(--border-subtle)]">
        {data.data.map((set) => (
          <li key={set.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 py-3 text-left"
              onClick={() => setOpenId(set.id)}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--text-strong)]">{set.name}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {KIND_LABELS[set.kind]} · {set.questionCount}{" "}
                  {set.questionCount === 1 ? "question" : "questions"}
                  {set.product ? ` · ${set.product.name}` : ""}
                  {set.sourceTemplateKey ? "" : " · edited"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Stack>
  );
}

function SectionEditor({ setId, onClose }: { setId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["crm", "question-set", setId],
    queryFn: () => fetchJson<SetDetail>(`/api/v2/crm/question-sets/${setId}`),
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  // Keyed, so a refetch never clobbers edits in progress — the same reasoning
  // the intake builder uses.
  return <SectionEditorForm key={data.set.id} detail={data} onClose={onClose} />;
}

function SectionEditorForm({ detail, onClose }: { detail: SetDetail; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(detail.set.name);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    detail.set.questions.map((question) => ({
      id: question.id,
      key: question.key,
      label: question.label,
      helpText: question.helpText,
      type: question.type,
      options: question.options,
      unit: question.unit,
      required: question.isRequired,
      requiresPhoto: question.requiresPhoto,
      needsReview: question.needsReview,
    })),
  );

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/question-sets/${detail.set.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          questions: questions.map((question) => ({
            id: question.id,
            key: question.key,
            label: question.label,
            helpText: question.helpText || null,
            type: question.type,
            options: question.options ?? null,
            unit: question.unit || null,
            isRequired: question.required,
            requiresPhoto: question.requiresPhoto,
          })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Reps will see this on their next visit." });
      queryClient.invalidateQueries({ queryKey: ["crm", "question-set", detail.set.id] });
      queryClient.invalidateQueries({ queryKey: ["crm", "question-sets"] });
    },
    onError: (error) =>
      toast({ title: "Could not save", description: getApiErrorMessage(error) }),
  });

  const flagged = questions.filter((question) => question.needsReview).length;

  function addQuestion() {
    setQuestions([
      ...questions,
      {
        key: `question_${questions.length + 1}`,
        label: "",
        helpText: null,
        type: "SHORT_TEXT",
        options: null,
        unit: null,
        required: false,
        requiresPhoto: false,
        needsReview: false,
      },
    ]);
  }

  return (
    <Stack gap="md" className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-sm text-[var(--text-muted)] underline" onClick={onClose}>
          ← All sections
        </button>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addQuestion} disabled={!detail.canEdit}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Add question
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={save.isPending || !detail.canEdit}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="set-name">Section name</Label>
        <Input
          id="set-name"
          value={name}
          disabled={!detail.canEdit}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      {flagged > 0 ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-strong)]">
          {flagged === 1
            ? "One question's type was a guess when the bank was imported — worth a look."
            : `${flagged} questions had their type guessed when the bank was imported — worth a look.`}{" "}
          Saving this section clears the flag.
        </p>
      ) : null}

      <Stack gap="sm">
        {questions.map((question, index) => {
          const answers = question.id ? (detail.answerCounts[question.id] ?? 0) : 0;
          return (
            <FieldRow
              key={question.id ?? `new-${index}`}
              field={question}
              types={QUESTION_TYPES}
              typeLabels={QUESTION_TYPE_LABELS}
              choiceTypes={CHOICE_TYPES}
              // A saved question's key is what its answers are stored against.
              keyEditable={!question.id}
              keyLockedReason={
                question.id
                  ? answers > 0
                    ? `Answered on ${answers} ${answers === 1 ? "visit" : "visits"}. Archive it and add a new question if the wording has to change fundamentally — the label above is safe to edit.`
                    : "Set when the question was created. The label above is safe to edit."
                  : undefined
              }
              onChange={(next) => {
                const copy = [...questions];
                copy[index] = next as QuestionDraft;
                setQuestions(copy);
              }}
              onRemove={() => setQuestions(questions.filter((_, i) => i !== index))}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`help-${index}`}>Help text</Label>
                  <Input
                    id={`help-${index}`}
                    value={question.helpText ?? ""}
                    placeholder="Shown under the question"
                    onChange={(event) => {
                      const copy = [...questions];
                      copy[index] = { ...question, helpText: event.target.value };
                      setQuestions(copy);
                    }}
                  />
                </div>
                {question.type === "NUMBER" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`unit-${index}`}>Unit</Label>
                    <Input
                      id={`unit-${index}`}
                      value={question.unit ?? ""}
                      placeholder="m², mm, litres"
                      onChange={(event) => {
                        const copy = [...questions];
                        copy[index] = { ...question, unit: event.target.value };
                        setQuestions(copy);
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
                <Checkbox
                  checked={question.requiresPhoto}
                  onCheckedChange={(checked) => {
                    const copy = [...questions];
                    copy[index] = { ...question, requiresPhoto: checked === true };
                    setQuestions(copy);
                  }}
                />
                <span>Ask for a photograph</span>
              </label>
            </FieldRow>
          );
        })}
      </Stack>

      {questions.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No questions in this section yet.
        </p>
      ) : null}
    </Stack>
  );
}
