"use client";

/** Up to three people on a record, overlapped, with how many more after. */
export function FaceStack({
  people,
  max = 3,
}: {
  people: Array<{ id: string; name: string | null; image?: string | null }>;
  max?: number;
}) {
  const unique = people.filter(
    (person, index) => people.findIndex((other) => other.id === person.id) === index,
  );
  const shown = unique.slice(0, max);
  const more = unique.length - shown.length;
  const label = unique.map((person) => person.name ?? "Someone").join(", ");

  return (
    <span className="rec-faces" role="img" aria-label={`On this record: ${label}`} title={label}>
      {shown.map((person) => (
        <span key={person.id} className="rec-face">
          {person.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.image} alt="" />
          ) : (
            (person.name ?? "?")
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("")
          )}
        </span>
      ))}
      {more > 0 ? <span className="rec-face rec-face-more">+{more}</span> : null}
    </span>
  );
}
