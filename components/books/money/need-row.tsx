import Link from "next/link";

import { CiIcon, type CiName } from "@/components/books/icons/ci-icon";
import type { MoneyNeed } from "@/lib/books/money-board-view";

import { Amt } from "../ui";

/** The icon a Needs you row carries (design/books/source/bk0.mjs, NOUNI). */
const NEED_ICON: Record<MoneyNeed["key"], CiName> = {
  overdue: "invoice",
  approve: "hand-coin",
  "bill-limit": "bill",
  bank: "match",
  posting: "needs-posting",
  fdms: "qr",
  itf263: "certificate",
  cash: "banknote",
  claims: "cash-box",
};

/** A Needs you row (`.k-nr`): 36px, an icon, what waits, its amount or one fact, the count, and its Books address. */
export function NeedRow({ need, currency, withFact = true }: { need: MoneyNeed; currency: string; withFact?: boolean }) {
  return (
    <Link className={need.tone ? `k-nr is-${need.tone}` : "k-nr"} href={need.href}>
      <CiIcon name={NEED_ICON[need.key]} className="ic k-ni" />
      <span className="k-nl truncate">{need.label}</span>
      {need.amount != null ? (
        <span className="k-na">
          <Amt value={need.amount} currency={currency} />
        </span>
      ) : need.fact && withFact ? (
        <span className="k-na truncate">{need.fact}</span>
      ) : null}
      <span className="k-nn">{need.count}</span>
      <CiIcon name="chevron-right" className="ic k-chev" />
    </Link>
  );
}
