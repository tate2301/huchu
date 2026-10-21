"use client";

import * as React from "react";
import { signIn } from "next-auth/react";

import { Face } from "@/components/teams/face";
import { WhatsAppMark } from "@/components/teams/brand-marks";
import { Glyph } from "@/components/teams/glyph";
import { Teams } from "@/components/teams/teams-root";
import "@/components/teams/w-people.css";
import { Button } from "@/components/workspace/button";
import type { JoinView } from "@/lib/teams/join-view";

import { joinAction, sendCodeAction } from "./actions";

/** Joining from an invite on a phone: who asked, as what, and the six digits sent to the number it went to. */
export function JoinPerson({ token, view }: { token: string; view: JoinView }) {
  const [code, setCode] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const needsCode = Boolean(view.phone);
  const sent = React.useRef(false);
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (needsCode && view.state === "OPEN" && !sent.current) {
      sent.current = true;
      void sendCodeAction(token);
    }
  }, [needsCode, token, view.state]);

  const gone = view.state !== "OPEN";
  const join = async () => {
    if (busy || (needsCode && code.length < 6)) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await joinAction(token, code);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      const signed = await signIn("handoff", { token: result.ticket, redirect: false });
      if (signed?.ok && !signed.error) window.location.replace(result.landsOn);
      else setProblem("You are in. Sign in to carry on.");
    } catch {
      setProblem(typeof navigator !== "undefined" && !navigator.onLine ? "You are offline. Nothing changed." : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Teams>
      <div className="wp-join">
        <div className="wp-join__body">
          <span className="wp-join__mark"><Glyph name="seal" /></span>
          <h1 className="wp-join__h">Join {view.workspace}</h1>
          <div className="wp-from">
            <Face person={{ name: view.invitedBy }} size={24} />
            <b>{view.invitedBy}</b>
            <span>· {view.sentAt}</span>
          </div>
          {gone ? (
            <div className="wp-problem" role="alert">
              <Glyph name="warning" className="i-lead" />
              <div className="wp-fail__t">
                {view.state === "ACCEPTED" ? "This invite has been used" : view.state === "REVOKED" ? "This invite was taken back" : "This invite has run out"}
              </div>
            </div>
          ) : (
            <>
              <div className="wp-kv" style={{ gridTemplateColumns: "24px 96px minmax(0, 1fr)" }}>
                <Glyph name="person" className="i" />
                <span>You</span>
                <b>{view.name}</b>
                <Glyph name="tag" className="i" />
                <span>Role</span>
                <b>{view.role}</b>
                <Glyph name="box" className="i" />
                <span>Product</span>
                <b>{view.product}</b>
              </div>
              {needsCode ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", fontWeight: 500, paddingTop: 16 }}>
                    Code sent to <WhatsAppMark /> {view.phone}
                  </div>
                  <label className="wp-code" aria-invalid={problem ? "true" : undefined} onClick={() => ref.current?.focus()}>
                    <input ref={ref} inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} maxLength={6} aria-label="Code" onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => event.key === "Enter" && void join()} />
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} className={i === code.length ? "is-now" : undefined}>{code[i] ?? ""}</span>
                    ))}
                  </label>
                </>
              ) : null}
              {problem ? <div className="wp-fail__s" role="alert">{problem}</div> : null}
            </>
          )}
        </div>
        {gone ? null : (
          <div className="wp-join__foot">
            <Button variant="primary" size="field" disabled={busy || (needsCode && code.length < 6)} onClick={() => void join()} style={{ height: 44 }}>
              Join {view.workspace}
            </Button>
            <div className="wp-by">{view.product} by Corelith</div>
          </div>
        )}
      </div>
    </Teams>
  );
}
