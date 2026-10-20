"use client";

import * as React from "react";

import { Face } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { WhatsAppMark } from "@/components/teams/brand-marks";
import { Panel, PanelFoot, PanelHead, PanelSection } from "@/components/teams/panel";
import {
  ContactRow,
  FileRow,
  KV,
  KVRow,
  LinkRow,
  NextUp,
  PanelCondition,
  PanelField,
  PanelPair,
  PanelSwitch,
  Position,
  StagePath,
  Tick,
  VaneCard,
} from "@/components/teams/panel-parts";
import { Button } from "@/components/workspace/button";

import { Board } from "./board";
import { P } from "./fixtures";

const record = [
  { id: "details", label: "Details", icon: "tag" as const },
  { id: "comments", label: "Comments", icon: "chat" as const },
];

function Col({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="tk-panel">
      <div className="tk-panel__t">{title}</div>
      <div className="tk-panel__s">{sub}</div>
      {children}
    </div>
  );
}

const A = ({ children }: { children: React.ReactNode }) => (
  <a className="u" href="#k6">
    {children}
  </a>
);

/** K6: the standard right panel on an invoice, a quote, a builder and a client. */
export function K6() {
  return (
    <Board id="K6">
      <div className="tk-panels">
        <Col title="An invoice" sub="INV-0064 in Books, Kuda Interiors">
          <Panel
            head={<PanelHead tabs={[record[0], { ...record[1], note: "1" }]} tab="details" />}
            foot={<PanelFoot made="Made by Rudo, 2 Oct" code="INV-0064" />}
          >
            <PanelSection gap="wide">
              <Position
                label="Owed"
                figure="US$1,280.00"
                of="of US$3,200.00"
                progress={{
                  percent: 60,
                  label: "60% paid",
                  legend: [{ label: "Paid US$1,920.00" }, { label: "Owed US$1,280.00", open: true }],
                }}
              />
              <NextUp
                when="Monday 26 October · on fitting"
                title="The balance falls due when the wardrobes are fitted"
                actions={[
                  { label: "Record a payment", icon: "card", shortcut: "P" },
                  { label: "Move it", icon: "cal" },
                ]}
              />
            </PanelSection>
            <PanelSection title="Vane" count={1}>
              <VaneCard
                kind="suggestion"
                from="Books"
                title="A WhatsApp reminder for the balance is ready for the fitting day"
                body="Mrs Marufu viewed the invoice the morning after it went. The reminder goes when you send it."
                actions={[{ label: "Read the reminder", icon: "eye" }, { label: "Not now", quiet: true }]}
              />
            </PanelSection>
            <PanelSection title="Invoice details" action={{ label: "Who changed what", icon: "history" }}>
              <KV>
                <KVRow icon="building" label="Client" state="hover">
                  <A>Highlands Guest Lodge</A>
                </KVRow>
                <KVRow icon="jobs" label="Job">
                  <A>J-0129</A>&nbsp;Fitted wardrobes
                </KVRow>
                <KVRow icon="cal" label="Issued">
                  Friday 2 October
                </KVRow>
                <KVRow icon="wait" label="Due">
                  On fitting, Monday 26 October
                </KVRow>
                <KVRow icon="tag" label="Terms">
                  60% deposit, balance on fitting
                </KVRow>
                <KVRow icon="receipt" label="Their order" state="empty" />
                <KVRow icon="shield" label="Fiscal receipt" state="locked" lock>
                  <span className="dot" style={{ background: "var(--ok)" }} />
                  Fiscalised, 0412/1842
                </KVRow>
              </KV>
            </PanelSection>
            <PanelSection title="Payments" count={1} action={{ label: "Record", icon: "plus" }}>
              <LinkRow icon="check" tone="ok" title="Deposit by CBZ transfer" sub="5 Oct · matched by Rudo" end={<b>US$1,920.00</b>} />
            </PanelSection>
            <PanelSection title="Linked" count={2}>
              <div>
                <LinkRow href="#k6" icon="doc" title="Quote Q-0081" sub="Signed in the portal, 1 Oct" end={<b>US$3,200.00</b>} />
                <LinkRow href="#k6" icon="jobs" title="Fitted wardrobes, 6 rooms" sub="Job J-0129 · in the workshop" end="5 Oct" />
              </div>
            </PanelSection>
            <PanelSection title="Documents" count={2} defaultOpen={false} />
          </Panel>
        </Col>

        <Col title="A quote" sub="Q-0088 in Pabasa, Kuda Interiors">
          <Panel
            head={<PanelHead tabs={record} tab="details" />}
            foot={<PanelFoot made="Made by Rudo, 15 Oct" code="Q-0088" />}
          >
            <PanelSection gap="wide">
              <Position
                label="Quote total"
                figure="US$4,850.00"
                note="The job is now US$5,450.00 after the change to oak."
              />
              <StagePath steps={4} now={2} label="Opened by the client" sub="17 Oct 11:30 on a phone" />
              <NextUp
                when="Today 14:00 · Rudo"
                title="Call Dr Mutasa about the revised quote"
                actions={[
                  { label: "Call", icon: "phone" },
                  { label: "Move it", icon: "cal" },
                ]}
              />
            </PanelSection>
            <PanelSection title="Vane" count={1}>
              <VaneCard
                kind="issue"
                from="Quotes"
                title="This quote is US$600.00 under the job"
                body="Tinashe's comment at 10:12 moves the counter to oak. I've drafted Q-0089 at US$5,450.00 from your oak prices."
                actions={[{ label: "Open Q-0089", icon: "doc" }, { label: "Not now", quiet: true }]}
              />
            </PanelSection>
            <PanelSection title="Quote details">
              <KV>
                <KVRow icon="building" label="Client">
                  <A>Msasa Dental Studio</A>
                </KVRow>
                <KVRow icon="person" label="Contact">
                  <Face person={P.precious} size={20} />
                  Dr Precious Mutasa
                </KVRow>
                <KVRow icon="jobs" label="Job">
                  <A>J-0142</A>&nbsp;Reception counter
                </KVRow>
                <KVRow icon="share" label="Sent">
                  <WhatsAppMark />
                  By WhatsApp, 16 Oct
                </KVRow>
                <KVRow icon="wait" label="Good until">
                  Sunday 15 November
                </KVRow>
                <KVRow icon="card" label="Deposit">
                  60% to start, US$2,910.00
                </KVRow>
                <KVRow icon="crown" label="Made by">
                  <Face person={P.rudo} size={20} />
                  Rudo Mapfumo
                </KVRow>
              </KV>
            </PanelSection>
            <PanelSection title="What the client did" count={3}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Tick done when="16 Oct 08:06">
                  Delivered on WhatsApp
                </Tick>
                <Tick done when="17 Oct 11:30">
                  Opened, read to the end
                </Tick>
                <Tick>Not accepted yet</Tick>
              </div>
            </PanelSection>
            <PanelSection title="Linked" count={2}>
              <div>
                <LinkRow href="#k6" icon="pin" title="Site visit V-0057" sub="Tinashe · 6 photos and a floor plan" end="14 Oct" />
                <LinkRow href="#k6" icon="inbox" title="Enquiry E-0311" sub="By WhatsApp, became this job" end="13 Oct" />
              </div>
            </PanelSection>
          </Panel>
        </Col>

        <Col title="A builder" sub="The site visit form in Build, Kuda Interiors">
          <Panel
            head={
              <PanelHead
                tabs={[
                  { id: "field", label: "This field", icon: "pencil" },
                  { id: "form", label: "The form", icon: "doc" },
                ]}
                tab="field"
              />
            }
            foot={
              <PanelFoot
                made="Changed by Rudo, 12 Oct · version 4"
                code=""
                action={
                  <Button style={{ height: 28 }}>
                    Publish<span className="kbd">Ctrl S</span>
                  </Button>
                }
              />
            }
          >
            <section className="pn__sec" style={{ gap: "var(--tm-s3)" }}>
              <div className="pos">
                <span className="pn__label">Field 6 of 14</span>
                <div style={{ color: "var(--ink)", fontSize: "var(--tm-t-h3)", fontWeight: 600 }}>Wall length</div>
                <div className="muted">Answered on 14 visits since 1 September</div>
              </div>
              <PanelField label="Label">Wall length</PanelField>
              <PanelPair>
                <PanelField label="Kind of answer">
                  Number
                  <Glyph name="caret-down" size="sm" className="muted" />
                </PanelField>
                <PanelField label="Unit">
                  metres
                  <Glyph name="caret-down" size="sm" className="muted" />
                </PanelField>
              </PanelPair>
              <PanelField label="Help under the box" quiet>
                Along the floor, wall to wall
              </PanelField>
              <PanelSwitch on>Must be answered</PanelSwitch>
              <PanelSwitch on={false}>Allow a photo with it</PanelSwitch>
            </section>
            <PanelSection title="Vane" count={1}>
              <VaneCard
                kind="suggestion"
                from="Build"
                title="Tinashe typed centimetres on 3 of his last 8 visits"
                body="4200 for 4.2 m on V-0057. Showing the unit inside the box would stop it."
                actions={[{ label: "Show the unit", icon: "check" }, { label: "Not now", quiet: true }]}
              />
            </PanelSection>
            <PanelSection title="Show it when">
              <PanelCondition>
                <b>Room</b> is <b>Kitchen</b> or <b>Reception</b>
              </PanelCondition>
              <button type="button" className="pn__act" style={{ margin: "-4px 0 0 -8px", alignSelf: "flex-start" }}>
                <Glyph name="plus" />
                Add a rule
              </button>
            </PanelSection>
            <PanelSection title="Where the answer goes">
              <LinkRow href="#k6" icon="receipt" title="Quote line: worktop" sub="Charged per metre from your prices" end="Quotes" />
              <LinkRow href="#k6" icon="chart" title="Monday board" sub="Metres measured by fitter" end="Reports" />
            </PanelSection>
          </Panel>
        </Col>

        <Col title="A client" sub="Msasa Dental Studio in Pabasa, Kuda Interiors">
          <Panel
            head={<PanelHead tabs={record} tab="details" />}
            foot={<PanelFoot made="Added by Rudo, 13 Oct" code="C-0031" />}
          >
            <PanelSection gap="wide">
              <Position label="Open with them" figure="US$5,450.00" of="1 job" note="Nothing owed. A client since October." />
              <NextUp when="Today 14:00 · Rudo" title="Call Dr Mutasa about the revised quote" actions={[]} />
            </PanelSection>
            <PanelSection title="Contacts" count={1} action={{ label: "Add", icon: "user-plus" }}>
              <ContactRow person={P.precious} sub="Owner · WhatsApp first" call whatsapp />
            </PanelSection>
            <PanelSection title="Client details" action={{ label: "Who changed what", icon: "history" }}>
              <KV>
                <KVRow icon="tag" label="Kind">
                  Dental practice
                </KVRow>
                <KVRow icon="pin" label="Address" state="hover">
                  Msasa, Harare
                </KVRow>
                <KVRow icon="inbox" label="Came in by">
                  <WhatsAppMark />
                  WhatsApp, 13 Oct
                </KVRow>
                <KVRow icon="crown" label="Owner">
                  <Face person={P.rudo} size={20} />
                  Rudo Mapfumo
                </KVRow>
                <KVRow icon="receipt" label="VAT number" state="empty" />
              </KV>
            </PanelSection>
            <PanelSection title="Jobs and money" count={2}>
              <div>
                <LinkRow href="#k6" icon="jobs" title="Reception counter and cabinets" sub="J-0142 · Quote out" end={<b>US$5,450.00</b>} />
                <LinkRow href="#k6" icon="doc" title="Quote Q-0088" sub="Opened 17 Oct" end={<b>US$4,850.00</b>} />
              </div>
            </PanelSection>
            <PanelSection title="Documents" count={2}>
              <FileRow kind="pdf" name="Reception floor plan.pdf" sub="1.2 MB · Tinashe, 14 Oct" end="J-0142" />
              <FileRow kind="img" name="6 site photos" sub="Tinashe, 14 Oct" end="V-0057" />
              <Button icon={<Glyph name="upload" />} style={{ alignSelf: "flex-start" }}>
                Add documents
              </Button>
            </PanelSection>
          </Panel>
        </Col>
      </div>
    </Board>
  );
}
