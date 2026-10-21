"use client";

import * as React from "react";
import { signIn } from "next-auth/react";

import { Face } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { Teams } from "@/components/teams/teams-root";
import "@/components/teams/w-people.css";
import { Button } from "@/components/workspace/button";
import type { LinkView } from "@/lib/teams/join-view";

import { joinByLinkAction } from "./actions";

/** The workspace's shared link: who made it, as what you join, and a way to reach you. */
export function JoinLink({ token, view }: { token: string; view: LinkView }) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ready = name.trim().length > 1 && (phone.trim() || email.trim());

  const join = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await joinByLinkAction(token, { name, phone, email });
      if (!result.ok) return setProblem(result.message);
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
            <Face person={{ name: view.madeBy }} size={24} />
            <b>{view.madeBy}</b>
            <span>· {view.role}</span>
          </div>
          <div className="wp-field">
            <label htmlFor="jl-name">Name</label>
            <span className="wp-input"><input id="jl-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></span>
          </div>
          <div className="wp-field">
            <label htmlFor="jl-phone">WhatsApp</label>
            <span className="wp-input"><Glyph name="phone" /><input id="jl-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></span>
          </div>
          <div className="wp-field">
            <label htmlFor="jl-email">Email</label>
            <span className="wp-input"><Glyph name="mail" /><input id="jl-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></span>
          </div>
          {problem ? <div className="wp-fail__s" role="alert">{problem}</div> : null}
        </div>
        <div className="wp-join__foot">
          <Button variant="primary" size="field" disabled={!ready || busy} onClick={() => void join()} style={{ height: 44 }}>
            Join {view.workspace}
          </Button>
          <div className="wp-by">{view.product} by Corelith</div>
        </div>
      </div>
    </Teams>
  );
}
