#!/usr/bin/env node
/**
 * Stop hook — session footprint summary.
 *
 * Reads the touched-files log written by agent-paired-test-check.js
 * and emits a brief summary so every agent turn leaves a visible record.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const SESSION_ID = process.env.CLAUDE_SESSION_ID || "unknown";
const TOUCHED_FILE = path.join(os.tmpdir(), `claude-gold-touched-${SESSION_ID}.json`);
const role = process.env.GOLD_AGENT_ROLE || "unknown";

try {
  const touched = JSON.parse(fs.readFileSync(TOUCHED_FILE, "utf8"));
  if (touched.length > 0) {
    const sources = touched.filter((f) => !f.includes(".test.") && !f.includes(".spec."));
    const tests = touched.filter((f) => f.includes(".test.") || f.includes(".spec."));
    process.stdout.write(
      JSON.stringify({
        systemMessage: `📋 Session summary [${role}]: ${sources.length} source file(s) + ${tests.length} test file(s) touched.\nFiles: ${touched.map((f) => f.split("/").slice(-2).join("/")).join(", ")}`,
      }) + "\n",
    );
    // Clean up the temp file
    fs.unlinkSync(TOUCHED_FILE);
  }
} catch {
  // No touched file — session made no Gold edits, nothing to report
}
process.exit(0);
