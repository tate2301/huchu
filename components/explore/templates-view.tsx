"use client";

import * as React from "react";

import { Button, ButtonGroup, ButtonLink, Icon } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { productInfo, PRODUCTS, type ProductKey } from "@/lib/explore/products";
import type { ExploreTemplate } from "@/lib/explore/templates";
import { templateTitle } from "@/lib/explore/templates";

import { toCsv } from "./worksheet";

export type TemplateRow = ExploreTemplate & { reads: string[] };

const PAGE = 25;

type Columns = { answers: boolean; reads: boolean; madeBy: boolean };

/**
 * Explore → Templates (the ExploreTemplates board): questions to start from,
 * by product, each with what it answers, what it reads and who made it.
 * Opening one starts a new question from its SQL. Pure: the page feeds it.
 */
export function TemplatesView({
  templates,
  product,
  onProduct,
  workspaceName,
}: {
  templates: readonly TemplateRow[];
  product: ProductKey | null;
  onProduct: (product: ProductKey | null) => void;
  workspaceName: string;
}) {
  const [q, setQ] = React.useState("");
  const [madeBy, setMadeBy] = React.useState<ExploreTemplate["madeBy"] | null>(null);
  const [table, setTable] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<"product" | "title">("product");
  const [grouped, setGrouped] = React.useState(true);
  const [columns, setColumns] = React.useState<Columns>({ answers: true, reads: true, madeBy: true });
  const [page, setPage] = React.useState(1);

  React.useEffect(() => setPage(1), [q, madeBy, table, product, sort, grouped]);

  const needle = q.trim().toLowerCase();
  const rows = React.useMemo(() => {
    const order = new Map(PRODUCTS.map((info, index) => [info.key, index]));
    return templates
      .filter((template) => !product || template.product === product)
      .filter((template) => !madeBy || template.madeBy === madeBy)
      .filter((template) => !table || template.reads.includes(table))
      .filter((template) => !needle || `${templateTitle(template)} ${template.answers} ${template.reads.join(" ")}`.toLowerCase().includes(needle))
      .sort((a, b) =>
        sort === "title" && !grouped
          ? templateTitle(a).localeCompare(templateTitle(b))
          : (order.get(a.product) ?? 0) - (order.get(b.product) ?? 0) || (sort === "title" ? templateTitle(a).localeCompare(templateTitle(b)) : 0),
      );
  }, [templates, product, madeBy, table, needle, sort, grouped]);

  const from = rows.length ? (page - 1) * PAGE + 1 : 0;
  const to = Math.min(rows.length, page * PAGE);
  const shown = rows.slice(Math.max(0, from - 1), to);
  const tables = [...new Set(templates.flatMap((template) => template.reads))].sort();
  const span = 2 + (columns.answers ? 1 : 0) + (columns.reads ? 1 : 0) + (columns.madeBy ? 1 : 0);

  const exportCsv = () => {
    const data = rows.map((template) => ({ template: templateTitle(template), answers: template.answers, reads: template.reads.join(", "), made_by: template.madeBy, sql: template.sql }));
    const csv = toCsv(
      ["template", "answers", "reads", "made_by", "sql"].map((key) => ({ key, label: key, kind: "text" as const })),
      data,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `Explore templates, ${workspaceName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="wt">
      <div className="ws-tools">
        <label className="input-wrap ws-find">
          <Icon name="search" />
          <input type="search" aria-label="Search templates" placeholder="Search templates" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <MenuButton
          className={product ? "chipsel is-set" : "chipsel"}
          label="Product"
          iconEnd="down"
          items={[
            { key: "any", label: "Any product", checked: !product, onSelect: () => onProduct(null) },
            { separator: true },
            ...PRODUCTS.filter((info) => templates.some((template) => template.product === info.key)).map((info) => ({
              key: info.key,
              label: info.name,
              checked: product === info.key,
              onSelect: () => onProduct(info.key),
            })),
          ]}
        >
          Product <b>{product ? productInfo(product).name : "Any"}</b>
        </MenuButton>
        <MenuButton
          className={madeBy ? "chipsel is-set" : "chipsel"}
          label="Made by"
          iconEnd="down"
          items={[
            { key: "any", label: "Anyone", checked: !madeBy, onSelect: () => setMadeBy(null) },
            { separator: true },
            { key: "Corelith", label: "Corelith", checked: madeBy === "Corelith", onSelect: () => setMadeBy("Corelith") },
            { key: "Vane", label: "Vane", checked: madeBy === "Vane", onSelect: () => setMadeBy("Vane") },
          ]}
        >
          Made by <b>{madeBy ?? "Any"}</b>
        </MenuButton>
        <MenuButton
          icon="filter"
          label="Filters"
          items={[
            { heading: "Reads the table" },
            { key: "any", label: "Any table", checked: !table, onSelect: () => setTable(null) },
            ...tables.map((name) => ({ key: name, label: name, checked: table === name, onSelect: () => setTable(name) })),
          ]}
        >
          Filters
        </MenuButton>
        <span className="ws-n">{rows.length}</span>
        <div className="end">
          <span className="sepv" />
          <MenuButton
            variant="quiet"
            icon="sort"
            align="end"
            label="Sort"
            items={[
              { key: "product", label: "By product", checked: sort === "product", onSelect: () => setSort("product") },
              { key: "title", label: "A to Z", checked: sort === "title", onSelect: () => setSort("title") },
            ]}
          >
            Sort
          </MenuButton>
          <MenuButton
            variant="quiet"
            icon="grid"
            align="end"
            label="Group"
            items={[
              { key: "product", label: "By product", checked: grouped, onSelect: () => setGrouped(true) },
              { key: "none", label: "No grouping", checked: !grouped, onSelect: () => setGrouped(false) },
            ]}
          >
            Group
          </MenuButton>
          <MenuButton
            variant="quiet"
            icon="columns"
            align="end"
            label="Columns"
            items={[
              { key: "answers", label: "Answers", checked: columns.answers, onSelect: () => setColumns((c) => ({ ...c, answers: !c.answers })) },
              { key: "reads", label: "Reads", checked: columns.reads, onSelect: () => setColumns((c) => ({ ...c, reads: !c.reads })) },
              { key: "madeBy", label: "Made by", checked: columns.madeBy, onSelect: () => setColumns((c) => ({ ...c, madeBy: !c.madeBy })) },
            ]}
          >
            Columns
          </MenuButton>
          <Button icon="export" onClick={exportCsv}>
            Export
          </Button>
        </div>
      </div>
      <div className="ws-scroll" tabIndex={0} aria-label="Templates">
        {rows.length === 0 ? (
          <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
            <b>{templates.length ? "No template matches" : "No template reads only your tables"}</b>
            <p className="muted">
              {templates.length ? "Clear the search or the filters to see the rest." : "Start a new question from your tables instead."}
            </p>
          </div>
        ) : (
          <table className="table ex-templates">
            <thead>
              <tr>
                <th>Template</th>
                {columns.answers ? <th>Answers</th> : null}
                {columns.reads ? <th>Reads</th> : null}
                {columns.madeBy ? <th>Made by</th> : null}
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {shown.map((template, index) => {
                const head = grouped && (index === 0 || shown[index - 1]!.product !== template.product);
                const info = productInfo(template.product);
                return (
                  <React.Fragment key={template.slug}>
                    {head ? (
                      <tr className="grp">
                        <td colSpan={span}>
                          <Icon name={info.icon} />
                          {info.name}
                          <span className="n">{rows.filter((row) => row.product === template.product).length}</span>
                        </td>
                      </tr>
                    ) : null}
                    <tr>
                      <td>
                        <span className="cell-lead">{templateTitle(template)}</span>
                      </td>
                      {columns.answers ? <td className="muted">{template.answers}</td> : null}
                      {columns.reads ? <td className="mono muted">{template.reads.join(", ")}</td> : null}
                      {columns.madeBy ? (
                        <td>
                          <span className="ex-maker">
                            <Icon name={template.madeBy === "Vane" ? "foryou" : "corelith"} />
                            {template.madeBy}
                          </span>
                        </td>
                      ) : null}
                      <td className="acts">
                        <ButtonLink href={`/explore/q/${template.slug}`} icon="explore">
                          Open
                        </ButtonLink>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={span}>
                  {templates.length} templates, {rows.length} shown
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <div className="table-foot">
        <div className="foot-row">
          <span className="num">{rows.length ? `${from} to ${to} of ${rows.length}` : "None"}</span>
          <div className="end">
            <ButtonGroup aria-label="Pages">
              <Button icon="back" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                Previous
              </Button>
              <Button iconEnd="chev" disabled={to >= rows.length} onClick={() => setPage((n) => n + 1)}>
                Next
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </div>
    </div>
  );
}
