#!/usr/bin/env python
"""File-level module graph derived from graphify-out/graph.json.

Collapses symbol nodes to their source_file and keeps import edges, giving the
module graph Next/Turbopack actually has to walk when compiling a route.

  python filegraph.py closures            # transitive closure size per route entry
  python filegraph.py closure <file>      # what one route pulls in
  python filegraph.py barrels             # widest fan-out modules
  python filegraph.py why <route> <dep>   # shortest import chain route -> dep
  python filegraph.py cost <file>         # closure + LOC weight
"""
import json
import os
import pickle
import sys
from collections import Counter, defaultdict, deque

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
GRAPH = os.path.join(REPO, "graphify-out", "graph.json")
CACHE = os.path.join(REPO, "graphify-out", ".filegraph_cache.pkl")

IMPORT_RELS = {"imports", "imports_from", "re_exports", "dynamic_import"}


def build():
    if os.path.exists(CACHE) and os.path.getmtime(CACHE) > os.path.getmtime(GRAPH):
        with open(CACHE, "rb") as f:
            return pickle.load(f)
    with open(GRAPH, encoding="utf-8") as f:
        d = json.load(f)
    owner = {}
    for n in d["nodes"]:
        sf = n.get("source_file")
        if sf:
            owner[n["id"]] = sf
    fout = defaultdict(set)
    fin = defaultdict(set)
    for e in d["links"]:
        if e["relation"] not in IMPORT_RELS:
            continue
        s, t = owner.get(e["source"]), owner.get(e["target"])
        if not s or not t or s == t:
            continue
        fout[s].add(t)
        fin[t].add(s)
    g = {"out": {k: sorted(v) for k, v in fout.items()},
         "in": {k: sorted(v) for k, v in fin.items()},
         "files": sorted({f for f in owner.values()})}
    with open(CACHE, "wb") as f:
        pickle.dump(g, f, protocol=4)
    return g


def loc_map():
    m = {}
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [x for x in dirs if x not in
                   {"node_modules", ".next", ".git", ".worktrees", "graphify-out", "scratch"}]
        for fn in files:
            if fn.endswith((".ts", ".tsx")):
                p = os.path.relpath(os.path.join(root, fn), REPO).replace("\\", "/")
                try:
                    with open(os.path.join(root, fn), "rb") as f:
                        m[p] = f.read().count(b"\n") + 1
                except OSError:
                    pass
    return m


def closure(g, start):
    seen = {start}
    q = deque([start])
    while q:
        cur = q.popleft()
        for nxt in g["out"].get(cur, ()):
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    return seen


def is_route(f):
    return f.startswith("app/") and (
        f.endswith("/page.tsx") or f.endswith("/route.ts") or f.endswith("/layout.tsx"))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    g = build()

    if cmd == "closures":
        loc = loc_map()
        rows = []
        for f in g["files"]:
            if not is_route(f):
                continue
            c = closure(g, f)
            rows.append((len(c), sum(loc.get(x, 0) for x in c), f))
        rows.sort(reverse=True)
        print(f"{len(rows)} route entries in graph")
        print(f"{'mods':>5} {'LOC':>8}  route")
        for n, l, f in rows[:int(sys.argv[2]) if len(sys.argv) > 2 else 40]:
            print(f"{n:5d} {l:8d}  {f}")
        tot = [r[0] for r in rows]
        print(f"\nmedian closure {sorted(tot)[len(tot)//2]} modules, max {max(tot)}")

    elif cmd == "closure":
        f = sys.argv[2]
        c = closure(g, f)
        print(f"{f}: {len(c)} modules")
        by = Counter(x.split("/")[0] + "/" + (x.split("/")[1] if "/" in x[len(x.split('/')[0])+1:] else "")
                     for x in c)
        for k, v in by.most_common(25):
            print(f"  {v:5d}  {k}")

    elif cmd == "cost":
        f = sys.argv[2]
        loc = loc_map()
        c = closure(g, f)
        rows = sorted(((loc.get(x, 0), x) for x in c), reverse=True)
        print(f"{f}: {len(c)} modules, {sum(r[0] for r in rows)} LOC")
        for l, x in rows[:30]:
            print(f"  {l:6d}  {x}")

    elif cmd == "barrels":
        loc = loc_map()
        rows = []
        for f in g["files"]:
            fanin = len(g["in"].get(f, ()))
            fanout = len(g["out"].get(f, ()))
            if fanin < 5:
                continue
            c = closure(g, f)
            rows.append((fanin * len(c), fanin, fanout, len(c), sum(loc.get(x, 0) for x in c), f))
        rows.sort(reverse=True)
        print(f"{'blast':>9} {'in':>5} {'out':>5} {'clos':>5} {'closLOC':>8}  file")
        for blast, fi, fo, cl, cloc, f in rows[:int(sys.argv[2]) if len(sys.argv) > 2 else 30]:
            print(f"{blast:9d} {fi:5d} {fo:5d} {cl:5d} {cloc:8d}  {f}")

    elif cmd == "why":
        src, dst = sys.argv[2], sys.argv[3]
        prev = {src: None}
        q = deque([src])
        while q:
            cur = q.popleft()
            if cur == dst:
                break
            for nxt in g["out"].get(cur, ()):
                if nxt not in prev:
                    prev[nxt] = cur
                    q.append(nxt)
        if dst not in prev:
            print("no import path")
            return
        chain = []
        cur = dst
        while cur:
            chain.append(cur)
            cur = prev[cur]
        for i, f in enumerate(reversed(chain)):
            print("  " * i + ("-> " if i else "") + f)

    else:
        print(__doc__)


if __name__ == "__main__":
    main()
