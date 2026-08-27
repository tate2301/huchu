import os
import re
import collections

REPO = "."
SKIP = {"node_modules", ".next", ".git", ".worktrees", ".claude", ".codex", ".idea",
        ".vercel", "graphify-out", "scratch", "design", "public", "docs", "e2e"}

files = []
for root, dirs, fs in os.walk(REPO):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for f in fs:
        if f.endswith((".ts", ".tsx")):
            p = os.path.join(root, f).replace(os.sep, "/")
            files.append(p[2:] if p.startswith("./") else p)

pat = re.compile(r'import\s*\{([^}]*)\}\s*from\s*["\']@/lib/api-utils["\']', re.S)
uses_session = 0
pure = 0
members = collections.Counter()
pure_files = []
for f in files:
    with open(f, encoding="utf-8", errors="ignore") as fh:
        t = fh.read()
    m = pat.search(t)
    if not m:
        continue
    ms = [x.strip().replace("type ", "") for x in m.group(1).split(",") if x.strip()]
    members.update(ms)
    if "validateSession" in ms:
        uses_session += 1
    else:
        pure += 1
        pure_files.append(f)

print("files importing @/lib/api-utils:", uses_session + pure)
print("  need validateSession (drags auth graph):", uses_session)
print("  PURE helpers only:", pure)
print()
print("members:", members.most_common())
print()
print("sample pure-only importers:")
for f in pure_files[:12]:
    print("  ", f)
