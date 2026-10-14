"use client";

import * as React from "react";

import { ButtonLink, Icon, InputWithIcon, Segmented, type IconName } from "@/components/core";
import { KitPage, OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import type { MarketItem, MarketKind, MarketSection } from "@/lib/management/marketplace";

const KIND_ICON: Record<MarketKind, IconName> = { forms: "edit", reports: "reports", documents: "docs", apps: "store" };

type Filter = "all" | MarketKind;

/**
 * Management → Marketplace (design/core-modules/html/management-marketplace.html):
 * Everything, Forms, Reports, Documents, Apps; sections by who it is for and
 * who makes it, each with its price and Add. Pure: the page and the fixture feed it.
 */
export function MarketplacePageView({ sections }: { sections: MarketSection[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const shown = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (filter === "all" || item.kind === filter) &&
          (!needle || item.name.toLowerCase().includes(needle) || item.detail.toLowerCase().includes(needle)),
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <KitPage screen="management-marketplace" title="Marketplace" mark={<Icon name="store" />} flush>
      <div className="tools">
        <Segmented<Filter>
          label="Kind"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: "Everything" },
            { value: "forms", label: "Forms" },
            { value: "reports", label: "Reports" },
            { value: "documents", label: "Documents" },
            { value: "apps", label: "Apps" },
          ]}
        />
        <div className="end">
          <InputWithIcon
            type="search"
            aria-label="Search the marketplace"
            placeholder="Search the marketplace"
            wrapClassName="mk-find"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="finding">
        <p className="lede-figure">
          Built for your business, and for the services you already use.{" "}
          <span className="q">Anything added here opens in the same builder, so it can be changed.</span>
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="muted" style={{ padding: "var(--space-16) var(--space-24)" }}>
          {needle ? `Nothing here is called “${query.trim()}”.` : "Nothing of this kind yet."}
        </p>
      ) : (
        shown.map((section, index) => (
          <section key={section.title} aria-labelledby={`market-${index}`}>
            <div className="group-head">
              <h2 id={`market-${index}`}>{section.title}</h2>
              <span className="sum">{section.items.length}</span>
            </div>
            <div className="list">
              {section.items.map((item) => (
                <Item key={item.key} item={item} />
              ))}
            </div>
          </section>
        ))
      )}
    </KitPage>
  );
}

function Item({ item }: { item: MarketItem }) {
  return (
    <div className="row mr2">
      {item.mark ? (
        // A product's mark, a fixed 32px SVG.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pm" src={item.mark} alt="" width={32} height={32} />
      ) : (
        <span className="mi">
          <Icon name={KIND_ICON[item.kind]} size={20} />
        </span>
      )}
      <span className="t">
        <span className="lead truncate">{item.name}</span>
        <span className="truncate muted">{item.detail}</span>
      </span>
      <span className="muted truncate">{item.maker}</span>
      <span className="muted">{item.price}</span>
      <span className="a">
        <ButtonLink href={item.href} icon="plus">
          Add
        </ButtonLink>
      </span>
    </div>
  );
}

export function MarketplacePage({ sections }: { sections: MarketSection[] }) {
  return (
    <ManagementShell>
      <OwnsChrome>
        <MarketplacePageView sections={sections} />
      </OwnsChrome>
    </ManagementShell>
  );
}
