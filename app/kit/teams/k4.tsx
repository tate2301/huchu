"use client";

import * as React from "react";

import {
  Bubble,
  CallSummary,
  Diff,
  EventActions,
  EventButton,
  MailThread,
  MoneyCard,
  PlaceCard,
  Photos,
  RecordCard,
  StagePath,
  State,
  WhatsAppThread,
} from "@/components/teams/timeline/bodies";
import { TimelineHead } from "@/components/teams/timeline/parts";
import { MarkBrand, MarkFace, MarkIcon, MarkVane, Ref, Src, TimelineRow } from "@/components/teams/timeline/row";

import { Board, Grid, TlFrame, Top } from "./board";
import { P } from "./fixtures";

const b500 = { color: "var(--ink)", fontWeight: 500 } as const;

/** K4: each module's own events, in Pabasa (sales) and Books. */
export function K4() {
  return (
    <Board id="K4">
      <Top title="Sales, in Pabasa">
        <Grid cols={3}>
          <TlFrame>
            <TimelineHead title="J-0142 Reception counter and cabinets" sub="this week" />
            <TimelineRow
              mark={<MarkIcon name="phone" tone="ok" />}
              time="Today 10:31"
              body={
                <CallSummary>
                  <b>Agreed:</b> oak instead of white gloss, about US$600 more. Rudo revises the quote; fitting moves a week.
                </CallSummary>
              }
            >
              <b>Rudo</b> called <b>Tinashe</b> about this job <Src>9 min</Src>
            </TimelineRow>
            <TimelineRow mark={<MarkFace person={P.precious} />} time="Sat 11:30">
              <b>Dr Precious Mutasa</b> opened <b>Q-0088</b> <Src>client portal, 4 min</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkIcon name="send" tone="info" />}
              time="Fri 08:05"
              body={
                <RecordCard
                  title="Quote Q-0088"
                  sub="7 lines · white gloss"
                  amount="US$4,850.00"
                  state={<State tone="calm">Delivered 08:06</State>}
                />
              }
            >
              <b>Rudo</b> sent <b>Q-0088</b> to Dr Precious Mutasa <Src>by WhatsApp</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.rudo} />}
              time="Fri 08:05"
              body={<StagePath from="Site visit" to="Quote out" />}
            >
              <b>Rudo</b> moved the job on
            </TimelineRow>
            <TimelineRow mark={<MarkIcon name="check" tone="ok" />} time="Wed 10:02">
              <b>Tinashe</b> ticked off <b>Measure the reception</b> <Src>from his phone</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.tinashe} />}
              time="Wed 09:10"
              body={
                <>
                  <Photos tones={["plan", "a", "b", "c"]} more={3} />
                  <PlaceCard
                    title="Msasa Dental Studio"
                    lines={["Msasa, Harare · 18 m from the pin", "In 09:10 · out 10:02"]}
                  />
                </>
              }
            >
              <b>Tinashe</b> logged site visit <Ref>V-0057</Ref>
            </TimelineRow>
          </TlFrame>

          <TlFrame>
            <TimelineHead title="J-0142, how it started" sub="Tuesday 13 October" />
            <TimelineRow
              mark={<MarkIcon name="mail" tone="info" />}
              time="15:41"
              body={
                <MailThread
                  subject="Measuring for the reception counter"
                  messages={[
                    { person: P.precious, time: "15:20", text: "What time suits you for measuring this week?", incoming: true },
                    {
                      person: P.rudo,
                      time: "15:41",
                      text: "Tinashe can come tomorrow at 09:00. He needs about an hour.",
                    },
                  ]}
                />
              }
            >
              <b>Dr Precious Mutasa</b> and <b>Rudo</b> by email <Src>2 emails</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.rudo} />}
              time="14:02"
              body={<StagePath from="Enquiry" to="Site visit" />}
            >
              <b>Rudo</b> turned enquiry <b>E-0311</b> into job <b>J-0142</b>
            </TimelineRow>
            <TimelineRow
              mark={<MarkBrand brand="whatsapp" />}
              time="13:55"
              body={
                <WhatsAppThread
                  messages={[
                    { text: "Hello, do you make reception counters? We are refitting our front desk.", time: "13:48" },
                    { text: "We do. Can you send a photo of the space?", time: "13:55", out: true },
                  ]}
                />
              }
            >
              <b>Dr Precious Mutasa</b> and <b>Rudo</b> on WhatsApp <Src>2 messages</Src>
            </TimelineRow>
          </TlFrame>

          <TlFrame>
            <TimelineHead title="J-0129 Fitted wardrobes, 6 rooms" sub="Highlands Guest Lodge" />
            <TimelineRow
              mark={<MarkIcon name="flag" />}
              time="5 Oct 14:12"
              body={<StagePath from="Quote out" to="Deposit paid" />}
            >
              <b>J-0129</b> moved on when the deposit came in
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.rudo} />}
              time="2 Oct 09:15"
              body={
                <RecordCard
                  title="Invoice INV-0064"
                  sub="Deposit 60% before cutting"
                  amount="US$3,200.00"
                  state={<State tone="wait">Owed</State>}
                />
              }
            >
              <b>Rudo</b> made the deposit invoice <Ref>INV-0064</Ref>
            </TimelineRow>
            <TimelineRow
              state="outside"
              mark={<MarkIcon name="person" />}
              time="1 Oct 16:48"
              body={
                <RecordCard
                  title="Quote Q-0081"
                  sub="6 rooms · white oak veneer"
                  amount="US$3,200.00"
                  state={<State tone="calm">Accepted</State>}
                />
              }
            >
              <b>Mrs Chido Marufu</b> accepted <b>Q-0081</b> <Src>client portal, signed</Src>
            </TimelineRow>
            <TimelineRow mark={<MarkIcon name="send" tone="info" />} time="28 Sep 10:12">
              <b>Rudo</b> sent <b>Q-0081</b> to Mrs Chido Marufu <Src>by email</Src>
            </TimelineRow>
          </TlFrame>
        </Grid>
      </Top>

      <Top title="Books">
        <Grid cols={3}>
          <TlFrame>
            <TimelineHead title="INV-0064 Highlands Guest Lodge" sub="Books" />
            <TimelineRow
              mark={<MarkIcon name="coins" tone="ok" />}
              time="5 Oct 14:12"
              body={
                <MoneyCard
                  amount="US$1,920.00"
                  how="60% of US$3,200.00"
                  percent={60}
                  left="US$1,280.00 left"
                  right="Due on fitting, Mon 26 Oct"
                />
              }
            >
              <b>Highlands Guest Lodge</b> paid the deposit <Src>CBZ transfer</Src>
            </TimelineRow>
            <TimelineRow mark={<MarkIcon name="eye" />} time="3 Oct 08:20">
              <b>Mrs Chido Marufu</b> viewed the invoice <Src>client portal, 2 min</Src>
            </TimelineRow>
            <TimelineRow mark={<MarkIcon name="send" tone="info" />} time="2 Oct 09:16">
              <b>Rudo</b> sent the invoice to Mrs Chido Marufu <Src>by WhatsApp and email</Src>
            </TimelineRow>
            <TimelineRow mark={<MarkIcon name="seal" tone="ok" />} time="2 Oct 09:15">
              Fiscalised with ZIMRA <Src>fiscal device FD-01, receipt 0412/1842</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.rudo} />}
              time="2 Oct 09:15"
              body={
                <MoneyCard
                  amount="US$3,200.00"
                  how="6 rooms, fitted wardrobes"
                  left="Deposit US$1,920.00 before cutting · US$1,280.00 on fitting"
                />
              }
            >
              <b>Rudo</b> issued the invoice from <b>Q-0081</b>
            </TimelineRow>
          </TlFrame>

          <TlFrame>
            <TimelineHead title="INV-0060 Avondale Pharmacy" sub="Books" />
            <TimelineRow
              mark={<MarkIcon name="coins" tone="ok" />}
              time="2 Oct 11:05"
              body={
                <MoneyCard
                  amount="US$740.00"
                  how="Paid in full"
                  percent={100}
                  left="US$860.00 less credit note CN-0007"
                  right="Nothing owed"
                />
              }
            >
              <b>Avondale Pharmacy</b> paid in full <Src>InnBucks</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.rudo} />}
              time="29 Sep 15:10"
              body={
                <>
                  <Bubble size="sm">Scratched drawer front. Replaced at no charge.</Bubble>
                  <Diff from="Owed US$860.00" to="Owed US$740.00" />
                </>
              }
            >
              <b>Rudo</b> made credit note <b>CN-0007</b> · US$120.00
            </TimelineRow>
            <TimelineRow
              mark={<MarkIcon name="send" tone="info" />}
              time="28 Sep 08:00"
              body={
                <Bubble size="sm">
                  Good morning. INV-0060 for the shop counter, US$860.00, was due on 21 September. You can pay by InnBucks,
                  EcoCash or transfer.
                </Bubble>
              }
            >
              <b>Rudo</b> sent a reminder <Src>by WhatsApp, 7 days late, drafted by Vane</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.rudo} />}
              time="14 Sep 10:30"
              body={
                <RecordCard
                  title="Invoice INV-0060"
                  sub="Shop counter, fitted"
                  amount="US$860.00"
                  state={<State tone="calm">Issued</State>}
                />
              }
            >
              <b>Rudo</b> issued the invoice <Src>due 21 Sep</Src>
            </TimelineRow>
          </TlFrame>

          <TlFrame>
            <TimelineHead title="CBZ business account" sub="Books · bank" />
            <TimelineRow
              state="vane"
              mark={<MarkVane />}
              time="5 Oct 14:31"
              body={
                <>
                  <RecordCard tight icon="bank" title="Service fee" sub="5 Oct · no invoice or bill" amount="−US$2.40" />
                  <EventActions>
                    <EventButton primary kbd="A">
                      Record as bank charges
                    </EventButton>
                    <EventButton quiet>Not now</EventButton>
                  </EventActions>
                </>
              }
            >
              <b>Vane</b> can&apos;t match a CBZ line <Src>for Rudo</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.rudo} />}
              time="5 Oct 14:30"
              body={
                <RecordCard
                  tight
                  icon="match"
                  title="Highlands Guest Lodge deposit"
                  sub={
                    <>
                      CBZ line, 5 Oct · to <b style={b500}>INV-0064</b>
                    </>
                  }
                  amount="US$1,920.00"
                  state={<State tone="calm">Matched</State>}
                />
              }
            >
              <b>Rudo</b> accepted a match <Src>found by Vane</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.rudo} />}
              time="2 Oct 15:02"
              body={
                <RecordCard
                  tight
                  icon="match"
                  title="InnBucks settlement"
                  sub={
                    <>
                      CBZ line, 2 Oct · to <b style={b500}>INV-0060</b>
                    </>
                  }
                  amount="US$740.00"
                  state={<State tone="calm">Matched</State>}
                />
              }
            >
              <b>Rudo</b> accepted a match <Src>found by Vane</Src>
            </TimelineRow>
          </TlFrame>
        </Grid>
      </Top>
    </Board>
  );
}
