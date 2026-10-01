"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { FieldInput } from "@/components/forms/field-input";
import { FormBuilder } from "@/components/forms/form-builder/form-builder";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fieldProblems, type FieldDefinition } from "@/lib/forms/fields";
import { Upload, X } from "@/lib/icons";

import styles from "./intake-forms.module.css";

export type ServiceDraft = { id: string; label: string };

/** What the questions section edits: the form as a client reads it. */
export type IntakeFormContent = {
  headline: string | null;
  description: string | null;
  successMessage: string | null;
  fields: FieldDefinition[];
  services: ServiceDraft[];
};

/** Asked on every intake form, before its own questions. Drawn, not described. */
const CONTACT: FieldDefinition[] = [
  { key: "contact_name", label: "Your name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: false },
  { key: "phone", label: "Phone", type: "phone", required: true },
];
const MESSAGE: FieldDefinition = { key: "message", label: "Anything else?", type: "longText", required: false };

/** How long typing has to pause before it is written. */
const AUTOSAVE_MS = 700;

function bodyOf(content: IntakeFormContent): string {
  return JSON.stringify({
    ...content,
    headline: content.headline?.trim() || null,
    description: content.description?.trim() || null,
    successMessage: content.successMessage?.trim() || null,
    // A pill still being typed is not a service yet.
    services: content.services.filter((service) => service.label.trim()),
  });
}

export type SaveState = "saved" | "saving" | "unsaved" | "blocked";

/**
 * The form, top to bottom, edited where it sits — the public form a client
 * fills in, with its own words editable in place.
 *
 * It saves itself, as every other field on the record does: a pause in typing
 * writes it, and leaving the form for another writes whatever is still
 * pending. There is no Save button to forget. Mount it keyed on the form so
 * the draft is seeded once and a refetch never lands over an edit.
 */
export function IntakeFormQuestions({
  formId,
  name,
  initial,
  allowPhotos,
  onSaveState,
  onSaved,
}: {
  formId: string;
  /** What a client sees as the title while there is no headline. */
  name: string;
  initial: IntakeFormContent;
  /** Whether the form asks for photos — set in Details, drawn here. */
  allowPhotos: boolean;
  onSaveState: (state: SaveState) => void;
  /** After any write, so what is cached about the form catches up. */
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [content, setContent] = useState<IntakeFormContent>(initial);
  const [savedBody, setSavedBody] = useState(() => bodyOf(initial));
  // The keys stored when the form was opened. A question added since keeps
  // following its label across autosaves; one that was already there keeps
  // the key its answers are filed under.
  const [lockedKeys] = useState(() => new Set(initial.fields.map((field) => field.key)));
  const set = (next: Partial<IntakeFormContent>) => setContent((current) => ({ ...current, ...next }));

  const save = useMutation({
    mutationFn: (body: string) =>
      fetchJson(`/api/v2/crm/intake-forms/${formId}`, { method: "PATCH", body }).then(() => body),
    onSuccess: (body) => {
      setSavedBody(body);
      onSaved();
    },
    onError: (error) =>
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const body = bodyOf(content);
  const problems = fieldProblems(content.fields);
  const valid = problems.length === 0;
  const state: SaveState = save.isPending
    ? "saving"
    : body === savedBody
      ? "saved"
      : valid
        ? "unsaved"
        : "blocked";

  useEffect(() => onSaveState(state), [onSaveState, state]);

  const { mutate } = save;
  useEffect(() => {
    if (body === savedBody || !valid) return;
    const timer = setTimeout(() => mutate(body), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [body, savedBody, valid, mutate]);

  // Leaving for another form inside the pause still writes what was typed.
  const pending = useRef<string | null>(null);
  const saved = useRef(onSaved);
  useEffect(() => {
    pending.current = valid && body !== savedBody ? body : null;
    saved.current = onSaved;
  });
  useEffect(
    () => () => {
      if (pending.current) {
        void fetchJson(`/api/v2/crm/intake-forms/${formId}`, {
          method: "PATCH",
          body: pending.current,
          keepalive: true,
        }).then(saved.current, () => undefined);
      }
    },
    [formId],
  );

  return (
    <div className={styles.canvas}>
      <FormBuilder
        fields={content.fields}
        onChange={(fields) => set({ fields })}
        lockedKeys={lockedKeys}
        header={
          <header className={styles.formHead}>
            <input
              className={styles.titleInput}
              value={content.headline ?? ""}
              placeholder={name}
              aria-label="Headline"
              onChange={(event) => set({ headline: event.target.value })}
            />
            <textarea
              className={styles.descriptionInput}
              value={content.description ?? ""}
              placeholder="Description"
              aria-label="Description"
              rows={Math.max(1, (content.description ?? "").split("\n").length)}
              onChange={(event) => set({ description: event.target.value })}
            />
          </header>
        }
        before={
          <div className={styles.fixed}>
            {CONTACT.map((field) => (
              <div key={field.key} className={styles.fixedBlock}>
                <FieldInput field={field} mode="preview" idPrefix="fixed" />
              </div>
            ))}
            <Services services={content.services} onChange={(services) => set({ services })} />
          </div>
        }
        after={
          <div className={styles.fixed}>
            {allowPhotos ? (
              <div className={styles.fixedBlock}>
                <p className={styles.fixedLabel}>Photos</p>
                <div className={styles.fakeDrop} aria-hidden="true">
                  <Upload />
                  <span>Add photos</span>
                </div>
              </div>
            ) : null}
            <div className={styles.fixedBlock}>
              <FieldInput field={MESSAGE} mode="preview" idPrefix="fixed" />
            </div>
            <div className={styles.fixedBlock} aria-hidden="true">
              <span className={styles.fakeSubmit}>Submit</span>
            </div>

            <section className={styles.thanks} aria-label="After it is sent">
              <h3 className={styles.thanksTitle}>After it is sent</h3>
              <textarea
                className={styles.descriptionInput}
                value={content.successMessage ?? ""}
                placeholder="Thank you."
                aria-label="What they see after sending"
                rows={Math.max(1, (content.successMessage ?? "").split("\n").length)}
                onChange={(event) => set({ successMessage: event.target.value })}
              />
            </section>
          </div>
        }
      />
    </div>
  );
}

/**
 * The services a client can ask about, typed as the pills they will pick.
 * Enter starts the next; Backspace in an empty one removes it. An id is taken
 * from the first words and kept, so renaming a service does not strand the
 * submissions that already chose it.
 */
function Services({
  services,
  onChange,
}: {
  services: ServiceDraft[];
  onChange: (services: ServiceDraft[]) => void;
}) {
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const [draft, setDraft] = useState("");
  const focus = (index: number) => requestAnimationFrame(() => inputs.current.get(index)?.focus());

  function idFor(label: string) {
    const taken = new Set(services.map((service) => service.id));
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "service";
    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
    return id;
  }

  function add(at: number, label: string) {
    onChange([...services.slice(0, at), { id: idFor(label || `service ${services.length + 1}`), label }, ...services.slice(at)]);
    focus(at);
  }

  return (
    <div className={styles.fixedBlock}>
      <p className={styles.fixedLabel}>What are you interested in?</p>
      <div className={styles.pills}>
        {services.map((service, index) => (
          <span key={service.id} className={styles.pill}>
            <input
              ref={(element) => {
                if (element) inputs.current.set(index, element);
                else inputs.current.delete(index);
              }}
              className={styles.pillInput}
              value={service.label}
              size={Math.max(4, service.label.length)}
              placeholder="Service"
              aria-label={`Service ${index + 1}`}
              onChange={(event) =>
                onChange(services.map((existing, at) => (at === index ? { ...existing, label: event.target.value } : existing)))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  add(index + 1, "");
                } else if (event.key === "Backspace" && service.label === "") {
                  event.preventDefault();
                  onChange(services.filter((_, at) => at !== index));
                  focus(Math.max(0, index - 1));
                }
              }}
            />
            <button
              type="button"
              className={styles.pillRemove}
              aria-label={`Remove ${service.label || `service ${index + 1}`}`}
              onClick={() => onChange(services.filter((_, at) => at !== index))}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          className={`${styles.pill} ${styles.pillDraft}`}
          value={draft}
          size={Math.max(12, draft.length)}
          placeholder="Add a service"
          aria-label="Add a service"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) {
              event.preventDefault();
              onChange([...services, { id: idFor(draft.trim()), label: draft.trim() }]);
              setDraft("");
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              onChange([...services, { id: idFor(draft.trim()), label: draft.trim() }]);
              setDraft("");
            }
          }}
        />
      </div>
    </div>
  );
}
