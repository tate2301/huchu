# Icons

Books uses Corelith UI icons, Corelith's own pack, never MingCute, Lucide or another library. The pack is in `icons/` and on the Corelith Icons page (https://claude.ai/artifact/QfgPeVoCybMN9EspHHUgkr).

- Grid: 18 x 18, 1.5 stroke, round caps and joins, currentColor. Four styles: outline, outline duo, fill, fill duo (second tone at 40%).
- In the screens: the panel, buttons and rows use outline, and the active panel row and active rail module use fill. The owner prefers fill and fill duo; v2 of the pack makes fill duo the default (see `open.md`). Build an `Icon` component with a `style` prop so the switch is one change.
- `icons/dist/icons.json` holds every icon's markup per style, its category and tags. `icons/dist/<style>/<name>.svg` holds the files. `icons/icons.py` and `icons/dsl.py` are the source; `python3 icons/build.py` rebuilds dist.
- Which icon goes where: `source/ci.mjs`. `CI_LABEL` maps every panel row, rail module and Management row to its icon by label; `CI_MAP` maps the old MingCute names the generators call to pack names. The page title always carries the same icon as its panel row.
- Every panel row, page title, primary action, Needs you row and money account has an icon. An icon stands in for words; it never gets an explanation beside it.
