"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";

import { WhatsAppMark } from "./brand-marks";
import { Face } from "./face";
import { Glyph } from "./glyph";
import { SeatMeter } from "./members";
import { Teams } from "./teams-root";
import "./w-people.css";

/**
 * The failure cells of W4, W2 and W7 as the boards draw them, with the data the boards use (world.json).
 * Each says what happened, what still works, and gives one button as the way out. The real screens raise
 * these through `use-people`, the join page and the invite link page; these are for the fixture routes.
 */

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="wp-cell__t">{title}</div>
      <div className="wp-cell__c">{children}</div>
    </div>
  );
}

function Who({ name, sub, end }: { name: string; sub: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="wp-cell__r">
      <Face person={{ name }} size={32} />
      <div>
        <div style={{ color: "var(--ink)", fontWeight: 600 }}>{name}</div>
        <div className="muted">{sub}</div>
      </div>
      {end}
    </div>
  );
}

export function W4Failures() {
  return (
    <Teams>
      <div className="wp-cells">
        <Cell title="Only the owner can">
          <Who name="Gerald Pondai" sub="gerald@corelith.co.zw" />
          <span className="wp-lock" style={{ alignSelf: "flex-start" }}>
            <Glyph name="shield" size="sm" /> Admin <Glyph name="lock" size="sm" />
          </span>
          <Button icon={<Glyph name="chat" />} style={{ alignSelf: "flex-start" }}>Ask Sean</Button>
        </Cell>
        <Cell title="Two admins at once">
          <div className="wp-prow" style={{ borderBottom: 0 }}>
            <div className="wp-prow__t">Delete deals and clients</div>
            <div className="tri" role="group" aria-label="Delete deals and clients">
              <button type="button" className="is-default" aria-pressed="false">Role default: no</button>
              <button type="button" aria-pressed="true">Allowed</button>
              <button type="button" aria-pressed="false">Denied</button>
            </div>
          </div>
          <div className="wp-conflict" role="alert">
            <div className="wp-conflict__t">Gerald set Denied at 15:07</div>
            <div className="wp-act">
              <Button>Keep mine</Button>
              <Button>Keep Gerald&apos;s</Button>
            </div>
          </div>
        </Cell>
        <Cell title="The last admin">
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>Suspend Rudo Mapfumo</div>
          <div className="wp-facts">
            <Glyph name="shield" className="i" />
            <span>Admins left</span>
            <b className="wp-bad">None</b>
            <Glyph name="clients" className="i" />
            <span>Seats</span>
            <b>4 of 5 <Glyph name="caret-right" /> 3 of 5</b>
          </div>
          <Button icon={<Glyph name="shield" />} style={{ alignSelf: "flex-start" }}>Make Tinashe an admin first</Button>
        </Cell>
        <Cell title="Open deals to hand over">
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>Remove Munashe Mangwiro</div>
          <div className="wp-work">
            <div>
              <Glyph name="jobs" />
              <span>
                <div className="wp-work__t">3 deals</div>
                <div className="wp-work__s">Black Ivy Media, Gweru Building Centre, Glen View Hardware</div>
              </span>
            </div>
            <div>
              <Glyph name="done" />
              <span>
                <div className="wp-work__t">2 follow-ups</div>
                <div className="wp-work__s">This week</div>
              </span>
            </div>
          </div>
          <label className="wp-fld">
            <span className="wp-fld__l">Hand them to</span>
            <span className="wp-pick">
              <Glyph name="person" />
              <select defaultValue="" aria-label="Hand them to">
                <option value="">Choose someone</option>
                <option>Gerald Pondai</option>
                <option>Tatenda Chinyamakobvu</option>
              </select>
            </span>
          </label>
        </Cell>
        <Cell title="His phone is offline">
          <div className="wp-cell__r">
            <Face person={{ name: "Tatenda" }} size={28} />
            <div><b style={{ color: "var(--ink)" }}>Tatenda</b> allowed him to see every deal</div>
            <span className="muted">15:06</span>
          </div>
          <div className="wp-cell__r">
            <Glyph name="offline" />
            <div>
              <div style={{ color: "var(--ink)", fontWeight: 500 }}>Not on his phone yet</div>
              <div className="muted">Last here 14:20</div>
            </div>
          </div>
          <Button icon={<WhatsAppMark />} style={{ alignSelf: "flex-start" }}>Message Simbarashe</Button>
        </Cell>
        <Cell title="The offer lapses">
          <Who name="Tatenda Chinyamakobvu" sub="Admin" end={<span className="wp-pill-warn">Offer lapsed 26 Oct</span>} />
          <Button icon={<Glyph name="crown" />} style={{ alignSelf: "flex-start" }}>Offer again</Button>
        </Cell>
      </div>
    </Teams>
  );
}

