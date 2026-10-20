"use client";

import * as React from "react";

import {
  Attachments,
  Bubble,
  CallSummary,
  ChangeStack,
  Diff,
  FileChip,
  Lines,
  Mention,
  MoneyCard,
  PlaceCard,
  Photos,
  RecordCard,
  RollTable,
  RollToggle,
  StagePath,
  State,
  WhatsAppThread,
} from "@/components/teams/timeline/bodies";
import { MarkBrand, MarkFace, MarkIcon, MarkWorkspace, Ref, Src, TimelineRow } from "@/components/teams/timeline/row";

import { Board, Cell, Grid, Rule, TlFrame, Top } from "./board";
import { P } from "./fixtures";

const changes = [
  { field: "Value", from: "US$4,850.00", to: "US$5,450.00" },
  { field: "Finish", from: "White gloss", to: "Oak" },
  { field: "Fitting date", from: "Fri 6 Nov", to: "Fri 13 Nov" },
];

const sales: Array<[string, string, string, string]> = [
  ["S-10470", "07:34", "Cash", "US$18.40"],
  ["S-10471", "07:52", "EcoCash", "US$6.20"],
  ["S-10474", "08:15", "Cash", "US$42.00"],
  ["S-10476", "08:41", "Cash", "US$11.50"],
  ["S-10480", "09:20", "EcoCash", "US$27.90"],
];

