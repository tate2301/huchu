"use client";

import * as React from "react";
import Link from "next/link";

import { Button, ButtonGroup, ButtonLink, Empty, Finding, GroupHead, Icon } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import {
  REPORT_VIEW_LABEL,
  REPORT_VIEWS,
  type ReportEntry,
  type ReportsFilter,
  type ReportsView,
} from "@/lib/reports/all";

export type ReportColumns = { kind: boolean; folder: boolean; made: boolean; seen: boolean };

const COLUMN_LABEL: Record<keyof ReportColumns, string> = { kind: "Kind", folder: "Folder", made: "Made by", seen: "Who sees it" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today", "yesterday", or "2 Oct": when a report last changed, in the reader's own days. */
export function changedWhen(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${at.getDate()} ${MONTHS[at.getMonth()]}${at.getFullYear() === now.getFullYear() ? "" : ` ${at.getFullYear()}`}`;
}

/** One of ours: a link to it, with a menu over its right edge to file it in a folder. */
function OurRow({
  entry,
  columns,
  folders,
  onMove,
}: {
  entry: ReportEntry;
  columns: ReportColumns;
  folders: Array<{ id: string; name: string }>;
  onMove: (entry: ReportEntry, folderId: string | null) => void;
}) {
  const made = [entry.madeBy, entry.updatedAt ? changedWhen(entry.updatedAt) : null].filter(Boolean).join(", ");
  return (
    <div className="rr-wrap">
      <Link className="row rr" href={entry.href}>
        <span className="lead truncate">{entry.title}</span>
        <span className="muted">{columns.kind ? entry.kind : null}</span>
        <span className="truncate">{columns.folder ? entry.folder?.name : null}</span>
        <span className="muted truncate">{columns.made ? made : null}</span>
        <span className="muted">{columns.seen ? entry.seenBy : null}</span>
        <Icon name="chev" className="chev" />
      </Link>
      {entry.movable ? (
        <span className="row-acts rr-move">
          <MenuButton
            variant="quiet"
            size="sm"
            icon="folder"
            iconEnd={undefined}
            className="btn-icon"
            aria-label={`Move ${entry.title} to a folder`}
            label="Folders"
            align="end"
            items={[
              { key: "none", label: "No folder", checked: !entry.folder, onSelect: () => onMove(entry, null) },
              ...(folders.length ? [{ separator: true as const }] : []),
              ...folders.map((folder) => ({
                key: folder.id,
                label: folder.name,
                checked: entry.folder?.id === folder.id,
                onSelect: () => onMove(entry, folder.id),
              })),
            ]}
          >
            {null}
          </MenuButton>
        </span>
      ) : null}
    </div>
  );
}

/** One of Corelith's: what it shows, and Make it yours. */
function CorelithRow({ entry, copying, onCopy }: { entry: ReportEntry; copying: boolean; onCopy: (entry: ReportEntry) => void }) {
  return (
    <div className="row rb">
      <Link className="lead truncate" href={entry.href}>
        {entry.title}
      </Link>
      <span className="truncate">{entry.summary}</span>
      <span className="a">
        {entry.copy ? (
          <Button icon="file" busy={copying} disabled={copying} onClick={() => onCopy(entry)}>
            Make it yours
          </Button>
        ) : (
          <ButtonLink icon="chev" href={entry.href}>
            Open
          </ButtonLink>
        )}
      </span>
    </div>
  );
}

/**
 * Reports → All reports (ReportsAll): the view menu, search, Filter (area),
 * Anyone (who made it), then Newest first, Columns and Export; the finding;
 * Yours and shared, then From Corelith. Pure: the page feeds it.
 */
export function ReportsAllView({
  entries,
  finding,
  filter,
  folder,
  folders,
  areas,
  makers,
  onFilter,
  onMove,
  onCopy,
  onExport,
  copying,
  initialColumns = { kind: true, folder: true, made: true, seen: true },
}: {
  /** What the filter shows. */
  entries: ReportEntry[];
  finding: { fact: string; rest: string | null };
  filter: ReportsFilter;
  /** The folder being looked at, by name. */
  folder: { id: string; name: string } | null;
  folders: Array<{ id: string; name: string }>;
  areas: string[];
  makers: string[];
  onFilter: (next: Partial<ReportsFilter>) => void;
  onMove: (entry: ReportEntry, folderId: string | null) => void;
  onCopy: (entry: ReportEntry) => void;
  onExport: () => void;
  /** The entry whose copy is being made. */
  copying: string | null;
  initialColumns?: ReportColumns;
}) {
  const [columns, setColumns] = React.useState(initialColumns);
  const [q, setQ] = React.useState(filter.q);
  React.useEffect(() => {
    if (q === filter.q) return;
    const timer = window.setTimeout(() => onFilter({ q }), 250);
    return () => window.clearTimeout(timer);
  }, [q, filter.q, onFilter]);

  const ours = entries.filter((entry) => entry.group === "ours");
  const corelith = entries.filter((entry) => entry.group === "corelith");
  const narrowed = Boolean(filter.q.trim() || filter.area || filter.maker);
  const showOurs = filter.view !== "corelith";
  const showCorelith = !folder && (filter.view === "all" || filter.view === "corelith");
  const oursTitle = folder ? folder.name : filter.view === "all" ? "Yours and shared" : REPORT_VIEW_LABEL[filter.view];
  const clear = () => {
    setQ("");
    onFilter({ q: "", area: null, maker: null });
  };

  return (
    <>
      <div className="tools tl-m">
        <MenuButton
          icon="reports"
          label="Which reports"
          items={REPORT_VIEWS.map((view) => ({
            key: view,
            label: REPORT_VIEW_LABEL[view],
            checked: !folder && filter.view === view,
            onSelect: () => onFilter({ view: view as ReportsView, folder: null }),
          }))}
        >
          {folder ? folder.name : REPORT_VIEW_LABEL[filter.view]}
        </MenuButton>
        <label className="input-wrap tl-find">
          <Icon name="search" />
          <input type="search" aria-label="Search this list" placeholder="Search this list" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <MenuButton
          variant="quiet"
          icon="filter"
          iconEnd={undefined}
          label="Area"
          items={[
            { key: "any", label: "Every area", checked: !filter.area, onSelect: () => onFilter({ area: null }) },
            ...(areas.length ? [{ separator: true as const }] : []),
            ...areas.map((area) => ({ key: area, label: area, checked: filter.area === area, onSelect: () => onFilter({ area }) })),
          ]}
        >
          {filter.area ?? "Filter"}
        </MenuButton>
        <MenuButton
          variant="quiet"
          icon="users"
          label="Made by"
          items={[
            { key: "anyone", label: "Anyone", checked: !filter.maker, onSelect: () => onFilter({ maker: null }) },
            { key: "you", label: "You", checked: filter.maker === "you", onSelect: () => onFilter({ maker: "you" }) },
            ...(makers.length ? [{ separator: true as const }] : []),
            ...makers.map((maker) => ({ key: maker, label: maker, checked: filter.maker === maker, onSelect: () => onFilter({ maker }) })),
          ]}
        >
          {filter.maker === "you" ? "You" : (filter.maker ?? "Anyone")}
        </MenuButton>
        <div className="end">
          <ButtonGroup aria-label="This list">
            <Button icon="sort" onClick={() => onFilter({ sort: filter.sort === "newest" ? "oldest" : "newest" })}>
              {filter.sort === "newest" ? "Newest first" : "Oldest first"}
            </Button>
            <MenuButton
              icon="columns"
              iconEnd={undefined}
              align="end"
              label="Columns"
              items={(Object.keys(COLUMN_LABEL) as Array<keyof ReportColumns>).map((key) => ({
                key,
                label: COLUMN_LABEL[key],
                checked: columns[key],
                onSelect: () => setColumns((current) => ({ ...current, [key]: !current[key] })),
              }))}
            >
              Columns
            </MenuButton>
            <Button icon="export" onClick={onExport}>
              Export
            </Button>
          </ButtonGroup>
        </div>
      </div>

      <Finding fact={finding.fact} rest={finding.rest} />

      {entries.length === 0 && narrowed ? (
        <Empty
          icon="search"
          title="No report matches"
          action={
            <Button icon="x" onClick={clear}>
              Clear the search and filters
            </Button>
          }
        >
          Nothing here is called that, or made by them, in that area.
        </Empty>
      ) : (
        <>
          {showOurs ? (
            <section aria-labelledby="reports-ours">
              <GroupHead id="reports-ours" title={oursTitle} sum={ours.length} />
              {ours.length > 0 ? (
                <div className="list">
                  {ours.map((entry) => (
                    <OurRow key={entry.id} entry={entry} columns={columns} folders={folders} onMove={onMove} />
                  ))}
                </div>
              ) : (
                <Empty icon={folder ? "folder" : "reports"} title={folder ? "Nothing in this folder yet" : filter.view === "shared" ? "Nothing is shared with you yet" : "Nothing made here yet"}>
                  {folder
                    ? "Move a report here with the folder button on its row."
                    : "Make one with New report, or press Make it yours on any of Corelith's."}
                </Empty>
              )}
            </section>
          ) : null}
          {showCorelith && corelith.length > 0 ? (
            <section aria-labelledby="reports-corelith">
              <GroupHead id="reports-corelith" title="From Corelith" sum={corelith.length} />
              <div className="list">
                {corelith.map((entry) => (
                  <CorelithRow key={entry.id} entry={entry} copying={copying === entry.id} onCopy={onCopy} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
