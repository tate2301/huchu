"use client";

import * as React from "react";

import { Button, SelectCell, TableFoot, TableShell, useSelection, VaneMark } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import type { BankLineView, BankTab, BankView } from "@/lib/books/bank";
import { money, signedMoney } from "@/lib/books/format";

import { Lead, TableEmpty } from "./bk-b";
import { BkChip, BkQuietTools, BkTabs, BkTools } from "./bk-list";
import { BooksFinding } from "./figures";

/**
 * Books → Bank & cash → To match (design/core-modules/boards/view/BkToMatch.html,
 * BkToMatchPhone at phone width): each statement line with Vane's proposal
 * and why; Accept one, a selection (A) or Vane's all; Choose; Create a
 * payment, a bank charge or a transfer from a line; Exclude with a reason.
 * Matched lines can be unmatched and excluded ones put back, until their
 * reconciliation closes. Nothing is matched until a person accepts it.
 */
export function BkToMatchView({
  data,
  q,
  busyLine,
  acceptingAll,
  onQuery,
  onAccept,
  onAcceptMany,
  onChoose,
  onExclude,
  createMenu,
  matchedMenu,
  onUpload,
  exportHref,
}: {
  data: BankView;
  q: string;
  busyLine: string | null;
  acceptingAll: boolean;
  onQuery: (next: { account?: string; tab?: BankTab; q?: string }) => void;
  onAccept: (line: BankLineView) => void;
  onAcceptMany: (lines: BankLineView[]) => void;
  onChoose: (line: BankLineView) => void;
  onExclude: (lines: BankLineView[]) => void;
  createMenu: (line: BankLineView) => MenuEntry[];
  matchedMenu: (line: BankLineView) => MenuEntry[];
  onUpload: () => void;
  exportHref: string;
}) {
  const c = data.account?.currency ?? "USD";
  const open = data.lines.filter((line) => line.state === "proposed" || line.state === "unmatched");
  const ids = React.useMemo(() => open.map((line) => line.id), [open]);
  const selection = useSelection(ids);
  const selected = open.filter((line) => selection.isSelected(line.id));
  const acceptable = selected.filter((line) => line.state === "proposed");
  const proposedLines = open.filter((line) => line.state === "proposed");
  const net = selected.reduce((sum, line) => sum + line.value, 0);
  const shown = data.lines.length;
  const working = data.tab === "to-match" || data.tab === "everything";

  const accountChip = (
    <BkChip
      label="Account"
      value={data.account?.label ?? "None"}
      set
      items={data.accounts.map((option) => ({ key: option.id, label: option.label, checked: option.id === data.account?.id, onSelect: () => onQuery({ account: option.id }) }))}
    />
  );

  const proposalCell = (line: BankLineView) =>
    line.proposal ? (
      <div className="bk-prop">
        <VaneMark size={14} />
        <span className="cell-lead">
          <span>{line.proposal.title}</span>
        </span>
        <span className="sub">{line.proposal.reason}</span>
      </div>
    ) : line.state === "unmatched" ? (
      <div className="bk-prop">
        <span />
        <span className="cell-lead muted">No match</span>
        <span className="sub">{line.reason ?? line.suggestion?.reason}</span>
      </div>
    ) : (
      <Lead sub={line.state === "excluded" ? "Excluded" : null}>{line.matchedTo}</Lead>
    );

  const rowActions = (line: BankLineView) => {
    if (line.state === "proposed") {
      return (
        <div className="bk-rowacts">
          <Button icon="check" busy={busyLine === line.id} disabled={Boolean(busyLine)} onClick={() => onAccept(line)}>
            Accept
          </Button>
          <MenuButton
            variant="quiet"
            iconOnly
            icon="more"
            iconEnd={undefined}
            align="end"
            label="Choose or exclude"
            aria-label="Choose or exclude"
            items={[
              { key: "choose", icon: "list", label: "Choose another", onSelect: () => onChoose(line) },
              ...createMenu(line),
              { separator: true },
              { key: "exclude", icon: "x", label: "Exclude", onSelect: () => onExclude([line]) },
            ]}
          />
        </div>
      );
    }
    if (line.state === "unmatched") {
      return (
        <div className="bk-rowacts">
          <MenuButton icon="plus" iconEnd="down" align="end" label="Create from this line" items={createMenu(line)}>
            Create
          </MenuButton>
          <MenuButton
            variant="quiet"
            iconOnly
            icon="more"
            iconEnd={undefined}
            align="end"
            label="Exclude"
            aria-label="Exclude"
            items={[
              { key: "choose", icon: "list", label: "Choose", onSelect: () => onChoose(line) },
              { key: "exclude", icon: "x", label: "Exclude", onSelect: () => onExclude([line]) },
            ]}
          />
        </div>
      );
    }
    const items = matchedMenu(line);
    return items.length ? (
      <div className="bk-rowacts">
        <MenuButton variant="quiet" iconOnly icon="more" iconEnd={undefined} align="end" label={`More for ${line.description}`} aria-label={`More for ${line.description}`} items={items} />
      </div>
    ) : null;
  };

  const desk = (
    <div className="bk bk-desk-only">
      {data.finding ? <BooksFinding finding={data.finding} /> : null}
      <BkTabs
        label="Statement lines"
        value={data.tab}
        onChange={(tab) => onQuery({ tab })}
        items={[
          { value: "to-match", label: "To match", count: data.counts.toMatch },
          { value: "matched", label: "Matched", count: data.counts.matched },
          { value: "excluded", label: "Excluded", count: data.counts.excluded },
          { value: "everything", label: "Everything", count: data.counts.everything },
        ]}
      />
      <BkTools
        find="Search lines"
        query={q}
        onFind={(next) => onQuery({ q: next })}
        chips={accountChip}
        count={`${shown} ${shown === 1 ? "line" : "lines"}`}
        end={
          <>
            {working && proposedLines.length > 0 ? (
              <Button icon="check" busy={acceptingAll} disabled={acceptingAll} onClick={() => onAcceptMany(proposedLines)}>
                {`Accept Vane’s ${proposedLines.length}`}
              </Button>
            ) : null}
            <BkQuietTools exportHref={exportHref} />
          </>
        }
      />
      <TableShell
        label="Statement lines"
        foot={
          <TableFoot
            range={`${data.counts.toMatch} ${data.counts.toMatch === 1 ? "line" : "lines"} to match`}
            sums={[
              { label: "In", value: money(data.sums.in, c) },
              { label: "Out", value: money(data.sums.out, c) },
            ]}
            end={data.statementTo ? <span className="muted">Statement to {data.statementTo}</span> : undefined}
            selection={
              working
                ? {
                    count: selected.length,
                    sum: { label: "Net", value: signedMoney(net, c) },
                    onClear: selection.clear,
                    note: selected.length && acceptable.length < selected.length ? `${selected.length - acceptable.length} without a proposal ${selected.length - acceptable.length === 1 ? "is" : "are"} left out of Accept` : undefined,
                    actions: (
                      <>
                        <Button icon="check" shortcut="A" disabled={acceptable.length === 0 || acceptingAll} busy={acceptingAll} onClick={() => onAcceptMany(acceptable)}>
                          {`Accept ${acceptable.length}`}
                        </Button>
                        <Button icon="x" disabled={selected.length === 0} onClick={() => onExclude(selected)}>
                          Exclude
                        </Button>
                      </>
                    ),
                  }
                : undefined
            }
          />
        }
      >
        {data.lines.length === 0 ? (
          <TableEmpty title={q ? "No line matches" : data.tab === "to-match" ? (data.counts.everything ? "Nothing left to match" : "No statement yet") : data.tab === "excluded" ? "Nothing excluded" : "Nothing matched yet"}>
            {q ? "Clear the search to see the rest." : data.tab === "to-match" && !data.counts.everything ? "Upload the bank’s CSV with Upload a statement: its lines land here." : "Lines move here as they are matched or excluded."}
          </TableEmpty>
        ) : (
          <table className="table" aria-label="Statement lines">
            <colgroup>
              {working ? <col style={{ width: 44 }} /> : null}
              <col style={{ width: 110 }} />
              <col style={{ width: 260 }} />
              <col style={{ width: 130 }} />
              <col />
              <col style={{ width: 170 }} />
            </colgroup>
            <thead>
              <tr>
                {working ? <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every line to match" /> : null}
                <th>Date</th>
                <th>Statement line</th>
                <th className="num">Amount</th>
                <th>{data.tab === "excluded" ? "Why it was excluded" : data.tab === "matched" ? "Matched to" : "Vane’s proposal"}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => {
                const selectable = line.state === "proposed" || line.state === "unmatched";
                return (
                  <tr key={line.id} aria-selected={selection.isSelected(line.id) || undefined}>
                    {working ? selectable ? <SelectCell checked={selection.isSelected(line.id)} onChange={() => selection.toggle(line.id)} label={`Select the line from ${line.day}`} /> : <td className="sel" /> : null}
                    <td className="muted">{line.day}</td>
                    <td className="truncate">
                      <span className="cell-lead">{line.description}</span>
                    </td>
                    <td className="num">{line.amount}</td>
                    <td className="fill bk-fw" style={{ paddingTop: 14, paddingBottom: 14 }}>
                      {proposalCell(line)}
                    </td>
                    <td>{working || line.state === "matched" || line.state === "excluded" ? rowActions(line) : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );

  // At phone width (BkToMatchPhone): the lines as cards, Accept or Choose, and Accept Vane's all at the foot.
  const phoneLines = open.slice(0, 6);
  const phone = (
    <div className="bk-ph-only" style={{ minHeight: "calc(100dvh - 56px)" }}>
      <div className="bk-ph-b">
        <div>
          <div className="bk-ph-t">{data.counts.toMatch ? `${data.counts.toMatch} ${data.counts.toMatch === 1 ? "line" : "lines"} to match` : "Nothing to match"}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {data.account?.label ?? "No account"}
            {data.statementTo ? ` · to ${data.statementTo.replace(/^\w+ /, "")}` : ""}
          </div>
        </div>
        {phoneLines.length ? (
          <div className="bk-ph-list">
            {phoneLines.map((line) => (
              <div className="bk-card" key={line.id} style={{ gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <b style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{line.description}</b>
                  <b className="mono" style={{ fontSize: 15, flex: "none" }}>
                    {line.amount}
                  </b>
                </div>
                <span className="muted" style={{ fontSize: 13, marginTop: -8 }}>
                  {line.day}
                </span>
                <div style={{ fontSize: 14 }}>{proposalCell(line)}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {line.state === "proposed" ? (
                    <Button size="lg" icon="check" busy={busyLine === line.id} disabled={Boolean(busyLine)} onClick={() => onAccept(line)}>
                      Accept
                    </Button>
                  ) : (
                    <MenuButton size="lg" icon="plus" iconEnd="down" label="Create from this line" items={createMenu(line)}>
                      Create
                    </MenuButton>
                  )}
                  <Button size="lg" variant="quiet" icon="list" onClick={() => onChoose(line)}>
                    Choose
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <TableEmpty title={data.counts.everything ? "Nothing left to match" : "No statement yet"}>Upload the bank’s CSV: its lines land here.</TableEmpty>
        )}
        {open.length > phoneLines.length ? (
          <div className="muted" style={{ fontSize: 14, textAlign: "center", padding: "4px 0" }}>
            {open.length - phoneLines.length} more {open.length - phoneLines.length === 1 ? "line" : "lines"}
          </div>
        ) : null}
      </div>
      <div className="bk-ph-f">
        <span className="muted" style={{ fontSize: 13, flex: 1 }}>
          {proposedLines.length ? `Vane proposed ${proposedLines.length}` : "Vane has no proposal"}
        </span>
        {proposedLines.length ? (
          <Button variant="primary" size="lg" icon="check" shortcut="A" busy={acceptingAll} disabled={acceptingAll} onClick={() => onAcceptMany(proposedLines)}>
            {`Accept Vane’s ${proposedLines.length}`}
          </Button>
        ) : (
          <Button size="lg" icon="upload" onClick={onUpload}>
            Upload a statement
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {desk}
      {phone}
    </>
  );
}

