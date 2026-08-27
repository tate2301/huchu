import sys

p, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
s = open(p, encoding="utf-8", newline="").read()
lines = s.split("\n")
for i in range(a - 1, b):
    if lines[i].strip():
        lines[i] = "  " + lines[i]
open(p, "w", encoding="utf-8", newline="").write("\n".join(lines))
print("indented", a, b)
