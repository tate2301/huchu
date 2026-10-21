"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { WhatsAppMark } from "@/components/teams/brand-marks";
import { Glyph } from "@/components/teams/glyph";
import { SeatMeter } from "@/components/teams/members";
import { TopBar } from "@/components/teams/top-bar";
import { Teams } from "@/components/teams/teams-root";
import { WToast, useToast6 } from "@/components/teams/w-dialog";
import "@/components/teams/w-people.css";
import { OwnsChrome } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { Button } from "@/components/workspace/button";
import { turnOffLinkAction, turnOnLinkAction } from "@/app/preferences/organization/invite-link/actions";
import type { UserRole } from "@prisma/client";
import type { LinkRow } from "@/lib/teams/join-view";
import type { SeatLine } from "@/lib/teams/seats";
import { dayShort } from "@/lib/teams/words";

/** One shared link per job. The address is shown once, when it is made. */
export function InviteLinkPage({ seats, links, company }: { seats: SeatLine; links: LinkRow[]; company: string }) {
  const router = useRouter();
  const { toast, show, clear } = useToast6();
  const [shown, setShown] = React.useState<{ role: string; url: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const copy = React.useCallback(async () => {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown.url);
      show({ text: "Link copied" });
    } catch {
      show({ text: "The link could not be copied. Select it and copy." });
    }
  }, [shown, show]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "c" && shown) {
        event.preventDefault();
        void copy();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, copy]);

  const turn = async (row: LinkRow, on: boolean) => {
    setBusy(true);
    try {
      const result = on ? await turnOnLinkAction(row.role as UserRole) : await turnOffLinkAction(row.role as UserRole);
      if (!result.ok) return show({ text: result.message });
      if (on && result.url) setShown({ role: row.role, url: result.url });
      else setShown((s) => (s?.role === row.role ? null : s));
      show({ text: on ? "Link is on" : "Link is off" });
      router.refresh();
    } catch {
      show({ text: "That did not go through. Nothing changed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PreferencesShell>
      <OwnsChrome>
        <Teams>
          <div className="wp-col">
            <TopBar
              back={{ label: "Members", href: "/preferences/organization/users" }}
              title="Invite link"
              bell={{ onOpen: () => router.push("/activity") }}
              primary={shown ? { id: "copy", label: "Copy the link", icon: "copy", shortcut: "C", onSelect: () => void copy() } : undefined}
            />
            <div className="wp-scroll">
              <div className="wp-main" style={{ maxWidth: 720 }}>
                <div className="wp-every" style={{ borderTop: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}><SeatMeter used={seats.used} held={seats.invites} limit={seats.limit} />{seats.text}</span>
                  <span className="muted">{company}</span>
                </div>
                {links.map((row) => (
                  <div key={row.role}>
                    <div className="wp-prow">
                      <div>
                        <div className="wp-prow__t">{row.label}</div>
                        <div className="wp-prow__s">{row.active && row.madeBy ? `${row.madeBy.split(" ")[0]} · ${row.madeAt ? dayShort(new Date(row.madeAt)) : ""}` : "Off"}</div>
                      </div>
                      <div className="wp-act">
                        {row.active ? <Button disabled={busy} onClick={() => void turn(row, false)}>Turn off</Button> : null}
                        <Button disabled={busy} onClick={() => void turn(row, true)}>{row.active ? "Make a new link" : "Turn on"}</Button>
                      </div>
                    </div>
                    {shown?.role === row.role ? (
                      <div style={{ display: "flex", gap: 8, padding: "12px 0", alignItems: "center" }}>
                        <span className="wp-link">{shown.url}</span>
                        <Button icon={<Glyph name="copy" />} onClick={() => void copy()}>Copy</Button>
                        <Button icon={<WhatsAppMark />} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Join ${company}: ${shown.url}`)}`, "_blank")}>Share on WhatsApp</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <WToast toast={toast} onClear={clear} />
        </Teams>
      </OwnsChrome>
    </PreferencesShell>
  );
}
