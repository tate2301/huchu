"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import type { UserRole } from "@prisma/client";
import { useParams } from "next/navigation";
import { Button, Spinner } from "@corelithzw/react";

import {
  addMembersTo,
  memberRoles,
  memberToEdit,
  saveMember,
  signInAs,
  signInAsChoices,
  type MemberRoles,
  type MemberToEdit,
  type SignInAsChoices,
} from "@/app/portal/admin/w/[slug]/members/actions";
import { SignInAsDialog } from "@/components/admin/members/sign-in-as-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/workspace/fields/field";
import { TextArea } from "@/components/workspace/fields/text-area";
import { TextInput } from "@/components/workspace/fields/text-input";

import type { AdminSheetProps } from "../admin-list";
import { postBulk } from "../post-bulk";

/**
 * The sheets a workspace's Members list opens: sign in as, edit, change role,
 * add members. Each reads what it needs from the server for the workspace in
 * the address, and the server checks the operator again on every write.
 */

const MEMBERS: [string, string] = ["member", "members"];

function useSlug(): string {
  return useParams<{ slug: string }>().slug;
}

/** Reads once when the sheet opens; null while it loads. */
function useLoad<T>(load: () => Promise<T>, key: string): T | null {
  const [value, setValue] = useState<{ key: string; value: T } | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((answer) => live && setValue({ key, value: answer }));
    return () => {
      live = false;
    };
    // The key says when to read again; `load` is a new closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value?.key === key ? value.value : null;
}

