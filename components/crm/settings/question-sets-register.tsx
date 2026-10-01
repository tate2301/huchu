"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@corelithzw/react";

import {
  ListColumn,
  ListRow,
  RecordHeader,
  RegisterLayout,
  SectionHeading,
  type ListColumnState,
} from "@/components/management/ui";
import { QuestionList, type QuestionItem } from "@/components/forms/question-list";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import {
  BackToList,
  RecordEmpty,
} from "@/app/management/master-data/schools/classes/record-fields";
import {
  CreateDialog,
  CreateField,
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  DetailSelect,
  NoRecord,
} from "@/app/management/master-data/operations/_components/register-fields";
import { SAVE_STATE_LABELS, useAutosave } from "@/hooks/use-autosave";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { keyFromLabel } from "@/lib/forms/fields";
import {
  CHOICE_TYPES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from "@/lib/crm/site-visits/question-editing";
import { Checklist, SlidersHorizontal } from "@/lib/icons";

type Kind = "PRODUCT" | "EVIDENCE" | "CLOSEOUT";

type SetSummary = {
  id: string;
  key: string;
  name: string;
  kind: Kind;
  isActive: boolean;
  product: { id: string; name: string } | null;
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
    name: string;
    kind: Kind;
    isActive: boolean;
    questions: QuestionRecord[];
    product: { id: string; name: string } | null;
  };
  answerCounts: Record<string, number>;
  canEdit: boolean;
};

/** A question in the editor. No `id` means it has not been saved yet. */
type QuestionDraft = QuestionItem<QuestionType> & {
  id?: string;
  unit: string | null;
  requiresPhoto: boolean;
  needsReview: boolean;
};

const INDEX_HREF = "/crm/settings/site-visit-questions";

const KIND_LABELS: Record<Kind, string> = {
  PRODUCT: "Product",
  EVIDENCE: "Photographs",
  CLOSEOUT: "Close-out",
};

/** Kinds measured in a unit: a number, or a width by a height. */
const MEASURED: readonly QuestionType[] = ["NUMBER", "DIMENSION"];

/**
 * The questions a rep is asked on site, as a register: the sections in a list,
 * and the open one beside it — its name, its details and its questions —
 * drawn with the same pieces as the intake forms, because they are the same
 * idea of a question.
 *
 * The open section is the route, `/crm/settings/site-visit-questions/[id]`.
 */
