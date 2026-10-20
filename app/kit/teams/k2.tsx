"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import { Glyph } from "@/components/teams/glyph";
import {
  InviteForm,
  InviteRow,
  JoinCard,
  JoinProblem,
  LimitNotice,
  MemberRow,
  OwnershipAsk,
  OwnershipOffer,
  PermissionRow,
  SeatMeter,
  Seats,
  SeatsFull,
  type Grant,
} from "@/components/teams/members";
import { SetupItem, SetupList } from "@/components/teams/states";
import { State } from "@/components/teams/timeline/bodies";
import { MarkIcon, TimelineRow } from "@/components/teams/timeline/row";

import { Board, Cell, Frame, Grid, Sec, WsMark } from "./board";
import { P } from "./fixtures";

/** K2: seats, inviting, a member's state, permissions, joining, setup items and ownership. */
export function K2() {
  const [grants, setGrants] = React.useState<[Grant, Grant, Grant]>(["default", "allowed", "denied"]);
  const set = (i: 0 | 1 | 2) => (v: Grant) => setGrants((g) => g.map((x, j) => (j === i ? v : x)) as [Grant, Grant, Grant]);
  return (
    <Board id="K2">
      <Sec title="Seats">
        <Grid>
          <Cell name="Seats free">
            <Frame>
              <Seats used={3} limit={5} />
            </Frame>
          </Cell>
          <Cell name="Last seat">
            <Frame>
              <Seats used={4} limit={5} />
            </Frame>
          </Cell>
          <Cell name="Full, seen by the owner">
            <SeatsFull limit={5} viewer="owner" owner={P.nyasha} />
          </Cell>
          <Cell name="Full, seen by an admin">
            <SeatsFull limit={5} viewer="admin" owner={P.nyasha} />
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Inviting">
        <Grid>
          <Cell name="The invite, with a seat left">
            <InviteForm
              workspace="Mufaro Hardware"
              contact="+263 77 412 0938"
              role="Cashier"
              place="Mufaro Hardware"
              seats={<SeatMeter used={4} limit={5} />}
            />
          </Cell>
          <Cell name="Already a member">
            <InviteForm
              workspace="Mufaro Hardware"
              contact="+263 71 300 4471"
              role="Cashier"
              place="Mufaro Hardware"
              seats={<SeatMeter used={4} limit={5} />}
              problem={
                <>
                  That&apos;s Tendai Chari, already a shop manager here. <a className="u" href="#k2">Open Tendai</a>
                </>
              }
            />
            <span className="tk-name" style={{ marginTop: "var(--tm-s3)" }}>
              Not delivered
            </span>
            <InviteRow status="not_delivered" name="Kudzai Ncube" contact="+263 77 412 0938 · cashier" />
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Invite states">
        <Grid>
          <Cell name="Sent">
            <InviteRow status="sent" name="Kudzai Ncube" contact="+263 77 412 0938 · cashier" />
          </Cell>
          <Cell name="Not delivered">
            <InviteRow status="not_delivered" name="Kudzai Ncube" contact="+263 77 412 0938 · cashier" />
          </Cell>
          <Cell name="Accepted">
            <InviteRow status="accepted" name="Kudzai Ncube" contact="+263 77 412 0938 · cashier" at="11:30" />
          </Cell>
          <Cell name="Expired">
            <InviteRow status="expired" name="Kudzai Ncube" contact="+263 77 412 0938 · cashier" at="24 Oct" />
          </Cell>
          <Cell name="Revoked">
            <InviteRow status="revoked" name="Kudzai Ncube" contact="+263 77 412 0938 · cashier" at="today" />
          </Cell>
        </Grid>
      </Sec>

      <Sec title="A member's state">
        <Grid>
          <Cell name="Never signed in">
            <MemberRow person={P.farai} name="Farai Chikwanha" sub="Field worker · joined 9 Oct" end={<State tone="calm">Never signed in</State>} />
          </Cell>
          <Cell name="Suspended">
            <MemberRow
              person={P.blessing}
              name="Blessing Dube"
              sub="Stock clerk · on leave, seat freed today"
              faded
              end={
                <Button icon={<Glyph name="undo" />}>Restore</Button>
              }
            />
          </Cell>
          <Cell name="Read-only, over the limit">
            <MemberRow person={P.rumbidzai} name="Rumbidzai Moyo" sub="Joined last, after the trial ended" end={<State tone="warn">Read-only</State>} />
          </Cell>
          <Cell name="Removed, on a sale she rang up">
            <Frame>
              <TimelineRow mark={<MarkIcon name="till" />} time="19 Oct">
                <b>Rumbidzai Moyo</b> <span className="muted">(no longer a member)</span> sold S-10482 on Till 1
              </TimelineRow>
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Permissions">
        <Grid>
          <Cell name="Role default, allowed, denied">
            <Frame>
              <PermissionRow first label="Give a refund" roleDefault="no" value={grants[0]} onChange={set(0)} />
              <PermissionRow label="Change a price" roleDefault="no" value={grants[1]} onChange={set(1)} />
              <PermissionRow last label="Void a sale" roleDefault="yes" value={grants[2]} onChange={set(2)} />
            </Frame>
          </Cell>
          <Cell name="A limit, where the work is">
            <LimitNotice title="Refunds over US$50 need a shop manager" detail="This one is US$86.00" ask={{ person: P.tendai }} />
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Joining">
        <Grid>
          <Cell name="The invite">
            <JoinCard
              mark={<WsMark />}
              title="Nyasha invited you to Mufaro Hardware"
              sub="Cashier · till PIN"
              action="Join Mufaro Hardware"
            />
          </Cell>
          <Cell name="Expired, full, or for someone else">
            <Frame variant="stack">
              <JoinProblem icon="wait" title="This invite expired on 24 October" action={{ label: "Ask Nyasha for a new one" }} />
              <JoinProblem icon="clients" title="Mufaro Hardware is full" action={{ label: "Ask Nyasha" }} />
              <JoinProblem
                icon="person"
                title="This invite is for k.ncube@gmail.com"
                sub="You're signed in as kudzai@mufarohardware.co.zw"
                action={{ label: "Sign out and continue", icon: "handover" }}
              />
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Setup items">
        <Grid>
          <Cell name="Open, done, skipped">
            <SetupList>
              <SetupItem state="open" title="Staff" action={{ label: "Add staff", icon: "user-plus" }} />
              <SetupItem state="done" title="Tills" sub="Till 1 on a Counter Mini · Till 2 on this computer" />
              <SetupItem state="skipped" title="A practice sale" sub="Skipped" action={{ label: "Try it", quiet: true }} />
            </SetupList>
          </Cell>
          <Cell name="Waiting on ZIMRA, and needs fixing">
            <SetupList>
              <SetupItem state="wait" title="Fiscal receipts" sub="Device 21457 · checking" action={{ label: "Check again", icon: "undo" }} />
              <SetupItem
                state="bad"
                title="Fiscal receipts"
                sub="ZIMRA says the activation key doesn't match device 21457"
                action={{ label: "Fix the key", icon: "pencil" }}
              />
            </SetupList>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Ownership">
        <Grid>
          <Cell name="The offer, in Needs you">
            <OwnershipOffer from={P.nyasha} workspace="Mufaro Hardware" moves="Billing moves to you" until="26 Oct" />
          </Cell>
          <Cell name="Asked twice">
            <OwnershipAsk workspace="Mufaro Hardware" from="28 Oct" />
          </Cell>
        </Grid>
      </Sec>
    </Board>
  );
}
