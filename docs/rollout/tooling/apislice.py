"""Slice named exports out of apps/legacy/lib/api.ts into a module's api-client.ts, leaving re-exports.
Usage: apislice.py <target file> <header text file or -> <name,name,...>
Handles `export async function X(`, `export function X(`, `export type X =`, `export const X =`, `export interface X {`."""
import re, sys
API="/home/user/huchu/apps/legacy/lib/api.ts"
import json, subprocess
def find_blocks(src_file, names):
    """Exact ranges from the TypeScript parser: {name: (start, end, kind)}."""
    out=subprocess.run(["node", "/tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/tsslice.mjs", src_file, ",".join(names)], capture_output=True, text=True, check=True).stdout
    found={b["name"]:(b["start"],b["end"],b["kind"]) for b in json.loads(out)}
    missing=[n for n in names if n not in found]
    if missing: raise SystemExit(f"not found: {missing}")
    return found

def main():
    target, header_file, names = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
    src=open(API).read()
    found=find_blocks(API, names)
    blocks=sorted((found[n][0], found[n][1], n) for n in names)
    kinds={n:found[n][2] for n in names}
    out=[]; new=src
    for s,e,n in reversed(blocks):
        out.insert(0, src[s:e].strip("\n")); new=new[:s]+new[e:]
    new=re.sub(r'\n{3,}', "\n\n", new)
    header=open(header_file).read() if header_file!="-" else ""
    open(target,"w").write(header+"\n\n".join(out)+"\n")
    # lib/api.ts keeps every name it used to export, re-exported from the module
    spec=sys.argv[4] if len(sys.argv)>4 else None
    if spec:
        values=[n for n in names if kinds[n]=="value"]; types=[n for n in names if kinds[n]=="type"]
        lines=[]
        if values: lines+= [f"  {n}," for n in sorted(values)]
        if types: lines+= [f"  type {n}," for n in sorted(types)]
        block="export {\n"+"\n".join(lines)+f'\n}} from "{spec}";\n'
        anchor='export type { Pagination, PaginationMeta } from "@corelithzw/platform/api-client";\n'
        assert anchor in new, "lib/api.ts anchor for re-exports missing"
        # names the remaining file still uses come back in as imports
        still_values=[n for n in values if re.search(r'\b'+re.escape(n)+r'\b', new)]
        still_types=[n for n in types if re.search(r'\b'+re.escape(n)+r'\b', new)]
        imp=""
        if still_values or still_types:
            parts=[*sorted(still_values), *[f"type {n}" for n in sorted(still_types)]]
            imp="import { "+", ".join(parts)+f' }} from "{spec}";\n'
        new=new.replace(anchor, anchor+block+imp, 1)
        # the module's own file must import what its sliced code still needs from lib/api.ts
    open(API,"w").write(new)
    print(f"sliced {len(names)} exports into {target}" + (f"; re-exported from {spec}" if spec else ""))
if __name__=="__main__": main()
