import { Icon, Meter } from "@/components/core";
import type { VanePlanCard } from "@/lib/vane/panel";

const dueLabel = (date: string) =>
  `Due ${new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

/** A plan broken down (the components board, Plans): its title, when it is due, the meter, and each step with who owns it. */
export function VanePlanCardView({ plan }: { plan: VanePlanCard }) {
  return (
    <article className="vp">
      <div className="vp-h">
        <h3>{plan.title}</h3>
        {plan.dueOn ? <span className="muted">{dueLabel(plan.dueOn)}</span> : null}
      </div>
      <Meter
        value={plan.steps.length ? (plan.done / plan.steps.length) * 100 : 0}
        label={`${plan.done} of ${plan.steps.length} steps done`}
      />
      <ol>
        {plan.steps.map((step) => (
          <li key={step.id} className={`is-${step.status}`}>
            <Icon name={`step-${step.status}`} />
            <span>{step.label}</span>
            <span className="muted">
              {step.owner === "vane" ? "Vane" : "You"}
              {step.progress ? `, ${step.progress}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}
