"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@corelithzw/react";

import { BuilderShell } from "@/components/builder/builder-shell";
import styles from "@/components/builder/builder.module.css";
import { FieldInput } from "@/components/forms/field-input";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight, Globe } from "@/lib/icons";
import { FIELD_TYPES, type FieldDefinition } from "@/lib/forms/fields";

type IntakeForm = {
  id: string;
  name: string;
  headline: string | null;
  description: string | null;
  successMessage: string | null;
  publicToken: string;
  isActive: boolean;
  allowPhotos: boolean;
  maxPhotos: number;
  fields: FieldDefinition[] | null;
  services: Array<{ id: string; label: string }> | null;
  submissionCount: number;
};

type Draft = {
  name: string;
  headline: string;
  description: string;
  successMessage: string;
  isActive: boolean;
  allowPhotos: boolean;
  fields: FieldDefinition[];
};

/** What every enquiry asks, before the form's own questions. */
const CONTACT: FieldDefinition[] = [
  { key: "contact_name", label: "Your name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: false },
  { key: "phone", label: "Phone", type: "phone", required: true },
];

function draftFrom(form: IntakeForm): Draft {
  return {
    name: form.name,
    headline: form.headline ?? "",
    description: form.description ?? "",
    successMessage: form.successMessage ?? "",
    isActive: form.isActive,
    allowPhotos: form.allowPhotos,
    fields: form.fields ?? [],
  };
}

/**
 * An enquiry form in the builder: the questions a customer answers before
 * anyone has met them, and where those answers go — each enquiry is a lead.
 */
export function EnquiryFormBuilder({ id }: { id: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["crm-intake-forms"];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => fetchJson<{ data: IntakeForm[] }>("/api/v2/crm/intake-forms") });
  const form = data?.data.find((entry) => entry.id === id) ?? null;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // The form arrives once; from then on the draft is the person's.
  if (form && draft === null) {
    const next = draftFrom(form);
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

  // Answers already given are stored under these keys.
  const lockedKeys = useMemo(() => new Set(form && form.submissionCount > 0 ? (form.fields ?? []).map((field) => field.key) : []), [form]);

  const save = useMutation({
    mutationFn: (next: Draft) =>
      fetchJson(`/api/v2/crm/intake-forms/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: next.name.trim() || "Untitled enquiry form",
          headline: next.headline.trim() || null,
          description: next.description.trim() || null,
          successMessage: next.successMessage.trim() || null,
          isActive: next.isActive,
          allowPhotos: next.allowPhotos,
          fields: next.fields,
        }),
      }),
    onSuccess: async (_, next) => {
      setSaved(JSON.stringify(next));
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: `${next.name} saved` });
    },
    onError: (failure) => toast({ title: "Not saved", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const back = { backHref: "/crm/build", backLabel: "Build" };
  if (error || (data && !form)) {
    return (
      <>
        <PageChrome title="Enquiry form" icon={Globe} {...back} />
        <p className="text-sm text-[var(--text-muted)]">{error ? getApiErrorMessage(error) : "That enquiry form is not here."}</p>
      </>
    );
  }
  if (isLoading || !form || !draft) {
    return (
      <>
        <PageChrome title="Enquiry form" icon={Globe} {...back} />
        <Skeleton className="h-[70vh] w-full" />
      </>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const publicPath = `/f/${form.publicToken}`;

  return (
    <>
      <PageChrome title={draft.name || "Untitled enquiry form"} icon={Globe} {...back}>
        <span className="text-sm text-[var(--text-muted)]">{save.isPending ? "Saving…" : dirty ? "Not saved yet" : "Saved"}</span>
        <Button asChild type="button" variant="outline" size="sm">
          <a href={publicPath} target="_blank" rel="noreferrer">
            Open the form
          </a>
        </Button>
        <Button type="button" size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
          Save
        </Button>
      </PageChrome>
      <BuilderShell
        name={draft.headline || draft.name}
        onNameChange={(headline) => set({ headline })}
        meta={draft.description || "Enquiry form · filled in by customers"}
        fields={draft.fields}
        onFieldsChange={(fields) => set({ fields })}
        types={FIELD_TYPES}
        lockedKeys={lockedKeys}
        before={CONTACT.map((field) => (
          <FieldInput key={field.key} field={field} mode="preview" idPrefix="contact" />
        ))}
        formSettings={
          <>
            <div className={styles.inspectorHead}>
              <Globe aria-hidden />
              <span className={styles.inspectorTitle}>{draft.name}</span>
            </div>
            <div className={styles.paneBody}>
              <div className={styles.group}>
                <div className={styles.row}>
                  <label htmlFor="enquiry-name">Name</label>
                  <Input id="enquiry-name" value={draft.name} onChange={(event) => set({ name: event.target.value })} />
                </div>
                <div className={styles.row}>
                  <label htmlFor="enquiry-description">Under the title</label>
                  <Input id="enquiry-description" value={draft.description} placeholder="We reply within a working day" onChange={(event) => set({ description: event.target.value })} />
                </div>
                <div className={styles.row}>
                  <label htmlFor="enquiry-thanks">After sending</label>
                  <Input id="enquiry-thanks" value={draft.successMessage} placeholder="Thanks — we will be in touch" onChange={(event) => set({ successMessage: event.target.value })} />
                </div>
                <div className={styles.row}>
                  <label htmlFor="enquiry-photos">Photos</label>
                  <div className={styles.inline}>
                    <Switch id="enquiry-photos" checked={draft.allowPhotos} onChange={(event) => set({ allowPhotos: event.target.checked })} />
                    <span className={styles.muted}>{draft.allowPhotos ? `Up to ${form.maxPhotos}` : "Not asked for"}</span>
                  </div>
                </div>
                <div className={styles.row}>
                  <label htmlFor="enquiry-active">Taking enquiries</label>
                  <Switch id="enquiry-active" checked={draft.isActive} onChange={(event) => set({ isActive: event.target.checked })} />
                </div>
              </div>
              <div className={styles.group}>
                <p className={styles.groupHead}>Where answers go</p>
                <p className={styles.hint} style={{ margin: 0 }}>
                  Each enquiry makes a lead for the next rep in turn. The name, email and phone fill the customer; every other answer is kept on the lead,
                  under the name it is saved as.
                </p>
                <p className={styles.hint} style={{ margin: 0 }}>
                  {form.submissionCount} {form.submissionCount === 1 ? "enquiry" : "enquiries"} so far
                  {(form.services ?? []).length ? ` · offers ${(form.services ?? []).length} services` : ""}.
                </p>
                <Link href={`/crm/forms/${form.id}`} className={styles.addLink}>
                  Services and recent enquiries
                  <ChevronRight aria-hidden />
                </Link>
              </div>
            </div>
          </>
        }
      />
    </>
  );
}
