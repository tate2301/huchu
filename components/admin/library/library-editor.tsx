"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LibraryKind, LibraryStatus } from "@prisma/client";
import { Badge, Button } from "@corelithzw/react";

import { publishOne, saveLibraryItem } from "@/app/portal/admin/(all)/library/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { useToast } from "@/components/ui/use-toast";
import { KIND_SLUG } from "@/lib/library/kinds";

import { JsonPayloadEditor, LIBRARY_EDITORS } from "./editors";
import { ReachPicker, reachOf, type ReachDraft } from "./reach-picker";

type EditorItem = {
  id: string | null;
  key: string;
  title: string;
  summary: string | null;
  payload: unknown;
  status: LibraryStatus;
  reach: ReachDraft;
};

const STATUS_WORD: Record<LibraryStatus, string> = { DRAFT: "Draft", PUBLISHED: "Published", RETIRED: "Retired" };

const field =
  "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] focus:border-[var(--action)] focus:outline-none";

/** A library item: its name and address, its kind's builder, and who it reaches. */
export function LibraryEditor({
  kind,
  item,
  label,
  foundIn,
  canManage,
}: {
  kind: LibraryKind;
  item: EditorItem;
  label: string;
  foundIn: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary ?? "");
  const [key, setKey] = useState(item.key);
  const [payload, setPayload] = useState<unknown>(item.payload);
  const [reach, setReach] = useState<ReachDraft>(item.reach);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const Builder = LIBRARY_EDITORS[kind] ?? JsonPayloadEditor;

  const save = () =>
    startSaving(async () => {
      setError(null);
      const result = await saveLibraryItem({ id: item.id ?? undefined, kind, title, summary, key: key || undefined, payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: item.id ? "Saved." : "Saved as a draft.", variant: "success" });
      if (!item.id) router.replace(`/admin/library/${KIND_SLUG[kind]}/${result.id}`);
      else router.refresh();
    });

  const publish = () =>
    startPublishing(async () => {
      if (!item.id) return;
      setError(null);
      const saved = await saveLibraryItem({ id: item.id, kind, title, summary, key: key || undefined, payload });
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      const result = await publishOne(item.id, reachOf(reach));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });

  return (
    <div className="space-y-6 pb-16">
      <AdminPageHeader
        title={item.id ? item.title : `New ${label.toLowerCase()}`}
        actions={
          <>
            <Link href="/admin/library" className="btn no-underline">
              Library
            </Link>
            {canManage ? (
              <Button variant="primary" loading={saving} onClick={save}>
                {item.id ? "Save" : "Save as a draft"}
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 t-body-sm text-[var(--text-muted)]">
        <Badge tone={item.status === "PUBLISHED" ? "success" : "neutral"}>{STATUS_WORD[item.status]}</Badge>
        <span>
          {label}, found {foundIn}.
        </span>
      </div>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-sm)] bg-[var(--bad-bg,transparent)] text-sm text-[var(--bad)]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="t-label text-[var(--ink)]">Title</span>
              <input className={field} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
            </label>
            <label className="block space-y-1.5">
              <span className="t-label text-[var(--ink)]">Address</span>
              <input
                className={`${field} font-mono`}
                value={key}
                onChange={(event) => setKey(event.target.value.toLowerCase())}
                placeholder="made from the title"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="t-label text-[var(--ink)]">In a line</span>
              <input className={field} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={300} />
            </label>
          </section>
        </div>

        <aside className="space-y-4">
          {item.id ? (
            <>
              <ReachPicker value={reach} onChange={setReach} />
              {canManage ? (
                <Button variant="primary" loading={publishing} onClick={publish} className="w-full">
                  {item.status === "PUBLISHED" ? "Save and publish again" : "Publish"}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <h2 className="t-label text-[var(--ink)]">Who gets it</h2>
              <p className="t-body-sm text-[var(--text-muted)]">Save it as a draft first; then choose who gets it.</p>
            </>
          )}
        </aside>
      </div>

      {/* Full width: the form and layout builders are three panels wide. */}
      <section aria-label={label}>
        <Builder value={payload} onChange={setPayload} title={title} />
      </section>
    </div>
  );
}
