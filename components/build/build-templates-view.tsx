"use client";

import * as React from "react";
import Link from "next/link";

import { Button, ButtonLink, Empty, Finding, Icon, Segmented, TableFoot, type IconName } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { BUILD_USER_LABEL } from "@/lib/build/provision";
import {
  groupTemplates,
  TEMPLATE_GROUP,
  TEMPLATE_VIEW_LABEL,
  type BuildTemplate,
  type TemplateGroup,
  type TemplatesView,
  type TemplateView,
} from "@/lib/build/templates";

const GROUP_ICON: Record<TemplateGroup, IconName> = { forms: "visits", documents: "invoice", emails: "send" };

const VIEWS: TemplateView[] = ["corelith", "made", "retired"];

export type TemplatesQuery = { view: TemplateView; group: TemplateGroup | null; q: string };

/**
 * Build → Templates (PageBuildTemplates): Corelith's starting points, the
 * workspace's own, and the ones it retired, grouped into forms, documents and
 * emails. Using one of Corelith's makes the workspace's own copy, which opens
 * in the builder; the workspace's own open as they are. Pure: the page feeds it.
 */
export function BuildTemplatesView({
  templates,
  query,
  onQuery,
  canStart,
  starting,
  onUse,
}: {
  templates: TemplatesView;
  query: TemplatesQuery;
  onQuery: (next: Partial<TemplatesQuery>) => void;
  canStart: boolean;
  /** The template whose copy is being made. */
  starting: string | null;
  onUse: (template: BuildTemplate) => void;
}) {
  const [q, setQ] = React.useState(query.q);
  React.useEffect(() => {
    if (q === query.q) return;
    const timer = window.setTimeout(() => onQuery({ q }), 250);
    return () => window.clearTimeout(timer);
  }, [q, query.q, onQuery]);

  const all = templates[query.view];
  const needle = query.q.trim().toLowerCase();
  const shown = all.filter(
    (template) =>
      (!query.group || template.group === query.group) &&
      (!needle || `${template.name} ${template.description} ${BUILD_USER_LABEL[template.usedBy]}`.toLowerCase().includes(needle)),
  );
  const groups = groupTemplates(shown);

  return (
    <div className="kbody">
      <div className="ws-tools">
        <label className="input-wrap ws-find">
          <Icon name="search" />
          <input type="search" aria-label="Search templates" placeholder="Search templates" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <MenuButton
          className="chipsel"
          icon="filter"
          label="Kind"
          items={[
            { key: "any", label: "Any kind", checked: !query.group, onSelect: () => onQuery({ group: null }) },
            { separator: true },
            ...(Object.keys(TEMPLATE_GROUP) as TemplateGroup[]).map((group) => ({
              key: group,
              label: TEMPLATE_GROUP[group].title,
              checked: query.group === group,
              onSelect: () => onQuery({ group }),
            })),
          ]}
        >
          {query.group ? TEMPLATE_GROUP[query.group].title : "Any kind"}
        </MenuButton>
        <Segmented<TemplateView>
          label="Templates"
          value={query.view}
          onChange={(view) => onQuery({ view })}
          items={VIEWS.map((view) => ({ value: view, label: TEMPLATE_VIEW_LABEL[view], count: templates[view].length }))}
        />
        <div className="end" />
      </div>

      <Finding
        fact="Templates moved here from Management."
        rest="A template is a starting point. Using one makes your own copy, which opens in the same builder as everything else."
      />

      {shown.length === 0 ? (
        needle || query.group ? (
          <Empty
            icon="search"
            title="No template matches"
            action={
              <Button
                icon="x"
                onClick={() => {
                  setQ("");
                  onQuery({ q: "", group: null });
                }}
              >
                Clear the search and filters
              </Button>
            }
          >
            Nothing here is called that, or is of that kind.
          </Empty>
        ) : (
          <Empty
            icon={query.view === "retired" ? "retire" : "file"}
            title={query.view === "retired" ? "Nothing is retired" : query.view === "made" ? "Nothing made here yet" : "No templates for this workspace"}
            action={
              query.view === "corelith" ? null : (
                <ButtonLink icon="file" href="/build/templates">
                  From Corelith
                </ButtonLink>
              )
            }
          >
            {query.view === "retired"
              ? "A form, document or email taken out of use is kept here."
              : query.view === "made"
                ? "Use one of Corelith's templates, or press New, and it is listed here."
                : "Templates come with the modules this workspace runs."}
          </Empty>
        )
      ) : (
        <>
          <div className="wt">
            <table className="table">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col className="bt-what" />
                <col style={{ width: 150 }} className="bh-wide" />
                <col style={{ width: 96 }} className="bh-wide" />
                <col style={{ width: 200 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Template</th>
                  <th className="bt-what">What it does</th>
                  <th className="bh-wide">For</th>
                  <th className="bh-wide" aria-label="Status" />
                  <th aria-label="Use" />
                </tr>
              </thead>
              <tbody>
                {groups.map(({ group, rows }) => (
                  <React.Fragment key={group}>
                    <tr className="grp">
                      <td colSpan={5}>
                        <b>{TEMPLATE_GROUP[group].title}</b>
                        {TEMPLATE_GROUP[group].note}
                        <span className="n">{rows.length}</span>
                      </td>
                    </tr>
                    {rows.map((template) => (
                      <tr key={template.key}>
                        <td>
                          <span className="bt-name">
                            <Icon name={GROUP_ICON[template.group]} />
                            {template.href ? (
                              <Link className="cell-lead truncate" href={template.href}>
                                {template.name}
                              </Link>
                            ) : (
                              <span className="truncate">{template.name}</span>
                            )}
                          </span>
                        </td>
                        <td className="fill bt-what">
                          <span className="truncate" title={template.description}>
                            {template.description}
                          </span>
                        </td>
                        <td className="muted bh-wide">{BUILD_USER_LABEL[template.usedBy]}</td>
                        <td className="bh-wide">{template.badge ? <span className={template.badge === "Draft" ? "status status-warn" : template.badge === "Default" ? "status status-info" : "status"}>{template.badge}</span> : null}</td>
                        <td className="bt-act">
                          {template.start ? (
                            canStart ? (
                              <Button icon="file" busy={starting === template.key} disabled={starting !== null} onClick={() => onUse(template)}>
                                Use this template
                              </Button>
                            ) : null
                          ) : template.href ? (
                            <ButtonLink icon="chev" href={template.href}>
                              Open
                            </ButtonLink>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <TableFoot range={`${shown.length} of ${all.length}`} />
        </>
      )}
    </div>
  );
}
