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
  /** Empty when there is nothing to go ahead with (a refusal known before asking): only `keep` is offered. */
  go: string;
  fill: "bad" | "action";
  /**
   * A required note the go needs ("Why", 3–300 characters): drawn as a
   * textarea under the body; its text goes with the request under `key`.
   * `needed` is the error while it is shorter than `min`.
   */
  field?: { key: string; label: string; placeholder?: string; min: number; max: number; needed: string };
};