/** K3: the anatomy of a timeline row: what it is made of, what it carries, three densities, grouping. */
export function K3() {
  return (
    <Board id="K3">
      <Top title="The row">
        <Grid cols={3}>
          <Cell name="Icon">
            <TlFrame>
              <TimelineRow mark={<MarkIcon name="send" tone="info" />} time="16 Oct 08:06">
                <b>Q-0088</b> delivered to Dr Precious Mutasa <Src>by WhatsApp</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Face">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.tinashe} />}
                time="10:12"
                body={
                  <Bubble>
                    <Mention>@Rudo Mapfumo</Mention> the client wants oak instead of white gloss. Adds about US$600 in board and
                    edging.
                  </Bubble>
                }
              >
                <b>Tinashe Gumbo</b> commented <Src>from his phone</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Brand">
            <TlFrame>
              <TimelineRow
                state="outside"
                mark={<MarkBrand brand="whatsapp" />}
                time="17 Oct 11:34"
                body={<Bubble>Could fitting be the week of 9 November? We close for two days then.</Bubble>}
              >
                <b>Dr Precious Mutasa</b> sent a message <Src>by WhatsApp</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Workspace">
            <TlFrame>
              <TimelineRow
                mark={
                  <MarkWorkspace>
                    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="currentColor" d="M5 3h4v8l7-8h5l-8 8.6L21 21h-5l-5.5-6.6L9 16.3V21H5z" />
                    </svg>
                  </MarkWorkspace>
                }
                time="1 Sep"
              >
                <b>Kuda Interiors</b> started a Pabasa trial <Src>14 days</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="The line" span={2}>
            <TlFrame>
              <TimelineRow mark={<MarkFace person={P.rudo} />} time="10:40" body={<Diff from="US$4,850.00" to="US$5,450.00" />}>
                <b>Rudo Mapfumo</b> changed the value of <Ref>J-0142</Ref> <Src>from her computer</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
        </Grid>
      </Top>

      <Top title="What an event carries">
        <Grid cols={3}>
          <Cell name="Documents">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.tinashe} />}
                time="14 Oct"
                body={
                  <Attachments>
                    <FileChip icon="doc" meta="1.2 MB">
                      Reception floor plan.pdf
                    </FileChip>
                    <FileChip icon="image">6 site photos</FileChip>
                  </Attachments>
                }
              >
                <b>Tinashe</b> added 2 documents
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="A record">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.rudo} />}
                time="15 Oct 16:20"
                body={
                  <RecordCard
                    title="Quote Q-0088"
                    sub="Msasa Dental Studio · 7 lines"
                    amount="US$4,850.00"
                    state={<State tone="info">Opened</State>}
                  />
                }
              >
                <b>Rudo</b> made a quote
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Money">
            <TlFrame>
              <TimelineRow
                mark={<MarkIcon name="coins" tone="ok" />}
                time="5 Oct 14:12"
                body={
                  <MoneyCard
                    amount="US$1,920.00"
                    how="by CBZ transfer"
                    percent={60}
                    left="60% of US$3,200.00"
                    right="US$1,280.00 left, due Mon 26 Oct"
                  />
                }
              >
                <b>Highlands Guest Lodge</b> paid the deposit on <Ref>INV-0064</Ref>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Photos">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.tinashe} />}
                time="14 Oct 09:41"
                body={<Photos tones={["a", "b", "c", "d"]} more={2} />}
              >
                <b>Tinashe</b> added 6 photos to <Ref>V-0057</Ref>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Place">
            <TlFrame>
              <TimelineRow
                mark={<MarkIcon name="pin" tone="info" />}
                time="14 Oct 09:10"
                body={
                  <PlaceCard
                    title="Msasa Dental Studio"
                    lines={["Msasa, Harare · 18 m from the pin", "In 09:10 · out 10:02 · 52 min"]}
                  />
                }
              >
                <b>Tinashe</b> checked in at Msasa Dental Studio
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Call">
            <TlFrame>
              <TimelineRow
                mark={<MarkIcon name="phone" tone="ok" />}
                time="10:31"
                body={
                  <CallSummary>
                    <b>Agreed:</b> oak instead of white gloss, about US$600 more in board and edging. Rudo revises the quote;
                    fitting moves a week.
                  </CallSummary>
                }
              >
                <b>Rudo</b> called <b>Tinashe</b> about this job <Src>9 min</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="A conversation from outside">
            <TlFrame>
              <TimelineRow
                mark={<MarkBrand brand="whatsapp" />}
                time="13 Oct 13:55"
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
          </Cell>
          <Cell name="Lines of a sale">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.rumbidzai} />}
                time="09:58"
                body={
                  <Lines
                    rows={[
                      ["20", "Cement 32.5R, 50 kg", "US$11.50", "US$230.00"],
                      ["10", "Y12 rebar, 6 m", "US$9.80", "US$98.00"],
                      ["2", "River sand, tonne", "US$45.00", "US$90.00"],
                      ["1", "Binding wire, 25 kg", "US$68.00", "US$68.00"],
                    ]}
                    total={["S-10482 · on account, 30 days", "US$486.00"]}
                  />
                }
              >
                <b>Rumbidzai</b> sold to <Ref>Mavhima Construction</Ref> on account <Src>Till 1</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="A field change">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.rudo} />}
                time="16 Oct 08:05"
                body={<StagePath from="Site visit" to="Quote out" />}
              >
                <b>Rudo</b> changed the stage
              </TimelineRow>
            </TlFrame>
          </Cell>
        </Grid>
      </Top>

      <Top title="Three densities">
        <Grid cols={3}>
          <Cell name="Compact">
            <TlFrame>
              <TimelineRow density="compact" mark={<MarkFace person={P.tinashe} />} time="14 Oct">
                <b>Tinashe</b> logged site visit <Ref>V-0057</Ref> at Msasa Dental Studio <Src>6 photos, 1 plan</Src>
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkFace person={P.rudo} />} time="15 Oct">
                <b>Rudo</b> made quote <Ref>Q-0088</Ref> · US$4,850.00
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkIcon name="send" tone="info" />} time="16 Oct">
                <b>Q-0088</b> delivered to Dr Precious Mutasa
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Standard">
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
                <b>Tinashe</b> logged site visit <Ref>V-0057</Ref> at Msasa Dental Studio
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Expanded">
            <TlFrame>
              <TimelineRow
                density="expanded"
                mark={<MarkFace person={P.tinashe} />}
                time="14 Oct 09:10"
                body={
                  <>
                    <Bubble size="sm">
                      Wall 4.2 m, return 1.8 m. The power point behind the counter has to move. Client prefers the drawers on the
                      left.
                    </Bubble>
                    <Photos tones={["plan", "a", "b"]} more={4} />
                    <PlaceCard compact title="52 min on site" lines={["In 09:10 · out 10:02"]} />
                  </>
                }
              >
                <b>Tinashe</b> logged site visit <Ref>V-0057</Ref> at Msasa Dental Studio <Src>from his phone</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
        </Grid>
      </Top>

      <Top title="Grouping">
        <Grid cols={3}>
          <Cell name="Several changes by one person">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.rudo} />}
                time="10:40"
                body={<ChangeStack title="Value, finish and fitting date" changes={changes} />}
              >
                <b>Rudo</b> changed 3 fields on <Ref>J-0142</Ref>
              </TimelineRow>
              <div style={{ height: 10 }} />
              <Rule />
              <TimelineRow
                mark={<MarkFace person={P.rudo} />}
                time="10:40"
                body={<ChangeStack open title="Value, finish and fitting date" changes={changes} />}
              >
                <b>Rudo</b> changed 3 fields on <Ref>J-0142</Ref>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Sales at a till">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.tendai} />}
                time="10:15"
                body={<RollToggle>Show 14 sales</RollToggle>}
              >
                <b>Tendai Chari</b> made 14 sales on Till 2 <Src>07:30 to 10:15</Src> · <span className="ev__amt">US$412.50</span>
              </TimelineRow>
              <Rule />
              <TimelineRow
                mark={<MarkFace person={P.tendai} />}
                time="10:15"
                body={<RollTable rows={sales} foot="9 more · US$306.50" />}
              >
                <b>Tendai Chari</b> made 14 sales on Till 2 <Src>07:30 to 10:15</Src> · <span className="ev__amt">US$412.50</span>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="A person's words always stand apart">
            <TlFrame>
              <TimelineRow
                mark={<MarkFace person={P.tinashe} />}
                time="10:12"
                body={<Bubble>The client wants oak instead of white gloss.</Bubble>}
              >
                <b>Tinashe</b> commented
              </TimelineRow>
              <TimelineRow
                mark={<MarkFace person={P.tinashe} />}
                time="10:14"
                body={<Bubble>And the drawers on the left, not the right.</Bubble>}
              >
                <b>Tinashe</b> commented
              </TimelineRow>
            </TlFrame>
          </Cell>
        </Grid>
      </Top>
    </Board>
  );
}
