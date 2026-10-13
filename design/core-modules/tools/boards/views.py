"""Writes boards/view/*.html, each artboard as a page that opens on its own, from boards/canvas.

    python3 design/core-modules/tools/boards/views.py

A view is its canvas file with the canvas runtime taken out: the kit stylesheet and the marks
come from ../assets instead of the canvas's uploads, and the artboard's script block goes.
"""
import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# The canvas's uploads, by the file each was uploaded from.
UPLOADS = {
    "/_blob/99852cf059ec2fd037ee27b1340107ec": "../assets/core.css",
    "/_blob/32e6e5c15575ba73f35524bb333d682b": "../assets/corelith-logo.svg",
    "/_blob/26bd05205cc4888edbde0a92e9ca6d5b": "../assets/ecocash-wordmark.png",
    "/_blob/53a8dc80210b2f55135fc98ac1eb991a": "../assets/flare-mark.svg",
    "/_blob/5bb4eb63ed09db6ea4b40efb888195c1": "../assets/tender-mark.svg",
    "/_blob/a8c16c523436d43f5489350a73045c4e": "../assets/shift-mark.svg",
    "/_blob/d4879c010d72a0ae5d79c4702dad17f6": "../assets/silo-mark.svg",
    "/_blob/40aba51cba29678370340cba4a555e35": "../assets/campus-mark.svg",
}


def run():
    count = 0
    for path in sorted(glob.glob(os.path.join(ROOT, "boards", "canvas", "*.dc.html"))):
        name = os.path.basename(path)[: -len(".dc.html")]
        view = os.path.join(ROOT, "boards", "view", name + ".html")
        if not os.path.exists(view):
            continue
        s = open(path).read()
        s = s.replace('<script src="./support.js"></script>', "<style>x-dc{display:block}helmet{display:contents}</style>")
        for blob, local in UPLOADS.items():
            s = s.replace(blob, local)
        s = re.sub(r'<script type="text/x-dc" data-dc-script.*?</script>\n?', "", s, flags=re.S)
        if open(view).read() != s:
            open(view, "w").write(s)
            count += 1
    print(f"{count} views written")


if __name__ == "__main__":
    run()
