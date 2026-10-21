# Corelith icons: a tiny DSL for an 18px grid, 1.5px stroke, round caps and joins.
# Each icon is a list of groups. A group has elements and optional gaps (shapes erased from the group,
# so a badge sits clear of what it overlaps). Element kinds:
#   b  body: stroked in outline, filled in fill
#   c  cut: stroked in outline, knocked out of the bodies in fill
#   h  hole: stroked in outline, knocked out as a filled hole in fill
#   l  line: stroked in both
#   d  dot: filled in both (small solid marks)
# Any element can be secondary (sec=True): drawn at 40% in the duo styles.
import math

SW = 1.5
G = 18


def f(n):
    s = f"{n:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def E(kind, d, sec=False):
    return {"k": kind, "d": d, "sec": sec}


# ---- path builders
def rect(x, y, w, h, r=0):
    if r <= 0:
        return f"M{f(x)} {f(y)}H{f(x+w)}V{f(y+h)}H{f(x)}Z"
    r = min(r, w / 2, h / 2)
    return (f"M{f(x+r)} {f(y)}H{f(x+w-r)}A{f(r)} {f(r)} 0 0 1 {f(x+w)} {f(y+r)}V{f(y+h-r)}"
            f"A{f(r)} {f(r)} 0 0 1 {f(x+w-r)} {f(y+h)}H{f(x+r)}A{f(r)} {f(r)} 0 0 1 {f(x)} {f(y+h-r)}"
            f"V{f(y+r)}A{f(r)} {f(r)} 0 0 1 {f(x+r)} {f(y)}Z")


def circ(cx, cy, r):
    return f"M{f(cx-r)} {f(cy)}A{f(r)} {f(r)} 0 1 0 {f(cx+r)} {f(cy)}A{f(r)} {f(r)} 0 1 0 {f(cx-r)} {f(cy)}Z"


def ell(cx, cy, rx, ry):
    return f"M{f(cx-rx)} {f(cy)}A{f(rx)} {f(ry)} 0 1 0 {f(cx+rx)} {f(cy)}A{f(rx)} {f(ry)} 0 1 0 {f(cx-rx)} {f(cy)}Z"


def line(x1, y1, x2, y2):
    return f"M{f(x1)} {f(y1)}L{f(x2)} {f(y2)}"


def poly(*pts, close=False):
    d = "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts)
    return d + ("Z" if close else "")


def arc(cx, cy, r, a0, a1):
    """Arc from angle a0 to a1 in degrees, clockwise on screen (0 = right, 90 = down)."""
    x0, y0 = cx + r * math.cos(math.radians(a0)), cy + r * math.sin(math.radians(a0))
    x1, y1 = cx + r * math.cos(math.radians(a1)), cy + r * math.sin(math.radians(a1))
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f"M{f(x0)} {f(y0)}A{f(r)} {f(r)} 0 {large} 1 {f(x1)} {f(y1)}"


def dot(cx, cy, r=0.9):
    return circ(cx, cy, r)


# ---- rendering
def _attrs_stroke(col="currentColor", w=SW):
    return f'fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"'


