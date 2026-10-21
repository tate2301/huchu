"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Face } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { SeatMeter } from "@/components/teams/members";
import { WDrawer } from "@/components/teams/w-dialog";
import { Button } from "@/components/workspace/button";
import { addSeatOnlyAction, askForSeatAction, inviteAction } from "@/app/preferences/organization/users/actions";
import type { MembersPage } from "@/lib/teams/members-view";

const ordinal = (n: number) => ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][n] ?? `${n}th`;

/** Invite someone: who, as what, where; and, when every seat is taken, the owner adds one or an admin asks. */
export function InviteDrawer({ page, open, onOpenChange, onDone }: { page: MembersPage; open: boolean; onOpenChange: (open: boolean) => void; onDone: (text: string) => void }) {
  const router = useRouter();
  const { seats, viewer, owner, jobs } = page;
  const full = seats.left === 0;
  const ownerFirst = owner?.name.split(" ")[0] ?? "the owner";
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState(jobs[0]?.value);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const ready = name.trim().length > 1 && (phone.trim() || email.trim()) && role;

  const submit = React.useCallback(async () => {
    if (!ready || busy || !role) return;
    setBusy(true);
    setProblem(null);
    const input = { name: name.trim(), phone: phone.trim(), email: email.trim(), role };
    try {
      let result;
      let text: string;
      if (full && !viewer.isOwner) {
        result = await askForSeatAction(input);
        text = `Asked ${ownerFirst} for a seat`;
      } else {
        if (full) {
          const added = await addSeatOnlyAction();
          if (!added.ok) {
            setProblem(added.message);
            return;
          }
        }
        result = await inviteAction(input);
        text = `Invite sent to ${name.trim().split(" ")[0]}`;
      }
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setName("");
      setPhone("");
      setEmail("");
      onOpenChange(false);
      onDone(text);
      router.refresh();
    } catch {
      setProblem(typeof navigator !== "undefined" && !navigator.onLine ? "You are offline. Nothing was sent." : "That did not go through. Nothing was sent.");
    } finally {
      setBusy(false);
    }
  }, [ready, busy, role, name, phone, email, full, viewer.isOwner, ownerFirst, onOpenChange, onDone, router]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submit]);

  const label = full ? (viewer.isOwner ? `Add the ${ordinal(seats.limit + 1)} seat and invite` : `Ask ${ownerFirst} for a ${ordinal(seats.limit + 1)} seat`) : "Send the invite";

  return (
    <WDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a member"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!ready || busy} onClick={submit}>
            {label}
            <span className="kbd">Ctrl Enter</span>
          </Button>
        </>
      }
    >
      <div className="wp-two">
        <div className="wp-field">
          <label htmlFor="inv-name">Name</label>
          <span className="wp-input">
            <input id="inv-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </span>
        </div>
        <div className="wp-field">
          <label htmlFor="inv-role">Role</label>
          <span className="wp-input">
            <select id="inv-role" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              {jobs.map((job) => (
                <option key={job.value} value={job.value}>{job.label}</option>
              ))}
            </select>
          </span>
        </div>
      </div>
      <div className="wp-two">
        <div className="wp-field">
          <label htmlFor="inv-phone">WhatsApp</label>
          <span className="wp-input">
            <Glyph name="phone" />
            <input id="inv-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </span>
        </div>
        <div className="wp-field">
          <label htmlFor="inv-email">Email</label>
          <span className="wp-input">
            <Glyph name="mail" />
            <input id="inv-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </span>
        </div>
      </div>
      <div className="wp-seatbox">
        <div className="wp-seatbox__top">
          <SeatMeter used={seats.used} held={seats.invites} limit={seats.limit + (full ? 1 : 0)} />
          <b style={{ color: "var(--ink)", fontWeight: 600 }}>{full ? `${seats.used} of ${seats.limit} seats used` : `${seats.used + 1} of ${seats.limit} seats used`}</b>
        </div>
        {full ? (
          <div className="wp-seatbox__who">
            {owner ? <Face person={{ name: owner.name }} size={28} /> : null}
            <span>{viewer.isOwner ? "Every seat is taken" : `Only ${ownerFirst} can add one`}</span>
          </div>
        ) : null}
      </div>
      {problem ? (
        <div className="wp-fail" role="alert">
          <Glyph name="warning" className="i-lead" />
          <div className="wp-fail__t">{problem}</div>
        </div>
      ) : null}
    </WDrawer>
  );
}
