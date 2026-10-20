"use client";

import * as React from "react";

import { Face, Pres } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { MOTION, progressAt } from "@/components/teams/motion";
import { SeatMeter } from "@/components/teams/members";

import { Board } from "./board";
import { P } from "./fixtures";

/** One frame of a motion at a moment: the label, and what it draws. `rm` is the reduced-motion frame. */
type Frame = { t: string; node: React.ReactNode; rm?: boolean };

const WHITE = "color-mix(in oklab, var(--on-sel) 22%, transparent)";

/** A row of the board: what happens, the token it uses, four moments of it and the reduced-motion frame. */
function Row({ name, token, per, frames }: { name: string; token: string; per?: string; frames: Frame[] }) {
  const t = MOTION.find((m) => m.name === token);
  return (
    <div className="tk-mrow">
      <div className="tk-mrow__n">
        {name}
        <span>
          {token} · {per ?? `${t?.ms} ms`}
        </span>
      </div>
      {frames.map((f) => (
        <div key={f.t} className={f.rm ? "tk-fr tk-fr--rm" : "tk-fr"}>
          <span className="tk-fr__t">{f.t}</span>
          {f.node}
        </div>
      ))}
    </div>
  );
}

/** Frames of a motion that eases from nothing to everything over a token's duration. */
const eased = (token: string, times: number[], draw: (p: number) => React.ReactNode, reduced: { t: string; p?: number }): Frame[] => [
  ...times.map((ms) => ({ t: String(ms), node: draw(progressAt(token, ms)) })),
  { t: reduced.t, node: draw(reduced.p ?? 1), rm: true },
];

const row = (p: number): React.CSSProperties => ({
  opacity: p,
  transform: `translateY(${(-6 * (1 - p)).toFixed(1)}px)`,
  display: "flex",
  alignItems: "center",
  gap: 8,
});

function Arrive({ p }: { p: number }) {
  return (
    <div style={row(p)}>
      <span className="ev__g ev__g--info" style={{ width: 22, height: 22 }}>
        <Glyph name="mail" />
      </span>
      <span className="tk-bar" style={{ flex: 1, background: "var(--ink-3)", opacity: 0.35 }} />
    </div>
  );
}

function Sheet({ p }: { p: number }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `color-mix(in oklab, var(--ink) ${(36 * p).toFixed(0)}%, transparent)` }} />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: "46%",
          background: "var(--surface)",
          boxShadow: "-8px 0 16px -8px color-mix(in oklab, var(--ink) 30%, transparent)",
          opacity: p,
          transform: `translateX(${(32 * (1 - p)).toFixed(0)}px)`,
          padding: 10,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span className="tk-bar" style={{ width: "70%" }} />
        <span className="tk-bar" />
        <span className="tk-bar" style={{ width: "50%" }} />
      </div>
    </>
  );
}

function Pane({ p }: { p: number }) {
  return (
    <>
      <div className="tk-blk" style={{ height: 18, width: "70%" }} />
      <div style={{ opacity: p, transform: `translateY(${(4 * (1 - p)).toFixed(0)}px)`, display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="tk-bar" />
        <span className="tk-bar" style={{ width: "60%" }} />
      </div>
    </>
  );
}

/** A step ticking off: the circle fills and overshoots a little, then the bar settles. */
function Step({ scale, filled, bar }: { scale: number; filled: boolean; bar: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 99,
          boxShadow: "inset 0 0 0 1.5px var(--line-strong)",
          background: filled ? "var(--tm-ok-dot)" : "transparent",
          transform: `scale(${scale})`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--on-sel)",
        }}
      >
        <Glyph name="check" size="sm" />
      </span>
      <span className="tk-bar" style={{ flex: 1, opacity: bar }} />
    </div>
  );
}

function Pages({ done, percent }: { done: number; percent: number }) {
  return (
    <>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <i
            key={i}
            style={{
              flex: 1,
              height: 26,
              borderRadius: 3,
              background: i < done ? "var(--ink)" : "var(--tray)",
              boxShadow: "inset 0 0 0 1px var(--line)",
            }}
          />
        ))}
      </div>
      <span className="track">
        <i style={{ width: `${percent}%`, background: "var(--action)", animation: "none" }} />
      </span>
    </>
  );
}

function Joins({ p }: { p: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Pres>
        <Face person={P.rudo} size={24} />
      </Pres>
      <span style={{ marginLeft: -6 }}>
        <Pres>
          <Face person={P.kuda} size={24} />
        </Pres>
      </span>
      <span style={{ marginLeft: -6, opacity: p, transform: `scale(${(0.6 + 0.4 * p).toFixed(2)})` }}>
        <Pres>
          <Face person={P.tinashe} size={24} />
        </Pres>
      </span>
    </div>
  );
}

