/** The pack's four styles (design/books/spec/icons.md). */
export type CiStyle = "outline" | "outline-duo" | "fill" | "fill-duo";

/** One icon's inner markup on the 18 grid, per style. */
export type CiGlyph = { name: string } & Record<CiStyle, string>;
