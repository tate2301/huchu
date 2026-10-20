"use client";

import * as React from "react";

import { Phone, PhoneBar, PhoneTabbar, PhoneTabs } from "@/components/teams/phone";
import {
  Approval,
  Attachments,
  Bubble,
  FileChip,
  MoneyCard,
  Photos,
  PlaceCard,
  RecordCard,
  RollRows,
  StagePath,
} from "@/components/teams/timeline/bodies";
import { Day, MarkFace, MarkIcon, MarkVane, Ref, Src, TimelineRow } from "@/components/teams/timeline/row";

import { Board, Cell, Grid, TlFrame, Top } from "./board";
import { P } from "./fixtures";

const Amt = ({ children }: { children: React.ReactNode }) => <span className="ev__amt">{children}</span>;

/** K5: one payment and one site visit, as each record it touches shows them. */
export function K5() {
  return (
    <Board id="K5">
      <Top title="One payment, on every record it touches">
        <Grid cols={3}>
          <Cell name="On the invoice">
            <TlFrame>
              <TimelineRow
                mark={<MarkIcon name="coins" tone="ok" />}
                time="5 Oct 14:12"
                body={
                  <>
                    <MoneyCard
                      amount="US$1,920.00"
                      how="60% of US$3,200.00"
                      percent={60}
                      left="US$1,280.00 left"
                      right="Due on fitting, Mon 26 Oct"
                    />
                    <div className="ev__acts">
                      <Approval person={P.rudo}>Matched to the CBZ line by Rudo, 14:30</Approval>
                    </div>
                  </>
                }
              >
                <b>Highlands Guest Lodge</b> paid the deposit <Src>CBZ transfer</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="On the client">
            <TlFrame>
              <TimelineRow
                mark={<MarkIcon name="coins" tone="ok" />}
                time="5 Oct 14:12"
                body={
                  <RecordCard
                    tight
                    title="Owes you now"
                    sub="1 invoice · due Mon 26 Oct"
                    amount="US$1,280.00"
                    state={<span className="muted" style={{ fontSize: "var(--tm-t-cap)" }}>was US$3,200.00</span>}
                  />
                }
              >
                Paid <Amt>US$1,920.00</Amt> on <Ref>INV-0064</Ref> <Src>CBZ transfer</Src>
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkIcon name="person" />} time="3 Oct 08:20">
                <b>Mrs Chido Marufu</b> viewed <b>INV-0064</b> <Src>client portal</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="On the job">
            <TlFrame>
              <TimelineRow
                mark={<MarkIcon name="coins" tone="ok" />}
                time="5 Oct 14:12"
                body={
                  <Bubble size="sm" className="bubble--ok">
                    The 60% is in. Cutting can start.
                  </Bubble>
                }
              >
                Deposit paid on <Ref>INV-0064</Ref> · <Amt>US$1,920.00</Amt>
              </TimelineRow>
              <TimelineRow
                mark={<MarkFace person={P.rudo} />}
                time="5 Oct 14:35"
                body={<StagePath from="Deposit paid" to="In the workshop" />}
              >
                <b>Rudo</b> moved the job on
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="In workspace activity">
            <TlFrame>
              <Day first label="Monday 5 October" />
              <TimelineRow density="compact" mark={<MarkFace person={P.rudo} />} time="14:35">
                <b>Rudo</b> moved <b>J-0129</b> to In the workshop
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkVane />} time="14:31">
                <b>Vane</b> couldn&apos;t match a CBZ line of −US$2.40
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkIcon name="coins" tone="ok" />} time="14:30">
                <b>Rudo</b> recorded <Amt>US$1,920.00</Amt> from Highlands Guest Lodge on <b>INV-0064</b>
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkFace person={P.tinashe} />} time="13:52">
                <b>Tinashe</b> commented on <b>J-0131</b>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="As Kudakwashe's notification">
            <div className="tl-frame tl-frame--pad">
              <div className="irow irow--unread" style={{ paddingLeft: "var(--tm-s5)", border: 0, cursor: "default" }}>
                <MarkIcon name="coins" tone="ok" />
                <div style={{ minWidth: 0 }}>
                  <div className="irow__t">
                    <b>Highlands Guest Lodge</b> paid the deposit on <b>INV-0064</b>: US$1,920.00
                  </div>
                  <div className="irow__m">
                    US$1,280.00 left · a job you follow
                    <span className="spacer" />
                    14:30
                  </div>
                </div>
              </div>
            </div>
          </Cell>
        </Grid>
      </Top>

      <Top title="One site visit, on every record it touches">
        <Grid cols={3}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--tm-s5)", minWidth: 0 }}>
            <Cell name="On the job">
              <TlFrame>
                <TimelineRow
                  density="expanded"
                  mark={<MarkFace person={P.tinashe} />}
                  time="14 Oct 09:10"
                  body={
                    <>
                      <Bubble size="sm">
                        Wall 4.2 m, return 1.8 m. The power point behind the counter has to move. Client prefers the drawers on
                        the left.
                      </Bubble>
                      <Photos tones={["plan", "a", "b"]} more={4} />
                      <PlaceCard
                        title="Msasa Dental Studio"
                        lines={["Msasa, Harare · 18 m from the pin", "In 09:10 · out 10:02 · 52 min"]}
                      />
                    </>
                  }
                >
                  <b>Tinashe</b> logged site visit <Ref>V-0057</Ref> <Src>from his phone</Src>
                </TimelineRow>
                <TimelineRow density="compact" mark={<MarkIcon name="check" tone="ok" />} time="14 Oct 10:02">
                  <b>Tinashe</b> ticked off <b>Measure the reception</b>
                </TimelineRow>
              </TlFrame>
            </Cell>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--tm-s5)", minWidth: 0 }}>
            <Cell name="On the client">
              <TlFrame>
                <TimelineRow
                  mark={<MarkFace person={P.tinashe} />}
                  time="14 Oct 09:10"
                  body={
                    <Attachments>
                      <FileChip icon="pin">V-0057</FileChip>
                      <FileChip icon="doc">Floor plan</FileChip>
                      <FileChip icon="image">6 photos</FileChip>
                    </Attachments>
                  }
                >
                  <b>Tinashe</b> visited for <Ref>J-0142 Reception counter and cabinets</Ref>
                </TimelineRow>
              </TlFrame>
            </Cell>
            <Cell name="On Tinashe's member page">
              <TlFrame>
                <Day first label="Wednesday 14 October" count={undefined} />
                <TimelineRow
                  mark={<MarkIcon name="pin" tone="info" />}
                  time="09:10"
                  body={
                    <RollRows
                      cols="72px minmax(0, 1fr) 84px"
                      rows={[
                        ["In", "18 m from the pin", "09:10"],
                        ["Out", "6 photos, 1 plan", "10:02"],
                      ]}
                    />
                  }
                >
                  At <b>Msasa Dental Studio</b> for <b>J-0142</b> <Src>52 min</Src>
                </TimelineRow>
                <TimelineRow density="compact" mark={<MarkIcon name="pin" tone="info" />} time="11:05">
                  At <b>Highlands Guest Lodge</b> for <b>J-0129</b> <Src>1 h 48 min</Src>
                </TimelineRow>
              </TlFrame>
            </Cell>
          </div>
          <Cell name="Phone">
            <Phone>
              <PhoneBar back="Back to jobs" title="J-0142" />
              <div className="pbody">
                <PhoneTabs tabs={[{ label: "Timeline", selected: true }, { label: "Details" }, { label: "Documents", count: 3 }]} />
                <div style={{ padding: "0 var(--tm-s4)" }}>
                  <Day label="Wednesday 14 October" />
                  <TimelineRow mark={<MarkIcon name="check" tone="ok" />} time="10:02">
                    <b>Tinashe</b> ticked off <b>Measure the reception</b>
                  </TimelineRow>
                  <TimelineRow
                    mark={<MarkFace person={P.tinashe} />}
                    time="09:10"
                    body={
                      <>
                        <Bubble size="sm">Wall 4.2 m, return 1.8 m. The power point has to move.</Bubble>
                        <Photos tones={["plan", "a"]} more={5} />
                        <PlaceCard compact title="52 min on site" lines={["In 09:10 · out 10:02"]} />
                      </>
                    }
                  >
                    <b>Tinashe</b> logged site visit <Ref>V-0057</Ref>
                  </TimelineRow>
                  <Day label="Tuesday 13 October" />
                  <TimelineRow mark={<MarkFace person={P.rudo} />} time="14:02">
                    <b>Rudo</b> turned enquiry <b>E-0311</b> into this job
                  </TimelineRow>
                </div>
              </div>
              <PhoneTabbar
                label="Pabasa"
                items={[
                  { label: "For you", icon: "house" },
                  { label: "Jobs", icon: "jobs", current: true },
                  { label: "Visits", icon: "pin" },
                  { label: "Notifications", icon: "bell", count: 1 },
                  { label: "More", icon: "more" },
                ]}
              />
            </Phone>
          </Cell>
        </Grid>
      </Top>
    </Board>
  );
}
