"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Spinner } from "@corelithzw/react";

import { VerticalDialog } from "@/components/admin/features/vertical-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/workspace/fields/field";
import { TextArea } from "@/components/workspace/fields/text-area";
import { TextInput } from "@/components/workspace/fields/text-input";
import type { CatalogueBundle, CatalogueFeature } from "@/lib/admin/features";

import type { AdminSheetProps } from "../admin-list";

/**
 * The sheets the Workspaces list and the Catalogue open: add or remove a
 * vertical across ticked workspaces, a bundle's features, a feature's words.
 */

/* ── Verticals, from the Workspaces list ─────────────────────────────────── */

export function AddVerticalSheet({ ids, close, done }: AdminSheetProps) {
  return <VerticalDialog mode="add" ids={ids} close={close} done={done} />;
}

export function RemoveVerticalSheet({ ids, close, done }: AdminSheetProps) {
  return <VerticalDialog mode="remove" ids={ids} close={close} done={done} />;
}

/* ── Shared ─────────────────────────────────────────────────────────────── */

type Loaded<T> = { ok: true; value: T } | { ok: false; error: string } | null;

/** Reads once when the sheet opens; null while it loads. */
function useJson<T>(url: string): Loaded<T> {
  const [state, setState] = useState<{ url: string; value: Loaded<T> } | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
        if (!live) return;
        setState({ url, value: response.ok && body ? { ok: true, value: body } : { ok: false, error: body?.error ?? "That could not be read. Try again." } });
      })
      .catch(() => live && setState({ url, value: { ok: false, error: "That could not be read. Check the connection and try again." } }));
    return () => {
      live = false;
    };
  }, [url]);
  return state?.url === url ? state.value : null;
}

async function save(url: string, body: unknown): Promise<string> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const answer = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  if (!response.ok) throw new Error(answer?.error ?? "That did not save. Nothing was changed; try again.");
  return answer?.message ?? "Saved.";
}

