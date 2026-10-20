"use client";

import * as React from "react";

import { Glyph } from "@/components/teams/glyph";
import {
  Panel,
  PanelHead,
  PanelSection,
  PanelSkeleton,
  PanelStrip,
  type PanelTab,
} from "@/components/teams/panel";
import {
  KV,
  KVRow,
  KVSelect,
  Position,
  VaneCard,
} from "@/components/teams/panel-parts";
import {
  BellButton,
  TopBar,
  VaneButton,
  type BarAction,
} from "@/components/teams/top-bar";
import { VanePanel, VaneGroup } from "@/components/teams/vane-panel";
import { Button } from "@/components/workspace/button";

import { Board, Cell } from "./board";
import { P } from "./fixtures";

const tabs = (note?: string): PanelTab[] => [
  { id: "details", label: "Details", icon: "tag" },
  { id: "comments", label: "Comments", icon: "chat", note },
];

const more: BarAction[][] = [
  [
    { id: "call", label: "Log a call", icon: "phone", shortcut: "L" },
    { id: "comment", label: "Comment", icon: "chat", shortcut: "C" },
    { id: "task", label: "New task", icon: "done", shortcut: "T" },
  ],
  [
    { id: "hand", label: "Hand over", icon: "handover" },
    { id: "visit", label: "Book a visit", icon: "pin" },
    { id: "quote", label: "Make a quote", icon: "receipt", shortcut: "Q" },
  ],
  [
    { id: "view", label: "Add to a saved view", icon: "flag" },
    { id: "copy", label: "Copy the link", icon: "copy" },
  ],
];

const email: BarAction = {
  id: "email",
  label: "Email the school",
  icon: "mail",
  shortcut: "E",
};

const presence = [
  { person: P.rudo },
  { person: P.kuda },
  { person: P.tinashe, kind: "away" as const },
];

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="tk-h">{children}</h2>;
}

function Barframe({
  width,
  children,
}: {
  width?: number | string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="tk-frame tk-frame--bar"
      style={{ width: typeof width === "number" ? `min(100%, ${width}px)` : (width ?? "min(100%, 1192px)") }}
    >
      {children}
    </div>
  );
}

