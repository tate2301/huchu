"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Face } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { WDialog, WToast, useToast6 } from "@/components/teams/w-dialog";
import { Button } from "@/components/workspace/button";
import type { MemberItem } from "@/lib/teams/members-view";
import {
  changeRoleAction,
  offerOwnershipAction,
  removeAction,
  restoreAction,
  suspendAction,
  type Done,
} from "@/app/preferences/organization/users/actions";
import { dayLong } from "@/lib/teams/words";

type Dialog =
  | { kind: "suspend"; member: MemberItem }
  | { kind: "remove"; member: MemberItem }
  | { kind: "offer"; member: MemberItem }
  | null;

const first = (name: string) => name.split(" ")[0];

/**
 * What the Members list and a member's page do to a person: change a role, suspend, remove, offer ownership.
 * One place for the dialogs, the toast with Undo and the way a refusal reads.
 */
export function usePeople({ people, ownerName, billing, used }: { people: MemberItem[]; ownerName: string; billing: number; used: number }) {
  const router = useRouter();
  const { toast, show, clear } = useToast6();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const attempt = React.useCallback(async <T extends object>(work: () => Promise<Done<T>>): Promise<Done<T> | null> => {
    setProblem(null);
    setBusy(true);
    try {
      const result = await work();
      if (!result.ok) {
        setProblem(result.message);
        return result;
      }
      router.refresh();
      return result;
    } catch {
      setProblem(typeof navigator !== "undefined" && !navigator.onLine ? "You are offline. Nothing changed." : "That did not go through. Nothing changed.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [router]);

  const close = () => {
    setDialog(null);
    setProblem(null);
  };

  const changeRole = async (member: MemberItem, role: MemberItem["role"], label: string) => {
    const before = member.role;
    const result = await attempt(() => changeRoleAction(member.membershipId, role));
    if (result?.ok) show({ text: `${first(member.name)} is now ${label.toLowerCase()}`, undo: () => void attempt(() => changeRoleAction(member.membershipId, before)) });
    else if (result) show({ text: result.message });
  };

  const restore = async (member: MemberItem) => {
    const result = await attempt(() => restoreAction(member.membershipId));
    if (result?.ok) show({ text: `${first(member.name)} is back` });
    else if (result) show({ text: result.message });
  };

  const node = (
    <>
      {dialog?.kind === "suspend" ? <SuspendDialog used={used} member={dialog.member} others={people} problem={problem} busy={busy} onClose={close} onDone={(until) => show({ text: `${first(dialog.member.name)} is suspended${until ? ` until ${until}` : ""}`, undo: () => void attempt(() => restoreAction(dialog.member.membershipId)) })} run={attempt} /> : null}
      {dialog?.kind === "remove" ? <RemoveDialog member={dialog.member} others={people} problem={problem} busy={busy} onClose={close} onDone={() => show({ text: `${first(dialog.member.name)} is removed` })} run={attempt} /> : null}
      {dialog?.kind === "offer" ? <OfferDialog member={dialog.member} ownerName={ownerName} billing={billing} problem={problem} busy={busy} onClose={close} onDone={() => show({ text: `Offer sent to ${first(dialog.member.name)}` })} run={attempt} /> : null}
      <WToast toast={toast} onClear={clear} />
    </>
  );

  return {
    node,
    busy,
    toast: show,
    attempt,
    changeRole,
    restore,
    suspend: (member: MemberItem) => setDialog({ kind: "suspend", member }),
    remove: (member: MemberItem) => setDialog({ kind: "remove", member }),
    offer: (member: MemberItem) => setDialog({ kind: "offer", member }),
  };
}

type Run = <T extends object>(work: () => Promise<Done<T>>) => Promise<Done<T> | null>;

function Trouble({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="wp-fail" role="alert">
      <Glyph name="warning" className="i-lead" />
      <div>
        <div className="wp-fail__t">{text}</div>
      </div>
    </div>
  );
}

function Who({ member }: { member: MemberItem }) {
  return (
    <div className="wp-who" style={{ gap: 12 }}>
      <Face person={{ name: member.name }} size={40} />
      <div>
        <div style={{ color: "var(--ink)", fontWeight: 600 }}>{member.name}</div>
        <div className="muted">{member.roleWord}</div>
      </div>
    </div>
  );
}

function HandOver({ member, others, value, onChange }: { member: MemberItem; others: MemberItem[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="wp-fld">
      <span className="wp-fld__l">{member.deals} {member.deals === 1 ? "deal" : "deals"} to hand over to</span>
      <span className="wp-pick">
        <Glyph name="handover" />
        <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Hand over to">
          <option value="">Choose a member</option>
          {others.filter((o) => o.membershipId !== member.membershipId && o.status === "ACTIVE").map((o) => (
            <option key={o.membershipId} value={o.membershipId}>{o.name}</option>
          ))}
        </select>
      </span>
    </label>
  );
}

function SuspendDialog({ used, member, others, problem, busy, onClose, onDone, run }: { used: number; member: MemberItem; others: MemberItem[]; problem: string | null; busy: boolean; onClose: () => void; onDone: (until: string | null) => void; run: Run }) {
  const [until, setUntil] = React.useState("");
  const [hand, setHand] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [tomorrow] = React.useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const submit = async () => {
    const result = await run(() => suspendAction(member.membershipId, until || null, hand ? to : undefined));
    if (result?.ok) {
      onClose();
      onDone(until ? dayLong(new Date(`${until}T12:00:00+02:00`)) : null);
    }
  };
  return (
    <WDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Suspend ${first(member.name)}`}
      icon="lock"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || (hand && !to)} onClick={submit}>
            Suspend
          </Button>
        </>
      }
    >
      <Who member={member} />
      <label className="wp-fld">
        <span className="wp-fld__l">Until</span>
        <span className="wp-pick">
          <Glyph name="cal" />
          <input type="date" min={tomorrow} value={until} onChange={(event) => setUntil(event.target.value)} aria-label="Until" />
        </span>
      </label>
      {member.deals > 0 ? (
        <>
          <div className="wp-act">
            <Button onClick={() => setHand(false)} aria-pressed={!hand}>Keep their {member.deals} deals</Button>
            <Button onClick={() => setHand(true)} aria-pressed={hand}>Hand them over</Button>
          </div>
          {hand ? <HandOver member={member} others={others} value={to} onChange={setTo} /> : null}
        </>
      ) : null}
      <div className="wp-facts">
        <Glyph name="user-plus" className="i" />
        <span>Seats</span>
        <b>
          <span className="muted">{used}</span> <Glyph name="arrow" /> {used - 1}
        </b>
      </div>
      <Trouble text={problem} />
    </WDialog>
  );
}

function RemoveDialog({ member, others, problem, busy, onClose, onDone, run }: { member: MemberItem; others: MemberItem[]; problem: string | null; busy: boolean; onClose: () => void; onDone: () => void; run: Run }) {
  const [to, setTo] = React.useState("");
  const needs = member.deals > 0;
  const submit = async () => {
    const result = await run(() => removeAction(member.membershipId, needs ? to : undefined));
    if (result?.ok) {
      onClose();
      onDone();
    }
  };
  return (
    <WDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${first(member.name)}`}
      icon="trash"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger-fill" disabled={busy || (needs && !to)} onClick={submit}>
            Remove
          </Button>
        </>
      }
    >
      <Who member={member} />
      {needs ? <HandOver member={member} others={others} value={to} onChange={setTo} /> : null}
      <Trouble text={problem} />
    </WDialog>
  );
}

function OfferDialog({ member, ownerName, billing, problem, busy, onClose, onDone, run }: { member: MemberItem; ownerName: string; billing: number; problem: string | null; busy: boolean; onClose: () => void; onDone: () => void; run: Run }) {
  const submit = async () => {
    const result = await run(() => offerOwnershipAction(member.membershipId));
    if (result?.ok) {
      onClose();
      onDone();
    }
  };
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !busy) {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  return (
    <WDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Offer ${first(member.name)} the workspace`}
      icon="crown"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            Send the offer
            <span className="kbd">Enter</span>
          </Button>
        </>
      }
    >
      <div className="wp-facts">
        <Glyph name="crown" className="i" />
        <span>Owner now</span>
        <b>{ownerName}</b>
        <Glyph name="person" className="i" />
        <span>New owner</span>
        <b>{member.name}</b>
        <Glyph name="coins" className="i" />
        <span>Billing moves to {first(member.name)}</span>
        <b>US${billing} a month</b>
        <Glyph name="clock" className="i" />
        <span>Lapses in</span>
        <b>7 days</b>
      </div>
      <Trouble text={problem} />
    </WDialog>
  );
}
