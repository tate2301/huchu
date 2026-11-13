#!/usr/bin/env node
/**
 * Merge a core release into this fork and open the PR for it.
 *
 * Run by `.github/workflows/fork-upstream-sync.yml`, in the fork only. Needs:
 *
 *   UPSTREAM_REPO   owner/name of core, e.g. tate2301/huchu
 *   GH_TOKEN        a token that can read core and push branches, open PRs and
 *                   issues in the fork (a PR opened with the default
 *                   GITHUB_TOKEN would not trigger the fork's checks)
 *   REQUESTED_TAG   optional; the core tag to sync, else the newest on core's
 *                   `stable`
 *
 * What it does:
 *   - nothing, when the fork's main already contains the target tag;
 *   - on a clean merge: pushes `sync/<tag>` and opens "chore(sync): core <tag>"
 *     with the core release notes and the list of new core migrations;
 *   - on a conflict: pushes nothing and opens a `sync-conflict` issue naming
 *     the files. With the fork boundary held, a conflict means a core file was
 *     changed in the fork;
 *   - when the fork's main is more than two core releases behind, opens a
 *     `fork-behind` issue so it is not left to drift.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { coreTagsAfter, isCoreTag, latestCoreTag, migrationsFromDiff } from "../release/release-lib.mjs";

const upstream = process.env.UPSTREAM_REPO;
const token = process.env.GH_TOKEN;
const requested = process.env.REQUESTED_TAG?.trim() || null;
const MAX_BEHIND = 2;

if (!upstream || !token) {
  console.error("UPSTREAM_REPO and GH_TOKEN must be set.");
  process.exit(2);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options }).trim();
}
const git = (...args) => run("git", args);
const gh = (...args) => run("gh", args);

function tryGit(...args) {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
}

function bodyFile(text) {
  const path = join(mkdtempSync(join(tmpdir(), "fork-sync-")), "body.md");
  writeFileSync(path, text);
  return path;
}

function ensureLabel(name, color, description) {
  gh("label", "create", name, "--color", color, "--description", description, "--force");
}

/** Open an issue unless one with this exact title is already open. */
function openIssueOnce(title, body, label) {
  ensureLabel(label, "d93f0b", "Opened by the core sync");
  const existing = JSON.parse(gh("issue", "list", "--state", "open", "--label", label, "--json", "title"));
  if (existing.some((issue) => issue.title === title)) {
    console.log(`Issue already open: ${title}`);
    return;
  }
  gh("issue", "create", "--title", title, "--label", label, "--body-file", bodyFile(body));
  console.log(`Opened issue: ${title}`);
}

git("config", "user.name", "corelith-sync[bot]");
git("config", "user.email", "corelith-sync@users.noreply.github.com");

// UPSTREAM_GIT_URL points at a non-GitHub remote (used to rehearse the sync locally).
const upstreamUrl = process.env.UPSTREAM_GIT_URL || `https://x-access-token:${token}@github.com/${upstream}.git`;
if (!tryGit("remote", "set-url", "upstream", upstreamUrl)) git("remote", "add", "upstream", upstreamUrl);
git("fetch", "--quiet", "origin", "main");
git("fetch", "--quiet", "--tags", "upstream", "stable");

const released = git("tag", "--merged", "upstream/stable", "--list", "v*").split("\n").filter(isCoreTag);
const target = requested ?? latestCoreTag(released);
if (!target) {
  console.log("Core has no release on stable yet. Nothing to sync.");
  process.exit(0);
}
if (!released.includes(target)) {
  console.error(`${target} is not a core release on ${upstream} stable.`);
  process.exit(1);
}

const merged = git("tag", "--merged", "origin/main", "--list", "v*").split("\n").filter(isCoreTag);
const base = latestCoreTag(merged);
const behind = coreTagsAfter(released, base);

if (behind.length > MAX_BEHIND) {
  openIssueOnce(
    `Fork is ${behind.length} core releases behind`,
    [
      `This fork's main is on core ${base ?? "(none)"}. Core has released since:`,
      "",
      ...behind.map((tag) => `- ${tag}`),
      "",
      "Merge the open sync PR, or run the **Fork · upstream sync** workflow. Forks are kept within two core releases (FORK.md).",
    ].join("\n"),
    "fork-behind",
  );
}

if (tryGit("merge-base", "--is-ancestor", target, "origin/main")) {
  console.log(`main already contains core ${target}. Nothing to sync.`);
  process.exit(0);
}

const branch = `sync/${target}`;
if (tryGit("ls-remote", "--exit-code", "--heads", "origin", branch)) {
  console.log(`${branch} already exists; its PR is waiting for review.`);
  process.exit(0);
}

git("checkout", "-B", branch, "origin/main");
if (!tryGit("merge", "--no-ff", "--no-edit", "-m", `chore(sync): core ${target}`, target)) {
  const conflicts = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
  git("merge", "--abort");
  openIssueOnce(
    `Core ${target} does not merge cleanly`,
    [
      `Merging core ${target} into main conflicts in:`,
      "",
      ...conflicts.map((path) => `- \`${path}\``),
      "",
      "A fork only changes files inside its boundary (FORK.md), so a conflict means a core file was edited here.",
      "Move that change to core, or resolve it by hand on a `sync/` branch and remove the difference.",
    ].join("\n"),
    "sync-conflict",
  );
  process.exit(1);
}

// The core tag goes too: `release:promote` names fork releases after the newest core tag merged in.
git("push", "--quiet", "origin", `HEAD:refs/heads/${branch}`, `refs/tags/${target}`);

const notes = git("tag", "--list", "--format=%(contents)", target) || `Core ${target}.`;
const migrations = migrationsFromDiff(git("diff", "--name-only", `origin/main...${target}`).split("\n"));
const body = [
  `Merges core **${target}** into this fork${base ? ` (from ${base})` : ""}.`,
  "",
  "### Core release notes",
  "",
  notes,
  "",
  "### Core migrations this brings",
  "",
  migrations.length ? migrations.map((name) => `- \`${name}\``).join("\n") : "None.",
  "",
  "### Before merging",
  "",
  "- [ ] Checks green, including the migration rehearsal on a copy of production",
  "- [ ] Read the core notes for anything the vertical relies on",
  "- [ ] After merging: `pnpm release:promote` to release the fork to `stable`",
].join("\n");

ensureLabel("sync", "0e8a16", "Core release merged into the fork");
gh(
  "pr",
  "create",
  "--base",
  "main",
  "--head",
  branch,
  "--title",
  `chore(sync): core ${target}`,
  "--label",
  "sync",
  "--body-file",
  bodyFile(body),
);
console.log(`✓ Opened the sync PR for core ${target}.`);
