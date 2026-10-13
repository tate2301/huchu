import { VaneMark } from "@/components/core";

/**
 * The Vane button in every top bar: the mark, "Vane", the count of what waits
 * for this person, and a pulsing dot while it is working. Pressed while the
 * panel is open. Below 760px only the mark and the dot show.
 */
export function VaneButtonView({
  open,
  count,
  working,
  onClick,
}: {
  open: boolean;
  count: number;
  working: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={open ? "btn vn-b is-vane" : "btn vn-b"}
      aria-pressed={open}
      aria-label={count > 0 ? `Vane, ${count} for you` : "Vane"}
      onClick={onClick}
    >
      <VaneMark />
      <span className="ask-l">Vane</span>
      {count > 0 ? <span className="vn-c">{count}</span> : null}
      {working ? <span className="live-d" aria-hidden="true" /> : null}
    </button>
  );
}
