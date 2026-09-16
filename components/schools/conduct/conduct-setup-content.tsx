"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { LoadError, NothingYet, SaveError, TableRowsSkeleton } from "@/components/records/states";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { ConductReasonDialog } from "@/components/schools/conduct/conduct-reason-dialog";
import { RecordActions } from "@/components/schools/common/record-actions";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchConductCategories,
  fetchMeritReasons,
  updateConductCategory,
  updateMeritReason,
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

  /*
    This screen asks for retired rows; every picker in the module does not.

    Retiring is the only way to take a category or a reason out of use —
    neither has a delete, deliberately, because incidents and merits already
    recorded point at them. That makes retiring a one-way door unless the screen
    that did it can still see what it retired, so these three queries ask for
    them and carry `all` in the key to stay off the pickers' cached copies.
  */
  const categoriesQuery = useQuery({
    queryKey: ["schools", "conduct", "categories", "all"],
    queryFn: () => fetchConductCategories({ includeRetired: true }),
  });

  const meritsQuery = useQuery({
    queryKey: ["schools", "conduct", "reasons", "MERIT", "all"],
    queryFn: () => fetchMeritReasons("MERIT", { includeRetired: true }),
  });

  const demeritsQuery = useQuery({
    queryKey: ["schools", "conduct", "reasons", "DEMERIT", "all"],
    queryFn: () => fetchMeritReasons("DEMERIT", { includeRetired: true }),
  });

  const categories = categoriesQuery.data?.rows ?? [];
  const merits = meritsQuery.data?.rows ?? [];
  const demerits = demeritsQuery.data?.rows ?? [];

  const refresh = () => {
    /*
      The whole `conduct` prefix, not the two keys this screen happens to use.

      The reason a school adds here is read by the award dialog on the merits
      screen, which keys its copy `["schools","conduct","merits","reasons"]` —
      so invalidating `["schools","conduct","reasons"]` prefix-matches this
      screen's own queries and not that one. Somebody adding a reason and going
      straight to award it would not see it until the cache went stale on its
      own. Conduct lists are small and cheap to refetch; the wide prefix is the
      right trade.
    */
    void queryClient.invalidateQueries({ queryKey: ["schools", "conduct"] });
  };

  /*
    Retire and bring back, which is the only shape "delete" takes here.

    Neither table has a DELETE and neither should: an incident points at its
    category and a merit points at its reason, and taking the row away would
    strip the meaning out of everything already recorded against it. `isActive`
    shipped on both models for exactly this and nothing could set it, so a
    mistyped category was in the picker for good.
  */
  const retireCategory = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => updateConductCategory(input),
    onSuccess: () => {
      setSaveError(null);
      refresh();
    },
    onError: (error) => setSaveError(getApiErrorMessage(error)),
  });

  const retireReason = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => updateMeritReason(input),
    onSuccess: () => {
      setSaveError(null);
      refresh();
    },
    onError: (error) => setSaveError(getApiErrorMessage(error)),
  });

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
                  <th className="w-[44px] py-1.5" />
                </tr>
              </thead>
              <tbody>
                {categories.map((row) => (
                  <tr key={row.id} className="border-b border-[color:var(--border-subtle)]">
                    <td className="py-2 font-mono text-xs">{row.code}</td>
                    <td className="py-2">
                      {row.name}
                      {row.isActive ? null : (
                        <span className="ml-2">
                          <Badge tone="neutral">Retired</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <Badge tone={toneBadge(row.tone)}>{TONE_LABELS[row.tone]}</Badge>
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {row.demeritPoints ?? "—"}
                    </td>
                    <td className="py-2">
                      <RecordActions
                        layout="menu"
                        label={`Row actions for ${row.name}`}
                        resource="schools.conduct"
                        verbs={[
                          {
                            label: row.isActive ? "Retire it" : "Bring it back",
                            action: "configure",
                            loading: retireCategory.isPending,
                            tone: row.isActive ? "warning" : "default",
                            confirm: row.isActive
                              ? {
                                  title: `Retire ${row.name}?`,
                                  description:
                                    "It stops being offered when somebody logs an incident. Everything already logged against it keeps its reason, and you can bring it back from here.",
                                  confirmLabel: "Retire it",
                                }
                              : undefined,
                            onSelect: () =>
                              retireCategory.mutate({ id: row.id, isActive: !row.isActive }),
                          },
                        ]}
                      />
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
            onRetire={(input) => retireReason.mutate(input)}
            retiring={retireReason.isPending}
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
  onRetire,
  retiring,
}: {
  rows: Array<{
    id: string;
    code: string;
    name: string;
    defaultPoints: number;
    isActive: boolean;
  }>;
  kind: "merit" | "demerit";
  onNew: () => void;
  onRetire: (input: { id: string; isActive: boolean }) => void;
  retiring: boolean;
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
          <th className="w-[44px] py-1.5" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-[color:var(--border-subtle)]">
            <td className="py-2 font-mono text-xs">{row.code}</td>
            <td className="py-2">
              {row.name}
              {row.isActive ? null : (
                <span className="ml-2">
                  <Badge tone="neutral">Retired</Badge>
                </span>
              )}
            </td>
            <td className="py-2 text-right font-mono text-xs">{row.defaultPoints}</td>
            <td className="py-2">
              <RecordActions
                layout="menu"
                label={`Row actions for ${row.name}`}
                resource="schools.conduct"
                verbs={[
                  {
                    label: row.isActive ? "Retire it" : "Bring it back",
                    action: "configure",
                    loading: retiring,
                    tone: row.isActive ? "warning" : "default",
                    confirm: row.isActive
                      ? {
                          title: `Retire ${row.name}?`,
                          description:
                            "It stops being offered when somebody awards a merit or a demerit. Everything already awarded keeps its reason, and you can bring it back from here.",
                          confirmLabel: "Retire it",
                        }
                      : undefined,
                    onSelect: () => onRetire({ id: row.id, isActive: !row.isActive }),
                  },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
