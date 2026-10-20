"use client";

import * as React from "react";

import { Button, ButtonGroup, Empty, Icon, VaneMark, type IconName } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import type { BankLineView, BankTab, BankView } from "@/lib/books/bank";

import { BooksFinding } from "./figures";

const MATCH_ICON: Record<string, IconName> = {
  invoice: "invoice",
  bill: "expenses",
  ecocash: "takings",
  transaction: "bank",
  "bank-charges": "folder",
};

const TABS: Array<{ value: BankTab; label: string }> = [
  { value: "to-match", label: "To match" },
  { value: "matched", label: "Matched" },
  { value: "everything", label: "Everything" },
];

function Line({
  line,
  busy,
  onAccept,
  onChoose,
  onSuggestion,
}: {
  line: BankLineView;
  busy: boolean;
  onAccept: (line: BankLineView) => void;
  onChoose: (line: BankLineView) => void;
  onSuggestion: (line: BankLineView) => void;
}) {
  return (
    <div className="row bl">
      <span className="muted">{line.day}</span>
      <span className="bl-l">
        <span className="code truncate">{line.description}</span>
        <span className={line.moneyIn ? "num in" : "num"}>{line.amount}</span>
      </span>
      <span className="bl-ar">
        <Icon name="arrow" />
      </span>
      <span className="bl-m">
        {line.state === "matched" ? (
          <>
            <span className="bl-r">
              <Icon name="check" />
              <b className="truncate">{line.matchedTo}</b>
            </span>
            <span className="bl-w">Matched.</span>
          </>
        ) : line.proposal ? (
          <>
            <span className="bl-r">
              <Icon name={MATCH_ICON[line.proposal.kind]} />
              <b className="truncate">{line.proposal.title}</b>
              <span className="muted">{line.proposal.source}</span>
            </span>
            <span className="bl-w">
              <VaneMark size={16} />
              {line.proposal.reason}
            </span>
          </>
        ) : (
          <>
            <span className="bl-r">
              <Icon name="help" />
              <b>No match</b>
            </span>
            <span className="bl-w">
              <VaneMark size={16} />
              {line.reason}
            </span>
          </>
        )}
      </span>
      <span className="bl-a">
        {line.state === "matched" ? null : line.proposal ? (
          <>
            <Button icon="check" disabled={busy} onClick={() => onAccept(line)}>
              Accept
            </Button>
            <Button variant="quiet" icon="search" disabled={busy} onClick={() => onChoose(line)}>
              Choose
            </Button>
          </>
        ) : (
          <>
            {line.suggestion ? (
              <Button icon={MATCH_ICON[line.suggestion.kind]} disabled={busy} onClick={() => onSuggestion(line)}>
                {line.suggestion.title}
              </Button>
            ) : null}
            <Button variant="quiet" icon="search" disabled={busy} onClick={() => onChoose(line)}>
              Choose
            </Button>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Books → Bank (design/core-modules/html/books-bank.html): the account, To
 * match, Matched and Everything, and each line with Vane's match and why.
 * Accept and "Accept Vane's 3" are a person's press; nothing is matched until
 * then. Pure: the page and the fixture feed it.
 */
export function BankPageView({
  data,
  busyLine,
  acceptingAll = false,
  onAccount,
  onTab,
  onAccept,
  onAcceptAll,
  onChoose,
  onSuggestion,
  onUpload,
}: {
  data: BankView;
  busyLine?: string | null;
  acceptingAll?: boolean;
  onAccount: (id: string) => void;
  onTab: (tab: BankTab) => void;
  onAccept: (line: BankLineView) => void;
  onAcceptAll: () => void;
  onChoose: (line: BankLineView) => void;
  onSuggestion: (line: BankLineView) => void;
  onUpload: () => void;
}) {
  if (!data.account) {
    return (
      <Empty icon="bank" title="No bank account yet">
        Add the account in Banking, then upload its statement here.
      </Empty>
    );
  }
  const counts: Record<BankTab, number | null> = { "to-match": data.counts.toMatch, matched: null, excluded: null, everything: null };
  return (
    <>
      <div className="tools">
        <ButtonGroup aria-label="Account">
          <MenuButton
            icon="bank2"
            label="Account"
            items={data.accounts.map((account) => ({
              key: account.id,
              label: account.label,
              checked: account.id === data.account?.id,
              onSelect: () => onAccount(account.id),
            }))}
          >
            {data.account.label}
          </MenuButton>
        </ButtonGroup>
        <div className="seg" role="tablist" aria-label="Lines">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={data.tab === tab.value}
              tabIndex={data.tab === tab.value ? 0 : -1}
              onClick={() => onTab(tab.value)}
            >
              {tab.label}
              {counts[tab.value] ? (
                <>
                  {" "}
                  <span className="pn-n">{counts[tab.value]}</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
        {data.proposed > 0 && data.tab !== "matched" ? (
          <div className="end">
            <Button icon="check" busy={acceptingAll} disabled={acceptingAll} onClick={onAcceptAll}>
              {`Accept Vane's ${data.proposed}`}
            </Button>
          </div>
        ) : null}
      </div>
      {data.finding ? <BooksFinding finding={data.finding} /> : null}
      {data.lines.length === 0 ? (
        data.counts.everything === 0 ? (
          <Empty
            icon="upload2"
            title={`No statement from ${data.account.bank} yet`}
            action={
              <Button icon="upload2" onClick={onUpload}>
                Upload a statement
              </Button>
            }
          >
            Upload the statement as CSV from online banking, and each line gets its match.
          </Empty>
        ) : (
          <Empty icon="check" title={data.tab === "matched" ? "Nothing matched yet" : "Every line is matched"}>
            {data.tab === "matched" ? "Lines show here once you accept their match." : "Upload the next statement when it comes."}
          </Empty>
        )
      ) : (
        <div className="list bk">
          {data.lines.map((line) => (
            <Line
              key={line.id}
              line={line}
              busy={acceptingAll || busyLine === line.id}
              onAccept={onAccept}
              onChoose={onChoose}
              onSuggestion={onSuggestion}
            />
          ))}
        </div>
      )}
    </>
  );
}
