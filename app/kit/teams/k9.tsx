"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import { WhatsAppMark } from "@/components/teams/brand-marks";
import { Face } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { SeatMeter } from "@/components/teams/members";
import {
  ImportLocked,
  ImportPaused,
  ImportRefused,
  ImportUndone,
  InviteGone,
  OwnershipDeclined,
  OwnershipWithdrawn,
  SetupDone,
  SetupItem,
} from "@/components/teams/states";

import { Board, Cell, Frame, Grid, Sec, WsMark } from "./board";
import { P } from "./fixtures";

/** K9: the states nobody plans for. Each says what happened and what still works. */
export function K9() {
  return (
    <Board id="K9">
      <Sec title="Ownership">
        <Grid>
          <Cell name="Declined">
            <Frame variant="col">
              <OwnershipDeclined
                person={P.tatenda}
                role="Admin"
                declinedAt="15:52"
                offeredAt="15:40"
                offeredBy="you"
              />
            </Frame>
          </Cell>
          <Cell name="Withdrawn">
            <Frame variant="col">
              <OwnershipWithdrawn by={P.sean} workspace="Corelith" offeredAt="15:40" withdrawnAt="15:47" />
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Invite">
        <Grid>
          <Cell name="Revoked, opening it">
            <Frame variant="col">
              <InviteGone
                mark={<WsMark />}
                title="This invite no longer works"
                sub="Mufaro Hardware · revoked by Nyasha, 19 Oct 11:30"
                action="Ask Nyasha for a new one"
              />
            </Frame>
          </Cell>
          <Cell name="Revoked, on Members">
            <Frame variant="col">
              <div className="k9-row">
                <span className="seats">
                  <SeatMeter used={4} limit={5} />
                  <span className="seats__t">4 of 5</span>
                </span>
              </div>
              <div className="k9-row k9-faded">
                <Face person={P.kudzai} size={32} />
                <div className="k9-grow">
                  <div className="strong">Kudzai Ncube</div>
                  <div className="muted">+263 77 412 0938 · cashier</div>
                </div>
                <span className="state state--calm">Revoked 11:30</span>
              </div>
              <div className="k9-row" style={{ justifyContent: "flex-end" }}>
                <Button icon={<WhatsAppMark mono />}>Invite Kudzai again</Button>
              </div>
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Import, Tender">
        <Grid cols={3}>
          <Cell name="Paused">
            <Frame variant="col">
              <ImportPaused name="Mufaro price list Oct 2026.xlsx" total={214} unit="products" at={131} time="09:13" />
            </Frame>
          </Cell>
          <Cell name="Undone">
            <Frame variant="col">
              <ImportUndone
                name="Mufaro price list Oct 2026.xlsx"
                by="Nyasha"
                time="09:20"
                icon="box"
                noun="Products"
                samples={6}
                removed={214}
              />
            </Frame>
          </Cell>
          <Cell name="File refused">
            <Frame variant="col">
              <ImportRefused name="Mufaro price list.pages" size="1.1 MB" problem="Can't read a .pages file" />
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Import, Pabasa">
        <Grid cols={3}>
          <Cell name="Paused">
            <Frame variant="col">
              <ImportPaused name="Corelith prospects.xlsx" total={52} unit="clients" at={31} time="10:12" />
            </Frame>
          </Cell>
          <Cell name="Undone">
            <Frame variant="col">
              <ImportUndone
                name="Corelith prospects.xlsx"
                by="Sean"
                time="10:15"
                icon="clients"
                noun="Clients"
                samples={5}
                removed={52}
              />
            </Frame>
          </Cell>
          <Cell name="File refused">
            <Frame variant="col">
              <ImportLocked name="Corelith prospects.xlsx" value="••••••••" />
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Fiscal receipts">
        <Grid cols={3}>
          <Cell name="Verified">
            <Frame variant="col">
              <div className="k9-bare">
                <SetupItem state="done" title="Fiscal receipts" sub="Device 21457 · verified 14 Oct 10:48" />
              </div>
              <dl className="kv">
                <dt>
                  <Glyph name="receipt" />
                  Serial
                </dt>
                <dd>
                  <span className="code">FD-MH-0093-24</span>
                </dd>
                <dt>
                  <Glyph name="building" />
                  Taxpayer
                </dt>
                <dd className="is-locked">
                  <span className="code">2001877316</span>
                  <Glyph name="lock" size="sm" className="kv__edit" />
                </dd>
                <dt>
                  <Glyph name="receipt" />
                  VAT number
                </dt>
                <dd className="is-locked">
                  <span className="code">220187731</span>
                  <Glyph name="lock" size="sm" className="kv__edit" />
                </dd>
              </dl>
            </Frame>
          </Cell>
          <Cell name="Later">
            <Frame variant="col">
              <div className="k9-bare">
                <SetupItem
                  state="open"
                  title="Fiscal receipts"
                  sub="Later · 14 Oct"
                  action={{ label: "Set up the device", icon: "receipt" }}
                />
              </div>
            </Frame>
          </Cell>
          <Cell name="Not VAT-registered">
            <Frame variant="col">
              <div className="k9-bare">
                <SetupItem
                  state="done"
                  title="Fiscal receipts"
                  sub="Not VAT-registered"
                  action={{ label: "Change", icon: "pencil", quiet: true }}
                />
              </div>
            </Frame>
          </Cell>
        </Grid>
      </Sec>

      <Sec title="Setup">
        <Grid>
          <Cell name="Complete, Tender">
            <Frame variant="col">
              <SetupDone
                mark={<WsMark size={28} />}
                title="Mufaro Hardware is set up"
                done={7}
                items={["Your shop", "What you sell", "Tills", "Getting paid", "Fiscal receipts", "Staff", "A practice sale"]}
              />
            </Frame>
          </Cell>
          <Cell name="Complete, Pabasa">
            <Frame variant="col">
              <SetupDone
                mark={<WsMark size={28} />}
                title="Kuda Interiors is set up"
                done={6}
                items={["Your business", "Your clients", "How a job moves", "Quotes that look like you", "Your team", "Your first job"]}
              />
            </Frame>
          </Cell>
          <Cell name="Checklist hidden" span="all">
            <div className="tk-frame tk-frame--col k9-split">
              <div className="k9-side side">
                <a className="nav__item" href="#" aria-current="page">
                  <Glyph name="house" />
                  Home
                </a>
                <a className="nav__item" href="#">
                  <Glyph name="bell" />
                  Notifications
                </a>
                <span className="nav__h">Workspace</span>
                <a className="nav__item" href="#">
                  <Glyph name="clients" />
                  Members
                  <span className="nav__count">5 of 5</span>
                </a>
                <a className="nav__item" href="#">
                  <Glyph name="desktop" />
                  Tills
                  <span className="nav__count">2</span>
                </a>
                <a className="nav__item k9-new" href="#">
                  <Glyph name="list-checks" />
                  Setting up
                  <span className="nav__count">5 of 7</span>
                </a>
                <a className="nav__item" href="#">
                  <Glyph name="gear" />
                  Settings
                </a>
              </div>
              <div className="k9-home">
                <h3 className="headline" style={{ fontSize: 26, margin: 0 }}>
                  The shop is selling.
                </h3>
                <div className="muted">Checklist hidden by Nyasha · 19 Oct 11:05</div>
              </div>
            </div>
          </Cell>
        </Grid>
      </Sec>
    </Board>
  );
}
