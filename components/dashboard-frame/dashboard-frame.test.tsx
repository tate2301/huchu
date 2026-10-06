// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ActionList } from "./action-list";
import { BarChart, ColumnsChart, compactTick, niceScale } from "./bar-chart";
import { DashboardFrame } from "./dashboard-frame";
import { HeatGrid, heatFill } from "./heat-grid";
import { HeroKpi } from "./hero-kpi";
import { InsightAside } from "./insight-aside";
import { InsightTabs } from "./insight-table";
import { KpiStrip, KpiTile } from "./kpi-tile";
import { Panel } from "./panel";
import { Segmented } from "@/components/workspace/segmented";
import { PeriodToolbar } from "./period-toolbar";
import { QuestionPanel } from "./question-panel";
import { RankList } from "./rank-list";
import { ShareBar } from "./share-bar";
import { StatusList } from "./status-list";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const money = (value: number) => `US$${value.toFixed(2)}`;

describe("DashboardFrame tiles, in the Floor board's shapes", () => {
  it("draws the hero KPI with its pill, sparkline and legend", () => {
    const hours = [12, 48, 96, 150, 182, 205, 176, 140, 118, 97];
    const lastWeek = [10, 40, 90, 140, 170, 190, 168, 150, 130, 110, 96, 60, 30];
    const html = renderToStaticMarkup(
      <HeroKpi
        label="Takings today"
        value="US$1,284.60"
        delta={{ text: "+8.2%", tone: "ok" }}
        comparison="on last Saturday by this hour (US$1,187.20)"
        points={lastWeek.map((before, index) => ({ label: `${7 + index}:00`, now: hours[index] ?? null, before }))}
        format={money}
        axis={["07:00", "10:00", "13:00", "16:00", "19:00"]}
        nowLabel="Today"
        beforeLabel="Last Saturday"
        chartLabel="Takings by hour today"
      />,
    );
    expect(html).toContain("cx-df-span-6");
    expect(html).toMatch(/Takings today<span class="cx-df-tile__value">US\$1,284.60<\/span>/);
    expect(html).toMatch(/class="cx-df-pill cx-df-pill--ok">\+8.2%/);
    expect(html).toContain("on last Saturday by this hour (US$1,187.20)");
    // Today a solid line over its fill; last Saturday dashed.
    expect(html).toMatch(/<polyline[^>]*stroke="var\(--data\)"[^>]*stroke-width="2"/);
    expect(html).toMatch(/<polygon[^>]*fill="var\(--data\)"[^>]*fill-opacity="0.1"/);
    expect(html).toMatch(/<polyline[^>]*stroke="var\(--data-compare\)"[^>]*stroke-dasharray="4 4"/);
    // Today stops at now: ten points, last Saturday runs the day.
    const nowLine = html.match(/data-series="now"/) ? html.match(/<polyline points="([^"]*)"[^>]*data-series="now"/)?.[1] : "";
    expect(nowLine?.split(" ")).toHaveLength(10);
    expect(html).toContain("07:00");
    expect(html).toContain("19:00");
    expect(html).toMatch(/cx-df-legend__line"[^>]*><\/span>Today/);
    expect(html).toMatch(/cx-df-legend__line cx-df-legend__line--compare"[^>]*><\/span>Last Saturday/);
  });

  it("draws a small KPI with seven bars, the last one in --data", () => {
    const html = renderToStaticMarkup(
      <KpiTile
        label="Sales"
        value="142"
        delta={{ text: "+11", tone: "ok" }}
        note="on last Saturday"
        bars={[118, 96, 104, 121, 133, 160, 142]}
      />,
    );
    expect(html).toContain("cx-df-span-2");
    expect(html.match(/class="cx-df-kpi__bar( [^"]*)?"/g)).toHaveLength(7);
    expect(html.match(/cx-df-kpi__bar--now/g)).toHaveLength(1);
    expect(html).toMatch(/cx-df-kpi__bar cx-df-kpi__bar--now" style="height:89%"/);
    expect(html).toMatch(/class="cx-df-mono cx-df-tone-ok">\+11<\/span> on last Saturday/);
    expect(html).toContain("Last 7 days");
  });

  it("says a tile has nothing yet instead of drawing zeros", () => {
    const html = renderToStaticMarkup(<KpiTile label="Sales" value="0" bars={[]} empty="Nothing yet today." />);
    expect(html).toContain("Nothing yet today.");
    expect(html).not.toContain("cx-df-kpi__bars");
  });

  it("draws the action list as links with a tone dot, figure and chevron", () => {
    const html = renderToStaticMarkup(
      <Panel title="Needs action" count={{ value: 2, tone: "bad" }} span={7}>
        <ActionList
          items={[
            {
              id: "stale",
              href: "/retail/shifts/1",
              title: "Back till open for 52 hours",
              meta: "SH-00240 · Farai Moyo · not cashed up since 17 Aug",
              figure: "US$72.95",
              dot: "warn",
            },
            {
              id: "short",
              href: "/retail/shifts?state=short",
              title: "Three drawers short this week",
              meta: "Chipo Dube twice, Farai Moyo once",
              figure: "−US$15.79",
              figureTone: "bad",
              dot: "bad",
            },
          ]}
        />
      </Panel>,
    );
    expect(html).toMatch(/<h2[^>]*>Needs action<\/h2><span class="cx-df-panel__count cx-df-panel__count--bad">2<\/span>/);
    expect(html.match(/<a href="[^"]+" class="cx-df-action">/g)).toHaveLength(2);
    expect(html).toContain("cx-df-action__dot cx-df-action__dot--warn");
    expect(html).toMatch(/cx-df-action__figure cx-df-tone-bad">−US\$15.79/);
    expect(html.match(/<svg/g)).toHaveLength(2);
  });

  it("draws the status list with a state badge and two figures", () => {
    const html = renderToStaticMarkup(
      <Panel title="Tills now" count={{ value: 1 }} link={{ href: "/retail/shifts", label: "Shifts" }} span={5}>
        <StatusList
          items={[
            {
              id: "front",
              name: "Front till",
              state: { tone: "info", label: "Open" },
              figure: "US$842.15",
              meta: "Chipo Dube · since 07:58 · float US$200.00",
              sub: "91 sales",
            },
          ]}
        />
      </Panel>,
    );
    expect(html).toMatch(/Front till<span class="cx-state cx-state--info">Open<\/span>/);
    expect(html).toContain('<span class="cx-df-status__figure">US$842.15</span>');
    expect(html).toContain('<span class="cx-df-status__sub">91 sales</span>');
    expect(html).toMatch(/<a class="cx-df-link" href="\/retail\/shifts">Shifts<\/a>|<a href="\/retail\/shifts" class="cx-df-link">Shifts<\/a>/);
  });

  it("draws 30 bars with the last one darker, on a readable axis", () => {
    const bars = Array.from({ length: 30 }, (_, index) => ({
      label: `Day ${index + 1}`,
      value: 800 + index * 20,
      text: money(800 + index * 20),
      sub: `${index + 90} sales`,
    }));
    const html = renderToStaticMarkup(
      <Panel title="Takings by day" qualifier="last 30 days" figure="US$34,918.40" span={8}>
        <BarChart bars={bars} xLabels={["4 Sep", "11 Sep", "18 Sep", "25 Sep", "3 Oct"]} label="Takings by day" />
      </Panel>,
    );
    expect(html.match(/data-bar=""/g)).toHaveLength(30);
    expect(html.match(/cx-df-bars__bar--now/g)).toHaveLength(1);
    expect(html).toMatch(/data-now="true" class="cx-df-bars__bar cx-df-bars__bar--now"/);
    expect(html).toContain('<span class="cx-df-tone-muted">last 30 days</span>');
    expect(html).toContain('<span class="cx-df-panel__figure">US$34,918.40</span>');
    for (const tick of ["2k", "1.5k", "1k", "500", "0"]) expect(html).toContain(`<span>${tick}</span>`);
  });

  it("shows a bar's day, value and sales on hover", () => {
    const view = mount(
      <BarChart
        bars={[
          { label: "Fri 2 October", value: 1200, text: "US$1,200.00", sub: "133 sales" },
          { label: "Sat 3 October", value: 1284.6, text: "US$1,284.60", sub: "142 sales" },
        ]}
        xLabels={["2 Oct", "3 Oct"]}
        label="Takings by day"
      />,
    );
    const slots = view.host.querySelectorAll(".cx-df-bars__slot");
    act(() => {
      slots[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const tip = view.host.querySelector('[role="status"]');
    expect(tip?.textContent).toBe("Sat 3 OctoberUS$1,284.60142 sales");
    view.unmount();
  });

  it("draws the share bar in --s1…--s4 with the legend's values", () => {
    const html = renderToStaticMarkup(
      <ShareBar
        parts={[
          { key: "cash", label: "Cash", value: "US$526.69", share: 0.41, color: "s1" },
          { key: "ecocash", label: "EcoCash", value: "US$436.76", share: 0.34, color: "s2" },
          { key: "card", label: "Card", value: "US$192.69", share: 0.15, color: "s3" },
          { key: "zig", label: "ZiG", value: "US$128.46", share: 0.1, color: "s4" },
        ]}
      />,
    );
    expect([...html.matchAll(/data-series="(s\d)"/g)].map((match) => match[1])).toEqual(["s1", "s2", "s3", "s4"]);
    expect(html).toContain('aria-label="Cash 41%, EcoCash 34%, Card 15%, ZiG 10%"');
    expect(html).toMatch(/<span>Cash<\/span><span class="cx-df-share__value">US\$526.69<\/span><span class="cx-df-share__pct">41%<\/span>/);
    expect(html).toMatch(/<span>ZiG<\/span><span class="cx-df-share__value">US\$128.46<\/span><span class="cx-df-share__pct">10%<\/span>/);
  });

  it("draws a rank list with its head, bars and meta, amber where stock runs low", () => {
    const html = renderToStaticMarkup(
      <RankList
        head={["Product", "On hand"]}
        rows={[
          { id: "jw", name: "Johnnie Walker Black 750ml", value: "6 left", valueTone: "bad", share: 0.5, barTone: "warn", meta: "reorder at 12" },
          { id: "cl", name: "Castle Lager case of 24", value: "22 left", share: 1, meta: "reorder at 20" },
        ]}
      />,
    );
    expect(html).toMatch(/<span>Product<\/span><span>On hand<\/span>/);
    expect(html).toMatch(/cx-df-rank__value cx-df-tone-bad">6 left/);
    expect(html).toMatch(/cx-df-rank__fill cx-df-rank__fill--warn" style="width:50.0%"/);
    expect(html).toMatch(/class="cx-df-rank__fill" style="width:100.0%"/);
    expect(html).toContain('<span class="cx-df-rank__meta">reorder at 12</span>');
  });
});

describe("the insight variant, in the InsightsSales board's shapes", () => {
  it("lays out a main column beside the aside under the toolbar", () => {
    const html = renderToStaticMarkup(
      <DashboardFrame variant="insight" label="Sales" toolbar={<div id="bar" />} aside={<p>aside</p>}>
        <p>main</p>
      </DashboardFrame>,
    );
    expect(html).toMatch(/^<div class="cx-df cx-df--insight"><div id="bar"><\/div><div class="cx-df-insight">/);
    expect(html).toContain('<aside class="cx-df-aside"><p>aside</p></aside>');
  });

  it("opens the main column with the headline: the fact, then what to notice", () => {
    const headline = {
      fact: "US$11,732 taken in the last 30 days across two shops.",
      notice: "Fri 17:00 is the busiest hour; takings are 17% down on the 30 days before.",
    };
    const html = renderToStaticMarkup(
      <DashboardFrame variant="insight" label="Sales" toolbar={<div id="bar" />} headline={headline}>
        <p>main</p>
      </DashboardFrame>,
    );
    expect(html).toContain(
      '<div class="cx-df-main" aria-label="Sales" role="region"><div class="cx-df-headline">' +
        '<p class="cx-df-headline__fact">US$11,732 taken in the last 30 days across two shops.</p>' +
        '<p class="cx-df-headline__notice">Fri 17:00 is the busiest hour; takings are 17% down on the 30 days before.</p></div><p>main</p>',
    );
    const overview = renderToStaticMarkup(
      <DashboardFrame variant="overview" toolbar={<div />} headline={headline}>
        <p>tile</p>
      </DashboardFrame>,
    );
    expect(overview).toMatch(/<div class="cx-df-grid"><div class="cx-df-headline">.*<\/div><p>tile<\/p>/);
    const bare = renderToStaticMarkup(
      <DashboardFrame variant="insight" toolbar={<div />} headline={null}>
        <p>main</p>
      </DashboardFrame>,
    );
    expect(bare).not.toContain("cx-df-headline");
  });

  it("puts the period, site, comparison and update time in the toolbar", () => {
    const html = renderToStaticMarkup(
      <PeriodToolbar
        ground
        periods={[
          { value: "today", label: "Today" },
          { value: "7d", label: "7 days" },
          { value: "30d", label: "30 days" },
          { value: "month", label: "This month" },
        ]}
        period="30d"
        onPeriodChange={() => {}}
        site={{ value: "all", label: "All sites", options: [{ value: "all", label: "All sites" }], onChange: () => {} }}
        compare="Compared with the 30 days before"
        updatedAt="2026-10-03T12:42:00Z"
      />,
    );
    expect(html).toContain("cx-df-toolbar cx-df-toolbar--ground");
    expect(html).toMatch(/aria-pressed="true">30 days</);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(html).toMatch(/cx-filter__label">Site<\/span><span class="cx-filter__value">All sites/);
    expect(html).toContain("Compared with the 30 days before");
    expect(html).toContain("Updated 14:42");
  });

  const PERIODS = [
    { value: "today", label: "Today" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "month", label: "This month" },
  ] as const;

  it("offers Choose dates after the periods when no days are chosen", () => {
    const html = renderToStaticMarkup(
      <PeriodToolbar
        periods={PERIODS}
        period="30d"
        onPeriodChange={() => {}}
        range={{ value: null, onChange: () => {}, onClear: () => {}, presets: [] }}
      />,
    );
    expect(html).toMatch(/aria-pressed="true">30 days</);
    expect(html).toMatch(/This month<\/button><\/div><button[^>]*class="cx-btn"[^>]*>.*Choose dates<\/button>/);
    expect(html).not.toContain("cx-filter-wrap");
  });

  it("draws the chosen days as a clearable chip and presses no period", () => {
    const onClear = vi.fn();
    const onPeriodChange = vi.fn();
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    const view = mount(
      <PeriodToolbar
        periods={PERIODS}
        period={null}
        onPeriodChange={onPeriodChange}
        range={{ value: { from: "2026-10-01", to: "2026-10-03" }, onChange: () => {}, onClear, presets: [] }}
      />,
    );
    expect(view.host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    expect(view.host.textContent).not.toContain("Choose dates");
    const chip = view.host.querySelector(".cx-filter-wrap .cx-filter")!;
    expect(chip.textContent).toBe("1 to 3 October");
    expect(chip.querySelector(".cx-filter__label")).toBeNull();
    // The × is its own button beside the chip, never inside it.
    expect(chip.querySelector("button")).toBeNull();
    const clear = view.host.querySelector<HTMLButtonElement>('button[aria-label="Clear the dates"]')!;
    act(() => clear.click());
    expect(onClear).toHaveBeenCalledTimes(1);
    act(() => (view.host.querySelector('[aria-label="Period"] button') as HTMLButtonElement).click());
    expect(onPeriodChange).toHaveBeenCalledWith("today");
    view.unmount();
  });

  it("presses nothing in a Segmented with no value, and any item answers", () => {
    const onValueChange = vi.fn();
    const view = mount(<Segmented items={PERIODS} value={null} onValueChange={onValueChange} />);
    expect(view.host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    expect(view.host.querySelectorAll('[aria-pressed="false"]')).toHaveLength(4);
    act(() => (view.host.querySelectorAll("button")[2] as HTMLButtonElement).click());
    expect(onValueChange).toHaveBeenCalledWith("30d");
    view.unmount();
  });

  it("writes the overview's live line in the shop's time", () => {
    const html = renderToStaticMarkup(
      <PeriodToolbar
        periods={[{ value: "today", label: "Today" }]}
        period="today"
        onPeriodChange={() => {}}
        live="2026-10-03T12:42:00Z"
      />,
    );
    expect(html).toMatch(/Live · Saturday 3 October 2026 · <span class="cx-df-mono">14:42<\/span>/);
  });

  it("draws four KPIs in one strip, deltas in their tone", () => {
    const html = renderToStaticMarkup(
      <KpiStrip
        items={[
          { label: "Takings", value: "US$34,918.40", delta: { text: "+6.1%", tone: "ok" }, note: "on the 30 days before" },
          { label: "Sales", value: "3,862", delta: { text: "+4.0%", tone: "ok" }, note: "baskets" },
          { label: "Average basket", value: "US$9.04", delta: { text: "+US$0.18", tone: "ok" } },
          { label: "Items a basket", value: "2.7", delta: { text: "−0.1", tone: "bad" } },
        ]}
      />,
    );
    expect(html.match(/cx-df-strip__tile/g)).toHaveLength(4);
    expect(html).toMatch(/cx-df-strip__delta cx-df-tone-ok">\+6.1%<\/span> on the 30 days before/);
    expect(html).toMatch(/cx-df-strip__delta cx-df-tone-bad">−0.1/);
  });

  it("draws the heat grid in one hue, shut hours on the tray, with a tooltip a cell", () => {
    const values = [
      [40, 62, null],
      [342, 0, 190],
    ];
    const view = mount(
      <QuestionPanel question="When do we sell?" unit="Takings by day and hour, last 30 days, average a day">
        <HeatGrid rows={["Fri", "Sun"]} columns={["17", "18", "19"]} values={values} format={money} label="Takings" />
      </QuestionPanel>,
    );
    const cells = view.host.querySelectorAll<HTMLElement>("[data-cell]");
    expect(cells).toHaveLength(6);
    expect(view.host.querySelectorAll("[data-closed]")).toHaveLength(1);
    expect(cells[3].style.background).toContain("100.0%");
    expect(view.host.textContent).toContain("QuieterBusier");
    expect(view.host.querySelector("h2")?.textContent).toBe("When do we sell?");
    act(() => {
      cells[3].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe("Sun 17:00US$342.00");
    act(() => {
      cells[2].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe("Fri 19:00Closed");
    view.unmount();
  });

  it("fades the quietest cell to 8% and the busiest to full", () => {
    expect(heatFill(0, 200)).toBe("color-mix(in srgb, var(--data) 8.0%, transparent)");
    expect(heatFill(200, 200)).toBe("color-mix(in srgb, var(--data) 100.0%, transparent)");
  });

  it("draws the tabs and one table with its Σ row, and switches tab", () => {
    const tables = [
      {
        id: "category",
        label: "By category",
        columns: [
          { id: "name", label: "Category" },
          { id: "takings", label: "Takings", align: "end" as const, width: "140px" },
        ],
        rows: [{ id: "beer", cells: { name: { text: "Beer" }, takings: { text: "US$14,204.10", mono: true } } }],
        total: { label: "Σ 1 categories", cells: { takings: { text: "US$14,204.10", mono: true } } },
        empty: "No sales in these dates.",
      },
      {
        id: "till",
        label: "By till",
        columns: [{ id: "name", label: "Till" }],
        rows: [],
        empty: "No sales in these dates.",
      },
    ];
    const onChange = vi.fn();
    const view = mount(<InsightTabs tables={tables} value="category" onValueChange={onChange} />);
    expect([...view.host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(["By category", "By till"]);
    const rows = view.host.querySelectorAll('.cx-df-table [role="row"]');
    expect(rows).toHaveLength(3);
    expect(rows[2].className).toContain("cx-df-table__row--total");
    expect(rows[2].textContent).toBe("Σ 1 categoriesUS$14,204.10");
    expect((rows[1] as HTMLElement).style.gridTemplateColumns).toBe("minmax(0, 1fr) 140px");
    act(() => {
      (view.host.querySelectorAll('[role="tab"]')[1] as HTMLElement).click();
    });
    expect(onChange).toHaveBeenCalledWith("till");
    view.unmount();

    const empty = renderToStaticMarkup(<InsightTabs tables={tables} value="till" onValueChange={() => {}} />);
    expect(empty).toContain("No sales in these dates.");
  });

  it("draws columns with a tooltip a segment", () => {
    const view = mount(
      <ColumnsChart
        label="Losses each week"
        stacked
        series={[
          { key: "counts", label: "Count differences", color: "s1" },
          { key: "drawer", label: "Drawer differences", color: "s2" },
        ]}
        groups={[{ label: "28 Sept", values: { counts: 20, drawer: 5 } }]}
        format={money}
      />,
    );
    const parts = view.host.querySelectorAll(".cx-df-bars__stack > span");
    expect([...parts].map((part) => part.className)).toEqual(["cx-df-s1", "cx-df-s2"]);
    act(() => {
      parts[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe("28 Sept · Drawer differencesUS$5.00");
    view.unmount();
  });

  it("writes the aside: what to do, and Send me this only when offered — never a What it says box", () => {
    const html = renderToStaticMarkup(
      <InsightAside actions={[{ label: "Put two cashiers on Friday 16:00 to 21:00", href: "/retail/manage/people" }]} />,
    );
    expect(html).not.toContain("What it says");
    expect(html).toContain("Do something about it");
    expect(html).toMatch(/<a href="\/retail\/manage\/people" class="cx-df-aside__do"><span>Put two cashiers on Friday 16:00 to 21:00<\/span><svg/);
    expect(html).not.toContain("Send me this");

    const send = renderToStaticMarkup(
      <InsightAside
        actions={[]}
        send={{ words: "This page, as a picture and three lines, every Monday at 07:00 on WhatsApp.", onWords: null, onSend: () => {} }}
      />,
    );
    expect(send).not.toContain("Not enough trade");
    expect(send).not.toContain("Do something about it");
    expect(send).toContain("Send me this");
    expect(send).toContain(">Send it every Monday</button>");
  });
});

describe("chart scales", () => {
  it("steps the axis in 1, 2, 2.5 or 5 × 10ⁿ", () => {
    expect(niceScale(1900).ticks).toEqual([2000, 1500, 1000, 500, 0]);
    expect(niceScale(180).ticks).toEqual([200, 150, 100, 50, 0]);
    expect(niceScale(0).top).toBe(4);
    expect(compactTick(1500)).toBe("1.5k");
    expect(compactTick(500)).toBe("500");
  });
});
