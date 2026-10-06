import type { Span } from "@/lib/reports/query/lexer";

/** A query as it was written: steps, in order, each a change to the table before it. */

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "and"
  | "or"
  | "like";

export type Expr =
  | { type: "literal"; value: string | number | boolean | null; span: Span }
  /** A column by its key or, in backticks, its label. `lead.title` is a joined column. */
  | { type: "column"; name: string; quoted: boolean; span: Span }
  | { type: "param"; name: string; span: Span }
  | { type: "unary"; op: "-" | "not"; arg: Expr; span: Span }
  | { type: "binary"; op: BinaryOp; left: Expr; right: Expr; span: Span }
  | { type: "in"; arg: Expr; list: Expr[]; negated: boolean; span: Span }
  | { type: "isNull"; arg: Expr; negated: boolean; span: Span }
  | { type: "call"; name: string; args: Expr[]; span: Span; nameSpan: Span };

/** `name = expression`, or a bare column that keeps its own name. */
export type NamedExpr = {
  name: string;
  /** Written in backticks: the name is the label as typed. */
  quoted: boolean;
  /** No `name =`: the column passes through as it is. */
  bare: boolean;
  expr: Expr;
  span: Span;
};

export type SourceRef =
  | { kind: "report"; key: string; span: Span }
  | { kind: "block"; name: string; span: Span };

export type SortKey = { expr: Expr; dir: "asc" | "desc" };

export type Step =
  | { type: "from"; source: SourceRef; span: Span }
  | { type: "join"; inner: boolean; source: SourceRef; alias: string; on: Expr; span: Span }
  | { type: "where"; expr: Expr; span: Span }
  | { type: "derive"; items: NamedExpr[]; span: Span }
  | { type: "select"; items: NamedExpr[]; span: Span }
  | { type: "drop"; columns: Array<{ name: string; quoted: boolean; span: Span }>; span: Span }
  | { type: "aggregate"; items: NamedExpr[]; by: NamedExpr[]; span: Span }
  | { type: "sort"; keys: SortKey[]; span: Span }
  | { type: "take"; count: number; span: Span };

export type StepType = Step["type"];

export type Pipeline = { steps: Step[] };
