"use client";

import { useState, type FormEvent } from "react";
import type { OperatorRole } from "@prisma/client";
import { Button, Input } from "@corelithzw/react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { CopyLink } from "@/lib/icons";

import type { AdminSheetProps } from "../admin-list";
import { postBulk } from "../post-bulk";

const ROLES: Array<{ value: OperatorRole; label: string; help: string }> = [
  { value: "SUPPORT", label: "Support", help: "Members, sign in as, and a workspace's settings short of closing it." },
  { value: "BILLING", label: "Billing", help: "Plans, trials and payments. Signs in as a member to look only." },
  { value: "OWNER", label: "Owner", help: "Everything, including operators and closing a workspace." },
];

function RolePicker({ name, value, onChange }: { name: string; value: OperatorRole | null; onChange: (role: OperatorRole) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="t-label mb-1.5 text-[var(--ink)]">Role</legend>
      {ROLES.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]"
        >
          <input type="radio" name={name} className="mt-1" checked={value === option.value} onChange={() => onChange(option.value)} />
          <span>
            <span className="block text-sm font-medium">{option.label}</span>
            <span className="block text-[13px] text-[var(--text-muted)]">{option.help}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const answer = (await response?.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response?.ok || !answer) throw new Error(answer?.error ?? "That did not work. Nothing was changed; try again.");
  return answer;
}

type Invited = { message: string; name: string; link: string };

/** The link, once: for when the email does not reach them. */
function InviteLink({ invited, onDone }: { invited: Invited; onDone: () => void }) {
  const { toast } = useToast();
  return (
    <>
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-body)]">
          {invited.name}&apos;s invite is emailed. If it does not reach them, send this link another way. It works once, for three days, and is
          not shown again.
        </p>
        <Input label="Invite link" value={invited.link} readOnly className="font-mono" onFocus={(event) => event.currentTarget.select()} />
      </div>
      <DialogFooter>
        <Button
          startIcon={<CopyLink />}
          onClick={() => {
            void navigator.clipboard.writeText(invited.link).then(
              () => toast({ title: "Link copied." }),
              () => toast({ title: "The link could not be copied. Select it and copy it instead.", variant: "destructive" }),
            );
          }}
        >
          Copy link
        </Button>
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

/** Operators › Invite an operator: emailed a link to choose a password, then an authenticator at their first sign-in. */
export function InviteOperatorSheet({ close, done }: AdminSheetProps) {
  const [form, setForm] = useState<{ name: string; email: string; role: OperatorRole }>({ name: "", email: "", role: "SUPPORT" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<Invited | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setInvited(await post<Invited>("/api/platform-admin/operators/invite", form));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && (invited ? done(invited.message) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{invited ? `${invited.name} is invited` : "Invite an operator"}</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            They are emailed a link to choose a password, then set up an authenticator at their first sign-in.
          </DialogDescription>
        </DialogHeader>
        {invited ? (
          <InviteLink invited={invited} onDone={() => done(invited.message)} />
        ) : (
          <>
            <form id="operator-invite" className="space-y-3" onSubmit={submit}>
              <Input label="Name" value={form.name} autoFocus onChange={(event) => setForm({ ...form, name: event.target.value })} />
              <Input label="Work email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <RolePicker name="invite-role" value={form.role} onChange={(role) => setForm({ ...form, role })} />
              {error ? (
                <p role="alert" className="text-sm text-[var(--bad)]">
                  {error}
                </p>
              ) : null}
            </form>
            <DialogFooter>
              <Button disabled={busy} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" form="operator-invite" variant="primary" loading={busy}>
                Send the invite
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Operators › Send a new invite: for a forgotten password. Their old one stops working and they are signed out. */
export function NewInviteSheet({ ids, close, done }: AdminSheetProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<Invited | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      setInvited(await post<Invited>("/api/platform-admin/operators/new-invite", { id: ids[0] }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && (invited ? done(invited.message) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{invited ? `${invited.name} is sent a new invite` : "Send a new invite?"}</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            For a forgotten password. Their password stops working now and they are signed out everywhere; the new link lets them choose
            another.
          </DialogDescription>
        </DialogHeader>
        {invited ? (
          <InviteLink invited={invited} onDone={() => done(invited.message)} />
        ) : (
          <>
            {error ? (
              <p role="alert" className="text-sm text-[var(--bad)]">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button disabled={busy} onClick={close}>
                Not now
              </Button>
              <Button variant="primary" loading={busy} disabled={ids.length !== 1} onClick={go}>
                Send a new invite
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Operators › Change role, for one or many. It applies from their next click. */
export function ChangeOperatorRoleSheet({ ids, close, done }: AdminSheetProps) {
  const [role, setRole] = useState<OperatorRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = ids.length;

  const go = async () => {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      const label = ROLES.find((option) => option.value === role)!.label.toLowerCase();
      const said = await postBulk("/api/platform-admin/operators/role", { ids, role }, `changed to ${label}`, ["operator", "operators"]);
      done(said.title, said.variant);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{count === 1 ? "Change role" : `Change ${count} operators' role`}</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            It applies from their next click. Your own role, and the last owner&apos;s, stay as they are.
          </DialogDescription>
        </DialogHeader>
        <RolePicker name="operator-role" value={role} onChange={setRole} />
        {error ? (
          <p role="alert" className="text-sm text-[var(--bad)]">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!role} onClick={go}>
            Change role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
