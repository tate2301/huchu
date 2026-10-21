"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Face } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { SeatMeter } from "@/components/teams/members";
import { TopBar } from "@/components/teams/top-bar";
import { Teams } from "@/components/teams/teams-root";
import "@/components/teams/w-people.css";
import { OwnsChrome } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { Button } from "@/components/workspace/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { addSeatAction, notNowAction, removeRequestAction, revokeAction, sendAgainAction, type Done } from "@/app/preferences/organization/users/actions";
import type { MemberItem, MembersPage } from "@/lib/teams/members-view";
import { addMemberLabel } from "@/components/teams/seats";
import { clock, dayShort } from "@/lib/teams/words";

import { InviteDrawer } from "./invite-drawer";
import { usePeople } from "./use-people";

const first = (name: string) => name.split(" ")[0];
const when = (iso: string | null) => {
  if (!iso) return "Not yet";
  const at = new Date(iso);
  const same = dayShort(at) === dayShort(new Date());
  return same ? clock(at) : dayShort(at);
};

export function MembersPage({ page }: { page: MembersPage }) {
  const router = useRouter();
  const { viewer, seats, members, invites, requests, jobs, owner, company, openOffer } = page;
  const billing = seats.limit >= 6 ? 99 : 39;
  const people = usePeople({ people: members, ownerName: owner?.name ?? "", billing , used: seats.used });
  const [inviting, setInviting] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [stateFilter, setStateFilter] = React.useState("all");
  const full = seats.left === 0;
  const ownerFirst = owner ? first(owner.name) : "the owner";

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        setInviting(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const match = (member: MemberItem) =>
    (!search || member.name.toLowerCase().includes(search.toLowerCase()) || (member.email ?? "").toLowerCase().includes(search.toLowerCase())) &&
    (roleFilter === "all" || (roleFilter === "owner" ? member.isOwner : roleFilter === "admin" ? member.isAdmin && !member.isOwner : member.role === roleFilter && !member.isAdmin));
  const active = members.filter((m) => m.status === "ACTIVE" && match(m) && (stateFilter === "all" || stateFilter === "active"));
  const suspended = members.filter((m) => m.status === "SUSPENDED" && match(m) && (stateFilter === "all" || stateFilter === "suspended"));
  const waiting = stateFilter === "all" || stateFilter === "waiting" ? invites.filter((i) => !search || (i.name ?? "").toLowerCase().includes(search.toLowerCase())) : [];
  const asked = stateFilter === "all" ? requests.filter((r) => r.state === "open" || r.state === "not-now") : [];

  const mayManage = (member: MemberItem) => !member.isYou && !member.isOwner && (viewer.isOwner || (viewer.isAdmin && !member.isAdmin));
  const act = async (work: () => Promise<Done<object>>, text: string) => {
    const result = await people.attempt(work);
    people.toast({ text: result?.ok ? text : (result?.message ?? "That did not go through. Nothing changed.") });
    router.refresh();
  };

  const primary = full
    ? viewer.isOwner
      ? { id: "add", label: addMemberLabel(seats.limit), icon: "user-plus" as const, shortcut: "I", onSelect: () => setInviting(true) }
      : { id: "ask", label: `Ask ${ownerFirst} for a seat`, icon: "user-plus" as const, shortcut: "I", onSelect: () => setInviting(true) }
    : { id: "invite", label: "Invite", icon: "user-plus" as const, shortcut: "I", onSelect: () => setInviting(true) };

  const row = (member: MemberItem) => {
    const manage = mayManage(member);
    const roleLocked = !manage || member.status !== "ACTIVE";
    return (
      <div key={member.membershipId} className="mrow wp-mrow" data-member={member.membershipId}>
        <Link href={`/preferences/organization/users/${member.membershipId}`} className="mrow__who" style={{ textDecoration: "none" }}>
          <Face person={{ name: member.name }} size={32} />
          <div style={{ minWidth: 0 }}>
            <div className="mrow__name">
              {member.name}
              {member.isYou ? <span className="muted" style={{ fontWeight: 400 }}> (you)</span> : null}
            </div>
            <div className="mrow__sub">{member.email ?? member.phone ?? ""}</div>
          </div>
        </Link>
        <div>
          {roleLocked ? (
            <span className="wp-role">
              {member.isOwner ? <Glyph name="crown" size="sm" className="wp-crown" /> : null}
              {member.roleWord}
            </span>
          ) : (
            <span className="wp-select">
              {member.roleWord}
              <Glyph name="caret-down" />
              <select
                aria-label={`Role of ${member.name}`}
                value={member.role}
                onChange={(event) => {
                  const value = event.target.value;
                  const label = jobs.find((j) => j.value === value)?.label ?? value;
                  void people.changeRole(member, value as MemberItem["role"], label);
                }}
              >
                {jobs.map((job) => (
                  <option key={job.value} value={job.value}>{job.label}</option>
                ))}
              </select>
            </span>
          )}
        </div>
        <div>
          {member.status === "SUSPENDED" ? (
            <span className="wp-state"><i />{member.until ? `Back ${dayShort(new Date(member.until))}` : "Suspended"}</span>
          ) : (
            <span className="muted">{member.lastHere ? `Last here ${when(member.lastHere)}` : "Not yet"}</span>
          )}
        </div>
        <div className="muted">{member.status === "ACTIVE" && member.deals ? `${member.deals} ${member.deals === 1 ? "deal" : "deals"}` : ""}</div>
        <div className="wp-end">
          {member.status === "SUSPENDED" && manage ? <Button onClick={() => void people.restore(member)}>Restore</Button> : null}
          <Menu>
            <MenuTrigger asChild>
              <Button iconOnly aria-label={`More for ${member.name}`} icon={<Glyph name="more" />} />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon={<Glyph name="shield" />} onSelect={() => router.push(`/preferences/organization/users/${member.membershipId}`)}>Permissions</MenuItem>
              {viewer.isOwner && !member.isYou && member.status === "ACTIVE" ? <MenuItem icon={<Glyph name="crown" />} onSelect={() => people.offer(member)}>Offer ownership</MenuItem> : null}
              {manage ? <MenuSeparator /> : null}
              {manage && member.status === "ACTIVE" ? <MenuItem icon={<Glyph name="lock" />} onSelect={() => people.suspend(member)}>Suspend</MenuItem> : null}
              {manage ? <MenuItem danger icon={<Glyph name="trash" />} onSelect={() => people.remove(member)}>Remove</MenuItem> : null}
            </MenuContent>
          </Menu>
        </div>
      </div>
    );
  };

  const empty = active.length + suspended.length + waiting.length + asked.length === 0;

  return (
    <PreferencesShell railCounts={{ users: members.filter((m) => m.status !== "REMOVED").length }}>
      <OwnsChrome>
        <Teams>
          <div className="wp-col">
            <TopBar
              icon="clients"
              title="Members"
              count={`${seats.used} of ${seats.limit} seats used`}
              more={[[{ id: "link", label: "Invite link", icon: "share", onSelect: () => router.push("/preferences/organization/invite-link") }]]}
              primary={primary}
              bell={{ onOpen: () => router.push("/activity") }}
              search={{ shortcut: "Ctrl K", onOpen: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })) }}
              vane={{ onToggle: () => router.push("/management/vane") }}
            />
            <div className="wp-toolbar">
              <label className="wp-search">
                <Glyph name="search" size="sm" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search members" />
              </label>
              <span className="wp-filter">
                Role <b>{roleFilter === "all" ? "Any" : roleFilter === "owner" ? "Owner" : roleFilter === "admin" ? "Admin" : (jobs.find((j) => j.value === roleFilter)?.label ?? roleFilter)}</b>
                <Glyph name="caret-down" size="sm" />
                <select aria-label="Role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="all">Any</option>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  {jobs.map((job) => (
                    <option key={job.value} value={job.value}>{job.label}</option>
                  ))}
                </select>
              </span>
              <span className="wp-filter">
                State <b>{{ all: "Any", active: "Active", waiting: "Waiting to join", suspended: "Suspended" }[stateFilter]}</b>
                <Glyph name="caret-down" size="sm" />
                <select aria-label="State" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                  <option value="all">Any</option>
                  <option value="active">Active</option>
                  <option value="waiting">Waiting to join</option>
                  <option value="suspended">Suspended</option>
                </select>
              </span>
              <span style={{ flex: 1 }} />
              <SeatMeter used={seats.used} held={seats.invites} limit={seats.limit} />
            </div>
            <div className="wp-scroll">
              {openOffer && viewer.isOwner ? (
                <div className="list-h">Offer to {first(openOffer.toName)} <span className="muted">open until {dayShort(new Date(openOffer.expiresAt))}</span></div>
              ) : null}
              {asked.length ? (
                <>
                  <div className="list-h">Asked for a seat <span className="muted">{asked.length}</span></div>
                  {asked.map((request) => (
                    <div key={request.ref} className="mrow wp-mrow" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                      <div className="mrow__who">
                        <Face person={{ name: request.name }} size={32} />
                        <div>
                          <div className="mrow__name">{request.name}</div>
                          <div className="mrow__sub">{request.roleWord} · asked by {first(request.askedBy)} at {when(request.askedAt)}</div>
                        </div>
                      </div>
                      <div className="wp-end">
                        {viewer.isOwner && request.state === "open" ? (
                          <>
                            <Button onClick={() => void act(() => notNowAction(request.ref), "Not now")}>Not now</Button>
                            <Button variant="primary" onClick={() => void act(() => addSeatAction(request.ref), `Seat added, invite sent to ${first(request.name)}`)}>Add the seat</Button>
                          </>
                        ) : (
                          <Button onClick={() => void act(() => removeRequestAction(request.ref), "Request removed")}>Remove</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
              {waiting.length ? (
                <>
                  <div className="list-h">Waiting to join <span className="muted">{waiting.length}</span></div>
                  {waiting.map((invite) => (
                    <div key={invite.id} className="mrow wp-mrow" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                      <div className="mrow__who">
                        <Face person={{ name: invite.name ?? "" }} size={32} />
                        <div>
                          <div className="mrow__name">{invite.name ?? invite.email ?? invite.phone}</div>
                          <div className="mrow__sub" style={invite.status === "NOT_DELIVERED" ? { color: "var(--bad)" } : undefined}>
                            {invite.status === "NOT_DELIVERED"
                              ? `${invite.channel === "EMAIL" ? "Email" : "WhatsApp"} could not deliver`
                              : invite.status === "EXPIRED"
                                ? `Expired ${dayShort(new Date(invite.expiresAt))}`
                                : invite.status === "REVOKED"
                                  ? "Revoked"
                                  : `${invite.phone ?? invite.email} · ${invite.roleWord}`}
                          </div>
                        </div>
                      </div>
                      <div className="wp-end">
                        {invite.status === "REVOKED" ? null : (
                          <>
                            <Button onClick={() => void act(() => sendAgainAction(invite.id), "Invite sent again")}>Send again</Button>
                            {invite.status === "SENT" || invite.status === "NOT_DELIVERED" ? <Button onClick={() => void act(() => revokeAction(invite.id), "Invite revoked")}>Revoke</Button> : null}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
              {active.length ? (
                <>
                  <div className="list-h">Members <span className="muted">{active.length}</span></div>
                  {active.map(row)}
                </>
              ) : null}
              {suspended.length ? (
                <>
                  <div className="list-h">Suspended <span className="muted">{suspended.length}</span></div>
                  {suspended.map(row)}
                </>
              ) : null}
              {empty ? <div className="wp-empty">No one matches</div> : null}
            </div>
            <div className="wp-foot">{company.name}</div>
          </div>
          <InviteDrawer page={page} open={inviting} onOpenChange={setInviting} onDone={(text) => people.toast({ text })} />
          {people.node}
        </Teams>
      </OwnsChrome>
    </PreferencesShell>
  );
}
