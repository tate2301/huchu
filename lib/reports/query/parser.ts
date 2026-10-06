import type { BinaryOp, Expr, NamedExpr, Pipeline, SortKey, SourceRef, Step, StepType } from "@/lib/reports/query/ast";
import { QueryError, tokenize, type Span, type Token } from "@/lib/reports/query/lexer";

/**
 * A query, read into steps.
 *
 *   from crm-deals
 *   where status = "Won"
 *   aggregate won = sum(value), deals = count() by owner
 *   sort won desc
 *
 * A step starts on its own line, or after `|`, with the word that names it.
 * Everything else on the line belongs to the step, which is how a column
 * called `from` or `by` still reads as a column.
 */

export const STEP_WORDS: readonly StepType[] = ["from", "join", "where", "derive", "select", "drop", "aggregate", "sort", "take"];
const STEP_SET = new Set<string>([...STEP_WORDS, "inner"]);

/** Operators by how tightly they bind, loosest first. */
const COMPARISONS = new Set(["=", "==", "!=", "<>", "<", "<=", ">", ">="]);

const MAX_TAKE = 100_000;

function join(a: Span, b: Span): Span {
  return { from: a.from, to: b.to };
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  private get token(): Token {
    return this.tokens[this.index]!;
  }

  private peek(offset = 1): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const token = this.token;
    if (token.type !== "eof") this.index += 1;
    return token;
  }

  private isWord(word: string, token = this.token): boolean {
    return token.type === "ident" && token.value.toLowerCase() === word;
  }

  private isOp(op: string, token = this.token): boolean {
    return token.type === "op" && token.value === op;
  }

  private describe(token: Token): string {
    if (token.type === "eof") return "the end";
    if (token.type === "string") return `"${token.value}"`;
    if (token.type === "quoted") return `\`${token.value}\``;
    return `"${token.value}"`;
  }

  private fail(message: string, span: Span = this.token.span): never {
    throw new QueryError(message, span);
  }

  private expectOp(op: string, message: string): Token {
    if (!this.isOp(op)) this.fail(message);
    return this.next();
  }

  /** A step keyword where a step can start: first on its line, or after `|`. */
  private atStepStart(): boolean {
    const token = this.token;
    if (token.type === "eof" || this.isOp("|")) return true;
    return token.lineStart && token.type === "ident" && STEP_SET.has(token.value.toLowerCase());
  }

  /* ── Pipeline ─────────────────────────────────────────────────────────── */

  pipeline(): Pipeline {
    const steps: Step[] = [];
    while (this.token.type !== "eof") {
      if (this.isOp("|")) {
        this.next();
        continue;
      }
      steps.push(this.step(steps.length === 0));
      if (!this.atStepStart()) {
        const token = this.token;
        if (token.type === "ident" && STEP_SET.has(token.value.toLowerCase())) {
          this.fail(`Start "${token.value}" on a new line, or put | before it`);
        }
        this.fail(`Expected a new step, found ${this.describe(token)}`);
      }
    }
    if (steps.length === 0) this.fail("Start with from and a source, like: from crm-deals");
    return { steps };
  }

  private step(first: boolean): Step {
    const token = this.token;
    const word = token.type === "ident" ? token.value.toLowerCase() : "";
    if (first && word !== "from") {
      this.fail("A query starts with from and a source, like: from crm-deals");
    }
    if (!first && word === "from") this.fail("A query has one from — use join to bring in another source");
    const start = token.span;

    switch (word) {
      case "from": {
        this.next();
        const source = this.source();
        return { type: "from", source, span: join(start, source.span) };
      }
      case "inner":
      case "join": {
        this.next();
        const inner = word === "inner";
        if (inner) {
          if (!this.isWord("join")) this.fail("Write inner join");
          this.next();
        }
        const source = this.source();
        let alias = source.kind === "report" ? source.key.split("-").pop()! : source.name;
        if (this.isWord("as")) {
          this.next();
          const name = this.next();
          if (name.type !== "ident") this.fail("A join is named with a plain word, like: as lead", name.span);
          alias = name.value;
        }
        if (!this.isWord("on")) this.fail("Say how rows match, like: on client = lead.client");
        this.next();
        const on = this.expression();
        return { type: "join", inner, source, alias, on, span: join(start, on.span) };
      }
      case "where": {
        this.next();
        const expr = this.expression();
        return { type: "where", expr, span: join(start, expr.span) };
      }
      case "derive":
      case "select": {
        this.next();
        const items = this.namedList(word === "derive");
        return { type: word, items, span: join(start, items[items.length - 1]!.span) };
      }
      case "drop": {
        this.next();
        const columns: Array<{ name: string; quoted: boolean; span: Span }> = [];
        do {
          if (columns.length) this.next();
          const column = this.columnName();
          columns.push(column);
        } while (this.isOp(","));
        return { type: "drop", columns, span: join(start, columns[columns.length - 1]!.span) };
      }
      case "aggregate": {
        this.next();
        const items = this.namedList(true);
        let by: NamedExpr[] = [];
        if (this.isWord("by")) {
          this.next();
          by = this.namedList(false);
        }
        const last = by.length ? by[by.length - 1]! : items[items.length - 1]!;
        return { type: "aggregate", items, by, span: join(start, last.span) };
      }
      case "sort": {
        this.next();
        const keys: SortKey[] = [];
        let end = start;
        do {
          if (keys.length) this.next();
          const expr = this.expression();
          let dir: "asc" | "desc" = "asc";
          end = expr.span;
          if (this.isWord("asc") || this.isWord("desc")) {
            dir = this.token.value.toLowerCase() as "asc" | "desc";
            end = this.next().span;
          }
          keys.push({ expr, dir });
        } while (this.isOp(","));
        return { type: "sort", keys, span: join(start, end) };
      }
      case "take": {
        this.next();
        const count = this.next();
        const value = Number(count.value);
        if (count.type !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_TAKE) {
          this.fail(`take needs a whole number from 1 to ${MAX_TAKE.toLocaleString("en-US")}`, count.span);
        }
        return { type: "take", count: value, span: join(start, count.span) };
      }
      default:
        return this.fail(`Expected a step — ${STEP_WORDS.join(", ")} — found ${this.describe(token)}`);
    }
  }

  /** `crm-deals` (a report, hyphens and all) or `@sales` (a block). */
  private source(): SourceRef {
    const token = this.token;
    if (token.type === "ref") {
      this.next();
      return { kind: "block", name: token.value, span: token.span };
    }
    if (token.type === "quoted") {
      this.next();
      return { kind: "report", key: token.value, span: token.span };
    }
    if (token.type !== "ident") this.fail("Name a source, like crm-deals, or a block, like @sales");
    let key = this.next().value;
    let span = token.span;
    // The parts of a key are written with no space between them.
    while (this.isOp("-") && this.token.joined && this.peek().joined && (this.peek().type === "ident" || this.peek().type === "number")) {
      this.next();
      const part = this.next();
      key += `-${part.value}`;
      span = join(span, part.span);
    }
    return { kind: "report", key, span };
  }

  private columnName(): { name: string; quoted: boolean; span: Span } {
    const token = this.token;
    if (token.type === "quoted") {
      this.next();
      return { name: token.value, quoted: true, span: token.span };
    }
    if (token.type !== "ident") this.fail(`Expected a column, found ${this.describe(token)}`);
    this.next();
    let name = token.value;
    let span = token.span;
    // `lead.title`: a joined column, written with no spaces.
    while (this.isOp(".") && this.token.joined && this.peek().joined && this.peek().type === "ident") {
      this.next();
      const part = this.next();
      name += `.${part.value}`;
      span = join(span, part.span);
    }
    return { name, quoted: false, span };
  }

  /** `name = expr, …`; a bare column stands for itself unless `requireName`. */
  private namedList(requireName: boolean): NamedExpr[] {
    const items: NamedExpr[] = [];
    do {
      if (items.length) this.next();
      const token = this.token;
      const named =
        (token.type === "ident" || token.type === "quoted") && (this.isOp("=", this.peek()) || this.isOp("==", this.peek()));
      if (named) {
        this.next();
        this.next();
        const expr = this.expression();
        items.push({ name: token.value, quoted: token.type === "quoted", bare: false, expr, span: join(token.span, expr.span) });
      } else {
        const expr = this.expression();
        if (requireName) {
          this.fail(
            expr.type === "column"
              ? `Give this a name, like: ${expr.name}_total = sum(${expr.name})`
              : "Give this a name, like: total = …",
            expr.span,
          );
        }
        if (expr.type !== "column") this.fail("Give this a name, like: name = …", expr.span);
        items.push({ name: expr.name, quoted: expr.quoted, bare: true, expr, span: expr.span });
      }
    } while (this.isOp(","));
    return items;
  }

  /* ── Expressions ──────────────────────────────────────────────────────── */

  expression(): Expr {
    if (this.atStepStart() && this.token.type !== "eof" && !this.isOp("|")) {
      // A step word first on a line with nothing before it: say what is missing.
      this.fail(`Expected a value, found ${this.describe(this.token)}`);
    }
    return this.or();
  }

  private binaryLoop(next: () => Expr, words: string[], ops: string[]): Expr {
    let left = next();
    for (;;) {
      if (this.atStepStart()) return left;
      const token = this.token;
      const word = token.type === "ident" ? token.value.toLowerCase() : null;
      const matched =
        (word && words.includes(word) && word) || (token.type === "op" && ops.includes(token.value) && token.value);
      if (!matched) return left;
      this.next();
      const right = next();
      left = { type: "binary", op: matched as BinaryOp, left, right, span: join(left.span, right.span) };
    }
  }

  private or(): Expr {
    return this.binaryLoop(() => this.and(), ["or"], []);
  }

  private and(): Expr {
    return this.binaryLoop(() => this.not(), ["and"], []);
  }

  private not(): Expr {
    if (this.isWord("not")) {
      const start = this.next().span;
      const arg = this.not();
      return { type: "unary", op: "not", arg, span: join(start, arg.span) };
    }
    return this.comparison();
  }

  private comparison(): Expr {
    const left = this.additive();
    if (this.atStepStart()) return left;
    const token = this.token;

    if (token.type === "op" && COMPARISONS.has(token.value)) {
      this.next();
      const right = this.additive();
      const op = token.value === "==" ? "=" : token.value === "<>" ? "!=" : token.value;
      return { type: "binary", op: op as BinaryOp, left, right, span: join(left.span, right.span) };
    }

    if (this.isWord("is")) {
      this.next();
      let negated = false;
      if (this.isWord("not")) {
        this.next();
        negated = true;
      }
      if (!this.isWord("null")) this.fail("Write is null or is not null");
      const end = this.next().span;
      return { type: "isNull", arg: left, negated, span: join(left.span, end) };
    }

    let negated = false;
    if (this.isWord("not") && (this.isWord("in", this.peek()) || this.isWord("like", this.peek()))) {
      this.next();
      negated = true;
    }
    if (this.isWord("like")) {
      this.next();
      const right = this.additive();
      const like: Expr = { type: "binary", op: "like", left, right, span: join(left.span, right.span) };
      return negated ? { type: "unary", op: "not", arg: like, span: like.span } : like;
    }
    if (this.isWord("in")) {
      this.next();
      this.expectOp("(", 'A list goes in brackets, like: in ("Won", "Lost")');
      const list: Expr[] = [];
      if (!this.isOp(")")) {
        do {
          if (list.length) this.next();
          list.push(this.additive());
        } while (this.isOp(","));
      }
      const end = this.expectOp(")", "Close the list with )").span;
      return { type: "in", arg: left, list, negated, span: join(left.span, end) };
    }
    return left;
  }

  private additive(): Expr {
    return this.binaryLoop(() => this.multiplicative(), [], ["+", "-"]);
  }

  private multiplicative(): Expr {
    return this.binaryLoop(() => this.unary(), [], ["*", "/", "%"]);
  }

  private unary(): Expr {
    if (this.isOp("-")) {
      const start = this.next().span;
      const arg = this.unary();
      if (arg.type === "literal" && typeof arg.value === "number") {
        return { type: "literal", value: -arg.value, span: join(start, arg.span) };
      }
      return { type: "unary", op: "-", arg, span: join(start, arg.span) };
    }
    return this.primary();
  }

  private primary(): Expr {
    const token = this.token;
    switch (token.type) {
      case "number":
        this.next();
        return { type: "literal", value: Number(token.value), span: token.span };
      case "string":
        this.next();
        return { type: "literal", value: token.value, span: token.span };
      case "param":
        this.next();
        return { type: "param", name: token.value, span: token.span };
      case "quoted": {
        const column = this.columnName();
        return { type: "column", ...column };
      }
      case "op":
        if (token.value === "(") {
          this.next();
          const inner = this.or();
          this.expectOp(")", "Close the bracket with )");
          return inner;
        }
        return this.fail(`Expected a value, found ${this.describe(token)}`);
      case "ident": {
        const word = token.value.toLowerCase();
        if (word === "true" || word === "false") {
          this.next();
          return { type: "literal", value: word === "true", span: token.span };
        }
        if (word === "null") {
          this.next();
          return { type: "literal", value: null, span: token.span };
        }
        if (this.isOp("(", this.peek()) && this.peek().joined) {
          this.next();
          this.next();
          const args: Expr[] = [];
          if (!this.isOp(")")) {
            do {
              if (args.length) this.next();
              args.push(this.or());
            } while (this.isOp(","));
          }
          const end = this.expectOp(")", `Close ${token.value}( with )`).span;
          return { type: "call", name: word, args, span: join(token.span, end), nameSpan: token.span };
        }
        const column = this.columnName();
        return { type: "column", ...column };
      }
      default:
        return this.fail(`Expected a value, found ${this.describe(token)}`);
    }
  }
}

/** The query's steps, or the first thing wrong with it. Throws `QueryError`. */
export function parseQuery(text: string): Pipeline {
  return new Parser(tokenize(text)).pipeline();
}
