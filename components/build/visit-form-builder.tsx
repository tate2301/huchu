"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ButtonLink, Field, Input, Select, Setting, Switch } from "@/components/core";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { applyFormChange, changedKey } from "@/lib/build/form-changes";
import { fieldFromQuestion, questionFromField, quoteLinesOf, SITE_VISIT_FIELD_TYPES, type QuestionRow } from "@/lib/crm/site-visits/fields";
import { DISPLAY_FIELD_TYPES, type FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";
import { formatTime } from "@/lib/workspace/format";

import { BuilderError, BuilderLoading } from "./builder-states";
import { FormBuilderView } from "./form-builder-view";
import { useBuilderKeys } from "./use-builder-keys";
import { useVaneStatus } from "@/components/vane/use-vane";
import type { FormChange } from "@/lib/vane/form-changes";

import { VaneFormChanges, type HeldChange } from "./vane-form-changes";

type Kind = "PRODUCT" | "EVIDENCE" | "CLOSEOUT";

type SetDetail = {
  set: {
    id: string;
    key: string;
    name: string;
    kind: Kind;
    productId: string | null;
    isActive: boolean;
    quoteLines: unknown;
    updatedAt?: string;
    questions: Array<QuestionRow & { id: string; requiresPhoto: boolean }>;
    product: { id: string; name: string } | null;
  };
  answerCounts: Record<string, number>;
  products: Array<{ id: string; name: string }>;
  visitCount: number;
  canEdit: boolean;
};

type Draft = { name: string; kind: Kind; productId: string | null; isActive: boolean; fields: FieldDefinition[]; quoteLines: QuoteLine[] };

const KIND_LABELS: Record<Kind, string> = {
  PRODUCT: "When it is being quoted",
  EVIDENCE: "On every visit",
  CLOSEOUT: "At the end of every visit",
};

const ROLE: Record<Kind, string> = {
  PRODUCT: "Form, used on site visits when quoting",
  EVIDENCE: "Form, used on every site visit",
  CLOSEOUT: "Form, used at the end of every site visit",
};

function draftFrom(detail: SetDetail): Draft {
  return {
    name: detail.set.name,
    kind: detail.set.kind,
    productId: detail.set.productId,
    isActive: detail.set.isActive,
    fields: detail.set.questions.map(fieldFromQuestion),
    quoteLines: quoteLinesOf(detail.set.quoteLines),
  };
}

/**
 * A site-visit form in Build (BuildForm): its questions, the quote they
 * draft, and which visits ask it, on the builder's grid. Publish (Ctrl ↵)
 * saves it whole, the way the questions have always been saved, and puts a
 * draft in use; Ctrl S saves without changing whether it is in use.
 */
export function VisitFormBuilder({ id }: { id: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["crm", "question-set", id];
  const detail = useQuery({ queryKey, queryFn: () => fetchJson<SetDetail>(`/api/v2/crm/question-sets/${id}`) });

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [savedJson, setSavedJson] = React.useState<string | null>(null);
  // The form arrives once; from then on the draft is the person's.
  if (detail.data && draft === null) {
    const next = draftFrom(detail.data);
    setDraft(next);
    setSavedJson(JSON.stringify(next));
  }
  const dirty = draft !== null && JSON.stringify(draft) !== savedJson;

  // Vane's changes to the form, from its answers (PageVaneForm): Read the answers for changes is a job of kind
  // write (`lib/vane/form-changes.ts`). Keep puts one in this draft; publishing the draft is the person's.
  const vaneStatus = useVaneStatus();
  const [changes, setChanges] = React.useState<HeldChange[] | null>(null);
  const readChanges = useMutation({
    mutationFn: () => fetchJson<{ changes: FormChange[] }>("/api/vane/write/form-changes", { method: "POST", body: JSON.stringify({ questionSetId: id }) }),
    onSuccess: ({ changes: found }) => setChanges(found.map((change, index) => ({ ...change, id: `${Date.now()}-${index}`, kept: false }))),
  });

  // A saved question keeps its key: answers are stored against it.
  const lockedKeys = React.useMemo(() => new Set(detail.data?.set.questions.map((question) => question.key) ?? []), [detail.data]);

  const save = useMutation({
    mutationFn: ({ next, published }: { next: Draft; published: boolean }) => {
      const existing = new Map((detail.data?.set.questions ?? []).map((question) => [question.key, question]));
      return fetchJson<{ set: SetDetail["set"] }>(`/api/v2/crm/question-sets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: next.name.trim() || "Untitled site visit form",
          kind: next.kind,
          productId: next.kind === "PRODUCT" ? next.productId : null,
          isActive: next.isActive,
          questions: next.fields.map((field) => {
            const row = questionFromField(field);
            const before = existing.get(field.key);
            return {
              ...(before ? { id: before.id } : {}),
              key: row.key,
              label: row.label,
              helpText: row.helpText,
              type: row.type,
              options: row.options,
              unit: row.unit,
              isRequired: row.isRequired,
              requiresPhoto: field.type === "photos" || Boolean(before?.requiresPhoto),
              settings: row.settings,
            };
          }),
          quoteLines: next.quoteLines,
        }),
      }).then(() => ({ next, published }));
    },
    onSuccess: async ({ next, published }) => {
      setDraft(next);
      setSavedJson(JSON.stringify(next));
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["build"] });
      toast({ title: `${next.name} ${published ? "published" : "saved"}`, variant: "success" });
    },
    onError: (failure) => toast({ title: "Not saved", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const publish = () => draft && save.mutate({ next: { ...draft, isActive: true }, published: true });
  const back = useBuilderKeys({ dirty, onSave: () => draft && dirty && save.mutate({ next: draft, published: false }), backHref: "/build?kind=forms" });

  if (detail.isError) return <BuilderError what="This form" onRetry={() => void detail.refetch()} error={detail.error} backHref="/build?kind=forms" />;
  if (!detail.data || !draft) return <BuilderLoading />;

  const data = detail.data;
  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const waiting = (changes ?? []).filter((change) => !change.kept);
  const pending = new Set(waiting.map(changedKey).filter((key): key is string => key !== null));
  const changesFromVane = waiting.length;
  const asked = draft.fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type)).length;
  const product = data.products.find((entry) => entry.id === draft.productId);

  return (
    <FormBuilderView
      name={draft.name}
      onName={(name) => set({ name })}
      role={`${draft.kind === "PRODUCT" && product ? `${ROLE.PRODUCT} ${product.name}` : ROLE[draft.kind]}${
        changesFromVane ? ` · ${draft.isActive ? "" : "draft, "}${changesFromVane} ${changesFromVane === 1 ? "change" : "changes"} from Vane` : ""
      }`}
      back={{ label: "Back to Build", onBack: back }}
      fields={draft.fields}
      onFields={(fields) => set({ fields })}
      types={SITE_VISIT_FIELD_TYPES}
      lockedKeys={lockedKeys}
      requiredNote="A visit cannot finish without it"
      quoteLines={draft.quoteLines}
      onQuoteLines={(quoteLines) => set({ quoteLines })}
      saved={save.isPending ? { state: "saving" } : dirty ? { state: "dirty" } : { state: "saved", at: data.set.updatedAt ? formatTime(new Date(data.set.updatedAt)) : null }}
      actions={
        <ButtonLink icon="insights" href={`/crm/build/visits/${encodeURIComponent(id)}/insights`}>
          Insights
        </ButtonLink>
      }
      onPublish={publish}
      publishing={save.isPending}
      canEdit={data.canEdit}
      vane={
        vaneStatus.data && !vaneStatus.data.paused
          ? {
              waiting: waiting.length,
              pending,
              panel: (
                <VaneFormChanges
                  changes={changes}
                  canEdit={data.canEdit}
                  reading={readChanges.isPending}
                  failed={readChanges.error ? getApiErrorMessage(readChanges.error, "Vane could not read the answers. Try again.") : null}
                  onRead={() => readChanges.mutate()}
                  onKeep={(change) => {
                    setDraft((current) => (current ? { ...current, ...applyFormChange(current, change) } : current));
                    setChanges((current) => current?.map((row) => (row.id === change.id ? { ...row, kept: true } : row)) ?? null);
                  }}
                  onNotNow={(change) => setChanges((current) => current?.filter((row) => row.id !== change.id) ?? null)}
                />
              ),
            }
          : undefined
      }
      settings={
        <>
          <h2>The form</h2>
          <Field label="Name" htmlFor="form-name">
            <Input id="form-name" value={draft.name} disabled={!data.canEdit} onChange={(event) => set({ name: event.target.value })} />
          </Field>
          <Field label="Asked" htmlFor="form-kind">
            <Select id="form-kind" value={draft.kind} disabled={!data.canEdit} onChange={(event) => set({ kind: event.target.value as Kind })}>
              {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>
          {draft.kind === "PRODUCT" ? (
            <Field label="Product" htmlFor="form-product">
              <Select
                id="form-product"
                value={draft.productId ?? ""}
                disabled={!data.canEdit}
                onChange={(event) => set({ productId: event.target.value || null })}
              >
                <option value="">Not linked to a product</option>
                {data.products.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Setting
            htmlFor="form-active"
            title="In use"
            description={draft.isActive ? "Reps are offered it" : "A draft; reps do not see it"}
            control={<Switch id="form-active" checked={draft.isActive} disabled={!data.canEdit} onCheckedChange={(isActive) => set({ isActive })} />}
          />
          <div className="pl">
            <div className="pl-h">So far</div>
            <div className="prow">
              <b>Questions</b>
              <span>{asked}</span>
            </div>
            <div className="prow">
              <b>Quote lines</b>
              <span>{draft.quoteLines.length}</span>
            </div>
            <div className="prow">
              <b>Opened on</b>
              <span>
                {data.visitCount} {data.visitCount === 1 ? "visit" : "visits"}
              </span>
            </div>
          </div>
          {!data.canEdit ? <p className="rb-note">A manager changes the site-visit questions. You can preview the form.</p> : null}
          <ButtonLink icon="insights" href={`/crm/build/visits/${encodeURIComponent(id)}/insights`}>
            The visits it was asked on
          </ButtonLink>
          {dirty ? (
            <p className="rb-note">
              Not saved yet. Publish (Ctrl ↵) saves it and puts it in use; Ctrl S saves it as it is. Leaving asks first.
            </p>
          ) : null}
        </>
      }
    />
  );
}