def render(groups, style, uid):
    """style: outline | fill | outline-duo | fill-duo. Returns the inner SVG markup."""
    fill = style.startswith("fill")
    duo = style.endswith("duo")
    out = []
    for gi, g in enumerate(groups):
        els, gaps = g["els"], g.get("gaps", [])
        cuts = [e for e in els if e["k"] in ("c", "h", "k")] if fill else []
        mid = f"{uid}-{style}-{gi}"
        need_mask = bool(gaps) or bool(cuts)
        body = []
        for e in els:
            op = ' opacity="0.4"' if (duo and e["sec"]) else ""
            k = e["k"]
            if k == "k" and not fill:
                body.append(f'<path d="{e["d"]}" fill="currentColor"{op}/>')
            elif k == "k":
                continue
            elif k == "d":
                body.append(f'<path d="{e["d"]}" fill="currentColor"{op}/>')
            elif fill and k == "b":
                body.append(f'<path d="{e["d"]}" fill="currentColor" stroke="currentColor" stroke-width="{SW}" stroke-linejoin="round"{op}/>')
            elif fill and k in ("c", "h"):
                continue
            else:
                body.append(f'<path d="{e["d"]}" {_attrs_stroke()}{op}/>')
        if need_mask:
            m = [f'<rect x="-2" y="-2" width="22" height="22" fill="#fff"/>']
            for c in cuts:
                if c["k"] in ("h", "k"):
                    m.append(f'<path d="{c["d"]}" fill="#000"/>')
                else:
                    m.append(f'<path d="{c["d"]}" {_attrs_stroke("#000")}/>')
            for gp in gaps:
                m.append(f'<path d="{gp}" fill="#000"/>')
            out.append(f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="-2" y="-2" width="22" height="22">{"".join(m)}</mask>')
            out.append(f'<g mask="url(#{mid})">{"".join(body)}</g>')
        else:
            out.append("".join(body))
    return "".join(out)


def svg(groups, style, uid, size=18):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 18 18">'
            f'{render(groups, style, uid)}</svg>')


# ---- shared parts
PAGE = "M10.25 1.75H5.25A2 2 0 0 0 3.25 3.75V14.25A2 2 0 0 0 5.25 16.25H12.75A2 2 0 0 0 14.75 14.25V6.25Z"
FOLD = "M10.25 1.75V5.25A1 1 0 0 0 11.25 6.25H14.75"


def page(sec_fold=True):
    return [E("b", PAGE), E("c", FOLD, sec=sec_fold)]


def receipt():
    # Receipt with a torn foot.
    return E("b", "M4.25 3.25A1.5 1.5 0 0 1 5.75 1.75H12.25A1.5 1.5 0 0 1 13.75 3.25V16.25L12.167 15L10.583 16.25L9 15L7.417 16.25L5.833 15L4.25 16.25Z")


# Badges sit in the bottom-right corner, clear of the base by a 1.5px gap.
BX, BY = 13.25, 13.25


