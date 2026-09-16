"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { LoadError, NothingYet, SaveError, TableRowsSkeleton } from "@/components/records/states";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { ConductReasonDialog } from "@/components/schools/conduct/conduct-reason-dialog";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchConductCategories,
  fetchMeritReasons,
  type ConductTone,
} from "@/lib/schools/conduct-v2";

/**
 * What this school logs behaviour against.
 *
 * ## Why this screen had to exist
 *
 * The conduct module could not be started. `logIncident` requires a
 * `categoryId` and the incident dialog's picker is fed from
 * `fetchConductCategories`; `awardMerit` requires a `reasonId` and the award
 * dialog is fed from `fetchMeritReasons`. A school on its first morning has
 * neither, and the two `POST` endpoints that create them — both shipped, both
 * on the `configure` grant — had no caller anywhere in the product. So every
 * screen in a 39,000-line module opened onto an empty list with no way to fill
 * it.
 *
 * ## Two lists, one screen
 *
 * A category is what an incident *is* — Late, Uniform, Fighting — and carries
 * the tone the log reads by and, optionally, the demerits it draws
 * automatically. A reason is what a merit or demerit is *given for*. They are
 * different tables and different verbs, and a school writes both on the same
 * afternoon, so they are two views of one screen rather than two destinations.
 *
 * Vertical views rather than a band of tabs, which is what the design system
 * asks for where one screen carries more than one table.
 */

type View = "categories" | "merits" | "demerits";

export function ConductSetupContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("categories");
  const [dialog, setDialog] = useState<null | "category" | "merit" | "demerit">(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["schools", "conduct", "categories"],
    queryFn: fetchConductCategories,
  });

  const meritsQuery = useQuery({
    queryKey: ["schools", "conduct", "reasons", "MERIT"],
    queryFn: () => fetchMeritReasons("MERIT"),
  });

  const demeritsQuery = useQuery({
    queryKey: ["schools", "conduct", "reasons", "DEMERIT"],
    queryFn: () => fetchMeritReasons("DEMERIT"),
  });

  const categories = categoriesQuery.data?.rows ?? [];
  const merits = meritsQuery.data?.rows ?? [];
  const demerits = demeritsQuery.data?.rows ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "conduct", "categories"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "conduct", "reasons"] });
  };

  const active =
    view === "categories" ? categoriesQuery : view === "merits" ? meritsQuery : demeritsQuery;

  return (
    <SchoolsPage>
      <PageChrome title="Conduct setup" backHref="/schools/conduct" backLabel="Behaviour log">
        <Button
          variant="primary"
          onClick={() =>
            setDialog(
              view === "categories" ? "category" : view === "merits" ? "merit" : "demerit",
            )
          }
        >
          {view === "categories" ? "New category" : "New reason"}
        </Button>
      </PageChrome>

      {saveError ? <SaveError what="The entry" error={saveError} /> : null}

      <VerticalDataViews
        items={[
          {
            id: "categories",
            label: "Behaviour categories",
            count: categoriesQuery.isPending ? undefined : categories.length,
          },
          {
            id: "merits",
            label: "Merit reasons",
            count: meritsQuery.isPending ? undefined : merits.length,
          },
          {
            id: "demerits",
            label: "Demerit reasons",
            count: demeritsQuery.isPending ? undefined : demerits.length,
          },
        ]}
        value={view}
        onValueChange={(value) => setView(value as View)}
        railLabel="Conduct setup"
      >
        {active.error ? (
          <LoadError
            what={view === "categories" ? "the categories" : "the reasons"}
            error={active.error}
            onRetry={() => void active.refetch()}
          />
        ) : active.isPending ? (
          <TableRowsSkeleton
            rows={6}
            headers={["Code", "Name", view === "categories" ? "Tone" : "Points"]}
            columns={[{ width: 110 }, {}, { width: 140 }]}
          />
        ) : view === "categories" ? (
          categories.length === 0 ? (
            <NothingYet
              title="No behaviour categories yet"
              body="An incident is logged against a category — Late, Uniform, Fighting, Disruption. Nothing can be recorded until this school has at least one."
              action={
                <Button variant="primary" onClick={() => setDialog("category")}>
                  New category
                </Button>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border-subtle)] text-left text-xs text-[color:var(--text-muted)]">
                  <th className="w-[120px] py-1.5 font-normal">Code</th>
                  <th className="py-1.5 font-normal">Name</th>
                  <th className="w-[100px] py-1.5 font-normal">Tone</th>
                  <th className="w-[110px] py-1.5 text-right font-normal">Demerits</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((row) => (
                  <tr key={row.id} className="border-b border-[color:var(--border-subtle)]">
                    <td className="py-2 font-mono text-xs">{row.code}</td>
                    <td className="py-2">{row.name}</td>
                    <td className="py-2">
                      <Badge tone={toneBadge(row.tone)}>{TONE_LABELS[row.tone]}</Badge>
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {row.demeritPoints ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <ReasonTable
            rows={view === "merits" ? merits : demerits}
            kind={view === "merits" ? "merit" : "demerit"}
            onNew={() => setDialog(view === "merits" ? "merit" : "demerit")}
          />
        )}
      </VerticalDataViews>

      <ConductReasonDialog
        // Fresh fields on every open. The reader is writing a list of ten in a
        // row, so a dialog that kept its last answers would submit the previous
        // one's name against this one's code.
        key={dialog ?? "closed"}
        kind={dialog}
        open={dialog !== null}
        onOpenChange={(open) => setDialog(open ? dialog : null)}
        onSaved={() => {
          setSaveError(null);
          refresh();
          setDialog(null);
        }}
        onError={(error) => setSaveError(getApiErrorMessage(error))}
      />
    </SchoolsPage>
  );
}

const TONE_LABELS: Record<ConductTone, string> = {
  PLAIN: "Plain",
  WARN: "Warn",
  BAD: "Serious",
};

function toneBadge(tone: ConductTone): "neutral" | "warn" | "danger" {
  if (tone === "BAD") return "danger";
  if (tone === "WARN") return "warn";
  return "neutral";
}

function ReasonTable({
  rows,
  kind,
  onNew,
}: {
  rows: Array<{ id: string; code: string; name: string; defaultPoints: number }>;
  kind: "merit" | "demerit";
  onNew: () => void;
}) {
  if (rows.length === 0) {
    return (
      <NothingYet
        title={`No ${kind} reasons yet`}
        body={
          kind === "merit"
            ? "A merit is given for a reason — Helpfulness, Effort, Representing the school. The award dialog reads this list."
            : "A demerit is given for a reason — Homework not done, Late again, Rudeness. The award dialog reads this list."
        }
        action={
          <Button variant="primary" onClick={onNew}>
            New reason
          </Button>
        }
      />
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[color:var(--border-subtle)] text-left text-xs text-[color:var(--text-muted)]">
          <th className="w-[120px] py-1.5 font-normal">Code</th>
          <th className="py-1.5 font-normal">Name</th>
          <th className="w-[110px] py-1.5 text-right font-normal">Points</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-[color:var(--border-subtle)]">
            <td className="py-2 font-mono text-xs">{row.code}</td>
            <td className="py-2">{row.name}</td>
            <td className="py-2 text-right font-mono text-xs">{row.defaultPoints}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
