"""Phase 2.3a: page chrome, shared components, saved-record and the guided-mode hook to packages/ui."""
import os, re, subprocess
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; UI=f"{ROOT}/packages/ui"
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
MOVES = {  # app path (no ext) -> ui path (no ext)
  "components/layout/page-chrome": "layout/page-chrome",
  "components/layout/page-heading": "layout/page-heading",
  "components/layout/page-actions": "layout/page-actions",
  "components/layout/list-page-shell": "layout/list-page-shell",
  "components/layout/detail-page-shell": "layout/detail-page-shell",
  "components/shared/context-help": "shared/context-help",
  "components/shared/data-list-shell": "shared/data-list-shell",
  "components/shared/field-help": "shared/field-help",
  "components/shared/form-shell": "shared/form-shell",
  "components/shared/page-intro": "shared/page-intro",
  "components/shared/primary-action-bar": "shared/primary-action-bar",
  "components/shared/record-saved-banner": "shared/record-saved-banner",
  "components/shared/status-state": "shared/status-state",
  "lib/saved-record": "lib/saved-record",
  "hooks/use-guided-mode": "hooks/use-guided-mode",
}
os.makedirs(f"{UI}/layout", exist_ok=True); os.makedirs(f"{UI}/shared", exist_ok=True)
for src, dst in MOVES.items():
    ext = ".tsx" if os.path.exists(f"{APP}/{src}.tsx") else ".ts"
    sh(f'git mv "{APP}/{src}{ext}" "{UI}/{dst}{ext}"')
alts = "|".join(re.escape(k) for k in sorted(MOVES, key=len, reverse=True))
SPEC = re.compile(r'(["\'])@/(' + alts + r')\1')
def walk(base):
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in ("node_modules", ".next", ".turbo")]
        for f in fn:
            if f.endswith((".ts", ".tsx", ".mjs", ".js")): yield os.path.join(dp, f)
def rewrite(path, in_ui):
    txt = open(path, encoding="utf-8").read()
    def repl(m):
        q, key = m.group(1), m.group(2); target = MOVES[key]
        if in_ui:
            rel = os.path.relpath(f"{UI}/{target}", os.path.dirname(path))
            if not rel.startswith("."): rel = "./" + rel
            return f"{q}{rel}{q}"
        return f"{q}@corelithzw/ui/{target}{q}"
    new = SPEC.sub(repl, txt)
    if new != txt: open(path, "w", encoding="utf-8").write(new); return 1
    return 0
a = sum(rewrite(p, False) for p in walk(APP)); b = sum(rewrite(p, True) for p in walk(UI))
print(f"moved {len(MOVES)}; rewritten app={a} ui={b}")
left = [p for p in walk(UI) if re.search(r'["\']@/', open(p).read())]
print("ui files still importing '@/':", [os.path.relpath(p, UI) for p in left] or "none")
