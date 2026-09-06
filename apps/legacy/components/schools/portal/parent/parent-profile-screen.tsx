"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { ChevronRight, LogOut, Mail, Phone } from "@/lib/icons";

import { useParentPortal } from "./parent-portal-context";

/**
 * S-6.2 (all my children) and the account itself.
 *
 * Every child is listed here, because the switcher answers "show me one" and a
 * parent of three sometimes wants "show me all three". Tapping one selects it
 * everywhere, which is the same act as the chip in the app bar — and the one in
 * view carries a badge saying so, since a list where nothing is marked leaves a
 * parent guessing whose balance they just read.
 *
 * How the school reaches you is above the children on purpose: a wrong phone
 * number is the reason a parent misses everything else in this app, and it is the
 * one thing on this screen they came to check.
 *
 * Sign out is a real sign-out through next-auth rather than a link to a login page:
 * a shared phone is normal here, and a "sign out" that leaves the session alive is
 * the worst kind of lie for a portal holding another family's data.
 */
export function ParentProfileScreen() {
  const { guardian, children, child, selectChild } = useParentPortal();

  if (!guardian) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
        This account is not linked to a family yet.
      </p>
    );
  }

  const schools = new Set(
    children.map((candidate) => candidate.currentClass?.name ?? "").filter(Boolean),
  );

  return (
    <div className="pp-page">
      <div className="prof-hero">
        <div className="av-wrap">
          <PersonAvatar name={`${guardian.firstName} ${guardian.lastName}`} size="lg" />
        </div>
        <h2>
          {guardian.firstName} {guardian.lastName}
        </h2>
        <div className="sb">
          {children.some((candidate) => candidate.isPrimary) ? "Main parent" : "Parent"} ·{" "}
          {children.length} {children.length === 1 ? "child" : "children"} on your account
        </div>
      </div>

      <div className="section-h">How the school reaches you</div>
      <div className="card-block boxed">
        <div className="pl-row">
          <span className="ic-tile brand">
            <Phone className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="nm">{guardian.phone}</div>
            <div className="sb">Main phone</div>
          </div>
          <ChevronRight className="chev size-4" aria-hidden />
        </div>
        <div className="pl-row">
          <span className="ic-tile">
            <Mail className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="nm">{guardian.email ?? "No email on file"}</div>
            <div className="sb">Email</div>
          </div>
          <ChevronRight className="chev size-4" aria-hidden />
        </div>
      </div>

      <div className="section-h">
        Your children
        {schools.size > 0 ? (
          <span className="mono-note">
            {children.length} {children.length === 1 ? "child" : "children"}
          </span>
        ) : null}
      </div>
      <div className="card-block boxed">
        {children.length === 0 ? (
          <p className="pp-empty-row">
            The school has not linked any children to your account.
          </p>
        ) : (
          children.map((candidate) => {
            const viewing = candidate.id === child?.id;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => selectChild(candidate.id)}
                aria-pressed={viewing}
                className="pl-row cl"
              >
                <PersonAvatar
                  firstName={candidate.firstName}
                  lastName={candidate.lastName}
                  src={candidate.avatarUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="nm block">
                    {candidate.firstName} {candidate.lastName}
                  </span>
                  <span className="sb block">
                    {[
                      candidate.currentClass?.name,
                      candidate.currentStream?.name,
                      candidate.relationship.toLowerCase(),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {viewing ? (
                  <span className="pp-viewing">Viewing</span>
                ) : (
                  <ChevronRight className="chev size-4" aria-hidden />
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="section-h">Your account</div>
      <div className="card-block boxed">
        {/* Messaging has no tab of its own — the bottom bar is the demo's four
            and a fifth would crowd a phone. It lives here, beside Help, which
            is where a parent looks when they want to reach somebody. */}
        <Link href="/portal/parent/messages" className="pl-row cl">
          <span className="min-w-0 flex-1">
            <span className="nm block">Messages</span>
            <span className="sb block">Write to the school, and read replies</span>
          </span>
          <ChevronRight className="chev size-4" aria-hidden />
        </Link>
        <Link href="/portal/parent/help" className="pl-row cl">
          <span className="min-w-0 flex-1">
            <span className="nm block">Help and common questions</span>
            <span className="sb block">Answers without ringing the office</span>
          </span>
          <ChevronRight className="chev size-4" aria-hidden />
        </Link>
      </div>

      <div className="px-4 py-[18px]">
        <button
          type="button"
          className="pp-wide-btn danger"
          onClick={() => signOut({ callbackUrl: "/portal/parent/login" })}
        >
          <LogOut className="size-[14px]" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}
