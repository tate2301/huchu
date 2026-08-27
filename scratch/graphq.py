#!/usr/bin/env python
"""Query the graphify knowledge graph at graphify-out/graph.json.

Usage:
  python graphq.py stats
  python graphq.py find <substring> [--file PATH] [--limit N]
  python graphq.py node <node_id>
  python graphq.py neighbors <node_id> [--depth 1] [--rel calls,imports] [--dir both|out|in]
  python graphq.py path <src_id> <dst_id> [--max 6]
  python graphq.py file <path-substring>
  python graphq.py community <name-substring>
  python graphq.py hubs [--limit 30] [--file PATH]
  python graphq.py rdeps <node_id>        # who depends on this
"""
import json
import os
import pickle
import sys
from collections import Counter, defaultdict, deque

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(ROOT), "graphify-out")
GRAPH = os.path.join(OUT, "graph.json")
CACHE = os.path.join(OUT, ".graphq_cache.pkl")


def load():
    if os.path.exists(CACHE) and os.path.getmtime(CACHE) > os.path.getmtime(GRAPH):
        with open(CACHE, "rb") as f:
            return pickle.load(f)
    with open(GRAPH, encoding="utf-8") as f:
        d = json.load(f)
    nodes = {n["id"]: n for n in d["nodes"]}
    out = defaultdict(list)
    inn = defaultdict(list)
    for e in d["links"]:
        out[e["source"]].append(e)
        inn[e["target"]].append(e)
    g = {
        "nodes": nodes,
        "out": dict(out),
        "in": dict(inn),
        "links": d["links"],
        "hyperedges": d.get("hyperedges", []),
        "commit": d.get("built_at_commit"),
    }
    with open(CACHE, "wb") as f:
        pickle.dump(g, f, protocol=4)
    return g


def fmt(g, nid, indent=""):
    n = g["nodes"].get(nid)
    if not n:
        return f"{indent}{nid}  <missing>"
    loc = f"{n.get('source_file','?')}:{(n.get('source_location') or '').lstrip('L')}"
    return f"{indent}{n.get('label',nid)}  [{nid}]  {loc}  ({n.get('community_name','')})"


def arg(flag, default=None, cast=str):
    if flag in sys.argv:
        return cast(sys.argv[sys.argv.index(flag) + 1])
    return default


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    g = load()
    nodes, out, inn = g["nodes"], g["out"], g["in"]
    limit = arg("--limit", 40, int)

    if cmd == "stats":
        print(f"commit {g['commit']}")
        print(f"{len(nodes)} nodes, {len(g['links'])} edges, {len(g['hyperedges'])} hyperedges")
        print("relations:", Counter(e["relation"] for e in g["links"]).most_common())
        print("file types:", Counter(n.get("file_type") for n in nodes.values()).most_common())

    elif cmd == "find":
        q = sys.argv[2].lower()
        ff = (arg("--file") or "").lower()
        hits = [
            n for n in nodes.values()
            if (q in n.get("label", "").lower() or q in n["id"].lower())
            and (not ff or ff in (n.get("source_file") or "").lower())
        ]
        hits.sort(key=lambda n: (len(n.get("label", "")), n["id"]))
        print(f"{len(hits)} matches")
        for n in hits[:limit]:
            print(" ", fmt(g, n["id"]))

    elif cmd == "node":
        nid = sys.argv[2]
        print(json.dumps(nodes[nid], indent=2))
        print(f"out-degree {len(out.get(nid, []))}  in-degree {len(inn.get(nid, []))}")

    elif cmd in ("neighbors", "rdeps"):
        nid = sys.argv[2]
        depth = arg("--depth", 1, int)
        rels = set((arg("--rel") or "").split(",")) - {""}
        direction = arg("--dir", "in" if cmd == "rdeps" else "both")
        seen = {nid}
        frontier = [(nid, 0)]
        print(fmt(g, nid))
        while frontier:
            cur, d = frontier.pop(0)
            if d >= depth:
                continue
            edges = []
            if direction in ("both", "out"):
                edges += [(e, e["target"], "->") for e in out.get(cur, [])]
            if direction in ("both", "in"):
                edges += [(e, e["source"], "<-") for e in inn.get(cur, [])]
            for e, other, a in edges:
                if rels and e["relation"] not in rels:
                    continue
                if other in seen:
                    continue
                seen.add(other)
                print("  " * (d + 1) + f"{a} {e['relation']}: " + fmt(g, other))
                frontier.append((other, d + 1))
        print(f"({len(seen)-1} reached)")

    elif cmd == "path":
        s, t = sys.argv[2], sys.argv[3]
        maxd = arg("--max", 6, int)
        prev = {s: None}
        q = deque([(s, 0)])
        found = False
        while q:
            cur, d = q.popleft()
            if cur == t:
                found = True
                break
            if d >= maxd:
                continue
            for e in out.get(cur, []) + inn.get(cur, []):
                o = e["target"] if e["source"] == cur else e["source"]
                if o not in prev:
                    prev[o] = (cur, e)
                    q.append((o, d + 1))
        if not found:
            print("no path within depth")
            return
        chain = []
        cur = t
        while prev[cur]:
            p, e = prev[cur]
            chain.append((cur, e))
            cur = p
        print(fmt(g, s))
        for nid, e in reversed(chain):
            print(f"  --{e['relation']}--> " + fmt(g, nid))

    elif cmd == "file":
        q = sys.argv[2].lower()
        by = defaultdict(list)
        for n in nodes.values():
            sf = n.get("source_file") or ""
            if q in sf.lower():
                by[sf].append(n)
        for sf in sorted(by)[:limit]:
            print(f"\n{sf}  ({len(by[sf])} symbols)")
            for n in sorted(by[sf], key=lambda x: x.get("source_location") or ""):
                print("   ", fmt(g, n["id"]))

    elif cmd == "community":
        q = sys.argv[2].lower()
        by = defaultdict(list)
        for n in nodes.values():
            cn = n.get("community_name") or ""
            if q in cn.lower():
                by[cn].append(n)
        for cn, ns in by.items():
            files = Counter(n.get("source_file") for n in ns)
            print(f"\n{cn}  ({len(ns)} nodes, {len(files)} files)")
            for f, c in files.most_common(limit):
                print(f"   {c:4d}  {f}")

    elif cmd == "hubs":
        ff = (arg("--file") or "").lower()
        deg = Counter()
        for nid in nodes:
            if ff and ff not in (nodes[nid].get("source_file") or "").lower():
                continue
            deg[nid] = len(out.get(nid, [])) + len(inn.get(nid, []))
        for nid, d in deg.most_common(limit):
            print(f"{d:5d}  " + fmt(g, nid))

    else:
        print(__doc__)


if __name__ == "__main__":
    main()
