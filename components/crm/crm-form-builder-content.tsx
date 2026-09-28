"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@corelithzw/react";

import { FieldInput } from "@/components/forms/field-input";
import { FormBuilder } from "@/components/forms/form-builder/form-builder";
import { PageChrome } from "@/components/layout/page-chrome";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fieldProblems, type FieldDefinition } from "@/lib/forms/fields";
import { DotsThree, Upload, X } from "@/lib/icons";

import styles from "./crm-form-builder.module.css";

type ServiceDraft = { id: string; label: string };

type FormRecord = {
  id: string;
  name: string;
  headline: string | null;
  description: string | null;
  successMessage: string | null;
  allowPhotos: boolean;
  maxPhotos: number;
  publicToken: string;
  fields: FieldDefinition[];
  services: ServiceDraft[];
};

type Draft = Omit<FormRecord, "id" | "publicToken">;

/** Asked on every intake form, before its own questions. Drawn, not described. */
const CONTACT: FieldDefinition[] = [
  { key: "contact_name", label: "Your name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: false },
  { key: "phone", label: "Phone", type: "phone", required: true },
];
const MESSAGE: FieldDefinition = { key: "message", label: "Anything else?", type: "longText", required: false };

export function CrmFormBuilderContent({ formId }: { formId: string }) {
  const form = useQuery({
    queryKey: ["crm-form", formId],
    queryFn: () => fetchJson<FormRecord>(`/api/v2/crm/intake-forms/${formId}`),
  });

  if (form.isError) {
    return <p className={styles.state}>{getApiErrorMessage(form.error)}</p>;
  }
  if (!form.data) {
    return <p className={styles.state}>Loading…</p>;
  }

  // Keyed on the form: the draft is seeded from the record once, so a refetch
  // of the same form never clobbers an edit in progress.
  return <FormEditor key={form.data.id} formId={formId} initial={form.data} />;
}

function draftOf(record: FormRecord): Draft {
  return {
    name: record.name,
    headline: record.headline,
    description: record.description,
    successMessage: record.successMessage,
    allowPhotos: record.allowPhotos,
    maxPhotos: record.maxPhotos,
    fields: record.fields ?? [],
    services: record.services ?? [],
  };
}

function FormEditor({ formId, initial }: { formId: string; initial: FormRecord }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [saved, setSaved] = useState<Draft>(() => draftOf(initial));
  const [renaming, setRenaming] = useState(false);
  const set = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/intake-forms/${formId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...draft,
          headline: draft.headline?.trim() || null,
          description: draft.description?.trim() || null,
          successMessage: draft.successMessage?.trim() || null,
        }),
      }),
    onSuccess: () => {
      setSaved(draft);
      queryClient.invalidateQueries({ queryKey: ["crm-form", formId] });
      toast({ title: "Saved" });
    },
    onError: (error) =>
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const valid = draft.name.trim().length > 0 && fieldProblems(draft.fields).length === 0;
  const savedKeys = new Set(saved.fields.map((field) => field.key));
  const publicUrl = () => `${window.location.origin}/f/${initial.publicToken}`;

  return (
    <>
      <PageChrome title={draft.name.trim() || "Intake form"} backHref="/crm/forms" backLabel="Intake forms">
        <div className={styles.actions}>
          {/* Shown once there is something to save, and hidden rather than
              disabled while something is wrong — the form says what, in
              amber, under the last question. */}
          {dirty && valid ? (
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={styles.iconButton} aria-label="More actions">
                <DotsThree aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard?.writeText(publicUrl());
                  toast({ title: "Link copied" });
                }}
              >
                Copy the public link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.open(publicUrl(), "_blank", "noopener")}>
                Open the public form
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageChrome>

      <div className={styles.frame}>
        <FormBuilder
          fields={draft.fields}
          onChange={(fields) => set({ fields })}
          lockedKeys={savedKeys}
          header={
            <header className={styles.formHead}>
              <input
                className={styles.titleInput}
                value={draft.headline ?? ""}
                placeholder={draft.name}
                aria-label="Headline"
                onChange={(event) => set({ headline: event.target.value })}
              />
              <textarea
                className={styles.descriptionInput}
                value={draft.description ?? ""}
                placeholder="Description"
                aria-label="Description"
                rows={Math.max(1, (draft.description ?? "").split("\n").length)}
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
              <Services services={draft.services} onChange={(services) => set({ services })} />
            </div>
          }
          after={
            <div className={styles.fixed}>
              <Photos
                on={draft.allowPhotos}
                max={draft.maxPhotos}
                onChange={(next) => set(next)}
              />
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
                  value={draft.successMessage ?? ""}
                  placeholder="Thank you."
                  aria-label="What they see after sending"
                  rows={Math.max(1, (draft.successMessage ?? "").split("\n").length)}
                  onChange={(event) => set({ successMessage: event.target.value })}
                />
              </section>
            </div>
          }
        />
      </div>

      {/* Mounted only while open, so it always starts from the current name. */}
      {renaming ? (
        <RenameDialog name={draft.name} onClose={() => setRenaming(false)} onRename={(name) => set({ name })} />
      ) : null}
    </>
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

function Photos({
  on,
  max,
  onChange,
}: {
  on: boolean;
  max: number;
  onChange: (next: { allowPhotos?: boolean; maxPhotos?: number }) => void;
}) {
  return (
    <div className={styles.fixedBlock}>
      <div className={styles.photosHead}>
        <label className={styles.photosToggle} htmlFor="intake-photos">
          <span className={styles.fixedLabel}>Photos</span>
          <Switch
            id="intake-photos"
            checked={on}
            onChange={(event) => onChange({ allowPhotos: event.target.checked })}
          />
        </label>
        {on ? (
          <Select value={String(max || 5)} onValueChange={(value) => onChange({ maxPhotos: Number(value) })}>
            <SelectTrigger className={`${styles.photosLimit} w-auto`} aria-label="Photos allowed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 3, 5, 10, 20].map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {`Up to ${count}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {on ? (
        <div className={styles.fakeDrop} aria-hidden="true">
          <Upload />
          <span>Add photos</span>
        </div>
      ) : null}
    </div>
  );
}

function RenameDialog({
  name,
  onClose,
  onRename,
}: {
  name: string;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(name);

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent size="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!value.trim()) return;
            onRename(value.trim());
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <div className={styles.dialogBody}>
            <label htmlFor="intake-name" className="sr-only">
              Name
            </label>
            <Input id="intake-name" value={value} onChange={(event) => setValue(event.target.value)} />
          </div>
          <DialogFooter>
            {value.trim() ? (
              <button type="submit" className={`${styles.button} ${styles.primary}`}>
                Rename
              </button>
            ) : null}
            <button type="button" className={styles.button} onClick={onClose}>
              Cancel
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
