"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge, Button, Input, SegmentedControl, TextArea } from "@corelithzw/react";
import { Kit } from "@/components/core";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { useToast } from "@/components/ui/use-toast";
import { VaneText } from "@/components/vane/vane-text";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ENTRY_WORDS, type KnowledgeEntryView } from "@/lib/crm/knowledge/entries";
import { Check, ChevronDown, FileText, Lightbulb, Pencil, Question, Sparkles, Trash, Upload, X } from "@/lib/icons";

export const KNOWLEDGE_QUERY_KEY = ["crm", "knowledge"] as const;

type Kind = KnowledgeEntryView["kind"];

export const ENTRY_ICON = { FAQ: Question, FACT: FileText, TIP: Lightbulb } as const;

/**
 * FAQs, facts or tips, as people read them: a question opens to its answer,
 * a fact or tip shows its line and what follows it. What Vane found and
 * nobody has kept says so, with Keep and Not now; a kept one can be changed
 * or removed by someone who can change CRM settings.
 */
export function EntryList({
  entries,
  canEdit,
  onEdit,
  empty,
}: {
  entries: KnowledgeEntryView[];
  canEdit: boolean;
  onEdit: (entry: KnowledgeEntryView) => void;
  empty: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY });
  const decide = useMutation({
    mutationFn: (body: { ids: string[]; keep: boolean } | { remove: string }) =>
      "remove" in body
        ? fetchJson(`/api/v2/crm/knowledge/entries/${body.remove}`, { method: "DELETE" })
        : fetchJson("/api/v2/crm/knowledge/entries", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: refresh,
    onError: (error) => toast({ title: "That did not change", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  if (entries.length === 0) return <p className="py-6 text-sm text-[var(--text-muted)]">{empty}</p>;
  const waiting = entries.filter((entry) => !entry.kept);

  return (
    <div className="space-y-3">
      {canEdit && waiting.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm text-[var(--text)]">
            <Sparkles aria-hidden="true" className="size-4 text-[var(--text-subtle)]" />
            Vane found {waiting.length} in your documents. Keep the ones that are right.
          </p>
          <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ ids: waiting.map((entry) => entry.id), keep: true })}>
            Keep all {waiting.length}
          </Button>
        </div>
      ) : null}
      <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} canEdit={canEdit} busy={decide.isPending} onDecide={(body) => decide.mutate(body)} onEdit={() => onEdit(entry)} />
        ))}
      </ul>
    </div>
  );
}

