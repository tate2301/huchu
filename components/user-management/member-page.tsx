"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Face } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { PermissionRow, type Grant } from "@/components/teams/members";
import { TopBar } from "@/components/teams/top-bar";
import { Teams } from "@/components/teams/teams-root";
import "@/components/teams/w-people.css";
import { OwnsChrome } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { Button } from "@/components/workspace/button";
import { Tooltip } from "@corelithzw/react";
import { setPermissionAction } from "@/app/preferences/organization/users/actions";
import type { MemberPage } from "@/lib/teams/members-view";
import type { PermissionState } from "@/lib/platform/permission-catalog";
import { clock, dayShort } from "@/lib/teams/words";

import { usePeople } from "./use-people";

const first = (name: string) => name.split(" ")[0];
const toGrant = (s: PermissionState): Grant => (s === "ALLOW" ? "allowed" : s === "DENY" ? "denied" : "default");
const toState = (g: Grant): PermissionState => (g === "allowed" ? "ALLOW" : g === "denied" ? "DENY" : "DEFAULT");
const stampOf = (iso: string) => {
  const at = new Date(iso);
  return dayShort(at) === dayShort(new Date()) ? clock(at) : dayShort(at);
};

export function MemberPageView({ page }: { page: MemberPage }) {
  const router = useRouter();
  const { member, permissions, may, position, changes, deals, owner, seats, viewer } = page;
  const people = usePeople({ people: page.members, ownerName: owner?.name ?? "", billing: page.billing.perMonth , used: seats.used });
  const [states, setStates] = React.useState(() => Object.fromEntries(permissions.map((p) => [p.key, p.state])) as Record<string, PermissionState>);
  const [conflict, setConflict] = React.useState<{ key: string; message: string; by: string; theirs: PermissionState; mine: PermissionState } | null>(null);
  const name = first(member.name);

  React.useEffect(() => setStates(Object.fromEntries(permissions.map((p) => [p.key, p.state]))), [permissions]);

  const go = (id: string | null) => id && router.push(`/preferences/organization/users/${id}`);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const k = event.key.toLowerCase();
      if (k === "j") go(position.next);
      if (k === "k") go(position.previous);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.next, position.previous]);

  const set = async (key: string, next: PermissionState, force = false) => {
    const expected = states[key] ?? "DEFAULT";
    setStates((s) => ({ ...s, [key]: next }));
    setConflict(null);
    const result = await people.attempt(() => setPermissionAction({ userId: member.userId, key, state: next, expected: force ? (conflict?.theirs ?? expected) : expected }));
    if (result && !result.ok) {
      if (result.code === "CONFLICT") {
        setStates((s) => ({ ...s, [key]: result.state ?? expected }));
        setConflict({ key, message: result.message, by: result.by ?? "Someone", theirs: result.state ?? "DEFAULT", mine: next });
      } else {
        setStates((s) => ({ ...s, [key]: expected }));
        people.toast({ text: result.message });
      }
    } else if (!result) {
      setStates((s) => ({ ...s, [key]: expected }));
    }
  };

  const groups = Array.from(new Set(permissions.map((p) => p.group)));
  const phone = member.phone;
  const jobs = page.jobs;

  return (
    <PreferencesShell railCounts={{ users: page.members.filter((m) => m.status !== "REMOVED").length }}>
      <OwnsChrome>
        <Teams>
          <div className="wp-col">
            <TopBar
              back={{ label: "Members", href: "/preferences/organization/users" }}
              title={member.name}
              step={{ position: position.index, total: position.total, noun: "member", onPrevious: () => go(position.previous), onNext: () => go(position.next) }}
              more={[
                [
                  ...(may.permissions ? [] : []),
                  ...(viewer.isOwner && may.offer ? [{ id: "offer", label: "Offer ownership", icon: "crown" as const, onSelect: () => people.offer(member) }] : []),
                ],
                [
                  ...(may.suspend ? [{ id: "suspend", label: "Suspend", icon: "lock" as const, onSelect: () => people.suspend(member) }] : []),
                  ...(may.restore ? [{ id: "restore", label: "Restore", icon: "undo" as const, onSelect: () => void people.restore(member) }] : []),
                  ...(may.remove ? [{ id: "remove", label: "Remove", icon: "trash" as const, onSelect: () => people.remove(member) }] : []),
                ],
              ]}
              primary={{ id: "message", label: "Message", icon: "chat", shortcut: "M", onSelect: () => (phone ? window.open(`https://wa.me/${phone.replace(/\D/g, "")}`, "_blank") : member.email ? (window.location.href = `mailto:${member.email}`) : undefined) }}
              bell={{ onOpen: () => router.push("/activity") }}
              search={{ shortcut: "Ctrl K", onOpen: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })) }}
              vane={{ onToggle: () => router.push("/management/vane") }}
            />
            <div className="wp-split">
              <div className="wp-main">
                <div className="wp-who">
                  <Face person={{ name: member.name }} size={56} />
                  <div>
                    <h2 className="wp-who__n">{member.name}</h2>
                    <div className="wp-who__s">
                      {member.isOwner ? <Glyph name="crown" size="sm" /> : null}
                      <span>{member.roleWord}</span>
                      {member.status === "SUSPENDED" ? <span className="wp-state wp-state--bad"><i />Suspended</span> : null}
                    </div>
                  </div>
                </div>

                <section className="wp-sec">
                  <h3 className="wp-sec__h">Role</h3>
                  {member.isOwner || !may.role ? (
                    <Tooltip content={page.lockedBy ? `Only ${page.lockedBy} can change an admin` : undefined}>
                      <span className="wp-lock" tabIndex={0}>
                        <Glyph name="lock" size="sm" />
                        {member.roleWord}
                      </span>
                    </Tooltip>
                  ) : (
                    <div className="wp-roles" role="group" aria-label="Role">
                      {jobs.map((job) => (
                        <button key={job.value} type="button" aria-pressed={member.role === job.value} onClick={() => void people.changeRole(member, job.value, job.label)}>
                          {job.label}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="wp-sec">
                  <h3 className="wp-sec__h">What {name} can do</h3>
                  {page.everything ? (
                    <div className="wp-every">
                      <span>Everything</span>
                      <Glyph name="check" />
                    </div>
                  ) : (
                    groups.map((group) => (
                      <div key={group}>
                        <div className="wp-grp">{group}</div>
                        {permissions
                          .filter((p) => p.group === group)
                          .map((p) => (
                            <div key={p.key}>
                              <PermissionRow
                                label={p.label}
                                roleDefault={p.roleDefault ? "yes" : "no"}
                                value={toGrant(states[p.key] ?? p.state)}
                                onChange={may.permissions ? (g) => void set(p.key, toState(g)) : undefined}
                              />
                              {p.by && states[p.key] !== "DEFAULT" ? (
                                <div className="wp-prow__s" style={{ paddingBottom: 6 }}>
                                  {p.by.name} · {stampOf(p.by.at)}
                                </div>
                              ) : null}
                              {conflict?.key === p.key ? (
                                <div className="wp-conflict" role="alert">
                                  <div className="wp-conflict__t">{conflict.message}</div>
                                  <div className="wp-act">
                                    <Button onClick={() => void set(p.key, conflict.mine, true)}>Keep mine</Button>
                                    <Button onClick={() => { setStates((s) => ({ ...s, [p.key]: conflict.theirs })); setConflict(null); }}>Keep {conflict.by}&apos;s</Button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                      </div>
                    ))
                  )}
                </section>
              </div>

              <aside className="wp-aside">
                <section className="wp-main" style={{ overflow: "visible" }}>
                  <h3 className="wp-sec__h">Who changed what</h3>
                  {changes.length === 0 ? <div className="muted">Nothing yet</div> : null}
                  {changes.slice(0, 8).map((change) => (
                    <div key={change.id} className="wp-chg">
                      <Face person={{ name: change.actorName ?? member.name }} size={24} />
                      <div className="wp-chg__t">{change.text}</div>
                      <div className="wp-chg__m">{stampOf(change.at)}</div>
                    </div>
                  ))}
                  <h3 className="wp-sec__h" style={{ paddingTop: 24 }}>Last here</h3>
                  <div className="wp-sess">
                    <Glyph name="desktop" />
                    <div>
                      <div className="wp-sess__t">{member.lastHere ? stampOf(member.lastHere) : "Not yet"}</div>
                    </div>
                  </div>
                  <h3 className="wp-sec__h" style={{ paddingTop: 24 }}>Membership</h3>
                  <div className="wp-kv">
                    <Glyph name="coins" className="i" />
                    <span>Seat</span>
                    <b>{seats.used} of {seats.limit}</b>
                    <Glyph name="jobs" className="i" />
                    <span>Deals</span>
                    <b>{deals.count}</b>
                  </div>
                  <div className="wp-act" style={{ paddingTop: 16 }}>
                    {may.suspend ? <Button onClick={() => people.suspend(member)}>Suspend</Button> : null}
                    {may.restore ? <Button onClick={() => void people.restore(member)}>Restore</Button> : null}
                    {may.remove ? <Button variant="danger" onClick={() => people.remove(member)}>Remove</Button> : null}
                  </div>
                </section>
              </aside>
            </div>
          </div>
          {people.node}
        </Teams>
      </OwnsChrome>
    </PreferencesShell>
  );
}
