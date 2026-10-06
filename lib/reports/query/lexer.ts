/**
 * The report query language, read into tokens.
 *
 * Every token keeps where it sits in the text, so an error points at the
 * characters it is about, and whether it is the first on its line, because a
 * step starts on a new line (or after `|`) and that is how a word like `from`
 * is told apart from a column called `from`.
 */

export type Span = { from: number; to: number };

export class QueryError extends Error {
  readonly span: Span;
  constructor(message: string, span: Span) {
    super(message);
    this.name = "QueryError";
    this.span = span;
  }
}

export type TokenType =
  | "ident"
  /** A name in backticks: a column whose label has spaces, or a name you choose. */
  | "quoted"
  | "string"
  | "number"
  /** `$from` — a value the report is run with. */
  | "param"
  /** `@sales` — another block's result. */
  | "ref"
  | "op"
  | "eof";

export type Token = {
  type: TokenType;
  /** The text as meant: a string without its quotes, an operator as written. */
  value: string;
  span: Span;
  /** The first token on its line. */
  lineStart: boolean;
  /** Nothing between this token and the one before it. */
  joined: boolean;
};

const OPERATORS = ["<=", ">=", "!=", "<>", "==", "=", "<", ">", "+", "-", "*", "/", "%", "(", ")", ",", "|", "."];

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let lineStart = true;
  let lastEnd = -1;

  const push = (type: TokenType, value: string, from: number, to: number) => {
    tokens.push({ type, value, span: { from, to }, lineStart, joined: lastEnd === from });
    lineStart = false;
    lastEnd = to;
  };

  while (index < text.length) {
    const char = text[index]!;

    if (char === "\n") {
      lineStart = true;
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    // A comment runs to the end of its line.
    if (char === "-" && text[index + 1] === "-") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }

    const start = index;

    if (IDENT_START.test(char)) {
      while (index < text.length && IDENT_PART.test(text[index]!)) index += 1;
      push("ident", text.slice(start, index), start, index);
      continue;
    }

    if (/[0-9]/.test(char)) {
      while (index < text.length && /[0-9]/.test(text[index]!)) index += 1;
      if (text[index] === "." && /[0-9]/.test(text[index + 1] ?? "")) {
        index += 1;
        while (index < text.length && /[0-9]/.test(text[index]!)) index += 1;
      }
      push("number", text.slice(start, index), start, index);
      continue;
    }

    if (char === '"' || char === "'") {
      index += 1;
      let value = "";
      while (index < text.length && text[index] !== char) {
        if (text[index] === "\n") throw new QueryError("This text is not closed — add the closing quote", { from: start, to: index });
        if (text[index] === "\\" && index + 1 < text.length) {
          index += 1;
          value += text[index] === "n" ? "\n" : text[index];
        } else {
          value += text[index];
        }
        index += 1;
      }
      if (index >= text.length) throw new QueryError("This text is not closed — add the closing quote", { from: start, to: index });
      index += 1;
      push("string", value, start, index);
      continue;
    }

    if (char === "`") {
      const close = text.indexOf("`", index + 1);
      const newline = text.indexOf("\n", index + 1);
      if (close === -1 || (newline !== -1 && newline < close)) {
        throw new QueryError("This name is not closed — add the closing backtick", { from: start, to: start + 1 });
      }
      const value = text.slice(index + 1, close).trim();
      if (!value) throw new QueryError("A name in backticks cannot be empty", { from: start, to: close + 1 });
      index = close + 1;
      push("quoted", value, start, index);
      continue;
    }

    if (char === "$" || char === "@") {
      index += 1;
      while (index < text.length && IDENT_PART.test(text[index]!)) index += 1;
      if (index === start + 1) {
        throw new QueryError(
          char === "$" ? "A value needs a name after $, like $from" : "A block needs a name after @, like @sales",
          { from: start, to: index },
        );
      }
      push(char === "$" ? "param" : "ref", text.slice(start + 1, index), start, index);
      continue;
    }

    const op = OPERATORS.find((candidate) => text.startsWith(candidate, index));
    if (op) {
      index += op.length;
      push("op", op, start, index);
      continue;
    }

    throw new QueryError(`"${char}" is not part of the language`, { from: start, to: start + 1 });
  }

  tokens.push({ type: "eof", value: "", span: { from: text.length, to: text.length }, lineStart: true, joined: false });
  return tokens;
}
