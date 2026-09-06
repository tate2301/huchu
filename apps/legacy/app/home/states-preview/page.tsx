"use client";

import { useState } from "react";
import { Button } from "@corelithzw/react";

import {
  CardsSkeleton,
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  RecordNotFound,
  SaveError,
  SavingOverlay,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";

/**
 * Every campus state on one page, live.
 *
 * The canvas draws these as artboards and the audit script counts whether a
 * screen reaches for them, but neither shows you the thing moving. A skeleton
 * whose stagger is wrong or whose columns do not line up looks fine in a diff
 * and wrong on a screen, and the only way to know is to look at it.
 *
 * Not linked from the sidebar — it is a bench, not a destination.
 */
export default function CampusStatesPreviewPage() {
  const [saving, setSaving] = useState(false);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 p-6">
      <header className="space-y-1">
        <h1 className="text-page-title">Campus states</h1>
        <p className="text-sm text-muted-foreground">
          The eight states every campus screen has, as they actually render.
          Rules in <code>docs/design-system/11-campus-states-and-motion.md</code>.
        </p>
      </header>

      <Section
        title="Table skeleton"
        note="Mirrors the row it is about to become — header solid, avatar where an avatar goes, a pill where a badge goes, money right-aligned. Rows cascade in at 40ms."
      >
        <TableRowsSkeleton
          headers={["Student", "Class", "Fees", "Attendance", "Owing"]}
          columns={[
            { avatar: true, twoLine: true },
            { width: 130 },
            { width: 110, badge: true },
            { width: 110 },
            { width: 100, align: "right" },
          ]}
          rows={6}
        />
      </Section>

      <Section title="Card skeleton" note="For the lists that are not tables — the bed board, the shelf.">
        <CardsSkeleton count={3} columns={3} lines={2} />
      </Section>

      <Section title="Stat skeleton" note="A band of tiles while their numbers are counted.">
        <StatsSkeleton count={4} />
      </Section>

      <Section
        title="Saving"
        note="Dims to 50% and refuses input. A save that accepts more marks halfway through is a save that loses them."
      >
        <Button variant="secondary" onClick={() => setSaving((current) => !current)}>
          {saving ? "Stop" : "Start saving"}
        </Button>
        <SavingOverlay saving={saving} label="Saving the register…">
          <div className="mt-3 rounded-[var(--card-radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <p className="text-sm">Form 2A · 32 of 32 marked</p>
            <p className="text-sm text-muted-foreground">
              Tap a pupil to change their mark.
            </p>
          </div>
        </SavingOverlay>
      </Section>

      <Section
        title="The three empties"
        note="Three different sentences. Nothing yet offers the verb that fills it; nothing matched repeats the filters; nothing left is good news and offers no create button."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <Framed>
            <NothingYet
              title="The school has not sent a notice yet"
              body="Anything you send appears in parents’ and pupils’ portals straight away."
              action={<Button>Send a notice</Button>}
            />
          </Framed>
          <Framed>
            <NothingMatched
              what="students"
              filters={["Form 2", "Suspended", "“chikwanda”"]}
              onClear={() => undefined}
            />
          </Framed>
          <Framed>
            <NothingLeftToDo
              title="Nothing is late"
              body="Every book that is out is inside its return date."
            />
          </Framed>
        </div>
      </Section>

      <Section title="Faults" note="A read that failed, a write that failed, and a record that is not there.">
        <div className="space-y-3">
          <LoadError
            what="the fee ledger"
            error={new Error("Request failed with status code 500")}
            onRetry={() => undefined}
          />
          <SaveError what="The invoice" error={new Error("Amount must be greater than zero")} />
          <Framed>
            <RecordNotFound
              what="That pupil"
              backHref="/schools/students"
              backLabel="Search all students"
            />
          </Framed>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-section-title">{title}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

function Framed({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--card-radius)] border border-[color:var(--border)] bg-[color:var(--surface)]">
      {children}
    </div>
  );
}
