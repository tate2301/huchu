"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@corelithzw/react";

import { BuilderShell } from "@/components/builder/builder-shell";
import styles from "@/components/builder/builder.module.css";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fieldFromQuestion, questionFromField, quoteLinesOf, SITE_VISIT_FIELD_TYPES, type QuestionRow } from "@/lib/crm/site-visits/fields";
import { ClipboardText } from "@/lib/icons";
import { DISPLAY_FIELD_TYPES, type FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

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

const NO_PRODUCT = "__none__";

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
 * A site-visit form in the builder: its questions, the quote they draft, and
 * which visits ask it. Saved whole, the way the questions have always been.
 */
export function VisitFormBuilder({ id }: { id: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["crm", "question-set", id];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => fetchJson<SetDetail>(`/api/v2/crm/question-sets/${id}`) });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // The form arrives once; from then on the draft is the person's.
  if (data && draft === null) {
    const next = draftFrom(data);
    setDraft(next);
    setSaved(JSON.stringify(next));
  }

  const dirty = draft !== null && JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // A saved question keeps its key: answers are stored against it.
  const lockedKeys = useMemo(() => new Set(data?.set.questions.map((question) => question.key) ?? []), [data]);

  const save = useMutation({
    mutationFn: (next: Draft) => {
      const existing = new Map((data?.set.questions ?? []).map((question) => [question.key, question]));
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
      });
    },
    onSuccess: async (_, next) => {
      setSaved(JSON.stringify(next));
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: `${next.name} saved` });
    },
    onError: (saveError) => toast({ title: "Not saved", description: getApiErrorMessage(saveError), variant: "destructive" }),
  });

  if (error) {
    return (
      <>
        <PageChrome title="Site visit form" icon={ClipboardText} backHref="/crm/build" backLabel="Build" />
        <p className="text-sm text-[var(--text-muted)]">{getApiErrorMessage(error)}</p>
      </>
    );
  }
  if (isLoading || !data || !draft) {
    return (
      <>
        <PageChrome title="Site visit form" icon={ClipboardText} backHref="/crm/build" backLabel="Build" />
        <Skeleton className="h-[70vh] w-full" />
      </>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const product = data.products.find((entry) => entry.id === draft.productId);
  const asked = draft.fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type)).length;
  const meta =
    draft.kind === "PRODUCT"
      ? `Site visit form · asked when quoting ${product?.name ?? "a product"}`
      : `Site visit form · ${KIND_LABELS[draft.kind].toLowerCase()}`;

  return (
    <>
      <PageChrome title={draft.name || "Untitled site visit form"} icon={ClipboardText} backHref="/crm/build" backLabel="Build">
        <span className="text-sm text-[var(--text-muted)]">{save.isPending ? "Saving…" : dirty ? "Not saved yet" : "Saved"}</span>
        {data.canEdit ? (
          <Button type="button" size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
            Save
          </Button>
        ) : null}
      </PageChrome>
      <BuilderShell
        name={draft.name}
        onNameChange={(name) => set({ name })}
        meta={meta}
        fields={draft.fields}
        onFieldsChange={(fields) => set({ fields })}
        types={SITE_VISIT_FIELD_TYPES}
        lockedKeys={lockedKeys}
        quoteLines={draft.quoteLines}
        onQuoteLinesChange={(quoteLines) => set({ quoteLines })}
        formSettings={
          <>
            <div className={styles.inspectorHead}>
              <ClipboardText aria-hidden />
              <span className={styles.inspectorTitle}>The form</span>
            </div>
            <div className={styles.paneBody}>
              <div className={styles.group}>
                <div className={styles.row}>
                  <label htmlFor="form-name">Name</label>
                  <Input id="form-name" value={draft.name} onChange={(event) => set({ name: event.target.value })} />
                </div>
                <div className={styles.row}>
                  <label htmlFor="form-kind">Asked</label>
                  <Select value={draft.kind} onValueChange={(kind) => set({ kind: kind as Kind })}>
                    <SelectTrigger id="form-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {KIND_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {draft.kind === "PRODUCT" ? (
                  <div className={styles.row}>
                    <label htmlFor="form-product">Product</label>
                    <Select value={draft.productId ?? NO_PRODUCT} onValueChange={(value) => set({ productId: value === NO_PRODUCT ? null : value })}>
                      <SelectTrigger id="form-product">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PRODUCT}>Not linked to a product</SelectItem>
                        {data.products.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className={styles.row}>
                  <label htmlFor="form-active">In use</label>
                  <div className={styles.inline}>
                    <Switch id="form-active" checked={draft.isActive} onChange={(event) => set({ isActive: event.target.checked })} />
                    <span className={styles.muted}>{draft.isActive ? "Reps are offered it" : "A draft; reps do not see it"}</span>
                  </div>
                </div>
              </div>
              <div className={styles.group}>
                <p className={styles.groupHead}>So far</p>
                <p className={styles.hint} style={{ margin: 0 }}>
                  {asked} {asked === 1 ? "question" : "questions"} · {draft.quoteLines.length} quote {draft.quoteLines.length === 1 ? "line" : "lines"} · opened on {data.visitCount}{" "}
                  {data.visitCount === 1 ? "visit" : "visits"}
                </p>
                <p className={styles.hint} style={{ margin: 0 }}>
                  Select a question to set it up, or the quote at the foot of the form to price it.
                </p>
              </div>
            </div>
          </>
        }
      />
    </>
  );
}
