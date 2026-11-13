#!/usr/bin/env node
/**
 * Create an industry fork of core from an empty GitHub repository.
 *
 *   pnpm fork:bootstrap --repo tate2301/corelith-milling --flavour milling [--dry-run]
 *
 * Run from a clean checkout of tate2301/huchu, on main, with push access to
 * the new, empty repository. It:
 *
 *   1. pushes core's full history to the fork's `main`, so every later sync is
 *      an ordinary three-way merge;
 *   2. adds one commit with the fork's FORK.md;
 *   3. points the fork's `stable` at that commit;
 *   4. prints the repository variables and secrets that switch on the fork
 *      workflows (they ship in core and do nothing until FORK_FLAVOUR is set).
 *
 * It does not create the GitHub repository and does not set secrets.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertFlavour } from "../release/release-lib.mjs";
import { allowedPaths } from "./boundary-lib.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const repo = option("--repo");
const flavour = option("--flavour");
const dryRun = args.includes("--dry-run");

if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !flavour) {
  console.error("Usage: pnpm fork:bootstrap --repo <owner/name> --flavour <flavour> [--dry-run]");
  process.exit(2);
}
assertFlavour(flavour);

const git = (...gitArgs) => execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") {
  console.error("Run this on core's main.");
  process.exit(1);
}
if (git("status", "--porcelain")) {
  console.error("The working tree has changes. Commit or stash them first.");
  process.exit(1);
}

const core = git("remote", "get-url", "origin").replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
// --url pushes somewhere other than github.com/<repo> (used to rehearse locally).
const forkUrl = option("--url") ?? `https://github.com/${repo}.git`;

const template = readFileSync(new URL("./FORK.template.md", import.meta.url), "utf8");
const forkDoc = template
  .replaceAll("{{FLAVOUR}}", flavour)
  .replaceAll("{{FORK_REPO}}", repo)
  .replaceAll("{{CORE_REPO}}", core)
  .replaceAll("{{ALLOWED_PATHS}}", allowedPaths(flavour).map(({ label }) => `- \`${label}\``).join("\n"));

if (dryRun) {
  console.log(`Would push ${core}@main to ${forkUrl} and commit this FORK.md:\n`);
  console.log(forkDoc);
} else {
  const worktree = mkdtempSync(join(tmpdir(), "fork-bootstrap-"));
  try {
    git("worktree", "add", "--detach", worktree, "HEAD");
    writeFileSync(join(worktree, "FORK.md"), forkDoc);
    execFileSync("git", ["-C", worktree, "add", "FORK.md"]);
    execFileSync("git", ["-C", worktree, "commit", "-m", `chore(fork): bootstrap the ${flavour} fork of ${core}`]);
    const commit = execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    execFileSync("git", ["push", forkUrl, `${commit}:refs/heads/main`, `${commit}:refs/heads/stable`], {
      stdio: "inherit",
    });
    // Core release tags let the fork name its base (v…-milling.N) from day one.
    execFileSync("git", ["push", forkUrl, "--tags"], { stdio: "inherit" });
  } finally {
    git("worktree", "remove", "--force", worktree);
    rmSync(worktree, { recursive: true, force: true });
  }
  console.log(`\n✓ ${repo} now holds core history plus FORK.md on main and stable.`);
}

console.log(`
Switch the fork workflows on. In ${repo} → Settings → Secrets and variables → Actions:

  Variables
    FORK_FLAVOUR        ${flavour}
    UPSTREAM_REPO       ${core}
    NEON_PROJECT_ID     <the cell's Neon project>        (migration rehearsal)
    NEON_PARENT_BRANCH  <the cell's production branch>   (migration rehearsal)
    NEON_DB_ROLE        optional, default neondb_owner
    NEON_DB_NAME        optional, default neondb

  Secrets
    FORK_SYNC_TOKEN     fine-grained token: ${core} contents read; ${repo} contents,
                        pull requests and issues write
    NEON_API_KEY        Neon API key that may create and delete branches

In ${core} → Settings → Secrets and variables → Actions:

  Variables
    FORK_REPOS          ${repo}   (space-separated when there are several)
  Secrets
    FORK_DISPATCH_TOKEN fine-grained token: ${repo} contents write (repository_dispatch)

Then run "Fork · upstream sync" once by hand in ${repo} to prove the loop.`);
