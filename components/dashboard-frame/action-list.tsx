import Link from "next/link";

import { ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { type DashTone, toneClass } from "./types";

export type ActionItem = {
  id: string;
  href: string;
  title: string;
  meta: string;
  figure: string;
  figureTone?: DashTone | null;
  /** The dot: crimson for money missing, amber for a job not done, indigo for what is coming. */
  dot: "bad" | "warn" | "info" | "ok";
};

/**
 * Action list (Needs action): each row a link — a tone dot, the title over
 * its meta, a figure in its tone, a chevron.
 */
export function ActionList({ items }: { items: ReadonlyArray<ActionItem> }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <Link href={item.href} className="cx-df-action">
            <span className={cn("cx-df-action__dot", `cx-df-action__dot--${item.dot}`)} aria-hidden="true" />
            <span className="cx-df-action__text">
              <span className="cx-df-action__title">{item.title}</span>
              <span className="cx-df-action__meta">{item.meta}</span>
            </span>
            <span className={cn("cx-df-action__figure", toneClass(item.figureTone))}>{item.figure}</span>
            <ChevronRight className="cx-df-action__chev" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