/** The sheet's frame while it loads, or when what it was opened on cannot be had. */
function SheetFrame({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Loading({ title, close }: { title: string; close: () => void }) {
  return (
    <SheetFrame title={title} close={close}>
      <div role="status" className="flex items-center gap-2 t-body-sm text-[var(--text-muted)]">
        <Spinner label="Loading" /> Loading
      </div>
    </SheetFrame>
  );
}

function Refused({ title, error, close }: { title: string; error: string; close: () => void }) {
  return (
    <SheetFrame title={title} close={close}>
      <p role="alert" className="text-sm text-[var(--bad)]">
        {error}
      </p>
      <DialogFooter>
        <Button onClick={close}>Close</Button>
      </DialogFooter>
    </SheetFrame>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-[var(--bad)]">
      {error}
    </p>
  ) : null;
}

const CHOICE =
  "flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]";

/* ── Sign in as ─────────────────────────────────────────────────────────── */

/** Members › Sign in as…: the same reason-and-how-far dialog the context bar's picker opens. */
export function SignInAsSheet({ ids, close }: AdminSheetProps) {
  const slug = useSlug();
  const choices = useLoad<SignInAsChoices>(() => signInAsChoices(slug), slug);
  const member = choices?.ok ? choices.members.find((row) => row.id === ids[0]) : undefined;

  if (!choices) return <Loading title="Sign in as" close={close} />;
  if (!choices.ok) return <Refused title="Sign in as" error={choices.error} close={close} />;
  if (!member) {
    return (
      <Refused
        title="Sign in as"
        error={`Only a member with access to ${choices.workspaceName}, who has joined, can be signed in as.`}
        close={close}
      />
    );
  }
  return (
    <SignInAsDialog
      open
      onOpenChange={(open) => !open && close()}
      member={member}
      workspaceName={choices.workspaceName}
      ownerName={choices.ownerName}
      canChange={choices.canChange}
      start={signInAs.bind(null, slug)}
    />
  );
}

/* ── Edit ───────────────────────────────────────────────────────────────── */

/** Members › Edit…: name, email and phone, each refusal under its field. */
export function EditMemberSheet({ ids, close, done }: AdminSheetProps) {
  const slug = useSlug();
  const id = ids[0] ?? "";
  const loaded = useLoad<MemberToEdit>(() => memberToEdit(slug, id), `${slug}:${id}`);
  if (!loaded) return <Loading title="Edit member" close={close} />;
  if (!loaded.ok) return <Refused title="Edit member" error={loaded.error} close={close} />;
  return <EditMemberForm key={id} slug={slug} id={id} loaded={loaded} close={close} done={done} />;
}

function EditMemberForm({
  slug,
  id,
  loaded,
  close,
  done,
}: {
  slug: string;
  id: string;
  loaded: Extract<MemberToEdit, { ok: true }>;
  close: () => void;
  done: AdminSheetProps["done"];
}) {
  const [values, setValues] = useState(loaded.member);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailChanged = values.email.trim().toLowerCase() !== loaded.member.email.toLowerCase();

  const save = async () => {
    setBusy(true);
    setError(null);
    setFields({});
    const result = await saveMember(slug, id, values);
    if (result.ok) {
      done(result.message);
      return;
    }
    if (result.fields) setFields(result.fields);
    else setError(result.error);
    setBusy(false);
  };

  const set = (key: keyof typeof values) => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {loaded.member.name} in {loaded.workspaceName}
          </DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            Their role and access are changed from the list. The owner sees what you change in their audit log.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Name" error={fields.name}>
            {(control) => <TextInput {...control} value={values.name} onChange={set("name")} autoComplete="off" maxLength={120} />}
          </Field>
          <Field
            label="Email"
            optional={!loaded.member.email}
            error={fields.email}
            hint={emailChanged && loaded.member.email ? "They sign in with it. Saving signs them out everywhere." : undefined}
            warn={emailChanged}
          >
            {(control) => <TextInput {...control} type="email" value={values.email} onChange={set("email")} autoComplete="off" />}
          </Field>
          <Field label="Mobile number" optional={!loaded.phoneNeeded} error={fields.phone}>
            {(control) => (
              <TextInput {...control} type="tel" mono value={values.phone} onChange={set("phone")} placeholder="+263 77 123 4567" autoComplete="off" />
            )}
          </Field>
          <ErrorLine error={error} />
          <DialogFooter>
            <Button type="button" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Change role ────────────────────────────────────────────────────────── */

/** Members › Change role: one role for every ticked member, from the roles this workspace has. */
export function ChangeRoleSheet({ ids, close, done }: AdminSheetProps) {
  const slug = useSlug();
  const loaded = useLoad<MemberRoles>(() => memberRoles(slug), slug);
  const [role, setRole] = useState<UserRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = ids.length;
  const title = count === 1 ? "Change role" : `Change the role of ${count} members`;

  if (!loaded) return <Loading title={title} close={close} />;
  if (!loaded.ok) return <Refused title={title} error={loaded.error} close={close} />;
  const label = loaded.roles.find((option) => option.value === role)?.label ?? null;

  const go = async () => {
    if (!role || !label) return;
    setBusy(true);
    setError(null);
    try {
      const said = await postBulk("/api/platform-admin/members/role", { ids, role }, `changed to ${label}`, MEMBERS);
      done(said.title, said.variant);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work. Nothing was changed; try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {title} in {loaded.workspaceName}
          </DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            The new role&apos;s pages and permissions apply from their next click. Any features turned on for one of them alone go back
            to the role&apos;s. The only owner keeps their role.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="max-h-80 space-y-1 overflow-y-auto">
          <legend className="sr-only">Role</legend>
          {loaded.roles.map((option) => (
            <label key={option.value} className={CHOICE}>
              <input type="radio" name="role" value={option.value} checked={role === option.value} onChange={() => setRole(option.value)} />
              <span className="flex-1 text-sm">{option.label}</span>
            </label>
          ))}
        </fieldset>
        <ErrorLine error={error} />
        <DialogFooter>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!role} onClick={go}>
            {label ? `Make ${count === 1 ? "them" : `all ${count}`} ${label}` : "Choose a role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Add members ────────────────────────────────────────────────────────── */

/** Members › Add members: one, or many pasted, with the role they start with. */
export function AddMembersSheet({ close, done }: AdminSheetProps) {
  const slug = useSlug();
  const loaded = useLoad<MemberRoles>(() => memberRoles(slug), slug);
  if (!loaded) return <Loading title="Add members" close={close} />;
  if (!loaded.ok) return <Refused title="Add members" error={loaded.error} close={close} />;
  return <AddMembersForm slug={slug} loaded={loaded} close={close} done={done} />;
}

function AddMembersForm({
  slug,
  loaded,
  close,
  done,
}: {
  slug: string;
  loaded: Extract<MemberRoles, { ok: true }>;
  close: () => void;
  done: AdminSheetProps["done"];
}) {
  const start = loaded.roles.find((option) => option.value !== "SUPERADMIN")?.value ?? loaded.roles[0]?.value ?? null;
  const [role, setRole] = useState<UserRole | null>(start);
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const count = useMemo(() => text.split(/\r?\n/).filter((line) => line.trim()).length, [text]);

  const go = async () => {
    if (!role) return;
    setBusy(true);
    setError(null);
    setProblems([]);
    const result = await addMembersTo(slug, { text, role });
    if (result.ok) {
      done(result.message);
      return;
    }
    if (result.problems && result.problems.length > 1) setProblems(result.problems);
    setError(result.error);
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add members to {loaded.workspaceName}</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            They have no password. They sign in with their email, and a code is sent to it. Nobody is added until every line is right.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void go();
          }}
        >
          <Field
            label="Who"
            hint="One per line: name, then email. A mobile number and a role may follow. Columns pasted from a spreadsheet work too."
          >
            {(control) => (
              <TextArea
                {...control}
                rows={6}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setError(null);
                }}
                placeholder={"Rutendo Moyo, rutendo@example.co.zw\nTafadzwa Ncube, tafadzwa@example.co.zw, 077 123 4567, Manager"}
                spellCheck={false}
                className="font-mono"
              />
            )}
          </Field>
          <fieldset className="space-y-1">
            <legend className="cx-label mb-1.5">Role, where a line gives none</legend>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {loaded.roles.map((option) => (
                <label key={option.value} className={CHOICE}>
                  <input type="radio" name="role" value={option.value} checked={role === option.value} onChange={() => setRole(option.value)} />
                  <span className="flex-1 text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? (
            <div role="alert" className="space-y-1 text-sm text-[var(--bad)]">
              <p>{error}</p>
              {problems.length > 0 ? (
                <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!role || count === 0}>
              {count > 1 ? `Add ${count} members` : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