export function QuestionSetsRegister({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<Kind>("PRODUCT");

  const setsQuery = useQuery({
    queryKey: ["crm", "question-sets"],
    queryFn: () => fetchJson<{ data: SetSummary[]; canEdit: boolean }>("/api/v2/crm/question-sets"),
  });
  const detailQuery = useQuery({
    queryKey: ["crm", "question-set", selectedId],
    queryFn: () => fetchJson<SetDetail>(`/api/v2/crm/question-sets/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const sets = useMemo(() => setsQuery.data?.data ?? [], [setsQuery.data]);
  const canEdit = setsQuery.data?.canEdit ?? false;
  const visible = useMemo(() => {
    const typed = search.trim().toLowerCase();
    return typed ? sets.filter((set) => set.name.toLowerCase().includes(typed)) : sets;
  }, [sets, search]);

  const create = useMutation({
    mutationFn: () =>
      fetchJson<{ set: { id: string } }>("/api/v2/crm/question-sets", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          kind: newKind,
          key: keyFromLabel(newName, new Set(sets.map((set) => set.key))),
        }),
      }),
    onSuccess: ({ set }) => {
      setCreating(false);
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["crm", "question-sets"] });
      router.push(`${INDEX_HREF}/${set.id}`);
    },
  });

  const state: ListColumnState = setsQuery.isLoading
    ? "loading"
    : setsQuery.isError
      ? "failed"
      : visible.length > 0
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  const detail = detailQuery.data;

  return (
    <>
      <RegisterLayout
        page
        hasSelection={Boolean(selectedId)}
        collapseList
        list={
          <ListColumn
            title="Site visit questions"
            noun="section"
            count={setsQuery.isLoading ? undefined : sets.length}
            state={state}
            columns={{ row: "Section", value: "Questions" }}
            search={{ value: search, onChange: setSearch, placeholder: "Search sections" }}
            onNew={canEdit ? () => setCreating(true) : undefined}
            onRetry={() => void setsQuery.refetch()}
            emptyLabel="No sections"
            emptyIcon={Checklist}
          >
            {visible.map((set) => (
              <ListRow
                key={set.id}
                name={set.name}
                value={set.questionCount}
                href={`${INDEX_HREF}/${set.id}`}
                selected={set.id === selectedId}
                className={set.isActive ? undefined : "[&_*]:text-[#5E6573]"}
              />
            ))}
          </ListColumn>
        }
      >
        {detail && detail.set.id === selectedId ? (
          <QuestionSetRecord
            key={detail.set.id}
            detail={detail}
            onSaved={() => void queryClient.invalidateQueries({ queryKey: ["crm", "question-sets"] })}
          />
        ) : (
          <>
            {selectedId ? <BackToList href={INDEX_HREF} label="Site visit questions" /> : null}
            <NoRecord
              label={
                selectedId
                  ? detailQuery.isError
                    ? "That section could not be found."
                    : "Opening the section"
                  : "Pick a section to see its questions. A visit asks one section per product being quoted, so only the questions that apply are asked."
              }
            />
          </>
        )}
      </RegisterLayout>

      <CreateDialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) create.reset();
        }}
        title="New section"
        submitLabel="Create the section"
        busy={create.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim()) create.mutate();
        }}
      >
        <CreateField label="Name">
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={newName}
              placeholder="Shutters"
              className="text-[13px]"
              onChange={(event) => setNewName(event.target.value)}
            />
          )}
        </CreateField>
        <CreateField label="Kind">
          {(id) => (
            <DetailSelect id={id} value={newKind} onValueChange={(next) => setNewKind(next as Kind)}>
              {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </DetailSelect>
          )}
        </CreateField>
        {create.error ? (
          <p role="alert" className="-mt-3 text-sm text-[#B42318]">
            {getApiErrorMessage(create.error)}
          </p>
        ) : null}
      </CreateDialog>
    </>
  );
}

type Draft = { name: string; kind: Kind; isActive: boolean; questions: QuestionDraft[] };

/** The request body, in one fixed order, so "changed" is a string compare. */
function bodyOf(draft: Draft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    kind: draft.kind,
    isActive: draft.isActive,
    questions: draft.questions.map((question) => ({
      id: question.id,
      key: question.key,
      label: question.label.trim(),
      helpText: question.help?.trim() || null,
      type: question.type,
      options: question.options?.length ? question.options : null,
      unit: question.unit?.trim() || null,
      isRequired: question.required,
      requiresPhoto: question.requiresPhoto,
    })),
  });
}

function problemsOf(draft: Draft): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push("The section needs a name.");
  const seen = new Set<string>();
  for (const question of draft.questions) {
    const name = question.label.trim() || question.key;
    if (!question.label.trim()) problems.push("Every question needs something to ask.");
    if (CHOICE_TYPES.includes(question.type) && !question.options?.some((option) => option.label.trim())) {
      problems.push(`"${name}" asks the rep to pick from a list, so it needs at least one choice.`);
    }
    if (question.options?.some((option) => !option.label.trim())) {
      problems.push(`"${name}" has a choice with no words.`);
    }
    if (seen.has(question.key)) problems.push(`Two questions both save to "${question.key}".`);
    seen.add(question.key);
  }
  return Array.from(new Set(problems));
}

function QuestionSetRecord({ detail, onSaved }: { detail: SetDetail; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const initial: Draft = {
    name: detail.set.name,
    kind: detail.set.kind,
    isActive: detail.set.isActive,
    questions: detail.set.questions.map((question) => ({
      id: question.id,
      key: question.key,
      label: question.label,
      help: question.helpText,
      type: question.type,
      options: question.options,
      unit: question.unit,
      required: question.isRequired,
      requiresPhoto: question.requiresPhoto,
      needsReview: question.needsReview,
    })),
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const set = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const problems = problemsOf(draft);
  const state = useAutosave({
    initialBody: bodyOf(initial),
    body: bodyOf(draft),
    valid: detail.canEdit && problems.length === 0,
    save: async (body, { keepalive }) => {
      const { set: saved } = await fetchJson<{ set: { questions: Array<{ id: string; key: string }> } }>(
        `/api/v2/crm/question-sets/${detail.set.id}`,
        { method: "PATCH", body, keepalive },
      );
      onSaved();
      void queryClient.invalidateQueries({ queryKey: ["crm", "question-set", detail.set.id] });
      // A question saved for the first time comes back with an id. Every save
      // after carries it, or the server would read it as another new question.
      // Saving also clears the "kind was guessed" flag, as somebody has now
      // looked at the question.
      const ids = new Map(saved.questions.map((question) => [question.key, question.id]));
      setDraft((current) => ({
        ...current,
        questions: current.questions.map((question) => ({
          ...question,
          id: question.id ?? ids.get(question.key),
          needsReview: false,
        })),
      }));
      // What is on the server now: the body that was sent, with those ids.
      const sent = JSON.parse(body) as { questions: Array<{ id?: string; key: string }> };
      return JSON.stringify({
        ...sent,
        questions: sent.questions.map(({ id, ...rest }) => ({ id: id ?? ids.get(rest.key), ...rest })),
      });
    },
  });
  const status = SAVE_STATE_LABELS[state];
  const statusNode = status ? <span className="text-[13px] leading-[1.45] text-[#5E6573]">{status}</span> : null;
  const readOnly = !detail.canEdit;

  return (
    <>
      <BackToList href={INDEX_HREF} label="Site visit questions" />

      <RecordHeader
        title={draft.name}
        icon={Checklist}
        onRename={readOnly ? undefined : (next) => set({ name: next })}
        renameLabel="Rename the section"
      />

      <SectionHeading icon={SlidersHorizontal} tone="brand" action={statusNode}>
        Details
      </SectionHeading>
      <DetailGrid className="mb-8">
        <DetailRow label="Kind">
          {(id) => (
            <DetailSelect id={id} value={draft.kind} disabled={readOnly} onValueChange={(next) => set({ kind: next as Kind })}>
              {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </DetailSelect>
          )}
        </DetailRow>
        <DetailRow label="Status">
          {(id) => (
            <DetailSelect
              id={id}
              value={draft.isActive ? "on" : "off"}
              disabled={readOnly}
              onValueChange={(next) => set({ isActive: next === "on" })}
            >
              <SelectItem value="on">Asked on visits</SelectItem>
              <SelectItem value="off">Not asked</SelectItem>
            </DetailSelect>
          )}
        </DetailRow>
        {detail.set.product ? (
          <DetailRow label="Product">
            <span className="text-[13px] leading-[1.5] text-[#16181D]">{detail.set.product.name}</span>
          </DetailRow>
        ) : null}
      </DetailGrid>

      {readOnly ? (
        <div className="mb-6">
          <RecordEmpty>You can read these but not change them. Ask somebody with CRM settings access.</RecordEmpty>
        </div>
      ) : null}

      <QuestionList<QuestionType, QuestionDraft>
        questions={draft.questions}
        onChange={(questions) => set({ questions })}
        types={QUESTION_TYPES}
        typeLabels={QUESTION_TYPE_LABELS}
        choiceTypes={CHOICE_TYPES}
        create={(key) => ({
          key,
          label: "",
          type: "SHORT_TEXT",
          required: false,
          help: null,
          options: null,
          unit: null,
          requiresPhoto: false,
          needsReview: false,
        })}
        // A saved question's key is what its answers are stored against.
        keyLocked={(question) => Boolean(question.id)}
        meta={(question) => {
          const answered = question.id ? (detail.answerCounts[question.id] ?? 0) : 0;
          return [
            question.needsReview ? "Kind was guessed on import — check it" : null,
            answered ? `Answered on ${answered} ${answered === 1 ? "visit" : "visits"}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null;
        }}
        extra={(question, update) => (
          <>
            {MEASURED.includes(question.type) ? (
              <DetailRow label="Unit">
                {(id) => (
                  <Input
                    id={id}
                    disabled={readOnly}
                    value={question.unit ?? ""}
                    placeholder="m², mm, litres"
                    className={DETAIL_CONTROL_CLASS}
                    onChange={(event) => update({ ...question, unit: event.target.value || null })}
                  />
                )}
              </DetailRow>
            ) : null}
            <DetailRow label="Photograph">
              {(id) => (
                <Switch
                  id={id}
                  checked={question.requiresPhoto}
                  disabled={readOnly}
                  onChange={(event) => update({ ...question, requiresPhoto: event.target.checked })}
                />
              )}
            </DetailRow>
          </>
        )}
        problems={readOnly ? [] : problems}
        status={statusNode}
        readOnly={readOnly}
      />
    </>
  );
}
