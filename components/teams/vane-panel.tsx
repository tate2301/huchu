"use client";

import * as React from "react";

import { VaneMark } from "@/components/core/vane-mark";
import { Button } from "@/components/workspace/button";

import { Glyph } from "./glyph";
import { PanelSection } from "./panel";
import { Teams } from "./teams-root";

/** When Vane is open it takes the panel's place: what it is doing now, what it found here, what it found elsewhere. */
export function VanePanel({
  working,
  onPause,
  onClose,
  children,
}: {
  working?: { doing: string; done: number; total: number; unit: string };
  onPause?: () => void;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Teams>
      <aside className="pn">
        <div className="pn__head" style={{ paddingLeft: "var(--tm-s4)" }}>
          <VaneMark size={20} />
          <span className="strong">Vane</span>
          {working ? (
            <>
              <span className="live-d" style={{ marginLeft: 2 }} />
              <span className="muted">Working</span>
            </>
          ) : null}
          <span className="spacer" />
          {working ? (
            <Button variant="ghost" onClick={onPause} style={{ height: 28 }}>
              Pause
            </Button>
          ) : null}
          <button type="button" className="ibtn" aria-label="Close Vane" onClick={onClose}>
            <Glyph name="x" size="sm" />
          </button>
        </div>
        <div className="pn__body">
          <PanelSection gap="wide">
            {working ? (
              <div className="vp__now">
                <div className="vc__k">Now</div>
                <div style={{ color: "var(--ink)" }}>{working.doing}</div>
                <div className="track">
                  <i style={{ width: `${Math.round((working.done / working.total) * 100)}%`, background: "var(--action)" }} />
                </div>
                <div className="muted" style={{ fontSize: "var(--tm-t-cap)" }}>
                  {working.done} of {working.total} {working.unit}
                </div>
              </div>
            ) : null}
            {children}
          </PanelSection>
          <div className="pn__foot" style={{ padding: "var(--tm-s3) var(--tm-s4)" }}>
            <div className="vask" style={{ flex: 1 }}>
              <VaneMark size={16} />
              <span>Give Vane a job</span>
            </div>
          </div>
        </div>
      </aside>
    </Teams>
  );
}

export function VaneGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="pn__label" style={{ marginTop: 4 }}>
        {label}
      </div>
      {children}
    </>
  );
}
