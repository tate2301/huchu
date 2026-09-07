"use client";

/**
 * A cover for a book that has no cover image.
 *
 * `SchoolBook` carries no image column, and a shelf of identical grey
 * rectangles is not a shelf — a cover's whole job is to make a book
 * recognisable before it is read. So the spine is drawn from the title: the
 * words set large, the author under them, and a hue derived from the title so
 * the same book is the same colour every time anybody opens the catalogue.
 *
 * The hue is computed rather than stored on purpose. It costs no column, it
 * cannot drift out of sync with a retitled book, and it is identical in the
 * student portal and at the issue desk — which is what makes "the blue one" a
 * thing two people can say to each other.
 *
 * When covers do arrive — an image column, or an ISBN lookup — this is the one
 * place that changes.
 */
export function BookCover({
  title,
  author,
  size = "md",
}: {
  title: string;
  author?: string | null;
  size?: "sm" | "md";
}) {
  const hue = [...title].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return (
    <div
      className={[
        "flex aspect-[3/4] flex-col justify-between rounded-[var(--radius-md)]",
        size === "sm" ? "p-2" : "p-3",
      ].join(" ")}
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 62% 42%), hsl(${(hue + 28) % 360} 58% 30%))`,
      }}
    >
      <span
        className={[
          "font-semibold leading-tight text-[color:var(--text-inverse)]",
          size === "sm"
            ? "line-clamp-3 text-[length:var(--type-caption)]"
            : "line-clamp-4 text-[length:var(--type-body-sm)]",
        ].join(" ")}
      >
        {title}
      </span>
      <span className="truncate text-[length:var(--type-caption)] text-[color:var(--text-inverse)] opacity-80">
        {author ?? "Unknown author"}
      </span>
    </div>
  );
}
