"use client";

import * as React from "react";

import {
  Bubble,
  EventActions,
  EventButton,
  Failure,
  HeldNote,
  Mention,
  PrivateTag,
  RecordCard,
  Sending,
} from "@/components/teams/timeline/bodies";
import { EditedTag, KindFilter, PostBox, RowSkeleton, TimelineEmpty, type PostKind } from "@/components/teams/timeline/parts";
import { Day, MarkBrand, MarkFace, MarkIcon, MarkVane, Src, TimelineRow } from "@/components/teams/timeline/row";

import { Board, Cell, Grid, TlFrame, Top } from "./board";
import { P } from "./fixtures";

/** K3b: the top of a timeline, and every state a row can be in. */
export function K3b() {
  const [kind, setKind] = React.useState<PostKind>("contact");
  const [filter, setFilter] = React.useState("all");
  return (
    <Board id="K3b">
      <Top title="Top of the timeline">
        <Grid cols={3}>
          <div className="tk-span2" style={{ display: "flex", flexDirection: "column", gap: "var(--tm-s5)" }}>
            <Cell name="Post">
              <div className="tl-frame tl-frame--pad">
                <PostBox
                  kind={kind}
                  onKindChange={setKind}
                  picks={[
                    { icon: "phone", label: "How", value: "Phone call" },
                    { icon: "person", label: "With", value: "Dr Precious Mutasa" },
                    { icon: "clock", label: "When", value: "Today 11:05" },
                    { icon: "cal", label: "Follow up", value: "Wed 21 Oct" },
                  ]}
                  action={
                    kind === "contact"
                      ? { label: "Log contact", icon: "handshake", kbd: "Ctrl Enter" }
                      : { label: "Comment", icon: "chat", kbd: "Ctrl Enter" }
                  }
                >
                  Spoke to Dr Mutasa. Oak is fine if fitting moves a week. She wants the revised quote by Wednesday.
                </PostBox>
              </div>
            </Cell>
            <Cell name="Filter by kind">
              <div className="tl-frame tl-frame--pad">
                <KindFilter
                  value={filter}
                  onChange={setFilter}
                  kinds={[
                    { id: "all", label: "Every kind", count: 9 },
                    { id: "contact", label: "Contact with the client", count: 3 },
                    { id: "changes", label: "Changes", count: 2 },
                    { id: "comments", label: "Comments", count: 1 },
                    { id: "calls", label: "Calls", count: 1 },
                    { id: "visits", label: "Visits", count: 1 },
                    { id: "documents", label: "Documents", count: 1 },
                  ]}
                />
              </div>
            </Cell>
          </div>
          <Cell name="Days">
            <TlFrame>
              <Day first label="Today" count={3} />
              <TimelineRow density="compact" mark={<MarkFace person={P.rudo} />} time="10:40">
                <b>Rudo</b> changed 3 fields
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkIcon name="phone" tone="ok" />} time="10:31">
                <b>Rudo</b> called <b>Tinashe</b> · 9 min
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkFace person={P.tinashe} />} time="10:12">
                <b>Tinashe</b> commented
              </TimelineRow>
              <Day label="Saturday 17 October" count={2} />
              <TimelineRow density="compact" mark={<MarkBrand brand="whatsapp" />} time="11:34">
                <b>Dr Precious Mutasa</b> sent a message
              </TimelineRow>
              <TimelineRow density="compact" mark={<MarkIcon name="eye" />} time="11:30">
                <b>Dr Precious Mutasa</b> opened <b>Q-0088</b> <Src>client portal</Src>
              </TimelineRow>
              <Day label="Earlier" count={4} />
              <TimelineRow density="compact" mark={<MarkIcon name="send" tone="info" />} time="Fri 16 Oct">
                <b>Rudo</b> sent <b>Q-0088</b> by WhatsApp
              </TimelineRow>
            </TlFrame>
          </Cell>
        </Grid>
      </Top>

      <Top title="States">
        <Grid cols={3}>
          <Cell name="New">
            <TlFrame>
              <TimelineRow
                state="new"
                mark={<MarkFace person={P.kuda} />}
                time="Just now"
                body={
                  <Bubble>
                    <Mention>@Rudo Mapfumo</Mention> Oak is fine. Keep the edging in the same oak.
                  </Bubble>
                }
              >
                <b>Kudakwashe Sibanda</b> commented
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Sending">
            <TlFrame>
              <TimelineRow
                state="sending"
                mark={<MarkFace person={P.rudo} />}
                time={<Sending />}
                body={<RecordCard title="Quote Q-0089" sub="Msasa Dental Studio · oak" amount="US$5,450.00" />}
              >
                <b>Rudo</b> is sending <b>Q-0089</b> to Dr Precious Mutasa <Src>by WhatsApp</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Failed">
            <TlFrame>
              <TimelineRow
                state="failed"
                mark={<MarkIcon name="mail" tone="bad" />}
                time="11:20"
                body={
                  <>
                    <Failure still="Q-0089 is still on the job, ready to send.">
                      Not delivered. The clinic&apos;s mail server says the address doesn&apos;t exist.
                    </Failure>
                    <EventActions>
                      <EventButton icon="pencil">Change the address</EventButton>
                    </EventActions>
                  </>
                }
              >
                <b>Rudo</b> emailed <b>Q-0089</b> to reception@msasadental.co.zw
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Edited">
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
                <b>Tinashe</b> commented <EditedTag>edited 10:15</EditedTag>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Removed">
            <TlFrame>
              <TimelineRow state="removed" mark={<MarkIcon name="trash" />} time="10:44">
                Comment removed by <b style={{ color: "var(--ink-3)", fontWeight: 500 }}>Rudo Mapfumo</b>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Owner and admins only">
            <TlFrame>
              <TimelineRow
                state="private"
                mark={<MarkFace person={P.kuda} />}
                time="10:46"
                body={<Bubble>Don&apos;t go below US$5,100.00 on this one. Oak board went up this month.</Bubble>}
              >
                <b>Kudakwashe</b> commented <PrivateTag />
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="From the client">
            <TlFrame>
              <TimelineRow
                state="outside"
                mark={<MarkFace person={P.precious} />}
                time="17 Oct 11:34"
                body={
                  <>
                    <Bubble>Could fitting be the week of 9 November? We close for two days then.</Bubble>
                    <EventActions>
                      <EventButton icon="reply">Reply to Dr Mutasa</EventButton>
                    </EventActions>
                  </>
                }
              >
                <b>Dr Precious Mutasa</b> wrote <Src>client portal</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Drafted by Vane">
            <TlFrame>
              <TimelineRow
                state="vane"
                mark={<MarkVane />}
                time="11:02"
                body={
                  <>
                    <Bubble size="sm">
                      Good morning Dr Mutasa. Here is the revised quote for the reception counter in oak, US$5,450.00. Fitting can
                      be the week of 9 November.
                    </Bubble>
                    <EventActions>
                      <EventButton primary whatsapp kbd="S">
                        Send by WhatsApp
                      </EventButton>
                      <EventButton icon="pencil">Edit</EventButton>
                      <EventButton quiet>Not now</EventButton>
                    </EventActions>
                  </>
                }
              >
                <b>Vane</b> drafted a follow-up to Dr Precious Mutasa <Src>for Rudo</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Held for quiet hours">
            <TlFrame>
              <TimelineRow
                state="held"
                mark={<MarkFace person={P.tinashe} />}
                time="Sun 21:14"
                body={
                  <>
                    <Bubble>The oak samples are in the van. I can bring them on Monday.</Bubble>
                    <HeldNote>Held until 06:00 Monday, after quiet hours</HeldNote>
                  </>
                }
              >
                <b>Tinashe</b> replied to Dr Mutasa <Src>by WhatsApp</Src>
              </TimelineRow>
            </TlFrame>
          </Cell>
          <Cell name="Loading">
            <TlFrame>
              <RowSkeleton
                widths={[
                  [70, 40],
                  [55, 0],
                  [82, 60],
                ]}
              />
            </TlFrame>
          </Cell>
          <Cell name="A new job">
            <TlFrame>
              <TimelineEmpty
                icon="history"
                title="Nothing on J-0143 yet"
                actions={[
                  { label: "Comment", icon: "chat" },
                  { label: "Log contact", icon: "handshake" },
                ]}
              />
            </TlFrame>
          </Cell>
          <Cell name="Filtered to nothing">
            <TlFrame>
              <TimelineEmpty icon="filter" title="No calls on this job" actions={[{ label: "Show every kind" }]} />
            </TlFrame>
          </Cell>
        </Grid>
      </Top>
    </Board>
  );
}
