#!/usr/bin/env node
/**
 * PostToolUse hook — paired-test check.
 *
 * When a lib/gold/ source file (not a test file) is edited, warns if
 * no sibling *.test.ts was touched in the same session.
 *
 * Tracks touched files in a session-scoped temp file keyed by
 * CLAUDE_SESSION_ID (set by the Claude Code harness).
 *
 * Exit 0 always — warning only.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const SESSION_ID = process.env.CLAUDE_SESSION_ID || "unknown";
const TOUCHED_FILE = path.join(os.tmpdir(), `claude-gold-touched-${SESSION_ID}.json`);

function loadTouched() {
  try {
    return JSON.parse(fs.readFileSync(TOUCHED_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveTouched(list) {
  fs.writeFileSync(TOUCHED_FILE, JSON.stringify(list));
}

const chunks = [];
process.stdin.on("data", (d) => chunks.push(d));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    const rawPath = input?.tool_input?.file_path || "";
    const filePath = rawPath.replace(/\\/g, "/");

    if (!filePath.includes("lib/gold/")) process.exit(0);

    // Exclude test-support files — they ARE the test infrastructure
    const isTestSupport = filePath.includes("test-factories") || filePath.includes("vitest.setup");
    if (isTestSupport) process.exit(0);

    const touched = loadTouched();
    if (!touched.includes(filePath)) {
      touched.push(filePath);
      saveTouched(touched);
    }

    const isSource = !filePath.includes(".test.") && !filePath.includes(".spec.");
    const hasTest = touched.some((f) => f.includes(".test.") || f.includes(".spec."));

    if (isSource && !hasTest) {
      process.stdout.write(
        JSON.stringify({
          systemMessage: `⚠️  Paired-test check: "${filePath}" was edited but no *.test.ts has been touched this session. Gold P0 migrations require a migration witness test in the same commit (see §11.2 of the review doc).`,
        }) + "\n",
      );
    }
  } catch {
    // Silently exit on errors
  }
  process.exit(0);
});