export function W2Failures() {
  return (
    <Teams>
      <div className="wp-cells">
        <Cell title="WhatsApp didn't deliver it">
          <Who name="Tariro Mhlanga" sub={<><WhatsAppMark /> +263 77 540 2186 · 11:53</>} end={<span className="wp-pill-bad">Not delivered</span>} />
          <Button icon={<Glyph name="pencil" />} style={{ alignSelf: "flex-start" }}>Change the number</Button>
        </Cell>
        <Cell title="The invite ran out">
          <Who name="Tariro Mhlanga" sub="+263 77 540 2186" end={<span className="muted">Expired 26 Oct 11:53</span>} />
          <Button icon={<WhatsAppMark />} style={{ alignSelf: "flex-start" }}>Send a new invite</Button>
        </Cell>
        <Cell title="Sean said not now">
          <Who name="Tariro Mhlanga" sub="+263 77 540 2186" end={<span className="muted">Sean · not now · 11:55</span>} />
          <Button icon={<Glyph name="x" />} style={{ alignSelf: "flex-start" }}>Remove the invite</Button>
        </Cell>
        <Cell title="The card was declined">
          <div className="wp-facts">
            <Glyph name="card" className="i" />
            <span>Card</span>
            <b className="wp-bad">Visa ending 4417 · declined</b>
            <Glyph name="cal" className="i" />
            <span>Today</span>
            <b>US$25.16</b>
          </div>
          <Button icon={<Glyph name="card" />} style={{ alignSelf: "flex-start" }}>Use another card</Button>
        </Cell>
        <Cell title="She's already in another workspace">
          <div className="wp-cell__r"><span className="wp-ws wp-ws--b">M</span><div><b style={{ color: "var(--ink)" }}>Mhlanga Events</b> <span className="muted">· yours</span></div></div>
          <div className="wp-cell__r"><span className="wp-ws">C</span><div><b style={{ color: "var(--ink)" }}>Corelith</b> <span className="muted">· Field worker</span></div></div>
          <Button variant="primary" style={{ alignSelf: "flex-start" }}>Join Corelith too <span className="kbd">Enter</span></Button>
        </Cell>
      </div>
    </Teams>
  );
}

export function W7Failures() {
  return (
    <Teams>
      <div className="wp-cells">
        <Cell title="Activity offline">
          <div className="wp-cell__r">
            <span className="wp-pill-warn"><Glyph name="offline" size="sm" /> Offline · last updated 17:20</span>
            <span style={{ flex: 1 }} />
            <Button icon={<Glyph name="retry" />}>Try again</Button>
          </div>
          <div className="wp-dim">
            <div className="wp-chg"><Glyph name="crown" /><div className="wp-chg__t"><b>Tatenda</b> became the owner</div><div className="wp-chg__m">15:52</div></div>
            <div className="wp-chg"><Glyph name="lock" /><div className="wp-chg__t"><b>Munashe</b> suspended to 2 Nov</div><div className="wp-chg__m">15:12</div></div>
          </div>
        </Cell>
        <Cell title="WhatsApp not connected">
          <div className="wp-card wp-card--bad">
            <WhatsAppMark />
            <div>
              <div className="wp-card__t">WhatsApp</div>
              <div className="wp-card__s">+263 77 118 9024 · not connected</div>
            </div>
          </div>
          <Button icon={<WhatsAppMark />} style={{ alignSelf: "flex-start" }}>Connect WhatsApp</Button>
        </Cell>
        <Cell title="A link that's off">
          <Who name="Corelith" sub="corelith.co.zw/join/k7Qm2" />
          <div className="wp-bad">This link was turned off at 17:05</div>
          <Button icon={<WhatsAppMark />} style={{ alignSelf: "flex-start" }}>Ask Tatenda for a new one</Button>
        </Cell>
        <Cell title="Joining by address, seats full">
          <div className="wp-cell__r">
            <span className="wp-ws">C</span>
            <div>
              <div style={{ color: "var(--ink)", fontWeight: 600 }}>Corelith is full</div>
              <div className="muted">kundai@corelith.co.zw</div>
            </div>
            <SeatMeter used={6} limit={6} />
            <span className="wp-bad">6 of 6</span>
          </div>
          <Button icon={<Glyph name="user-plus" />} style={{ alignSelf: "flex-start" }}>Ask Tatenda for a seat</Button>
        </Cell>
        <Cell title="A workspace you can't open">
          <div className="wp-cell__r">
            <span className="wp-ws">C</span>
            <div>
              <div style={{ color: "var(--ink)", fontWeight: 600 }}>Corelith</div>
              <div className="wp-bad">Munashe · suspended until Monday 2 November</div>
            </div>
          </div>
          <Button icon={<Glyph name="chat" />} style={{ alignSelf: "flex-start" }}>Message Tatenda</Button>
        </Cell>
        <Cell title="Removed from a workspace">
          <div className="wp-cell__r">
            <span className="wp-ws wp-ws--b">M</span>
            <div>
              <div style={{ color: "var(--ink-3)", fontWeight: 600 }}>Mhlanga Events</div>
              <div className="wp-bad">Rufaro · removed 17:12</div>
            </div>
          </div>
          <Button icon={<Glyph name="x" />} style={{ alignSelf: "flex-start" }}>Take it off your list</Button>
        </Cell>
      </div>
    </Teams>
  );
}
