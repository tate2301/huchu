"use client";

import * as React from "react";

import {
  Approval,
  Bubble,
  ChangeLine,
  EventActions,
  EventButton,
  Lines,
  MoneyCard,
  PlaceCard,
  Photos,
  RecordCard,
  RollRows,
  RollToggle,
  State,
} from "@/components/teams/timeline/bodies";
import { TimelineHead } from "@/components/teams/timeline/parts";
import { MarkBrand, MarkFace, MarkIcon, Ref, Src, TimelineRow } from "@/components/teams/timeline/row";

import { Board, Grid, TlFrame, Top } from "./board";
import { P } from "./fixtures";

const Amt = ({ children }: { children: React.ReactNode }) => <span className="ev__amt">{children}</span>;

/** K4b: the events of each industry's modules: retail, schools, maintenance and gold. */
export function K4b() {
  return (
    <Board id="K4b">
      <Top title="Retail, in Tender">
        <Grid cols={3}>
          <TlFrame>
            <TimelineHead module="tender" title="Sales" sub="Mufaro Hardware · today" />
            <TimelineRow
              mark={<MarkFace person={P.rumbidzai} />}
              time="10:14"
              body={
                <Lines
                  rows={[
                    ["1", "PVA paint, 5 L", "US$30.00", "US$30.00"],
                    ["2", "Paint brush, 75 mm", "US$2.40", "US$4.80"],
                  ]}
                  total={["EcoCash US$30.00 · cash US$4.80", "US$34.80"]}
                />
              }
            >
              <b>Rumbidzai</b> sold <b>S-10485</b> <Src>Till 1</Src>
            </TimelineRow>
            <TimelineRow mark={<MarkFace person={P.tendai} />} time="10:15" body={<RollToggle>Show 14 sales</RollToggle>}>
              <b>Tendai</b> made 14 sales on Till 2 <Src>07:30 to 10:15</Src> · <Amt>US$412.50</Amt>
            </TimelineRow>
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
                  total={["S-10482 · they owe US$1,312.40 now", "US$486.00"]}
                />
              }
            >
              <b>Rumbidzai</b> sold to <Ref>Mavhima Construction</Ref> on account <Src>Till 1</Src>
            </TimelineRow>
          </TlFrame>

          <TlFrame>
            <TimelineHead module="tender" title="Money back, laybys and cash-ups" sub="Mufaro Hardware" />
            <TimelineRow
              mark={<MarkFace person={P.tendai} />}
              time="09:31"
              body={
                <MoneyCard
                  amount="US$60.00"
                  how="EcoCash · garden shed kit"
                  percent={62.5}
                  left="US$200.00 of US$320.00"
                  right="US$120.00 left by 30 Nov"
                />
              }
            >
              <b>Tendai</b> took a layby payment from <b>Tsitsi Banda</b> <Src>LB-0012, Till 2</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkIcon name="refund" tone="warn" />}
              time="08:47"
              body={
                <>
                  <Bubble size="sm">Wrong size: four 20 mm elbows, the customer wanted 25 mm.</Bubble>
                  <EventActions>
                    <Approval person={P.tendai}>Approved by Tendai from his phone, 08:46</Approval>
                  </EventActions>
                </>
              }
            >
              <b>Rumbidzai</b> refunded <Amt>US$4.80</Amt> on <b>S-10466</b> <Src>cash, Till 1</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkIcon name="till" tone="bad" />}
              time="17 Oct 17:40"
              body={
                <>
                  <div className="tl-money">
                    <div className="tl-money__row">
                      <span className="tl-money__big" style={{ color: "var(--bad)" }}>
                        Short US$4.00
                      </span>
                      <span>in cash</span>
                    </div>
                    <div className="tl-money__row" style={{ fontSize: "var(--tm-t-cap)" }}>
                      <span>Expected US$612.40 · counted US$608.40</span>
                    </div>
                  </div>
                  <EventActions>
                    <EventButton icon="pencil">Add a reason</EventButton>
                  </EventActions>
                </>
              }
            >
              <b>Tendai</b> cashed up Till 2
            </TimelineRow>
          </TlFrame>

          <TlFrame>
            <TimelineHead module="tender" title="Stock and prices" sub="Mufaro Hardware" />
            <TimelineRow
              mark={<MarkFace person={P.blessing} />}
              time="18 Oct 08:10"
              body={<ChangeLine field="PVC elbow, 25 mm" from="46" to="41" />}
            >
              <b>Blessing</b> counted shelf B4 <Src>1 difference</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.nyasha} />}
              time="17 Oct 16:05"
              body={<ChangeLine field="Cement 32.5R, 50 kg" from="US$11.00" to="US$11.50" />}
            >
              <b>Nyasha</b> changed a price <Src>both tills from Monday 07:00</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.blessing} />}
              time="17 Oct 14:20"
              body={
                <>
                  <RecordCard
                    icon="truck"
                    title="Goods received GRN-0088"
                    sub="18 lines · 2 short"
                    amount="US$3,412.80"
                    state={<State tone="warn">2 short</State>}
                  />
                  <RollRows
                    cols="minmax(0, 1fr) 120px"
                    rows={[
                      ["Cement 32.5R, 50 kg", "180 of 200"],
                      ["Binding wire, 25 kg", "4 of 6"],
                    ]}
                  />
                </>
              }
            >
              <b>Blessing</b> received stock from <b>Ruwa Building Supplies</b>
            </TimelineRow>
          </TlFrame>
        </Grid>
      </Top>

      <Top title="Schools, maintenance and gold">
        <Grid cols={3}>
          <TlFrame>
            <TimelineHead module="other" icon="student" title="Activity" sub="Campus · Mabvazuva Primary School" />
            <TimelineRow
              mark={<MarkIcon name="send" tone="info" />}
              time="14 Sep 07:30"
              body={
                <RollRows
                  cols="minmax(0, 1fr) 80px"
                  rows={[
                    ["By WhatsApp", "368"],
                    ["By email", "31"],
                    ["Printed", "13"],
                  ]}
                  foot="287 paid so far · US$51,660.00"
                />
              }
            >
              <b>Mrs Ruvimbo Chikore</b> sent term 3 invoices to 412 families · <Amt>US$74,160.00</Amt>
            </TimelineRow>
            <TimelineHead
              module="other"
              icon="student"
              title="P-0412 Tanaka Mhere"
              sub="Grade 5 Blue"
              style={{ marginTop: "var(--tm-s3)" }}
            />
            <TimelineRow
              mark={<MarkIcon name="coins" tone="ok" />}
              time="21 Sep 18:02"
              body={<MoneyCard amount="US$180.00" how="Term 3" percent={100} left="Paid in full" right="Receipt R-T3-0412" />}
            >
              <b>Mr Tonderai Mhere</b> paid term 3 fees <Src>EcoCash</Src>
            </TimelineRow>
            <TimelineRow mark={<MarkIcon name="send" tone="info" />} time="14 Sep 07:30">
              <b>Mrs Chikore</b> sent invoice <b>INV-T3-0412</b> to Mr Tonderai Mhere <Src>by WhatsApp</Src>
            </TimelineRow>
            <TimelineRow mark={<MarkIcon name="student" tone="info" />} time="14 Sep 07:12">
              <b>Mrs Chikore</b> enrolled Tanaka in Grade 5 Blue <Src>from Ruwa Junior School</Src>
            </TimelineRow>
          </TlFrame>

          <TlFrame>
            <TimelineHead title="WO-0021 Drawer runner broken" sub="Maintenance · Avondale Pharmacy" />
            <TimelineRow
              mark={<MarkFace person={P.tinashe} />}
              time="16 Oct 10:05"
              body={<Photos tones={["b", "d"]} />}
            >
              <b>Tinashe</b> closed the work order <Src>2 photos</Src>
            </TimelineRow>
            <TimelineRow
              mark={<MarkFace person={P.tinashe} />}
              time="16 Oct 09:58"
              body={
                <Lines
                  rows={[["2", "Soft-close runner, 450 mm", "US$18.00", "US$36.00"]]}
                  total={["To bill Avondale Pharmacy", "US$36.00"]}
                />
              }
            >
              <b>Tinashe</b> used parts
            </TimelineRow>
            <TimelineRow
              mark={<MarkIcon name="pin" tone="info" />}
              time="16 Oct 09:12"
              body={
                <PlaceCard
                  title="Avondale Pharmacy"
                  lines={["Avondale, Harare · 12 m from the pin", "In 09:12 · out 10:05"]}
                />
              }
            >
              <b>Tinashe</b> checked in at Avondale Pharmacy
            </TimelineRow>
            <TimelineRow
              state="outside"
              mark={<MarkBrand brand="whatsapp" />}
              time="15 Oct 16:30"
              body={<Bubble size="sm">The second drawer under the counter won&apos;t close. The runner looks broken.</Bubble>}
            >
              <b>Mrs Nyarai Choto</b> reported it <Src>by WhatsApp, given to Tinashe by Rudo</Src>
            </TimelineRow>
          </TlFrame>

          <TlFrame>
            <TimelineHead module="other" icon="hard-hat" title="Lot L-0418" sub="Huchu gold · Muzvezve Mine, Kadoma" />
            <TimelineRow
              mark={<MarkIcon name="flask" tone="ok" />}
              time="18 Oct 09:40"
              body={
                <MoneyCard amount="269.3 g fine gold" how="86.2% fine" left="From 312.4 g delivered" />
              }
            >
              <b>Fidelity Gold Refinery</b> sent the assay
            </TimelineRow>
            <TimelineRow
              mark={<MarkIcon name="truck" tone="info" />}
              time="16 Oct 11:20"
              body={
                <RecordCard
                  icon="gold"
                  title="Lot L-0418"
                  sub="Seal 004127 · 4 bars"
                  amount="312.4 g"
                  state={<State tone="calm">Received</State>}
                />
              }
            >
              <b>Tapiwa Gora</b> delivered the lot to Fidelity Gold Refinery, Kadoma
            </TimelineRow>
            <TimelineRow
              mark={<MarkIcon name="gold" />}
              time="15 Oct 06:10"
              body={
                <RollRows
                  cols="72px minmax(0, 1fr) 84px"
                  rows={[
                    ["Smelt 1", "22:40", "78.2 g"],
                    ["Smelt 2", "00:55", "81.0 g"],
                    ["Smelt 3", "03:20", "74.6 g"],
                    ["Smelt 4", "05:35", "78.6 g"],
                  ]}
                />
              }
            >
              <b>Night shift</b> smelted 4 times · <Amt>312.4 g</Amt>
            </TimelineRow>
          </TlFrame>
        </Grid>
      </Top>
    </Board>
  );
}
