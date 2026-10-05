"use client";

import "@/components/sheet-form/sheet-form.css";
import "./settings-frame.css";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { SheetField } from "@/components/sheet-form/sheet-field";
import { Button } from "@/components/workspace/button";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { Field } from "@/components/workspace/fields/field";
import { ReadValue } from "@/components/workspace/fields/read-value";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import {
  isSettingsFieldEditable,
  settingsPage,
  type SettingsPage,
  type SettingsResponse,
  type SettingsSaved,
} from "@/lib/retail/settings-pages";
import { cn } from "@/lib/utils";
import type { Ask } from "@/lib/workspace/ask";
import type { FieldSpec, SheetCtx } from "@/lib/workspace/sheet-kind";

import { SettingsActivity } from "./settings-activity";
import { SettingsAside } from "./settings-aside";
import {
  canChangeField,
  changedValues,
  checkBeforeSave,
  cleanLine,
  JUST_SAVED_MS,
  settingsQueryKey,
  shownSettingsSections,
} from "./model";
import { SaveBar } from "./save-bar";

/**
 * SettingsFrame — every settings page (00-foundations 5.10).
 *
 *   <SettingsFrame page="company" />
 *
 * Reads `GET /api/v2/retail/settings/<page>`, draws the page's sections with
 * the sheet's fields (5.7.4), and saves the changed fields with one `PATCH`
 * from the save bar at the foot of the form. The header carries the title
 * and "Activity"; the aside says what the page changes and who may. A role
 * that cannot change the page reads every field as `read`.
 */

const controlId = (fieldId: string) => `cx-set-${fieldId}`;

const noSubscription = () => () => {};

function focusField(fieldId: string) {
  const node = document.getElementById(controlId(fieldId));
  const target = node?.matches("input, textarea, button")
    ? node
    : node?.querySelector<HTMLElement>("input, textarea, button:not([disabled])");
  target?.focus();
}

/** "On", "Liquor store", "—": a value drawn as `read`. */
function ReadField({ field, value, values }: { field: FieldSpec; value: unknown; values: Record<string, unknown> }) {
  const hint = typeof field.h === "function" ? field.h(values) : field.h;
  const empty = value === null || value === undefined || value === "";
  return (
    <Field
      id={controlId(field.id)}
      label={field.l}
      hint={field.t === "toggle" || field.t === "seg" ? hint : undefined}
      nolabel={field.t === "cards"}
    >
      {(control) => {
        if (field.t === "photo") {
          return (
            <ReadValue id={control.id}>
              {typeof value === "string" && value ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the tenant's uploaded logo, any origin, 28px */}
                  <img className="cx-sf-logo" src={value} alt="" />
                  Logo added
                </>
              ) : (
                <span className="cx-sf-empty">No logo yet</span>
              )}
            </ReadValue>
          );
        }
        const shown =
          field.t === "toggle"
            ? value === true
              ? "On"
              : "Off"
            : empty
              ? null
              : field.t === "money" && field.cur
                ? `${field.cur} ${String(value)}`
                : String(value);
        return (
          <ReadValue
            id={control.id}
            mono={field.mono || field.t === "money"}
            right={field.t === "money"}
            className={cn(field.t === "area" && "cx-read--area")}
          >
            {shown ?? <span className="cx-sf-empty">—</span>}
          </ReadValue>
        );
      }}
    </Field>
  );
}

function leaveAsk(count: number, title: string): Ask {
  return {
    title: "Leave without saving?",
    body: `${count} ${count === 1 ? "change" : "changes"} on ${title} ${count === 1 ? "is" : "are"} not saved.`,
    keep: "Keep editing",
    go: "Discard changes",
    fill: "bad",
  };
}

export function SettingsFrame({ page: key }: { page: string }) {
  const page = settingsPage(key);
  if (!page) throw new Error(`No settings page "${key}"`);
  return <Frame pageKey={key} page={page} />;
}

