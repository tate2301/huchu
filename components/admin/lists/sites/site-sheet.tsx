"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Button, Input, Select, Skeleton } from "@corelithzw/react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { AdminSheetProps } from "../admin-list";

type Rules = { retail: boolean; units: readonly string[] | null; nameMax: number; locationMax: number; codeFixed: boolean; codeHint: string };
type Values = { name: string; code: string; location: string; unit: string };
type Field = keyof Values;

const BLANK: Values = { name: "", code: "", location: "", unit: "tonnes" };

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? "That could not be loaded. Try again.");
  return body;
}

/** Sites › Add site: in the workspace the page is about. */
export function AddSiteSheet(props: AdminSheetProps) {
  const { slug } = useParams<{ slug: string }>();
  return <SiteSheet {...props} mode={{ kind: "add", slug }} />;
}

/** Sites › Edit: one site's name, code, location and unit. */
export function EditSiteSheet(props: AdminSheetProps) {
  return <SiteSheet {...props} mode={{ kind: "edit", id: props.ids[0] ?? "" }} />;
}

/**
 * Add or change a site, on its workspace's rules: a shop's short code, or
 * SITE-0001 and on elsewhere (fixed once set); a mine's measurement unit.
 * The server says what it refuses, under the field it belongs to.
 */
function SiteSheet({ close, done, mode }: AdminSheetProps & { mode: { kind: "add"; slug: string } | { kind: "edit"; id: string } }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [workspace, setWorkspace] = useState("");
  const [values, setValues] = useState<Values>(BLANK);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const adding = mode.kind === "add";
  const key = mode.kind === "add" ? mode.slug : mode.id;

  useEffect(() => {
    let live = true;
    const url = mode.kind === "add" ? `/api/platform-admin/sites?w=${encodeURIComponent(mode.slug)}` : `/api/platform-admin/sites/${encodeURIComponent(mode.id)}`;
    readJson<{ workspace: string; rules: Rules; site?: { name: string; code: string; location: string | null; unit: string } }>(url)
      .then((answer) => {
        if (!live) return;
        setRules(answer.rules);
        setWorkspace(answer.workspace);
        if (answer.site) setValues({ name: answer.site.name, code: answer.site.code, location: answer.site.location ?? "", unit: answer.site.unit });
      })
      .catch((error: unknown) => live && setLoadError(error instanceof Error ? error.message : "That could not be loaded."));
    return () => {
      live = false;
    };
    // `mode` is rebuilt every render; its address is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.name.trim()) return setErrors({ name: "Name is needed." });
    setBusy(true);
    setErrors({});
    const payload = { name: values.name, code: values.code, location: values.location, unit: rules?.units ? values.unit : null };
    const response = await fetch(adding ? "/api/platform-admin/sites" : `/api/platform-admin/sites/${encodeURIComponent(mode.kind === "edit" ? mode.id : "")}`, {
      method: adding ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adding ? { ...payload, w: mode.kind === "add" ? mode.slug : "" } : payload),
    }).catch(() => null);
    const answer = (await response?.json().catch(() => null)) as { error?: string; field?: Field; changed?: boolean } | null;
    if (!response?.ok) {
      setBusy(false);
      const message = answer?.error ?? "That did not work. Nothing was changed; try again.";
      return setErrors(answer?.field ? { [answer.field]: message } : { form: message });
    }
    const name = values.name.trim();
    done(adding ? `${name} added.` : answer?.changed === false ? "Nothing to change." : `${name} saved.`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{adding ? "Add site" : "Edit site"}</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            {workspace
              ? adding
                ? `A new open site in ${workspace}. Its tills, stock and people are set up from inside.`
                : `A site of ${workspace}. Everything else about it is changed from inside.`
              : " "}
          </DialogDescription>
        </DialogHeader>
        {loadError ? (
          <p role="alert" className="text-sm text-[var(--bad)]">
            {loadError}
          </p>
        ) : !rules ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the site">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <form id="site-sheet" className="space-y-3" onSubmit={submit} noValidate>
            <Input
              label="Name"
              value={values.name}
              maxLength={rules.nameMax}
              autoFocus
              error={errors.name}
              onChange={(event) => set("name")(event.target.value)}
            />
            <Input
              label={rules.retail ? "Short code" : "Code"}
              value={values.code}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              disabled={!adding && rules.codeFixed}
              placeholder={rules.retail ? "HRE" : "SITE-0001"}
              hint={!adding && rules.codeFixed ? "It stays as it was set: it is on the site's records." : rules.codeHint}
              error={errors.code}
              onChange={(event) => set("code")(event.target.value)}
            />
            <Input
              label={rules.retail ? "Address" : "Location"}
              value={values.location}
              maxLength={rules.locationMax}
              error={errors.location}
              onChange={(event) => set("location")(event.target.value)}
            />
            {rules.units ? (
              <Select label="Measured in" value={values.unit} error={errors.unit} onChange={(event) => set("unit")(event.target.value)}>
                {rules.units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit.charAt(0).toUpperCase() + unit.slice(1)}
                  </option>
                ))}
              </Select>
            ) : null}
            {errors.form ? (
              <p role="alert" className="text-sm text-[var(--bad)]">
                {errors.form}
              </p>
            ) : null}
          </form>
        )}
        <DialogFooter>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="site-sheet" variant="primary" loading={busy} disabled={!rules}>
            {adding ? "Add site" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
