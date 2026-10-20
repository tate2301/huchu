"use client";

import * as React from "react";

import { VaneMark } from "@/components/core/vane-mark";
import { CallBar, CallNotice, IncomingCall } from "@/components/teams/call-bar";
import { Composer, DeletedComment, MentionMenu, PendingComment, type ComposerKind } from "@/components/teams/composer";
import { EditingValue, FieldConflict, HereRow, PresenceDown, Typing } from "@/components/teams/presence";
import { Bubble, EventActions, EventButton, RollToggle } from "@/components/teams/timeline/bodies";
import { MarkFace, MarkIcon, Ref, TimelineRow } from "@/components/teams/timeline/row";

import { Board, Cell, Frame, Grid, Sec } from "./board";
import { P } from "./fixtures";

/** K1: presence, calls, the composer, timeline events, and two people in one field. */
export function K1() {
  const [kind, setKind] = React.useState<ComposerKind>("client");
  return (
    <Board id="K1">
      <Sec title="Who's here">
        <Grid>
          <Cell name="Here">
            <Frame>
              <HereRow faces={[{ person: P.rudo }, { person: P.kuda }]}>
                <b>You and Kudakwashe</b> are here
              </HereRow>
            </Frame>
          </Cell>
          <Cell name="Away">
            <Frame>
              <HereRow faces={[{ person: P.tinashe, kind: "away" }]}>
                <b>Tinashe</b> left 8 minutes ago
              </HereRow>
            </Frame>
          </Cell>
          <Cell name="Typing">
            <Frame>
              <Typing name="Kudakwashe" />
            </Frame>
          </Cell>
          <Cell name="Editing a field">
            <Frame>
              <EditingValue label="Value" value="US$5,450.00" person={P.rudo} />
            </Frame>
          </Cell>
          <Cell name="Reconnecting">
            <Frame>
              <HereRow faded faces={[{ person: P.rudo }, { person: P.kuda }]}>
                Reconnecting
              </HereRow>
            </Frame>
          </Cell>
          <Cell name="Unavailable">
            <Frame>
              <PresenceDown />
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Calls on a record">
        <Grid>
          <Cell name="Incoming call">
            <IncomingCall caller={P.rudo} record="J-0142" subject="Reception counter and cabinets" />
          </Cell>
          <Cell name="In a call">
            <CallBar
              people={[
                { person: P.tinashe, kind: "talk" },
                { person: P.rudo, kind: "here" },
              ]}
              title="Call on this job"
              meta="Tinashe is talking · 04:12"
              actions={[
                { label: "Mute", icon: "mic" },
                { label: "Leave", icon: "hangup", leave: true },
              ]}
            />
          </Cell>
          <Cell name="Muted, sharing a screen">
            <CallBar
              people={[
                { person: P.tinashe, kind: "here" },
                { person: P.rudo, kind: "here" },
              ]}
              title="You're sharing your screen"
              meta="Muted · 06:40"
              actions={[
                { label: "Unmute", icon: "mic-off", on: true },
                { label: "Stop sharing", icon: "screen", on: true },
              ]}
            />
          </Cell>
          <Cell name="Poor connection">
            <CallBar
              dim
              people={[{ person: P.tinashe }]}
              title="Audio only for now"
              meta="Screen share paused"
              actions={[{ label: "Leave", icon: "hangup", leave: true }]}
            />
          </Cell>
          <Cell name="Dropped">
            <CallNotice tone="warn" icon="offline" title="You dropped out of the call" sub="Tinashe and Rudo are still on it" action={{ label: "Rejoin", icon: "phone" }} />
          </Cell>
          <Cell name="Calls can't connect">
            <CallNotice icon="alert" title="Calls can't connect" action={{ label: "Call Tinashe on WhatsApp", whatsapp: true }} />
          </Cell>
          <Cell name="Microphone blocked">
            <CallNotice tone="bad" icon="mic-off" title="Microphone blocked" action={{ label: "Allow the microphone", icon: "mic" }} />
          </Cell>
          <Cell name="Ended, on the timeline">
            <Frame>
              <TimelineRow mark={<MarkIcon name="phone" tone="ok" />} time="10:31">
                <b>Rudo Mapfumo</b> called <b>Tinashe Gumbo</b> about this job · 9 min
              </TimelineRow>
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Composer">
        <Grid>
          <Cell name="Mentioning someone">
            <div style={{ position: "relative" }}>
              <Composer kind="team" action={{ label: "Comment", icon: "chat" }}>
                Can you approve the new price <span className="tm-mention">@Ku</span>
              </Composer>
              <div className="tk-pop">
                <MentionMenu matches={[{ person: P.kuda, role: "Owner" }]} invite={{ name: "Kudzai" }} />
              </div>
            </div>
          </Cell>
          <Cell name="A record of contact">
            <Composer kind={kind} onKindChange={setKind} clientHow="Call" action={{ label: "Log the call", icon: "phone" }}>
              Spoke to Dr Mutasa. Oak is fine, she wants it by the 30th.
            </Composer>
          </Cell>
          <Cell name="Waiting to send">
            <Frame>
              <PendingComment state="waiting">Measured again: the counter is 2.4 m, not 2.2 m.</PendingComment>
            </Frame>
          </Cell>
          <Cell name="Didn't post">
            <Frame>
              <PendingComment state="failed">Agreed on the call: oak veneer, same layout.</PendingComment>
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Timeline events">
        <Grid>
          <Cell name="Resolved thread">
            <Frame>
              <TimelineRow mark={<MarkIcon name="check" tone="ok" small />} time="11:05">
                <b>Rudo</b> resolved Tinashe&apos;s comment about the oak finish ·{" "}
                <RollToggle>Show 2 replies</RollToggle>
              </TimelineRow>
            </Frame>
          </Cell>
          <Cell name="Deleted, with undo">
            <DeletedComment seconds={8} />
          </Cell>
          <Cell name="Grouped">
            <Frame>
              <TimelineRow mark={<MarkIcon name="pencil" />} time="10:40">
                <b>Rudo</b> changed the value and the close date · <RollToggle>See changes</RollToggle>
              </TimelineRow>
            </Frame>
          </Cell>
          <Cell name="Rolled up">
            <Frame>
              <TimelineRow mark={<MarkIcon name="receipt" tone="info" />} time="Sat">
                <b>12 receipts</b> from Till 1 stamped by ZIMRA · <b className="num">US$1,284.00</b>
              </TimelineRow>
            </Frame>
          </Cell>
          <Cell name="Handed over">
            <Frame>
              <TimelineRow
                mark={<MarkFace person={P.kuda} />}
                time="09:02"
                body={<Bubble size="sm">Client wants it done before the 30th.</Bubble>}
              >
                <b>Kudakwashe</b> handed this job to <b>Rudo</b>
              </TimelineRow>
            </Frame>
          </Cell>
          <Cell name="From Vane">
            <Frame>
              <TimelineRow
                mark={
                  <span className="ev__g ev__g--ink">
                    <VaneMark size={16} />
                  </span>
                }
                time="10:41"
                body={
                  <EventActions>
                    <EventButton icon="pencil">Draft a revised quote</EventButton>
                  </EventActions>
                }
              >
                <b>Vane</b> noticed the value changed after <Ref>Q-0088</Ref> went out
              </TimelineRow>
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Two people, one field">
        <Grid>
          <Cell name="Conflict">
            <Frame>
              <FieldConflict person={P.rudo} at="10:40" label="value" theirs="US$5,450.00" mine="US$5,250.00" />
            </Frame>
          </Cell>
        </Grid>
      </Sec>
    </Board>
  );
}