function Frame({ pageKey, page }: { pageKey: string; page: SettingsPage }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";

  // The server renders the loading state; so does the client's first render,
  // even when the page's values are already in the query cache.
  const hydrated = React.useSyncExternalStore(noSubscription, () => true, () => false);
  const query = useQuery({
    queryKey: settingsQueryKey(pageKey),
    queryFn: () => fetchJson<SettingsResponse>(`/api/v2/retail/settings/${encodeURIComponent(pageKey)}`),
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });

  // What the person has typed over what is saved; cleared by a save or Discard.
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [barError, setBarError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => new Date());
  const [leaving, setLeaving] = React.useState<string | null>(null);
  const [activityOpen, setActivityOpen] = React.useState(false);

  const saved = React.useMemo(() => query.data?.values ?? {}, [query.data]);
  const values = React.useMemo(() => ({ ...saved, ...draft }), [saved, draft]);
  const canEdit = query.data?.canEdit ?? false;
  const changes = React.useMemo(() => changedValues(page, saved, values), [page, saved, values]);
  const count = Object.keys(changes).length;

  // "Saved just now." gives way to who changed it after a minute.
  React.useEffect(() => {
    if (savedAt === null) return;
    const timer = window.setTimeout(() => setNow(new Date()), JUST_SAVED_MS + 50);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  // Leaving with changes asks first: a link in the app, or the tab itself.
  React.useEffect(() => {
    if (count === 0) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaving(`${url.pathname}${url.search}${url.hash}`);
    };
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [count]);

  const ctx = React.useMemo<SheetCtx>(
    () => ({
      params: new URLSearchParams(),
      id: null,
      user: { id: session?.user?.id ?? "", name: session?.user?.name ?? "", role },
      can: (resource, action) => canRetailRoleDo(role, resource, action),
    }),
    [session?.user?.id, session?.user?.name, role],
  );

  const setValue = (fieldId: string, value: unknown) => {
    setDraft((current) => ({ ...current, [fieldId]: value }));
    setBarError(null);
    setErrors((current) => {
      if (!(fieldId in current)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  };

  const discard = () => {
    setDraft({});
    setErrors({});
    setBarError(null);
  };

  const save = async () => {
    if (saving || count === 0) return;
    const problems = checkBeforeSave(page, changes);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      requestAnimationFrame(() => focusField(Object.keys(problems)[0]!));
      return;
    }
    setSaving(true);
    setBarError(null);
    try {
      const response = await fetch(`/api/v2/retail/settings/${encodeURIComponent(pageKey)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (SettingsSaved & { error?: string; fieldErrors?: Record<string, string> })
        | null;
      if (!response.ok) {
        const fieldErrors = payload?.fieldErrors ?? {};
        if (response.status === 400 && Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          requestAnimationFrame(() => focusField(Object.keys(fieldErrors)[0]!));
        } else {
          setBarError(payload?.error ?? "Nothing was saved. Try again.");
        }
        return;
      }
      queryClient.setQueryData<SettingsResponse>(settingsQueryKey(pageKey), (current) => ({
        canEdit: current?.canEdit ?? true,
        editable: current?.editable,
        values: payload!.values,
        lastChanged: payload!.lastChanged,
      }));
      setDraft({});
      setErrors({});
      setSavedAt(Date.now());
      setNow(new Date());
    } catch {
      setBarError("That did not reach the server. Nothing was saved; try again.");
    } finally {
      setSaving(false);
    }
  };

  const canReadActivity = canRetailRoleDo(role, "retail.activity", "view");
  const chrome = (
    <PageChrome title={page.title}>
      {canReadActivity ? <Button onClick={() => setActivityOpen(true)}>Activity</Button> : null}
    </PageChrome>
  );

  let body: React.ReactNode;
  if (!hydrated || query.isPending) {
    body = (
      <div aria-busy="true" aria-label="Loading">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="cx-sheet__section">
            <div className="cx-sf-skel" style={{ width: 160 }} />
            <div className="cx-sf-skel" />
          </div>
        ))}
      </div>
    );
  } else if (query.isError || !query.data) {
    body = (
      <p role="alert" className="cx-sf-state cx-sf-state--bad">
        {getApiErrorMessage(query.error, "These settings did not load.")}
        {!(query.error instanceof ApiError && query.error.status === 403) ? (
          <Button onClick={() => void query.refetch()}>Try again</Button>
        ) : null}
      </p>
    );
  } else {
    body = shownSettingsSections(page, values).map((section) => (
      <section key={section.title ?? section.fields[0]!.id} className="cx-sheet__section">
        {section.title ? <h3 className="cx-sheet__section-title">{section.title}</h3> : null}
        {section.note ? (
          <p className="cx-sf-note">
            {section.note.text}
            {section.note.link ? (
              <>
                {" "}
                <Link href={section.note.link.href}>{section.note.link.label}</Link>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="sf-grid">
          {section.fields.map((field) => (
            <div key={field.id} className={field.half ? "sf-cell sf-cell--half" : "sf-cell"}>
              {canChangeField(page, query.data, field.id) ? (
                <SheetField
                  field={field}
                  controlId={controlId(field.id)}
                  ctx={ctx}
                  values={values}
                  currency="US$"
                  error={errors[field.id]}
                  onChange={(value) => setValue(field.id, value)}
                />
              ) : canEdit && isSettingsFieldEditable(page, field.id) ? (
                // Changed here, but not by this role (the manager on Payments): the control, held.
                <SheetField
                  field={{ ...field, disabled: () => true }}
                  controlId={controlId(field.id)}
                  ctx={ctx}
                  values={values}
                  currency="US$"
                  onChange={() => {}}
                />
              ) : (
                <ReadField field={field} value={values[field.id]} values={values} />
              )}
            </div>
          ))}
        </div>
      </section>
    ));
  }

  const line = query.data
    ? cleanLine({ page, canEdit, lastChanged: query.data.lastChanged, savedAt, now })
    : null;

  return (
    <>
      {chrome}
      <div className="cx-sf">
        <div className="cx-sf-body">
          <div className="cx-sf-main">
            <div className="cx-sf-scroll">
              <form
                className="cx-sf-form"
                aria-label={page.title}
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                {body}
              </form>
              <SettingsAside sections={page.aside} under />
            </div>
            {hydrated && query.data ? (
              <SaveBar
                count={canEdit ? count : 0}
                line={line}
                error={barError}
                saving={saving}
                onDiscard={discard}
                onSave={() => void save()}
              />
            ) : null}
          </div>
          <SettingsAside sections={page.aside} />
        </div>
      </div>
      {leaving !== null ? (
        <ConfirmDialog
          ask={leaveAsk(count, page.title)}
          open
          onOpenChange={(open) => {
            if (!open) setLeaving(null);
          }}
          onConfirm={() => {
            const href = leaving;
            discard();
            setLeaving(null);
            router.push(href);
          }}
        />
      ) : null}
      <SettingsActivity page={pageKey} title={page.title} open={activityOpen} onOpenChange={setActivityOpen} />
    </>
  );
}
