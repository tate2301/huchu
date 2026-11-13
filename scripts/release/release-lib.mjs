/**
 * Pure helpers behind `pnpm release:promote` and the fork sync.
 *
 * Two kinds of tag share one repository history:
 *
 *   core  `v2026.12.1`         — a release of tate2301/huchu, cut from `main`
 *   fork  `v2026.12.1-milling.3` — the third release of the milling fork built
 *                                  on core v2026.12.1
 *
 * A fork tag always names the core release it is built on, so anyone reading a
 * cell's version knows exactly which core it runs.
 *
 * Nothing here touches git; the callers pass tag names and commit text in.
 */

const CORE_TAG = /^v(\d{4})\.(\d{2})\.(\d+)$/;
const FLAVOUR = /^[a-z][a-z0-9-]{1,30}$/;

export function isCoreTag(tag) {
  return CORE_TAG.test(tag);
}

export function assertFlavour(flavour) {
  if (!FLAVOUR.test(flavour)) {
    throw new Error(`Fork flavour "${flavour}" must be lower-case letters, digits or "-", 2–31 characters.`);
  }
}

function parseCore(tag) {
  const match = CORE_TAG.exec(tag);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), n: Number(match[3]) };
}

function compareCore(a, b) {
  const x = parseCore(a);
  const y = parseCore(b);
  return x.year - y.year || x.month - y.month || x.n - y.n;
}

/** Core tags, oldest first. Anything that is not a core tag is ignored. */
export function sortCoreTags(tags) {
  return tags.filter(isCoreTag).sort(compareCore);
}

export function latestCoreTag(tags) {
  const sorted = sortCoreTags(tags);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/** `v2026.12.<n+1>` for the month of `now`, counting the tags already cut that month. */
export function nextCoreVersion(tags, now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const sameMonth = tags
    .map(parseCore)
    .filter((parsed) => parsed && parsed.year === year && parsed.month === month);
  const n = sameMonth.reduce((max, parsed) => Math.max(max, parsed.n), 0) + 1;
  return `v${year}.${String(month).padStart(2, "0")}.${n}`;
}

function forkPattern(baseCoreTag, flavour) {
  const escaped = baseCoreTag.replace(/\./g, "\\.");
  return new RegExp(`^${escaped}-${flavour}\\.(\\d+)$`);
}

/** `<base>-<flavour>.<k+1>`, counting the fork releases already cut on that core base. */
export function nextForkVersion(tags, baseCoreTag, flavour) {
  assertFlavour(flavour);
  if (!isCoreTag(baseCoreTag)) {
    throw new Error(`"${baseCoreTag}" is not a core release tag (vYYYY.MM.N).`);
  }
  const pattern = forkPattern(baseCoreTag, flavour);
  const k = tags.reduce((max, tag) => {
    const match = pattern.exec(tag);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${baseCoreTag}-${flavour}.${k + 1}`;
}

/** The newest fork tag of this flavour, by core base and then increment. */
export function latestForkTag(tags, flavour) {
  assertFlavour(flavour);
  const pattern = new RegExp(`^(v\\d{4}\\.\\d{2}\\.\\d+)-${flavour}\\.(\\d+)$`);
  let best = null;
  for (const tag of tags) {
    const match = pattern.exec(tag);
    if (!match) continue;
    const candidate = { tag, base: match[1], k: Number(match[2]) };
    if (!best || compareCore(candidate.base, best.base) > 0 || (candidate.base === best.base && candidate.k > best.k)) {
      best = candidate;
    }
  }
  return best ? best.tag : null;
}

/** Core tags released after `baseTag` (all of them when there is no base yet). */
export function coreTagsAfter(tags, baseTag) {
  const sorted = sortCoreTags(tags);
  if (!baseTag) return sorted;
  return sorted.filter((tag) => compareCore(tag, baseTag) > 0);
}

const MERGE_PR = /^Merge pull request #(\d+) from \S+$/;
const CONVENTIONAL = /^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/;

/**
 * One line per first-parent commit. A GitHub merge commit's subject is
 * "Merge pull request #N from branch"; the PR title is the first body line.
 */
export function describeCommit({ subject, body = "" }) {
  const merge = MERGE_PR.exec(subject.trim());
  if (merge) {
    const title = body.split("\n").map((line) => line.trim()).find(Boolean);
    return { text: title ?? subject.trim(), pr: Number(merge[1]) };
  }
  return { text: subject.trim(), pr: null };
}

const SECTIONS = [
  { title: "Breaking", match: (type, bang) => bang },
  { title: "Features", match: (type) => type === "feat" },
  { title: "Fixes", match: (type) => type === "fix" },
  { title: "Database", match: (type) => type === "db" || type === "migration" },
];

/** Release notes grouped by Conventional Commit type. Sync merges are listed under "Core". */
export function releaseNotes(version, commits) {
  const groups = new Map();
  const push = (title, line) => {
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(line);
  };

  for (const commit of commits) {
    const { text, pr } = describeCommit(commit);
    if (!text || /^chore\(release\)/.test(text)) continue;
    const suffix = pr ? ` (#${pr})` : "";
    if (/^chore\(sync\)/.test(text)) {
      push("Core", `${text.replace(/^chore\(sync\):\s*/, "")}${suffix}`);
      continue;
    }
    const conventional = CONVENTIONAL.exec(text);
    const type = conventional?.[1]?.toLowerCase() ?? "";
    const bang = Boolean(conventional?.[3]);
    const section = SECTIONS.find((candidate) => candidate.match(type, bang))?.title ?? "Other";
    push(section, `${conventional ? conventional[4] : text}${suffix}`);
  }

  const order = ["Breaking", "Core", "Features", "Fixes", "Database", "Other"];
  const lines = [`Release ${version}`, ""];
  for (const title of order) {
    const items = groups.get(title);
    if (!items?.length) continue;
    lines.push(`## ${title}`, "", ...items.map((item) => `- ${item}`), "");
  }
  if (lines.length === 2) lines.push("No changes since the previous release.");
  return lines.join("\n").trimEnd() + "\n";
}

/** New migration folders between two refs, from `git diff --name-only` output. */
export function migrationsFromDiff(paths) {
  return paths
    .map((path) => /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(path.trim()))
    .filter(Boolean)
    .map((match) => match[1])
    .sort();
}
