import { phoneDisplay } from "@/lib/retail/people/words";
import { formatCount } from "@/lib/workspace/format";

/** A merge's words (CUS-05), shared by the server, the merge lookup and Activity. */

const pointsWords = (points: number) => `${formatCount(points)} ${Math.abs(points) === 1 ? "point" : "points"}`;
const visitsWords = (visits: number) => `${formatCount(visits)} ${visits === 1 ? "visit" : "visits"}`;

/** "412 points, 9 visits". */
export const pointsAndVisits = (points: number, visits: number) => `${pointsWords(points)}, ${visitsWords(visits)}`;

/** "T. Marange, +263 77 412 3380". */
export const nameAndPhone = (party: { name: string; phone: string | null }) =>
  party.phone ? `${party.name}, ${phoneDisplay(party.phone)}` : party.name;