def badge(kind, cx=BX, cy=BY):
    """Returns (elements, gap path)."""
    r = 3.5
    gap = circ(cx, cy, r + 1.25)
    a = 2.0
    if kind == "plus":
        els = [E("l", line(cx - a, cy, cx + a, cy)), E("l", line(cx, cy - a, cx, cy + a))]
    elif kind == "minus":
        els = [E("l", line(cx - a, cy, cx + a, cy))]
    elif kind == "check":
        els = [E("l", poly((cx - 2.1, cy + 0.1), (cx - 0.6, cy + 1.6), (cx + 2.2, cy - 1.7)))]
    elif kind == "x":
        b = 1.6
        els = [E("l", line(cx - b, cy - b, cx + b, cy + b)), E("l", line(cx + b, cy - b, cx - b, cy + b))]
    elif kind == "clock":
        els = [E("b", circ(cx, cy, 3)), E("c", poly((cx, cy - 1.4), (cx, cy), (cx + 1.1, cy + 0.8)))]
        gap = circ(cx, cy, 4.5)
    elif kind == "up":
        els = [E("l", line(cx, cy + 2.2, cx, cy - 2.2)), E("l", poly((cx - 1.8, cy - 0.5), (cx, cy - 2.3), (cx + 1.8, cy - 0.5)))]
    elif kind == "down":
        els = [E("l", line(cx, cy - 2.2, cx, cy + 2.2)), E("l", poly((cx - 1.8, cy + 0.5), (cx, cy + 2.3), (cx + 1.8, cy + 0.5)))]
    elif kind == "out":  # arrow up-right
        els = [E("l", line(cx - 1.8, cy + 1.8, cx + 1.8, cy - 1.8)), E("l", poly((cx - 0.9, cy - 1.9), (cx + 1.9, cy - 1.9), (cx + 1.9, cy + 0.9)))]
    elif kind == "in":  # arrow down-left
        els = [E("l", line(cx + 1.8, cy - 1.8, cx - 1.8, cy + 1.8)), E("l", poly((cx + 0.9, cy + 1.9), (cx - 1.9, cy + 1.9), (cx - 1.9, cy - 0.9)))]
    elif kind == "pencil":
        els = [E("b", poly((cx - 2.4, cy + 2.4), (cx - 2.4, cy + 0.9), (cx + 1.1, cy - 2.6), (cx + 2.6, cy - 1.1), (cx - 0.9, cy + 2.4), close=True))]
        gap = circ(cx, cy, 4.6)
    elif kind == "lock":
        els = [E("b", rect(cx - 2.6, cy - 0.6, 5.2, 3.6, 1)), E("l", "M%s %sV%sA1.5 1.5 0 0 1 %s %s" % (f(cx-1.4), f(cy-0.6), f(cy-1.9), f(cx+1.6), f(cy-1.9)) + "V%s" % f(cy-0.6))]
        gap = rect(cx - 4.1, cy - 4.6, 8.2, 9.1, 2.5)
    elif kind == "search":
        els = [E("b", circ(cx - 0.6, cy - 0.6, 2.1)), E("l", line(cx + 0.9, cy + 0.9, cx + 2.4, cy + 2.4))]
    elif kind == "coin":
        els = [E("b", circ(cx, cy, 3)), E("c", circ(cx, cy, 1.1), sec=True)]
        gap = circ(cx, cy, 4.5)
    elif kind == "user":
        els = [E("b", circ(cx, cy - 1.3, 1.4)), E("b", "M%s %sA2.6 2.6 0 0 1 %s %sZ" % (f(cx-2.6), f(cy+2.8), f(cx+2.6), f(cy+2.8)))]
        gap = circ(cx, cy + 0.3, 4.7)
    elif kind == "alert":
        els = [E("l", line(cx, cy - 2.2, cx, cy + 0.6)), E("d", dot(cx, cy + 2.3, 0.85))]
    elif kind == "percent":
        els = [E("l", line(cx + 1.8, cy - 1.8, cx - 1.8, cy + 1.8)), E("d", dot(cx - 1.5, cy - 1.5, 0.8)), E("d", dot(cx + 1.5, cy + 1.5, 0.8))]
    elif kind == "slash":
        els = [E("b", circ(cx, cy, 3)), E("c", line(cx - 2.1, cy + 2.1, cx + 2.1, cy - 2.1))]
        gap = circ(cx, cy, 4.5)
    elif kind == "star":
        pts = []
        for i in range(10):
            ang = math.radians(-90 + i * 36)
            rr = 3 if i % 2 == 0 else 1.35
            pts.append((cx + rr * math.cos(ang), cy + 0.2 + rr * math.sin(ang)))
        els = [E("b", poly(*pts, close=True))]
        gap = circ(cx, cy, 4.6)
    else:
        raise ValueError(kind)
    return els, gap


def with_badge(base_els, kind, cx=BX, cy=BY):
    b, gap = badge(kind, cx, cy)
    return [{"els": base_els, "gaps": [gap]}, {"els": b}]


def one(*els):
    return [{"els": list(els)}]


def thick(x1, y1, x2, y2, w=3.5):
    """A capsule around a line, used as a gap so a slash sits clear of what it crosses."""
    import math as _m
    a = _m.atan2(y2 - y1, x2 - x1); r = w / 2
    nx, ny = -_m.sin(a) * r, _m.cos(a) * r
    return (f"M{f(x1+nx)} {f(y1+ny)}L{f(x2+nx)} {f(y2+ny)}A{f(r)} {f(r)} 0 0 0 {f(x2-nx)} {f(y2-ny)}"
            f"L{f(x1-nx)} {f(y1-ny)}A{f(r)} {f(r)} 0 0 0 {f(x1+nx)} {f(y1+ny)}Z")
