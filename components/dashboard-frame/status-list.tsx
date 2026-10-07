import { StateBadge, type StateTone } from "@/components/workspace/state-badge";

export type StatusItem = {
  id: string;
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
 */
export function StatusList({ items }: { items: ReadonlyArray<StatusItem> }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="cx-df-status">
          <span className="cx-df-status__name">
            {item.name}
            <StateBadge tone={item.state.tone}>{item.state.label}</StateBadge>
          </span>
          <span className="cx-df-status__figure">{item.figure}</span>
          <span className="cx-df-status__meta">{item.meta}</span>
          <span className="cx-df-status__sub">{item.sub}</span>
        </li>
      ))}
    </ul>
  );
}