function EntryRow({
  entry,
  canEdit,
  busy,
  onDecide,
  onEdit,
}: {
  entry: KnowledgeEntryView;
  canEdit: boolean;
  busy: boolean;
  onDecide: (body: { ids: string[]; keep: boolean } | { remove: string }) => void;
  onEdit: () => void;
}) {
  const Icon = ENTRY_ICON[entry.kind];
  const faq = entry.kind === "FAQ";
  const [open, setOpen] = useState(!faq || !entry.kept);
  const id = `entry-${entry.id}`;
  const showBody = entry.body.trim() && entry.body.trim() !== entry.title.trim();

  return (
    <li className="flex gap-3 py-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start gap-2">
          {faq ? (
            <button type="button" className="flex min-w-0 flex-1 items-start gap-1 text-left font-medium text-[var(--text)]" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
              <span className="min-w-0">{entry.title}</span>
              <ChevronDown aria-hidden="true" className={`mt-1 size-3.5 shrink-0 text-[var(--text-subtle)] transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          ) : (
            <span className="min-w-0 flex-1 font-medium text-[var(--text)]">{entry.title}</span>
          )}
          {!entry.kept ? (
            <Badge tone="warn" size="sm">
              Vane found it
            </Badge>
          ) : null}
        </div>
        {open && showBody ? (
          <div id={id} className="text-sm text-[var(--text-muted)]">
            <Kit>
              <VaneText text={entry.body} />
            </Kit>
          </div>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--text-subtle)]">
          {entry.doc ? (
            <Link href={`/crm/knowledge/${entry.doc.id}`} className="underline-offset-2 hover:underline">
              From {entry.doc.title}
            </Link>
          ) : null}
          {entry.by ? <span>{entry.doc ? "· " : ""}{entry.kept ? `Kept by ${entry.by}` : "Waiting for someone to keep it"}</span> : null}
        </p>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-start gap-1">
          {!entry.kept ? (
            <>
              <Button size="sm" variant="secondary" disabled={busy} startIcon={<Check aria-hidden="true" className="size-4" />} onClick={() => onDecide({ ids: [entry.id], keep: true })}>
                Keep
              </Button>
              <Button size="sm" variant="ghost" iconOnly disabled={busy} aria-label={`Not now: ${entry.title}`} onClick={() => onDecide({ ids: [entry.id], keep: false })}>
                <X aria-hidden="true" className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" iconOnly disabled={busy} aria-label={`Change ${entry.title}`} onClick={onEdit}>
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" iconOnly disabled={busy} aria-label={`Remove ${entry.title}`} onClick={() => onDecide({ remove: entry.id })}>
                <Trash aria-hidden="true" className="size-4" />
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

export type EntryDraft = { id?: string; kind: Kind; title: string; body: string };

/** Writes or changes an FAQ, a fact or a tip. */
export function EntryDialog({ draft, onClose }: { draft: EntryDraft | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [value, setValue] = useState<EntryDraft | null>(draft);
  const [errors, setErrors] = useState<string[]>([]);
  const [seen, setSeen] = useState(draft);
  if (draft !== seen) {
    setSeen(draft);
    setValue(draft);
    setErrors([]);
  }

  const save = useMutation({
    mutationFn: (entry: EntryDraft) =>
      entry.id
        ? fetchJson(`/api/v2/crm/knowledge/entries/${entry.id}`, { method: "PATCH", body: JSON.stringify({ kind: entry.kind, title: entry.title, body: entry.body }) })
        : fetchJson("/api/v2/crm/knowledge/entries", { method: "POST", body: JSON.stringify({ kind: entry.kind, title: entry.title, body: entry.body }) }),
    onSuccess: async (_, entry) => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY });
      toast({ title: entry.id ? "Changed" : `The ${ENTRY_WORDS[entry.kind].one} is in the knowledge base`, description: entry.id ? undefined : "Vane answers from it from now on.", variant: "success" });
      onClose();
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const words = value ? ENTRY_WORDS[value.kind] : ENTRY_WORDS.FAQ;
  return (
    <RecordDialog
      open={Boolean(draft)}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={value?.id ? "Change it" : "Add to the knowledge base"}
      description="Something your team or your clients should know. Vane answers from it."
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        if (value) save.mutate(value);
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {value?.id ? "Save" : "Add it"}
          </Button>
        </>
      }
    >
      {value ? (
        <div className="space-y-3">
          <SegmentedControl
            aria-label="What it is"
            options={[
              { value: "FAQ", label: "FAQ", icon: <Question aria-hidden="true" className="size-4" /> },
              { value: "FACT", label: "Fact", icon: <FileText aria-hidden="true" className="size-4" /> },
              { value: "TIP", label: "Tip", icon: <Lightbulb aria-hidden="true" className="size-4" /> },
            ]}
            value={value.kind}
            onValueChange={(kind) => setValue({ ...value, kind: kind as Kind })}
          />
          <Input
            label={words.title}
            value={value.title}
            onChange={(event) => setValue({ ...value, title: event.target.value })}
            placeholder={value.kind === "FAQ" ? "Do you need a deposit?" : value.kind === "FACT" ? "We fit floors in Harare and Bulawayo" : "Take a moisture reading before quoting vinyl"}
            maxLength={300}
            autoFocus
          />
          <TextArea
            label={words.body}
            value={value.body}
            onChange={(event) => setValue({ ...value, body: event.target.value })}
            rows={5}
            maxLength={5000}
            placeholder={value.kind === "FAQ" ? "Yes: half, before work starts. The rest on handover." : ""}
          />
        </div>
      ) : null}
    </RecordDialog>
  );
}

const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md";

/** Uploads a document to the knowledge base, then opens it. */
export function UploadDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const close = () => {
    setFile(null);
    setTitle("");
    setErrors([]);
    onClose();
  };
  const upload = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append("file", file!);
      body.append("title", title.trim());
      return fetchJson<{ id: string }>("/api/v2/crm/knowledge", { method: "POST", body });
    },
    onSuccess: async (doc) => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY });
      close();
      onDone(doc.id);
    },
    onError: (error) => setErrors([getApiErrorMessage(error, "It did not upload. Try again.")]),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title="Upload a document"
      description="A price list, rate card, handbook, product sheet or terms. It stays inside the business: Vane reads it, clients never see it."
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        if (!file) return setErrors(["Choose a file to upload."]);
        setErrors([]);
        upload.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={upload.isPending}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="The file"
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen);
              if (chosen && !title) setTitle(chosen.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
            }}
          />
          <Button type="button" variant="secondary" startIcon={<Upload aria-hidden="true" className="size-4" />} onClick={() => input.current?.click()}>
            {file ? "Choose a different file" : "Choose a file"}
          </Button>
          <p className="text-sm text-[var(--text-muted)]">
            {file ? file.name : "A spreadsheet is read row by row for its prices. A PDF, Word document or text file is read for its words; Vane then finds its FAQs, facts, tips and prices for you to keep. Up to 20MB."}
          </p>
        </div>
        <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Rate card 2026" maxLength={200} />
      </div>
    </RecordDialog>
  );
}
