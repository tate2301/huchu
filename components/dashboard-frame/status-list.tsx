import Link from "next/link";

import { StateBadge, type StateTone } from "@/components/workspace/state-badge";

export type StatusItem = {
  id: string;
  /** Where the row goes (Tills now: the shift). */
  href?: string;
  name: string;
  state: { tone: StateTone; label: string };
  /** The figure on the right ("US$842.15"). */
  figure: string;
  meta: string;
  /** The quieter figure under it ("91 sales"). */
  sub: string;
};

/**
 * Status list (Tills now): the name in 600 with its state badge and the
 * figure on the right; under them the meta and a quieter second figure.
 * With an `href` the whole row is a link.
 */
export function StatusList({ items }: { items: ReadonlyArray<StatusItem> }) {
  return (
    <ul>
      {items.map((item) => {
        const body = (
          <>
            <span className="cx-df-status__name">
              {item.name}
              <StateBadge tone={item.state.tone}>{item.state.label}</StateBadge>
            </span>
            <span className="cx-df-status__figure">{item.figure}</span>
            <span className="cx-df-status__meta">{item.meta}</span>
            <span className="cx-df-status__sub">{item.sub}</span>
          </>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="cx-df-status cx-df-status--link">
                {body}
              </Link>
            ) : (
              <div className="cx-df-status">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
