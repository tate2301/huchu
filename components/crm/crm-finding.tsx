import * as React from "react";

/**
 * Matches monetary values, percentages, durations (e.g. 30d), and integer/decimal quantities.
 * Capturing parentheses ensure String.prototype.split alternates:
 * [plainText, matchedFigure, plainText, matchedFigure, ...]
 */
export const FIGURE_RE =
  /([+−-]?(?:US\$|\$|ZWG\s*|[A-Z]{3}\s+)\d[\d,]*(?:\.\d{1,2})?|[+−-]?\d+(?:\.\d+)?%|\b\d+d\b|\b\d[\d,]*(?:\.\d+)?\b)/;

/**
 * Matches standard delimiter patterns " · " (middle dot) and " — " (em dash) or leading "— ".
 */
const DELIM_RE = /(\s+[·—]\s+|\s+—\s*|^—\s*)/;

function renderSegmentWithDelimiters(segment: string, keyPrefix: string): React.ReactNode[] {
  const parts = segment.split(DELIM_RE);
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-d-${idx}`;
    const trimmed = part.trim();
    if (trimmed === "·") {
      return (
        <span key={key} className="crm-bk-finding-dot" aria-hidden="true">
          {" · "}
        </span>
      );
    }
    if (trimmed === "—") {
      return (
        <span key={key} className="crm-bk-finding-dash" aria-hidden="true">
          {part.startsWith(" ") ? " — " : "— "}
        </span>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

/**
 * A phrase or sentence with its numerical figures, currency, percentages,
 * and durations set in mono tabular figures, as the Books design standard specifies.
 */
export function Figures({ text }: { text: React.ReactNode }) {
  if (typeof text !== "string") {
    return <>{text}</>;
  }

  const parts = text.split(FIGURE_RE);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (index % 2 === 1) {
          return (
            <span key={index} className="num tabular-nums font-semibold">
              {part}
            </span>
          );
        }
        return (
          <React.Fragment key={index}>
            {renderSegmentWithDelimiters(part, `p-${index}`)}
          </React.Fragment>
        );
      })}
    </>
  );
}

export type CrmFindingAction =
  | {
      label: string;
      onClick?: () => void;
      href?: string;
    }
  | React.ReactNode;

export type CrmFindingTone =
  | "default"
  | "warn"
  | "warning"
  | "danger"
  | "bad"
  | "success"
  | "ok"
  | "info"
  | (string & {});

export type CrmStructuredFinding = {
  fact?: React.ReactNode;
  rest?: React.ReactNode;
  end?: React.ReactNode;
  scope?: string;
  window?: string | number;
  label?: string;
  text?: React.ReactNode;
  children?: React.ReactNode;
  action?: CrmFindingAction;
  tone?: CrmFindingTone;
};

export type CrmFindingProp = CrmStructuredFinding | React.ReactNode;

export interface CrmFindingProps {
  finding?: CrmFindingProp | null;
  fact?: React.ReactNode;
  rest?: React.ReactNode;
  label?: string;
  text?: React.ReactNode;
  children?: React.ReactNode;
  end?: React.ReactNode;
  scope?: string;
  window?: string | number;
  action?: CrmFindingAction;
  tone?: CrmFindingTone;
  className?: string;
  role?: string;
}

function resolveToneClass(tone?: string): string {
  if (!tone || tone === "default") return "";
  if (tone === "warn" || tone === "warning") return "is-warn";
  if (tone === "danger" || tone === "bad") return "is-danger";
  if (tone === "success" || tone === "ok") return "is-success";
  if (tone === "info") return "is-info";
  return "";
}

/**
 * Books Narrative Finding Banner (`.crm-bk-finding`):
 * Formats commercial findings with fact clause in primary ink, supporting rest clause
 * in secondary ink, numerical figures in mono tabular bold, and optional Books metadata chips.
 */
export function CrmFinding({
  finding,
  fact: propFact,
  rest: propRest,
  label: propLabel,
  text: propText,
  children: propChildren,
  end: propEnd,
  scope: propScope,
  window: propWindow,
  action: propAction,
  tone: propTone,
  className = "",
  role = "status",
}: CrmFindingProps) {
  // If nothing is provided, render nothing
  if (!finding && !propFact && !propRest && !propLabel && !propEnd && !propText && !propChildren) {
    return null;
  }

  // If finding is a raw primitive or non-structured ReactNode
  const isObjectFinding = finding && typeof finding === "object" && !React.isValidElement(finding);
  const structured: CrmStructuredFinding = isObjectFinding
    ? (finding as CrmStructuredFinding)
    : {};

  const fact = propFact ?? structured.fact;
  const rest = propRest ?? structured.rest;
  const label = propLabel ?? structured.label;
  const text = propText ?? propChildren ?? structured.text ?? structured.children;
  const scope = propScope ?? structured.scope;
  const windowVal = propWindow ?? structured.window;
  const end = propEnd ?? structured.end;
  const action = propAction ?? structured.action;
  const tone = propTone ?? structured.tone;

  const toneClass = resolveToneClass(tone);
  const classes = ["crm-bk-finding", toneClass, className].filter(Boolean).join(" ");

  // If finding is a raw React element and not an object shape
  if (!isObjectFinding && finding && !propFact && !propRest && !propLabel && !propText && !propChildren) {
    return (
      <div className={classes} role={role}>
        <div className="crm-bk-finding-text">{finding}</div>
      </div>
    );
  }

  return (
    <div className={classes} role={role}>
      <div className="crm-bk-finding-text">
        {label ? (
          <span className={`fl ${toneClass ? `is-${toneClass.replace("is-", "")}` : ""} mr-2`}>
            {label}
          </span>
        ) : null}

        {fact ? (
          <span className="crm-bk-finding-fact">
            <Figures text={fact} />
          </span>
        ) : null}

        {rest ? (
          <span className="crm-bk-finding-rest">
            {fact ? " " : null}
            <Figures text={rest} />
          </span>
        ) : null}

        {!fact && !rest && text ? (
          <span className="crm-bk-finding-rest">
            <Figures text={text} />
          </span>
        ) : null}
      </div>

      {(scope || windowVal != null || end || action) ? (
        <div className="crm-bk-finding-end">
          {scope ? (
            <span className="crm-bk-meta-chip">
              Scope: <b>{scope}</b>
            </span>
          ) : null}

          {windowVal != null ? (
            <span className="crm-bk-meta-chip">
              Window: <b>{typeof windowVal === "number" ? `${windowVal}d` : windowVal}</b>
            </span>
          ) : null}

          {end}

          {action ? (
            typeof action === "object" && action && "label" in action ? (
              action.href ? (
                <a href={action.href} className="fl-act">
                  {action.label}
                </a>
              ) : (
                <button
                  type="button"
                  className="fl-act"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              )
            ) : (
              (action as React.ReactNode)
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
