/**
 * Duplicate detection for people, companies and leads.
 *
 * Runs on manual creation, lead conversion, imports and form submissions. The
 * rule throughout is to *warn*, never to block: a real business genuinely has
 * two people called John Moyo, and refusing the second one is worse than
 * showing the first.
 */
import type { Prisma } from "@corelithzw/db";

import { normalizeEmail, normalizePhoneE164 } from "./phone";

export type DuplicateConfidence = "EXACT" | "STRONG" | "POSSIBLE";

export type DuplicateMatch<T> = {
  record: T;
  confidence: DuplicateConfidence;
  /** Why this was flagged, in words a user can act on. */
  reasons: string[];
};

type Tx = Prisma.TransactionClient;

/** Strip punctuation and casing so "Delta Interiors (Pvt) Ltd" ≈ "delta interiors pvt ltd". */
export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/\b(pvt|pty|ltd|limited|inc|incorporated|llc|plc|cc|co|company|holdings|group)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Host of a URL, without www, for matching companies by website. */
export function extractDomain(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Similarity on 0..1 using a token-overlap measure (Dice on word sets).
 * Chosen over edit distance because business names differ by whole words far
 * more often than by typos.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = new Set(normalizeName(a).split(" ").filter(Boolean));
  const right = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

const STRONG_NAME_THRESHOLD = 0.8;
const POSSIBLE_NAME_THRESHOLD = 0.6;

export type PersonCandidate = {
  id: string;
  personNo: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  client: { id: string; name: string } | null;
};

/**
 * Find people who may already be this person. Email and phone are treated as
 * identity; name alone is only a possible match unless the company matches too.
 */
export async function findPersonDuplicates(
  db: Tx,
  input: {
    companyId: string;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    clientId?: string | null;
    excludeId?: string;
  },
): Promise<DuplicateMatch<PersonCandidate>[]> {
  const emailNormalized = normalizeEmail(input.email ?? undefined);
  const phoneE164 = normalizePhoneE164(input.phone ?? undefined);
  const nameKey = normalizeName(input.fullName);

  const or: Prisma.CrmPersonWhereInput[] = [];
  if (emailNormalized) or.push({ emailNormalized });
  if (phoneE164) or.push({ phoneE164 });
  if (nameKey) {
    // Fetch on the first token and score precisely in memory — a LIKE on the
    // whole name would miss "John Moyo" vs "Moyo John".
    const firstToken = nameKey.split(" ")[0];
    if (firstToken.length >= 3) {
      or.push({ fullName: { contains: firstToken, mode: "insensitive" } });
    }
  }
  if (or.length === 0) return [];

  const candidates = await db.crmPerson.findMany({
    where: {
      companyId: input.companyId,
      archivedAt: null,
      mergedIntoId: null,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: or,
    },
    select: {
      id: true,
      personNo: true,
      fullName: true,
      email: true,
      phone: true,
      jobTitle: true,
      emailNormalized: true,
      phoneE164: true,
      clientId: true,
      client: { select: { id: true, name: true } },
    },
    take: 25,
  });

  const matches: DuplicateMatch<PersonCandidate>[] = [];
  for (const candidate of candidates) {
    const reasons: string[] = [];
    let confidence: DuplicateConfidence | null = null;

    if (emailNormalized && candidate.emailNormalized === emailNormalized) {
      reasons.push("Same email address");
      confidence = "EXACT";
    }
    if (phoneE164 && candidate.phoneE164 === phoneE164) {
      reasons.push("Same phone number");
      confidence = confidence === "EXACT" ? "EXACT" : "STRONG";
    }

    const similarity = nameSimilarity(input.fullName ?? "", candidate.fullName);
    if (similarity >= POSSIBLE_NAME_THRESHOLD) {
      const sameCompany = Boolean(input.clientId) && candidate.clientId === input.clientId;
      if (sameCompany) {
        reasons.push("Similar name at the same company");
        confidence = confidence ?? "STRONG";
      } else if (similarity >= STRONG_NAME_THRESHOLD) {
        reasons.push("Very similar name");
        confidence = confidence ?? "POSSIBLE";
      } else {
        reasons.push("Similar name");
        confidence = confidence ?? "POSSIBLE";
      }
    }

    if (confidence) {
      matches.push({
        record: {
          id: candidate.id,
          personNo: candidate.personNo,
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          jobTitle: candidate.jobTitle,
          client: candidate.client,
        },
        confidence,
        reasons,
      });
    }
  }

  return sortByConfidence(matches);
}

export type CompanyCandidate = {
  id: string;
  clientNo: string;
  name: string;
  registrationNumber: string | null;
  website: string | null;
  city: string | null;
};

/**
 * Find companies that may already be this company. Registration and tax
 * numbers are legal identity, so they are exact matches; a shared web domain
 * is nearly as strong.
 */
export async function findCompanyDuplicates(
  db: Tx,
  input: {
    companyId: string;
    name?: string | null;
    registrationNumber?: string | null;
    taxNumber?: string | null;
    website?: string | null;
    excludeId?: string;
  },
): Promise<DuplicateMatch<CompanyCandidate>[]> {
  const domain = extractDomain(input.website);
  const registration = input.registrationNumber?.trim() || null;
  const tax = input.taxNumber?.trim() || null;
  const nameKey = normalizeName(input.name);

  const or: Prisma.CrmClientWhereInput[] = [];
  if (registration) or.push({ registrationNumber: registration });
  if (tax) or.push({ taxNumber: tax });
  if (domain) or.push({ websiteDomain: domain });
  if (nameKey) {
    const firstToken = nameKey.split(" ")[0];
    if (firstToken.length >= 3) or.push({ name: { contains: firstToken, mode: "insensitive" } });
  }
  if (or.length === 0) return [];

  const candidates = await db.crmClient.findMany({
    where: {
      companyId: input.companyId,
      archivedAt: null,
      mergedIntoId: null,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: or,
    },
    select: {
      id: true,
      clientNo: true,
      name: true,
      registrationNumber: true,
      taxNumber: true,
      website: true,
      websiteDomain: true,
      city: true,
    },
    take: 25,
  });

  const matches: DuplicateMatch<CompanyCandidate>[] = [];
  for (const candidate of candidates) {
    const reasons: string[] = [];
    let confidence: DuplicateConfidence | null = null;

    if (registration && candidate.registrationNumber === registration) {
      reasons.push("Same registration number");
      confidence = "EXACT";
    }
    if (tax && candidate.taxNumber === tax) {
      reasons.push("Same tax number");
      confidence = "EXACT";
    }
    if (domain && candidate.websiteDomain === domain) {
      reasons.push("Same website domain");
      confidence = confidence ?? "STRONG";
    }

    const similarity = nameSimilarity(input.name ?? "", candidate.name);
    if (similarity >= STRONG_NAME_THRESHOLD) {
      reasons.push("Very similar name");
      confidence = confidence ?? "STRONG";
    } else if (similarity >= POSSIBLE_NAME_THRESHOLD) {
      reasons.push("Similar name");
      confidence = confidence ?? "POSSIBLE";
    }

    if (confidence) {
      matches.push({
        record: {
          id: candidate.id,
          clientNo: candidate.clientNo,
          name: candidate.name,
          registrationNumber: candidate.registrationNumber,
          website: candidate.website,
          city: candidate.city,
        },
        confidence,
        reasons,
      });
    }
  }

  return sortByConfidence(matches);
}

export type LeadCandidate = {
  id: string;
  leadNo: string;
  title: string | null;
  contactName: string | null;
  stage: string;
  createdAt: Date;
};

/**
 * Find leads that look like the same enquiry. Unlike people and companies, an
 * old lead from the same contact is not a duplicate — a customer who comes
 * back next year is new business — so this only looks at a recent window.
 */
export async function findLeadDuplicates(
  db: Tx,
  input: {
    companyId: string;
    email?: string | null;
    phone?: string | null;
    withinDays?: number;
    excludeId?: string;
  },
): Promise<DuplicateMatch<LeadCandidate>[]> {
  const emailNormalized = normalizeEmail(input.email ?? undefined);
  const phoneE164 = normalizePhoneE164(input.phone ?? undefined);
  if (!emailNormalized && !phoneE164) return [];

  const since = new Date(Date.now() - (input.withinDays ?? 30) * 86_400_000);
  const or: Prisma.CrmLeadWhereInput[] = [];
  if (emailNormalized) or.push({ contactEmail: { equals: emailNormalized, mode: "insensitive" } });
  if (phoneE164) or.push({ contactPhone: phoneE164 });

  const candidates = await db.crmLead.findMany({
    where: {
      companyId: input.companyId,
      convertedAt: null,
      createdAt: { gte: since },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: or,
    },
    select: { id: true, leadNo: true, title: true, contactName: true, stage: true, createdAt: true, contactEmail: true, contactPhone: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return candidates.map((candidate) => {
    const reasons: string[] = [];
    if (emailNormalized && candidate.contactEmail?.toLowerCase() === emailNormalized) {
      reasons.push("Same email on a recent open enquiry");
    }
    if (phoneE164 && candidate.contactPhone === phoneE164) {
      reasons.push("Same phone on a recent open enquiry");
    }
    return {
      record: {
        id: candidate.id,
        leadNo: candidate.leadNo,
        title: candidate.title,
        contactName: candidate.contactName,
        stage: candidate.stage,
        createdAt: candidate.createdAt,
      },
      confidence: "STRONG" as const,
      reasons,
    };
  });
}

const CONFIDENCE_ORDER: Record<DuplicateConfidence, number> = {
  EXACT: 0,
  STRONG: 1,
  POSSIBLE: 2,
};

function sortByConfidence<T>(matches: DuplicateMatch<T>[]): DuplicateMatch<T>[] {
  return matches.sort(
    (a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence],
  );
}