function Frame({ title, line, close, busy, children, wide }: { title: string; line?: string; close: () => void; busy?: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className={wide ? "sm:max-w-lg" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={line ? "not-sr-only t-body-sm text-[var(--text-muted)]" : "sr-only"}>{line ?? title}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Loading({ title, close }: { title: string; close: () => void }) {
  return (
    <Frame title={title} close={close}>
      <div role="status" className="flex items-center gap-2 t-body-sm text-[var(--text-muted)]">
        <Spinner label="Loading" /> Loading
      </div>
    </Frame>
  );
}

function Refused({ title, error, close }: { title: string; error: string; close: () => void }) {
  return (
    <Frame title={title} close={close}>
      <p role="alert" className="text-sm text-[var(--bad)]">
        {error}
      </p>
      <DialogFooter>
        <Button onClick={close}>Close</Button>
      </DialogFooter>
    </Frame>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-[var(--bad)]">
      {error}
    </p>
  ) : null;
}

/* ── A bundle ───────────────────────────────────────────────────────────── */

type BundleAnswer = { bundle: CatalogueBundle | null; features: CatalogueFeature[]; canEdit: boolean };

/** Catalogue › Bundles: a new bundle (no id), or one bundle's features — editable when it was made here. */
export function CatalogueBundleSheet({ ids, close, done }: AdminSheetProps) {
  const code = ids[0] ?? null;
  const loaded = useJson<BundleAnswer>(`/api/platform-admin/catalogue/bundles${code ? `?code=${encodeURIComponent(code)}` : ""}`);
  const title = code ? "Bundle" : "New bundle";
  if (!loaded) return <Loading title={title} close={close} />;
  if (!loaded.ok) return <Refused title={title} error={loaded.error} close={close} />;
  return <BundleForm answer={loaded.value} close={close} done={done} />;
}

function BundleForm({ answer, close, done }: { answer: BundleAnswer; close: () => void; done: AdminSheetProps["done"] }) {
  const { bundle, features, canEdit } = answer;
  const [name, setName] = useState(bundle?.name ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(bundle?.features ?? []));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const pool = canEdit ? features : features.filter((feature) => ticked.has(feature.key));
    return term ? pool.filter((feature) => feature.name.toLowerCase().includes(term) || feature.key.includes(term)) : pool;
  }, [canEdit, features, search, ticked]);

  const toggle = (key: string) =>
    setTicked((before) => {
      const next = new Set(before);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const message = await save("/api/platform-admin/catalogue/bundles", {
        ...(bundle ? { code: bundle.code } : {}),
        name,
        description,
        featureKeys: [...ticked],
      });
      done(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not save. Try again.");
      setBusy(false);
    }
  };

  const title = bundle ? bundle.name : "New bundle";
  const line = !bundle
    ? "A bundle switches its features on together in a workspace. It carries no charge of its own."
    : bundle.inCode
      ? "Defined in code. Its features change in feature-catalog.ts."
      : canEdit
        ? "Workspaces that have it on get any feature you add. One you take out stays as it is in each workspace until switched off there."
        : undefined;

  return (
    <Frame title={title} line={line} close={close} busy={busy} wide>
      {canEdit ? (
        <div className="grid gap-3">
          <Field label="Name">
            {(control) => <TextInput {...control} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />}
          </Field>
          <Field label="What it is for" optional>
            {(control) => <TextArea {...control} rows={2} maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} />}
          </Field>
        </div>
      ) : null}
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="t-label text-[var(--ink)]">Features</h3>
          <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">{ticked.size} ticked</span>
        </div>
        <Field label="Find a feature" nolabel>
          {(control) => (
            <TextInput {...control} type="search" aria-label="Find a feature" placeholder="Feature or key" value={search} onChange={(event) => setSearch(event.target.value)} />
          )}
        </Field>
        <ul className="max-h-72 overflow-y-auto rounded-[var(--radius-sm)] shadow-[inset_0_0_0_1px_var(--line)]" aria-label="Features">
          {shown.length === 0 ? (
            <li className="px-3 py-3 t-body-sm text-[var(--ink-3)]">{search ? "No feature matches." : "No features."}</li>
          ) : (
            shown.map((feature) => (
              <li key={feature.key} className="border-b border-[var(--line)] last:border-b-0">
                {canEdit ? (
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                    <input type="checkbox" checked={ticked.has(feature.key)} onChange={() => toggle(feature.key)} />
                    <FeatureWords feature={feature} />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2">
                    <FeatureWords feature={feature} />
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
      <ErrorLine error={error} />
      <DialogFooter>
        {canEdit ? (
          <>
            <Button disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={go}>
              {bundle ? "Save bundle" : "Make bundle"}
            </Button>
          </>
        ) : (
          <Button onClick={close}>Close</Button>
        )}
      </DialogFooter>
    </Frame>
  );
}

function FeatureWords({ feature }: { feature: CatalogueFeature }) {
  return (
    <span className="grid min-w-0">
      <span className="truncate text-sm text-[var(--ink)]">{feature.name}</span>
      <span className="truncate font-mono text-xs text-[var(--ink-3)]">{feature.key}</span>
    </span>
  );
}

/* ── A feature ──────────────────────────────────────────────────────────── */

type FeatureAnswer = { feature: { key: string; name: string; domain: string | null; defaultEnabled: boolean } };

/** Catalogue › Features › Edit…: the words and default of a feature made outside the code. */
export function CatalogueFeatureSheet({ ids, close, done }: AdminSheetProps) {
  const key = ids[0] ?? "";
  const loaded = useJson<FeatureAnswer>(`/api/platform-admin/catalogue/features?key=${encodeURIComponent(key)}`);
  if (!loaded) return <Loading title="Edit feature" close={close} />;
  if (!loaded.ok) return <Refused title="Edit feature" error={loaded.error} close={close} />;
  return <FeatureForm feature={loaded.value.feature} close={close} done={done} />;
}

function FeatureForm({ feature, close, done }: { feature: FeatureAnswer["feature"]; close: () => void; done: AdminSheetProps["done"] }) {
  const [name, setName] = useState(feature.name);
  const [domain, setDomain] = useState(feature.domain ?? "");
  const [defaultEnabled, setDefaultEnabled] = useState(feature.defaultEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      done(await save("/api/platform-admin/catalogue/features", { key: feature.key, name, domain, defaultEnabled }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not save. Try again.");
      setBusy(false);
    }
  };

  return (
    <Frame title="Edit feature" line={feature.key} close={close} busy={busy}>
      <div className="grid gap-3">
        <Field label="Name">{(control) => <TextInput {...control} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />}</Field>
        <Field label="Area" hint="One lower-case word, like retail or hr.">
          {(control) => <TextInput {...control} mono value={domain} maxLength={30} onChange={(event) => setDomain(event.target.value)} />}
        </Field>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--ink)]">
          <input type="checkbox" checked={defaultEnabled} onChange={(event) => setDefaultEnabled(event.target.checked)} />
          On in every workspace unless switched off
        </label>
      </div>
      <ErrorLine error={error} />
      <DialogFooter>
        <Button disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={go}>
          Save feature
        </Button>
      </DialogFooter>
    </Frame>
  );
}
