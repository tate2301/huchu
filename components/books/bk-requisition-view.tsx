"use client";

import * as React from "react";
import Link from "next/link";

import { money } from "@/lib/books/format";
import type { RequisitionRecordPage } from "@/lib/books/requisition-record";

import { BkState } from "./bk-list";
import { Bleed, Callout, History, Named, PostingTable, RailSection, RecordHead, Section, Strip } from "./bk-record";
import { Person } from "@/components/core";

const PILL: Record<string, string> = { DRAFT: "pill-n", SUBMITTED: "pill-warn", APPROVED: "pill-info", REJECTED: "pill-plain", DISBURSED: "pill-info", ACQUITTED: "pill-ok", CANCELLED: "pill-plain" };
const first = (name: string) => name.split(" ")[0] ?? name;

/**
 * One requisition (design/core-modules/boards/view/BkRequisition.html): what
 * was asked for and its state, the money given, spent, handed back and still
 * with the person; the slips it was accounted for with; what it posted; its
 * history. On the right, the request and who did what. At phone width it is
 * BkRequisitionPhone: who asks for how much, for what, the job, when it is
 * needed and where it is paid from. Pure.
 */
export function BkRequisitionView({ record }: { record: RequisitionRecordPage }) {
  const m = record.money;
  const c = record.currency;
  const tiles = [
    { label: "Given", value: m.given !== null ? money(m.given, c) : "—", note: m.givenHow ?? "Not paid out yet" },
    { label: "Spent", value: m.spent !== null ? money(m.spent, c) : "—", note: record.slips.length ? `${record.slips.length} ${record.slips.length === 1 ? "slip" : "slips"}` : "No slips yet" },
    m.topUp
      ? { label: "Topped up", value: money(m.topUp, c), note: "Spent over it" }
      : { label: "Change returned", value: m.change !== null ? money(m.change, c) : "—", note: m.changeOn ?? (record.status === "ACQUITTED" ? "None" : "Not yet") },
    { label: `With ${first(record.askedBy.name)} now`, value: m.withThem !== null ? money(m.withThem, c) : "—", note: m.withThem === 0 ? "Nothing owed" : m.withThem ? "To account for" : "Nothing given" },
  ];
  const slipVat = record.slips.reduce((sum, slip) => sum + (slip.vat ?? 0), 0);
  const slipTotal = record.slips.reduce((sum, slip) => sum + slip.amount, 0);
  return (
    <>
      <div className="bk bk-rec bk-has-ph">
        <div className="bk-main">
          <RecordHead
            title={record.purpose}
            pill={<span className={`pill ${PILL[record.status] ?? "pill-n"}`}>{record.state}</span>}
            line={[
              <Person key="by" name={record.askedBy.name} src={record.faces[record.askedBy.name]}>
                {record.askedBy.role ? `${record.askedBy.name}, ${record.askedBy.role}` : record.askedBy.name}
              </Person>,
              record.source === "CRM" ? "From the CRM" : "From the shop",
            ]}
          />
          <Strip tiles={tiles} />
          {record.status === "REJECTED" && record.decisionNote ? (
            <Callout tone="plain" icon="warn">
              <b>Not approved.</b> {record.decisionNote}
            </Callout>
          ) : null}

          <Section id="r1" title="Slips" sum={record.slips.length || null}>
            {record.slips.length ? (
              <Bleed>
                <table className="table" aria-label="Slips">
                  <colgroup>
                    <col style={{ width: 160 }} />
                    <col />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 88 }} />
                    <col style={{ width: 104 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Slip</th>
                      <th>What</th>
                      <th>Expense</th>
                      <th>FDMS</th>
                      <th className="num">VAT</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.slips.map((slip) => (
                      <tr key={slip.id}>
                        <td className="truncate">
                          {slip.slip ? (
                            <a href={slip.slip.url} target="_blank" rel="noopener noreferrer">
                              {slip.slip.name}
                            </a>
                          ) : (
                            <span className="muted">No photo</span>
                          )}
                        </td>
                        <td className="truncate">
                          <span className="cell-lead">{slip.what}</span>
                        </td>
                        <td className="muted">{slip.expense}</td>
                        <td>{slip.fdms ? <BkState tone="plain">{slip.fdms}</BkState> : <span className="muted">None</span>}</td>
                        <td className="num muted">{slip.vat ? money(slip.vat, c) : "—"}</td>
                        <td className="num">{slip.amount ? money(slip.amount, c) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="tot">
                      <td>{record.slips.length === 1 ? "1 slip" : `${record.slips.length} slips`}</td>
                      <td />
                      <td />
                      <td />
                      <td className="num">{slipVat ? money(slipVat, c) : "—"}</td>
                      <td className="num">{money(slipTotal || (m.spent ?? 0), c)}</td>
                    </tr>
                  </tfoot>
                </table>
              </Bleed>
            ) : (
              <p className="bk-note">
                <span>
                  {record.status === "DISBURSED"
                    ? `${first(record.askedBy.name)} adds the slips where it was asked, and closes it there.`
                    : "Slips come in once it is paid out."}{" "}
                  <Link href={record.sourceHref}>{record.source === "CRM" ? "Open it in the CRM" : "Open it in the shop"}</Link>
                </span>
              </p>
            )}
          </Section>

          {record.posting.length ? (
            <Section id="r2" title="Posting" sum={record.entries === 1 ? "1 entry" : `${record.entries} entries`}>
              <PostingTable rows={record.posting} />
            </Section>
          ) : null}

          <Section id="r3" title="History">
            <History items={record.history} faces={record.faces} />
          </Section>
        </div>
        <aside className="rail" aria-label={`About ${record.number}`}>
          <RailSection
            title="Request"
            rows={[
              ["For", record.request.for ? <Link key="for" href={record.sourceHref}>{record.request.for}</Link> : "—"],
              ["Needed", record.request.needed ?? "Not said"],
              ["Paid from", record.request.paidFrom ?? "Not yet"],
              ["Cost centre", record.request.costCentre ?? "None"],
            ]}
          />
          <RailSection
            title="Who did what"
            rows={[
              ["Approved", <Named key="a" name={record.people.approved} faces={record.faces} fallback="Not yet" />],
              ["Paid out", <Named key="p" name={record.people.paidOut} faces={record.faces} fallback="Not yet" />],
              ["Closed", <Named key="c" name={record.people.closed} faces={record.faces} fallback="Not yet" />],
            ]}
          />
        </aside>
      </div>

      {/* At phone width (BkRequisitionPhone): who asks for how much and for what; the job, when, where from; who pays it out. */}
      <div className="bk-ph-only">
        <div className="bk-ph-b">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 15, color: "var(--color-ink-2)" }}>
                <Person name={record.askedBy.name} src={record.faces[record.askedBy.name]}>
                  {record.askedBy.name}
                </Person>{" "}
                asks for
              </span>
              <span className="pill pill-n">{record.source}</span>
            </span>
            <div className="num" style={{ fontSize: 34, fontWeight: 600, color: "var(--color-ink)", letterSpacing: "var(--tracking-display)", textAlign: "left" }}>
              {money(record.asked, c)}
            </div>
            <span style={{ fontSize: 15, lineHeight: 1.45, color: "var(--color-ink)" }}>{record.purpose}</span>
          </div>
          <div className="bk-ph-list">
            <div className="bk-ph-row">
              <span>Job</span>
              <span className="truncate">{record.request.for ?? "None"}</span>
            </div>
            <div className="bk-ph-row">
              <span>Needed</span>
              <span>{record.request.needed ?? "Not said"}</span>
            </div>
            <div className="bk-ph-row">
              <span>Paid from</span>
              <span className="truncate">{record.request.paidFrom ?? "Chosen at pay out"}</span>
            </div>
            <div className="bk-ph-row">
              <span>Their last {record.lastThree.count || 3}</span>
              <span>
                {record.lastThree.count === 0
                  ? "None before"
                  : record.lastThree.accounted === record.lastThree.count
                    ? "All accounted for"
                    : `${record.lastThree.count - record.lastThree.accounted} not accounted for`}
              </span>
            </div>
          </div>
          <span style={{ fontSize: 14, color: "var(--color-muted)" }}>
            {record.status === "SUBMITTED"
              ? record.paysOut ? (
                  <>
                    <Person name={record.paysOut} src={record.faces[record.paysOut]} /> pays it out once approved.
                  </>
                ) : "Whoever pays out pays it out once approved."
              : record.can.why ?? `${record.state}.`}
          </span>
        </div>
      </div>
    </>
  );
}
