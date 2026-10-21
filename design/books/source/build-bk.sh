#!/bin/bash
cd /home/claude/workbench/app
export ICONS_ROOT=/tmp/claude-0/-home-claude/bcef0de9-d748-5cac-a3e6-27f5c8608e47/scratchpad/node_modules
# Books uses the Corelith UI icon pack: rename the plugin's ic, insert ci.mjs after the import, label icons in the rail and Management.
sed -e 's/const { setup, ic, logo, logoIc, money } = await import/const { setup, ic: icMC, logo, logoIc, money } = await import/' \
    -e '/^const VN = /r ci.mjs' \
    -e 's/aria-label="\${l}"\${l === on ? '"'"' aria-current="page"'"'"' : ""}>\${ic(i)}/aria-label="${l}"${l === on ? '"'"' aria-current="page"'"'"' : ""}>${l === on ? icF(CI_LABEL[l] || i) : ic(CI_LABEL[l] || i)}/' \
    -e 's/\${i === "vane" ? VN() : ic(i)}<span class="truncate">\${l}<\/span>\${n !== undefined/${i === "vane" ? VN() : on ? icF(CI_LABEL[l] || i) : ic(CI_LABEL[l] || i)}<span class="truncate">${l}<\/span>${n !== undefined/' \
    -e 's/>\${i ? ic(i) : `<span class="pn-dot"><\/span>`}/>${i ? (o.on ? icF(CI_LABEL[l] || i) : ic(CI_LABEL[l] || i)) : `<span class="pn-dot"><\/span>`}/' \
    shell.mjs > _shell_ci.mjs
grep -c "icF(" _shell_ci.mjs >&2
cat _shell_ci.mjs bk[0-9]*.mjs > _bk.mjs && node _bk.mjs 2>&1 | grep -v "^    at" | tail -${1:-6}