/** K7: the top bar, Vane in the bar, and the panel's states. */
export function K7() {
  return (
    <Board id="K7">
      <div className="tk-k7">
        <Heading>The top bar</Heading>
        <Cell name="A record at 1440">
          <Barframe>
            <TopBar
              back={{ label: "Deals", href: "#k7" }}
              title="Campus for Nyatsime College"
              favourite={{ on: true }}
              step={{ position: 3, total: 9, noun: "deal" }}
              presence={presence}
              more={more}
              primary={email}
              bell={{ count: 3 }}
              vane={{ count: 1 }}
            />
          </Barframe>
        </Cell>
        <Cell name="More open">
          <Barframe>
            <TopBar
              moreOpen
              back={{ label: "Deals", href: "#k7" }}
              title="Campus for Nyatsime College"
              favourite={{ on: true }}
              step={{ position: 3, total: 9, noun: "deal" }}
              presence={presence}
              more={more}
              primary={email}
              bell={{ count: 3 }}
              vane={{ count: 1 }}
            />
          </Barframe>
          <div className="tk-k7__gap" />
        </Cell>
        <div className="tk-k7__two">
          <Cell name="A list page">
            <Barframe width={760}>
              <TopBar
                icon="jobs"
                title="Deals"
                count="9 open"
                more={[
                  [{ id: "view", label: "Add to a saved view", icon: "flag" }],
                ]}
                primary={{
                  id: "new",
                  label: "New deal",
                  icon: "plus",
                  shortcut: "N",
                }}
                search={{ shortcut: "Ctrl K", hintOpen: true }}
                bell={{ count: 3 }}
                vane={{ count: 1 }}
              />
            </Barframe>
          </Cell>
          <Cell name="Phone">
            <div className="tk-phonebar">
              <TopBar
                back={{ label: "Deals", href: "#k7" }}
                title="Campus for Nyatsime College"
                more={more}
                primary={email}
                bell={{ count: 3 }}
                vane={{ count: 1 }}
              />
            </div>
          </Cell>
        </div>

        <Heading>Vane in the bar</Heading>
        <div className="tk-vrow">
          <Cell name="Nothing for you">
            <VaneButton />
          </Cell>
          <Cell name="3 waiting for you">
            <VaneButton count={3} />
          </Cell>
          <Cell name="Working">
            <VaneButton status="working" />
          </Cell>
          <Cell name="Working, 3 waiting">
            <VaneButton status="working" count={3} />
          </Cell>
          <Cell name="Panel open">
            <VaneButton status="working" count={3} open />
          </Cell>
          <Cell name="Paused">
            <VaneButton status="paused" />
          </Cell>
          <div style={{ width: 40 }} />
          <Cell name="Bell">
            <BellButton />
          </Cell>
          <Cell name="12 need you">
            <BellButton count={12} />
          </Cell>
        </div>

        <Heading>The panel&apos;s states</Heading>
        <div className="tk-states">
          <Cell name="Loading">
            <Panel head={<PanelHead tabs={tabs("2 open")} tab="details" />}>
              <PanelSkeleton />
            </Panel>
          </Cell>
          <Cell name="Changing a value in place">
            <Panel head={<PanelHead tabs={tabs("2 open")} tab="details" />}>
              <PanelSection title="Deal details">
                <KV>
                  <KVRow icon="box" label="Product">
                    Campus
                  </KVRow>
                  <KVRow icon="building" label="School">
                    <a className="u" href="#k7">
                      Nyatsime College
                    </a>
                  </KVRow>
                  <KVSelect
                    defaultOpen
                    icon="tag"
                    label="Kind of school"
                    value="Government boarding"
                    caption="Kind of school"
                    options={[
                      "Government boarding",
                      "Government day",
                      "Private boarding",
                      "Private day",
                      "Mission",
                    ]}
                    addLabel="Add a kind"
                  />
                  <KVRow icon="person" label="Contact">
                    The bursar
                  </KVRow>
                  <KVRow icon="clients" label="Pupils" state="empty" />
                  <KVRow icon="cal" label="Terms">
                    Founding school, open to 31 October
                  </KVRow>
                </KV>
              </PanelSection>
            </Panel>
          </Cell>
          <Cell name="What you can't see or change">
            <Panel head={<PanelHead tabs={tabs("2 open")} tab="details" />}>
              <PanelSection title="Member details">
                <KV>
                  <KVRow icon="person" label="Name">
                    Farai Chikwanha
                  </KVRow>
                  <KVRow icon="tag" label="Role" state="locked" lock>
                    Field worker
                  </KVRow>
                  <KVRow icon="phone" label="Phone" state="locked">
                    Hidden
                  </KVRow>
                  <KVRow icon="card" label="Pay" state="locked">
                    Hidden
                  </KVRow>
                  <KVRow icon="cal" label="Joined">
                    12 Oct
                  </KVRow>
                </KV>
              </PanelSection>
            </Panel>
          </Cell>
          <Cell name="Vane open">
            <div className="tk-auto">
              <VanePanel
                working={{
                  doing:
                    "Reading the deals you follow for anything waiting on Corelith",
                  done: 6,
                  total: 9,
                  unit: "deals",
                }}
              >
                <VaneGroup label="On this deal">
                  <VaneCard
                    kind="suggestion"
                    from="Deals"
                    title="Tatenda's reminder from 28 Sep is still addressed to the old admin address"
                    actions={[
                      { label: "Open the draft", icon: "doc" },
                      { label: "Not now", quiet: true },
                    ]}
                  />
                </VaneGroup>
                <VaneGroup label="Elsewhere">
                  <VaneCard
                    kind="issue"
                    from="Deals"
                    title="Black Ivy Media has waited 6 days for a reply"
                  />
                </VaneGroup>
              </VanePanel>
            </div>
          </Cell>
        </div>
        <div className="tk-k7__two" style={{ gap: 32 }}>
          <Cell name="Hidden">
            <PanelStrip
              items={[
                { id: "details", label: "Details", icon: "tag" },
                {
                  id: "comments",
                  label: "Comments, 2 open",
                  icon: "chat",
                  dot: true,
                },
              ]}
            />
          </Cell>
          <Cell name="A new record">
            <div className="tk-newrec">
              <Panel head={<PanelHead tabs={tabs()} tab="details" />}>
                <PanelSection gap="wide">
                  <Position label="Price" figure="US$0.00" muted />
                  <Button
                    icon={<Glyph name="plus" />}
                    style={{ alignSelf: "flex-start" }}
                  >
                    Add a price
                  </Button>
                </PanelSection>
                <PanelSection title="Deal details">
                  <KV>
                    <KVRow icon="box" label="Product">
                      Campus
                    </KVRow>
                    <KVRow icon="building" label="School">
                      Marondera High School
                    </KVRow>
                    <KVRow icon="person" label="Contact" state="empty" />
                    <KVRow icon="clients" label="Pupils" state="empty" />
                  </KV>
                </PanelSection>
                <PanelSection title="Linked" count={0} />
              </Panel>
            </div>
          </Cell>
        </div>
      </div>
    </Board>
  );
}
