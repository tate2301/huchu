"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Alert } from "@corelithzw/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Block } from "@/lib/crm/blocks";
import { sampleValues } from "@/lib/crm/template-variables";

import { BlockRenderer } from "./block-renderer";
import styles from "./public-form.module.css";

type PublicForm = {
  name: string;
  attributes: { emoji?: string | null; description?: string | null } | null;
  blocks: Block[];
  companyName: string;
};

/**
 * A block form, filled in by somebody outside the company.
 *
 * The same renderer the editor previews with, in `fill` mode — so what the
 * person who built it approved is exactly what a customer sees. The only thing
 * this adds is the submit button and what happens after it.
 */
export function PublicTemplateForm({ token }: { token: string }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formQuery = useQuery({
    queryKey: ["public-template", token],
    queryFn: async () => {
      const response = await fetch(`/api/public/crm/template/${token}`);
      const payload = (await response.json()) as { ok: boolean; form?: PublicForm };
      if (!response.ok || !payload.ok || !payload.form) throw new Error("Form not found");
      return payload.form;
    },
    retry: false,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/public/crm/template/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not send it");
      return payload;
    },
    onSuccess: () => setDone(true),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not send it"),
  });

  if (formQuery.isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.sheet}>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="mt-5 h-64 w-full" />
        </div>
      </div>
    );
  }

  if (formQuery.error || !formQuery.data) {
    return (
      <div className={styles.page}>
        <div className={styles.sheet}>
          <Alert tone="danger" title="This form is not available">
            The link may have expired, or the form may have been taken down.
          </Alert>
        </div>
      </div>
    );
  }

  const form = formQuery.data;

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.sheet}>
          <Alert tone="success" title="Thank you">
            {form.companyName} has your answers and will be in touch.
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.sheet}>
        {/* Whose form this is, then what it is called. Rule 4: no third line
            of prose explaining the form to the person already reading it. */}
        <p className={styles.company}>{form.companyName}</p>
        <h1 className={styles.title}>
          {form.attributes?.emoji ? (
            <span className={styles.emoji} aria-hidden="true">
              {form.attributes.emoji}
            </span>
          ) : null}
          {form.name}
        </h1>

        {error ? (
          <div className={styles.alert}>
            <Alert tone="danger" title="Not sent">
              {error}
            </Alert>
          </div>
        ) : null}

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            submit.mutate();
          }}
        >
          <BlockRenderer
            blocks={form.blocks}
            context={{
              mode: "fill",
              // Variables in a public form's prose still resolve — the
              // company's own details are the ones that appear, and they are
              // not secret.
              values: sampleValues(),
              answers,
              onAnswer: (key, value) =>
                setAnswers((current) => ({ ...current, [key]: value })),
              uploadUrl: `/api/public/crm/template/${token}/upload`,
            }}
          />

          <div className={styles.foot}>
            <button type="submit" className={styles.send} disabled={submit.isPending}>
              {submit.isPending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
