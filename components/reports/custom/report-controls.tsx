"use client";

import { Button, ButtonGroup, Finding, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { COMMON_PRESETS, DateRangePicker } from "@/components/ui/date-picker";
import { fillSentence, type ControlFilter, type ControlsBlock, type SentenceBlock } from "@/lib/reports/custom/document";
import type { BlockResult } from "@/lib/reports/custom/run";
import { formatValue } from "@/lib/reports/format";
import type { ReportColumn, ReportValue } from "@/lib/reports/types";
import { insightMoney } from "@/lib/reports/week-insights";

/**
 * The two blocks a board opens with (ReportMonday, ReportBuild): its finding
 * sentence over a question's first row, and its own controls — the dates and
 * a filter on each column it names. Drawn the same on the report and in the
 * builder.
 */

/** A value as a sentence says it: money with its dollar sign, counts in figures. */
export function sentenceValue(value: ReportValue | undefined, column: ReportColumn): string {
  if (column.kind === "money" && typeof value === "number" && (!column.currency || column.currency === "USD")) return insightMoney(value);
  return formatValue(value, column);
}

/** The sentence over its question's first row. Null while it cannot be said yet; a reason when it cannot be said at all. */
export function sentenceText(block: SentenceBlock, result: BlockResult | undefined): { fact: string; rest: string | null } | { problem: string } | null {
  if (!block.from) return { problem: "Choose the question it reads, in Block" };
  if (!result) return null;
  if (!result.ok) return { problem: `${block.from.replace(/_/g, " ")} has a problem of its own` };
  const row = result.rows[0];
  const value = (name: string) => {
    const column = result.columns.find((candidate) => candidate.key === name);
    return column && row ? sentenceValue(row[name], column) : null;
  };
  const fact = fillSentence(block.fact, value).trim();
  const rest = block.rest ? fillSentence(block.rest, value).trim() : "";
  if (!fact && !rest) return { problem: "Write the sentence in Block" };
  return { fact: fact || rest, rest: fact && rest ? rest : null };
}

export function SentenceView({ block, result, loading }: { block: SentenceBlock; result: BlockResult | undefined; loading: boolean }) {
  const said = loading ? null : sentenceText(block, result);
  if (!said) {
    return (
      <div className="finding" aria-busy="true">
        <div className="skeleton" style={{ height: 28, width: "70%" }} />
      </div>
    );
  }
  if ("problem" in said) return <p className="muted rp-pad">{said.problem}.</p>;
  // Titled, it reads as a note beside a chart: the title, the fact, then the rest.
  if (block.title) {
    return (
      <section className="rp-pad" aria-label={block.title}>
        <h3 className="rp-sec">{block.title}</h3>
        <p className="rp-text">{said.fact}</p>
        {said.rest ? <p className="rp-text">{said.rest}</p> : null}
      </section>
    );
  }
  return (
    <Kit contents>
      <Finding fact={said.fact} rest={said.rest} />
    </Kit>
  );
}

/** A filter at rest names what it covers: "Every fitter". */
export function filterWords(filter: Pick<ControlFilter, "label">, value: string | undefined): string {
  return value ?? `Every ${filter.label.toLowerCase()}`;
}

/**
 * The controls ("Narrow the board"): the dates, then each filter as a menu of
 * the values its column holds in the rows read. Choosing one narrows every
 * question; the first entry clears it.
 */
export function ControlsView({
  block,
  dates = { from: null, to: null },
  datesWords,
  onDates,
  onDatesClick,
  values,
  options,
  onFilter,
  label = "Narrow the board",
}: {
  block: Pick<ControlsBlock, "dates" | "filters">;
  dates?: { from: string | null; to: string | null };
  /** "Last 180 days, 16 April to 13 October". */
  datesWords: string;
  /** Read: the dates change as the report is read. */
  onDates?: (next: { from: string; to: string }) => void;
  /** Built: the date button opens the report's own dates instead. */
  onDatesClick?: () => void;
  /** The value each filter is set to, by column. */
  values: Readonly<Record<string, string>>;
  /** The values each filter's column holds, by column. */
  options: Readonly<Record<string, readonly string[]>>;
  onFilter: (column: string, value: string | null) => void;
  label?: string;
}) {
  return (
    // On a phone the controls wrap rather than push the page sideways.
    <ButtonGroup aria-label={label} style={{ flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
      {block.dates && onDatesClick ? (
        <Button icon="calendar" onClick={onDatesClick}>
          {datesWords}
        </Button>
      ) : block.dates && onDates ? (
        <DateRangePicker
          openEnded
          presets={COMMON_PRESETS}
          title="Dates"
          value={dates}
          onChange={(next) => onDates({ from: next.from ?? "", to: next.to ?? "" })}
          trigger={
            <Button icon="calendar" aria-label={`Dates: ${datesWords}`} style={{ maxWidth: "100%" }}>
              <span className="truncate">{datesWords}</span>
            </Button>
          }
        />
      ) : null}
      {block.filters.map((filter) => {
        const value = values[filter.column];
        const choices = options[filter.column] ?? [];
        return (
          <MenuButton
            key={filter.column}
            icon="filter"
            label={`Every ${filter.label.toLowerCase()}`}
            items={[
              { key: "", label: `Every ${filter.label.toLowerCase()}`, checked: !value, onSelect: () => onFilter(filter.column, null) },
              ...choices.map((choice) => ({ key: choice, label: choice, checked: choice === value, onSelect: () => onFilter(filter.column, choice) })),
            ]}
          >
            {filterWords(filter, value)}
          </MenuButton>
        );
      })}
    </ButtonGroup>
  );
}
