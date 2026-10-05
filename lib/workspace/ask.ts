/**
 * An ask: the words of a confirmation before anything hard to undo
 * (00-foundations 5.8). The title says what is about to happen to what; the
 * body says what happens, what it changes and whether it can be undone; `keep`
 * backs out and `go` does it. `fill` is `bad` for a destructive go and
 * `action` otherwise.
 */
export type Ask = {
  title: string;
  body: string;
  keep: string;
  go: string;
  fill: "bad" | "action";
};
