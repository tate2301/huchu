#!/usr/bin/env python3
"""Print a board as a compact outline: tag.classes "text", icons as [icon], no SVG paths or styles.

  python3 -I outline.py <board name or path> [--all]

By default the shell (rail, module panel) is skipped: it is already built. --all keeps it.
Repeated sibling rows after the third are folded into "... +N more".
"""
import sys, os, re
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
SKIP = {"style", "script", "head", "title", "colgroup"}
SHELL = {"rail-m", "pm"}
KEEP_ATTR = ("aria-label", "placeholder", "href", "role", "aria-sort", "type", "value", "title")


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.kids, self.text = tag, dict(attrs), parent, [], []


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", {}, None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, d):
        d = re.sub(r"\s+", " ", d)
        if d.strip():
            self.cur.kids.append(d.strip())


def label(n):
    cls = n.attrs.get("class", "").split()
    s = n.tag + "".join("." + c for c in cls)
    extra = [f'{k}="{n.attrs[k]}"' for k in KEEP_ATTR if n.attrs.get(k) and not (k == "href" and n.attrs[k].startswith("#"))]
    st = n.attrs.get("style", "")
    for prop in ("width", "grid-template-columns", "height"):
        m = re.search(rf"(?:^|;)\s*{prop}\s*:\s*([^;]+)", st)
        if m:
            extra.append(f"{prop}:{m.group(1).strip()}")
    return s + (" " + " ".join(extra) if extra else "")


def text_only(n):
    if isinstance(n, str):
        return n
    if n.tag == "svg":
        return "[icon]"
    return " ".join(t for t in (text_only(k) for k in n.kids) if t)


def inline(n):
    """An element whose children are all text or inline leaves prints on one line."""
    return all(isinstance(k, str) or k.tag in ("svg", "b", "i", "em", "strong", "span", "kbd", "br", "small", "code") and all(isinstance(x, str) or x.tag in ("svg", "path", "br") for x in k.kids) for k in n.kids)


def walk(n, depth, out, keep_shell):
    if isinstance(n, str):
        out.append("  " * depth + f'"{n}"')
        return
    if n.tag in SKIP or n.tag == "helmet":
        return
    if not keep_shell and SHELL & set(n.attrs.get("class", "").split()):
        out.append("  " * depth + label(n) + "  (shell, skipped)")
        return
    if n.tag == "svg":
        out.append("  " * depth + "[icon]")
        return
    kids = n.kids
    if n.tag in ("root", "html", "body", "x-dc"):
        for k in kids:
            walk(k, depth, out, keep_shell)
        return
    if kids and inline(n):
        t = text_only(n)
        out.append("  " * depth + label(n) + (f' "{t}"' if t else ""))
        return
    if not kids:
        out.append("  " * depth + label(n))
        return
    # fold one-child wrappers
    out.append("  " * depth + label(n))
    seen, folded = {}, 0
    for k in kids:
        key = None if isinstance(k, str) else (k.tag, k.attrs.get("class", ""))
        if key and key[0] in ("tr", "li", "div", "a", "button", "article"):
            seen[key] = seen.get(key, 0) + 1
            if seen[key] > 3:
                folded += 1
                continue
        walk(k, depth + 1, out, keep_shell)
    if folded:
        out.append("  " * (depth + 1) + f"... +{folded} more alike")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    keep = "--all" in sys.argv
    here = os.path.dirname(os.path.abspath(__file__))
    for a in args:
        path = a if os.path.exists(a) else os.path.join(here, "..", "..", "boards", "view", a + ".html")
        p = P()
        p.feed(open(path, encoding="utf-8").read())
        out = []
        walk(p.root, 0, out, keep)
        print(f"# {os.path.basename(path)}")
        print("\n".join(out))


main()
