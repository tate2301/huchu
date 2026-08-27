import sys

p, open_marker = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8", newline="").read()
lines = s.split("\n")
start = end = None
for i, l in enumerate(lines):
    t = l.rstrip("\r").strip()
    if start is None and t == open_marker:
        start = i + 1
    elif start is not None and t.startswith("</SavingOverlay>"):
        end = i
        break
for i in range(start, end):
    if lines[i].strip():
        lines[i] = "  " + lines[i]
open(p, "w", encoding="utf-8", newline="").write("\n".join(lines))
print(start, end)
