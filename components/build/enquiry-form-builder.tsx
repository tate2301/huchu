"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, ButtonLink, Field, Input, Select, Setting, Switch, TextArea } from "@/components/core";
import { FieldInput } from "@/components/forms/field-input";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { FIELD_TYPES, type FieldDefinition } from "@/lib/forms/fields";
import { formatTime } from "@/lib/workspace/format";

import { BuilderError, BuilderLoading, BuilderMessage } from "./builder-states";
import { FormBuilderView } from "./form-builder-view";
import { useBuilderKeys } from "./use-builder-keys";

type Service = { id: string; label: string };

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
  services: Service[] | null;
  submissionCount: number;
  convertedCount?: number;
  lastSubmissionAt?: string | null;
  updatedAt?: string;
};

type Submission = { id: string; createdAt: string; contactName: string | null; lead: { id: string; leadNo: string } | null };

type Draft = {
  name: string;
  headline: string;
  description: string;
  successMessage: string;
  isActive: boolean;
  allowPhotos: boolean;
  maxPhotos: number;
  fields: FieldDefinition[];
  services: Service[];
};

/** What every enquiry asks, before the form's own questions. */
const CONTACT: FieldDefinition[] = [
  { key: "contact_name", label: "Your name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: false },
  { key: "phone", label: "Phone", type: "phone", required: true },
];
const MESSAGE: FieldDefinition = { key: "message", label: "Anything else?", type: "longText", required: false };
const PHOTO_LIMITS = [1, 3, 5, 10, 20];

function draftFrom(form: IntakeForm): Draft {
  return {
    name: form.name,
    headline: form.headline ?? "",
    description: form.description ?? "",
    successMessage: form.successMessage ?? "",
    isActive: form.isActive,
    allowPhotos: form.allowPhotos,
    maxPhotos: form.maxPhotos || 5,
    fields: form.fields ?? [],
    services: form.services ?? [],
  };
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * An enquiry form in Build (PageIntakeForm): the questions a customer answers
 * before anyone has met them, what they can ask about, and where the answers
 * go — each enquiry is a lead — on the builder's grid. Its recent enquiries
 * and public link are in Settings.
 */
export function EnquiryFormBuilder({ id }: { id: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["crm-intake-forms"];
  const forms = useQuery({ queryKey, queryFn: () => fetchJson<{ data: IntakeForm[] }>("/api/v2/crm/intake-forms") });
  const form = forms.data?.data.find((entry) => entry.id === id) ?? null;
  const submissions = useQuery({
    queryKey: ["crm-submissions", "form", id],
    queryFn: () => fetchJson<{ data: Submission[] }>(`/api/v2/crm/submissions?formId=${encodeURIComponent(id)}&limit=10`),
    enabled: Boolean(form),
  });

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [savedJson, setSavedJson] = React.useState<string | null>(null);
  if (form && draft === null) {
    const next = draftFrom(form);
    setDraft(next);
    setSavedJson(JSON.stringify(next));
  }
  const dirty = draft !== null && JSON.stringify(draft) !== savedJson;

  // Answers already given are stored under these keys.
  const lockedKeys = React.useMemo(() => new Set(form && form.submissionCount > 0 ? (form.fields ?? []).map((field) => field.key) : []), [form]);

  const save = useMutation({
    mutationFn: ({ next, published }: { next: Draft; published: boolean }) =>
      fetchJson(`/api/v2/crm/intake-forms/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: next.name.trim() || "Untitled enquiry form",
          headline: next.headline.trim() || null,
          description: next.description.trim() || null,
          successMessage: next.successMessage.trim() || null,
          isActive: next.isActive,
          allowPhotos: next.allowPhotos,
          maxPhotos: next.maxPhotos,
          fields: next.fields,
          // A pill still being typed is not a service yet.
          services: next.services.filter((service) => service.label.trim()),
        }),
      }).then(() => ({ next, published })),
    onSuccess: async ({ next, published }) => {
      setDraft(next);
      setSavedJson(JSON.stringify(next));
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["crm-forms"] });
      await queryClient.invalidateQueries({ queryKey: ["build"] });
      toast({ title: `${next.name} ${published ? "published" : "saved"}`, variant: "success" });
    },
    onError: (failure) => toast({ title: "Not saved", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const back = useBuilderKeys({ dirty, onSave: () => draft && dirty && save.mutate({ next: draft, published: false }), backHref: "/build?kind=forms" });

  if (forms.isError) return <BuilderError what="This form" onRetry={() => void forms.refetch()} error={forms.error} backHref="/build?kind=forms" />;
  if (forms.data && !form) {
    return (
      <BuilderMessage backHref="/build?kind=forms">
        <p className="muted">That enquiry form is not here. It may have been deleted.</p>
      </BuilderMessage>
    );
  }
  if (!form || !draft) return <BuilderLoading />;

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const publicPath = `/f/${form.publicToken}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      toast({ title: "Link copied", description: "Anyone with it can fill the form in." });
    } catch {
      toast({ title: "Couldn't copy the link", variant: "destructive" });
    }
  };

  return (
    <FormBuilderView
      name={draft.name}
      onName={(name) => set({ name })}
      role="Form, used for new enquiries"
      back={{ label: "Back", onBack: back }}
      fields={draft.fields}
      onFields={(fields) => set({ fields })}
      types={FIELD_TYPES}
      lockedKeys={lockedKeys}
      requiredNote="An enquiry cannot be sent without it"
      saved={save.isPending ? { state: "saving" } : dirty ? { state: "dirty" } : { state: "saved", at: form.updatedAt ? formatTime(new Date(form.updatedAt)) : null }}
      actions={
        <ButtonLink icon="link" href={publicPath} target="_blank" rel="noreferrer">
          Open the form
        </ButtonLink>
      }
      onPublish={() => save.mutate({ next: { ...draft, isActive: true }, published: true })}
      publishing={save.isPending}
      canEdit
      before={
        <section className="fs">
          {draft.headline || draft.description ? (
            <div className="rb-sec">
              {draft.headline ? <h2>{draft.headline}</h2> : null}
              {draft.description ? <p>{draft.description}</p> : null}
            </div>
          ) : null}
          <div className="rb-fixed" inert>
            <div className="pl-h">Asked on every enquiry</div>
            {CONTACT.map((field) => (
              <FieldInput key={field.key} field={field} mode="preview" idPrefix="contact" />
            ))}
            {draft.services.length ? (
              <div className="qr">
                <div className="qr-l">
                  <span className="qr-q">What are you interested in?</span>
                </div>
                <div className="qr-in rb-pills">
                  {draft.services.map((service) => (
                    <span key={service.id} className="pill pill-plain">
                      {service.label || "Service"}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      }
      after={
        <div className="rb-fixed" inert>
          {draft.allowPhotos ? (
            <div className="qr">
              <div className="qr-l">
                <span className="qr-q">Photos</span>
                <span className="qr-m">Up to {draft.maxPhotos}</span>
              </div>
            </div>
          ) : null}
          <FieldInput field={MESSAGE} mode="preview" idPrefix="fixed" />
          <span className="btn" style={{ alignSelf: "flex-start" }}>
            Send
          </span>
          <div className="pl-h">After it is sent</div>
          <p className="rb-note-q">{draft.successMessage || "Thank you. We will be in touch."}</p>
        </div>
      }
      foot={
        <>
          <span>
            Each answer makes a lead in <b>Leads</b> for the next rep in turn
            {form.submissionCount ? `, ${form.submissionCount} so far` : ""}
          </span>
          <ButtonLink icon="pipeline" href="/crm/leads">
            See the pipeline
          </ButtonLink>
        </>
      }
      settings={
        <>
          <h2>The form</h2>
          <Field label="Name" htmlFor="enquiry-name">
            <Input id="enquiry-name" value={draft.name} onChange={(event) => set({ name: event.target.value })} />
          </Field>
          <Field label="Headline" htmlFor="enquiry-headline" optional help="The title the customer sees; the name is used when there is none.">
            <Input id="enquiry-headline" value={draft.headline} placeholder={draft.name} onChange={(event) => set({ headline: event.target.value })} />
          </Field>
          <Field label="Under the title" htmlFor="enquiry-description" optional>
            <TextArea id="enquiry-description" value={draft.description} placeholder="We reply within a working day" onChange={(event) => set({ description: event.target.value })} />
          </Field>
          <Field label="After sending" htmlFor="enquiry-thanks" optional>
            <TextArea id="enquiry-thanks" value={draft.successMessage} placeholder="Thank you. We will be in touch." onChange={(event) => set({ successMessage: event.target.value })} />
          </Field>
          <Setting
            htmlFor="enquiry-active"
            title="Taking enquiries"
            description={draft.isActive ? "The public link takes enquiries" : "Paused: the link says so"}
            control={<Switch id="enquiry-active" checked={draft.isActive} onCheckedChange={(isActive) => set({ isActive })} />}
          />
          <Setting
            htmlFor="enquiry-photos"
            title="Photos"
            description={draft.allowPhotos ? `Up to ${draft.maxPhotos}` : "Not asked for"}
            control={<Switch id="enquiry-photos" checked={draft.allowPhotos} onCheckedChange={(allowPhotos) => set({ allowPhotos })} />}
          />
          {draft.allowPhotos ? (
            <Field label="How many photos" htmlFor="enquiry-max">
              <Select id="enquiry-max" value={String(draft.maxPhotos)} onChange={(event) => set({ maxPhotos: Number(event.target.value) })}>
                {PHOTO_LIMITS.map((count) => (
                  <option key={count} value={count}>
                    Up to {count}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Services services={draft.services} onChange={(services) => set({ services })} />
          <Field label="Public link" htmlFor="enquiry-link">
            <Input id="enquiry-link" className="mono" readOnly value={publicPath} onFocus={(event) => event.currentTarget.select()} />
          </Field>
          <div className="rb-acts" style={{ marginTop: 0 }}>
            <Button icon="link" onClick={() => void copyLink()}>
              Copy link
            </Button>
            <ButtonLink variant="quiet" icon="eye" href={publicPath} target="_blank" rel="noreferrer">
              Open the form
            </ButtonLink>
          </div>
          <div className="pl">
            <div className="pl-h">Where answers go</div>
            <p className="rb-note">
              Each enquiry makes a lead for the next rep in turn. The name, email and phone fill the customer; every other answer is kept on the lead, under
              the name it is saved as.
            </p>
          </div>
          <div className="pl">
            <div className="pl-h">
              Recent enquiries <span className="muted">{form.submissionCount}</span>
            </div>
            {submissions.isLoading ? <div className="skeleton" style={{ height: 72 }} /> : null}
            {(submissions.data?.data ?? []).map((submission) =>
              submission.lead ? (
                <Link key={submission.id} className="prow" href={`/crm/leads/${submission.lead.id}`}>
                  <b>
                    {submission.contactName ?? "Someone"} · {shortDate(submission.createdAt)}
                  </b>
                  <span>{submission.lead.leadNo}</span>
                </Link>
              ) : (
                <div key={submission.id} className="prow">
                  <b>
                    {submission.contactName ?? "Someone"} · {shortDate(submission.createdAt)}
                  </b>
                  <span>Not converted</span>
                </div>
              ),
            )}
            {submissions.data && submissions.data.data.length === 0 ? (
              <p className="rb-note">Nothing has been sent yet. Copy the link and put it where customers will find it.</p>
            ) : null}
          </div>
        </>
      }
    />
  );
}

/**
 * The services a customer can ask about, typed as the pills they will pick.
 * An id is taken from the first words and kept, so renaming a service does not
 * strand the enquiries that already chose it.
 */
function Services({ services, onChange }: { services: Service[]; onChange: (services: Service[]) => void }) {
  const [draft, setDraft] = React.useState("");
  const idFor = (label: string) => {
    const taken = new Set(services.map((service) => service.id));
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "service";
    let next = base;
    for (let n = 2; taken.has(next); n += 1) next = `${base}-${n}`;
    return next;
  };
  const add = () => {
    if (!draft.trim()) return;
    onChange([...services, { id: idFor(draft.trim()), label: draft.trim() }]);
    setDraft("");
  };
  return (
    <div className="pl">
      <div className="pl-h">What they can ask about</div>
      {services.map((service, index) => (
        <span key={service.id} className="rb-pair rb-choice">
          <Input
            aria-label={`Service ${index + 1}`}
            value={service.label}
            onChange={(event) => onChange(services.map((existing, at) => (at === index ? { ...existing, label: event.target.value } : existing)))}
          />
          <Button variant="quiet" iconOnly icon="x" label={`Remove ${service.label || `service ${index + 1}`}`} onClick={() => onChange(services.filter((_, at) => at !== index))} />
        </span>
      ))}
      <span className="rb-pair rb-choice">
        <Input
          aria-label="Add a service"
          placeholder="Add a service"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button variant="quiet" iconOnly icon="plus" label="Add the service" onClick={add} />
      </span>
    </div>
  );
}
