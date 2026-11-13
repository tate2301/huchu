#!/usr/bin/env node
/**
 * Cut a release and move `stable` to it.
 *
 *   pnpm release:promote --dry-run      # print the version and notes, change nothing
 *   pnpm release:promote                # tag, push the tag, fast-forward stable
 *
 * Core (tate2301/huchu) tags `vYYYY.MM.N`. A fork (it has a FORK.md naming its
 * flavour; FORK_FLAVOUR or --flavour override) tags `<core base>-<flavour>.<k>`,
 * where the core base is the newest core release merged into the fork.
 *
 * Every dedicated cell's Vercel project deploys `stable`, so moving `stable`
 * is the deploy. It only ever fast-forwards: if `stable` has a commit `main`
 * does not, the push is refused and nothing is released.
 *
 * Release notes go in the annotated tag; `.github/workflows/release.yml` turns
 * the tag into a GitHub Release and tells the forks. No commit is made, so
 * `main` needs no bypass of its branch protection.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import {
  latestCoreTag,
  latestForkTag,
  nextCoreVersion,
  nextForkVersion,
  releaseNotes,
} from "./release-lib.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const flavourIndex = args.indexOf("--flavour");
const flavour = flavourIndex >= 0 ? args[flavourIndex + 1] : process.env.FORK_FLAVOUR || flavourFromForkDoc();
const remoteIndex = args.indexOf("--remote");
const remote = remoteIndex >= 0 ? args[remoteIndex + 1] : "origin";

/** A fork's FORK.md opens "# owner/name: the <flavour> fork of Corelith"; core has no FORK.md. */
function flavourFromForkDoc() {
  if (!existsSync("FORK.md")) return null;
  return /^# \S+: the ([a-z0-9-]+) fork of Corelith/m.exec(readFileSync("FORK.md", "utf8"))?.[1] ?? null;
}

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("Run this on main.");
if (git("status", "--porcelain")) fail("The working tree has changes. Commit or stash them first.");

git("fetch", remote, "main", "--tags", "--force");
const head = git("rev-parse", "HEAD");
if (head !== git("rev-parse", `${remote}/main`)) fail(`Local main is not ${remote}/main. Pull or push first.`);

const allTags = git("tag", "--list", "v*").split("\n").filter(Boolean);
const mergedTags = git("tag", "--merged", "HEAD", "--list", "v*").split("\n").filter(Boolean);

let version;
let previous;
if (flavour) {
  const base = latestCoreTag(mergedTags);
  if (!base) fail("No core release is merged into this fork yet. Sync a core release first.");
  version = nextForkVersion(allTags, base, flavour);
  previous = latestForkTag(mergedTags, flavour) ?? base;
} else {
  version = nextCoreVersion(allTags);
  previous = latestCoreTag(mergedTags);
}

if (previous && git("rev-parse", `${previous}^{commit}`) === head) fail(`HEAD is already released as ${previous}.`);

const range = previous ? `${previous}..HEAD` : "HEAD";
const log = git("log", "--first-parent", "--format=%s%x1f%b%x1e", range);
const commits = log
  .split("\x1e")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [subject, body = ""] = entry.split("\x1f");
    return { subject, body };
  });

const notes = releaseNotes(version, commits);
console.log(`${flavour ? `Fork (${flavour})` : "Core"} release ${version}${previous ? `, since ${previous}` : ""}\n`);
console.log(notes);

if (dryRun) {
  console.log("--dry-run: nothing tagged or pushed.");
  process.exit(0);
}

// verbatim: the default cleanup strips "## Features" and every other heading as a comment.
execFileSync("git", ["tag", "-a", "--cleanup=verbatim", version, "-F", "-"], { input: notes, stdio: ["pipe", "inherit", "inherit"] });
try {
  // Fast-forward only: git refuses a non-fast-forward push without --force.
  git("push", remote, `${head}:refs/heads/stable`);
} catch (error) {
  git("tag", "-d", version);
  fail(`${remote}/stable could not fast-forward to main. It has commits main does not.\n${error.stderr ?? ""}`);
}
git("push", remote, `refs/tags/${version}`);
console.log(`✓ ${version} tagged, and ${remote}/stable moved to ${head.slice(0, 8)}.`);