function Bell({ scale, count }: { scale: number; count: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <span className="ibtn" style={{ position: "relative" }}>
        <Glyph name="bell" />
        <span className="ibtn__badge" style={{ transform: `scale(${scale})`, animation: "none" }}>
          {count}
        </span>
      </span>
    </div>
  );
}

function Seat({ members, held, label }: { members: number; held: number; label: string }) {
  return (
    <span className="seats">
      <SeatMeter used={members + held} held={held} limit={5} />
      <span className="seats__t">{label}</span>
    </span>
  );
}

function CallStrip({ p }: { p: number }) {
  return (
    <>
      <div
        style={{
          opacity: p,
          transform: `translateY(${(-8 * (1 - p)).toFixed(0)}px)`,
          height: 30,
          borderRadius: 8,
          background: "var(--ink)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 8px",
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 99, background: WHITE }} />
        <span style={{ flex: 1, height: 6, borderRadius: 99, background: WHITE }} />
        <span style={{ width: 26, height: 16, borderRadius: 5, background: "var(--bad)" }} />
      </div>
      <span className="tk-bar" />
    </>
  );
}

/** K8: motion. Frames are drawn from each token's own duration and easing, so the sheet cannot drift from the code. */
export function K8() {
  return (
    <Board id="K8">
      <div className="tk-k7">
        <div className="tk-mrow tk-mrow--h">
          <h2 className="tk-h" style={{ margin: 0 }}>
            Motion
          </h2>
          <span>Frames</span>
          <span />
          <span />
          <span />
          <span>Reduced motion</span>
        </div>
        <Row name="An event arrives" token="arrive" frames={eased("arrive", [0, 90, 180, 260], (p) => <Arrive p={p} />, { t: "fade 120" })} />
        <Row name="A sheet opens" token="sheet" frames={eased("sheet", [0, 90, 190, 280], (p) => <Sheet p={p} />, { t: "fade 120" })} />
        <Row name="The panel switches" token="pane" frames={eased("pane", [0, 70, 140, 200], (p) => <Pane p={p} />, { t: "none" })} />
        <Row
          name="A step completes"
          token="fill"
          frames={[
            { t: "0", node: <Step scale={1} filled={false} bar={1} /> },
            { t: "120", node: <Step scale={0.7} filled bar={1} /> },
            { t: "240", node: <Step scale={1.1} filled bar={0.7} /> },
            { t: "700", node: <Step scale={1} filled bar={0.45} /> },
            { t: "none", node: <Step scale={1} filled bar={0.45} />, rm: true },
          ]}
        />
        <Row
          name="Vane reads"
          token="fill"
          per="per page"
          frames={[
            { t: "page 1", node: <Pages done={1} percent={16} /> },
            { t: "page 3", node: <Pages done={3} percent={50} /> },
            { t: "page 5", node: <Pages done={5} percent={83} /> },
            { t: "page 6", node: <Pages done={6} percent={100} /> },
            { t: "none", node: <Pages done={6} percent={100} />, rm: true },
          ]}
        />
        <Row name="Someone joins" token="arrive" frames={eased("arrive", [0, 90, 180, 260], (p) => <Joins p={p} />, { t: "fade 120" })} />
        <Row
          name="A badge counts"
          token="pop"
          frames={[
            { t: "0", node: <Bell scale={1} count={2} /> },
            { t: "60", node: <Bell scale={1.25} count={3} /> },
            { t: "110", node: <Bell scale={1.08} count={3} /> },
            { t: "160", node: <Bell scale={1} count={3} /> },
            { t: "none", node: <Bell scale={1} count={3} />, rm: true },
          ]}
        />
        <Row
          name="A seat fills"
          token="fill"
          frames={[
            { t: "0", node: <Seat members={4} held={0} label="4 of 5" /> },
            { t: "200", node: <Seat members={4} held={1} label="5 of 5" /> },
            { t: "450", node: <Seat members={5} held={0} label="5 of 5" /> },
            { t: "700", node: <Seat members={5} held={0} label="5 of 5" /> },
            { t: "none", node: <Seat members={5} held={0} label="5 of 5" />, rm: true },
          ]}
        />
        <Row name="A call starts" token="arrive" frames={eased("arrive", [0, 90, 180, 260], (p) => <CallStrip p={p} />, { t: "fade 120" })} />

        <h2 className="tk-h">Tokens</h2>
        <div className="tk-tok">
          <div className="tk-tok__r tk-tok__r--h">
            <span>Name</span>
            <span>Duration</span>
            <span>Easing</span>
            <span>Used for</span>
            <span>Reduced motion</span>
          </div>
          {MOTION.map((m) => (
            <div key={m.name} className="tk-tok__r">
              <code>{m.name}</code>
              <span>
                {m.ms} ms{m.loop ? " loop" : ""}
              </span>
              <code>{m.easing}</code>
              <span>{m.usedFor}</span>
              <span className="muted">{m.reduced}</span>
            </div>
          ))}
        </div>
      </div>
    </Board>
  );
}
