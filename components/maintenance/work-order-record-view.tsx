"use client";

import * as React from "react";
import Link from "next/link";

import { Field, Finding, GroupHead, Select } from "@/components/core";
import { VaneDraftNote } from "@/components/vane/vane-draft-note";
import type { WorkOrderRecord } from "@/lib/maintenance/work-order-record";

/** Figures keep their width; the name column takes the rest. */
const NUM = { width: "9rem" } as const;

export const PRIORITY_LABEL = { NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" } as const;
const STATUS_LABEL = { DRAFT: "Draft", OPEN: "Open", IN_PROGRESS: "In progress", COMPLETED: "Done", CANCELLED: "Cancelled" } as const;

const amount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

/**
 * One equipment work order (PageVaneMine): Vane's note on its draft, what to
 * do and why, the equipment, who fixes it and how urgently (changeable while
 * it is a draft), what happened to the equipment before, and its parts
 * against stores. Pure: the page owns Raise and Delete.
 */
export function WorkOrderRecordView({
  order,
  saving,
  onChange,
}: {
  order: WorkOrderRecord;
  saving: boolean;
  onChange: (change: { technicianId?: string | null; priority?: WorkOrderRecord["priority"] }) => void;
}) {
  const draft = order.status === "DRAFT";
  const ids = { equipment: React.useId(), technician: React.useId(), priority: React.useId() };
  return (
    <div className="kbody">
      {order.madeByVane && draft ? <VaneDraftNote>Vane&rsquo;s draft, from the history below. Raise it to send it to the workshop; nobody is told until you do.</VaneDraftNote> : null}
      <Finding fact={order.issue} rest={order.note ?? `${STATUS_LABEL[order.status]} since ${order.started}.`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-16)", padding: "0 var(--space-24) var(--space-16)" }}>
        <Field label="Equipment" htmlFor={ids.equipment}>
          <input id={ids.equipment} className="input" readOnly value={`${order.equipment.label} · ${order.equipment.site}`} />
        </Field>
        <Field label="Assign to" htmlFor={ids.technician}>
          <Select
            id={ids.technician}
            value={order.technician?.id ?? ""}
            disabled={!draft || saving}
            onChange={(event) => onChange({ technicianId: event.target.value || null })}
          >
            <option value="">Nobody yet</option>
            {order.technicians.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor={ids.priority}>
          <Select id={ids.priority} value={order.priority} disabled={!draft || saving} onChange={(event) => onChange({ priority: event.target.value as WorkOrderRecord["priority"] })}>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <GroupHead title="What happened before" sum={order.history.length ? `${order.history.length}` : undefined} />
      {order.history.length === 0 ? (
        <p className="muted" style={{ padding: "var(--space-12) var(--space-24)", margin: 0 }}>
          No earlier work orders on this equipment.
        </p>
      ) : (
        <div className="wt" style={{ flex: "none" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "7rem" }}>Date</th>
                <th>Issue</th>
                <th className="num" style={NUM}>Hours</th>
                <th>Work done</th>
              </tr>
            </thead>
            <tbody>
              {order.history.map((row) => (
                <tr key={row.id}>
                  <td className="muted">{row.date}</td>
                  <td className="fill">
                    <Link className="link" href={`/maintenance/work-orders/${row.id}`}>
                      {row.issue}
                    </Link>
                  </td>
                  <td className="num">{row.hours === null ? "—" : row.hours.toFixed(1)}</td>
                  <td className="fill muted">{row.workDone ?? STATUS_LABEL[row.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GroupHead title="Parts" sum={order.parts.length ? `${order.parts.length}` : undefined} />
      {order.parts.length === 0 ? (
        <p className="muted" style={{ padding: "var(--space-12) var(--space-24)", margin: 0 }}>
          No parts named.
        </p>
      ) : (
        <div className="wt" style={{ flex: "none" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Part</th>
                <th className="num" style={NUM}>On hand</th>
                <th className="num" style={NUM}>Needed</th>
              </tr>
            </thead>
            <tbody>
              {order.parts.map((part) => (
                <tr key={part.name}>
                  <td className="fill">{part.name}</td>
                  <td className="num">
                    {part.onHand === null ? (
                      <span className="muted">Not in stores</span>
                    ) : part.onHand < part.needed ? (
                      <b style={{ color: "var(--color-danger)" }}>{amount(part.onHand)}</b>
                    ) : (
                      amount(part.onHand)
                    )}
                  </td>
                  <td className="num">{amount(part.needed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
