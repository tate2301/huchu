# The shell

Corelith's single sidebar (one list composed per person from workspace entitlements and rights; the collapsed rail is the same list as marks), drawn with the clean sidebar. Books and Reports are core modules in every vertical, so they behave alike: same panel, same toolbar, same footer. Values below are from `source/shell.mjs`; the HTML files are the final word.

## Module pages

```
| rail 56 | module panel 240 | main (min 0, 1fr)                     | Vane panel 400 (when open) |
|         |                  | top bar 56                            |                            |
|         |                  | toolbar (lists only)                  |                            |
|         |                  | finding, sections, table, footer      |                            |
```

- **Rail** (`rail-m`): workspace tile at the top; modules (Pipeline, Site visits, Showroom, Books, Reports, Documents; a vertical swaps in its own); a gap; Vane; Settings; the person's avatar. Active item: surface tile with ring and raised shadow. Icons 20 px.
- **Module panel** (`panel-m`): title and Hide button (56 px row); search with `/`; items 36 px with icon, label and count; groups with a 12 px muted head, a chevron and an Add button; Help and Management at the foot.
- **Top bar** (`tb-m`): page icon and title; on the right, search everything (`Ctrl K`), notifications, the Vane button, then the page's own actions with the primary last.
- **Toolbar** (`tl-m`): view menu, search this list, Filter, page filters, then sort, columns and export grouped at the end.
- **Finding**: every list or board opens with one sentence in ink and a second in grey that states what the page shows in figures.
- **Table footer**: count and page buttons; sums; when rows are selected, a selection bar replaces it with the count, the sum and the actions, `Esc` to clear.
- Widths: below 1100 px the module panel hides; below 760 px the rail hides, the toolbar keeps only the view menu and Filter, and the Vane button shows only its mark and dot.

## The builder (reports, forms, documents)

```
| rail 56 | outline 240 | top bar: Build / Preview, Saved, Share, Publish (Ctrl ↵)        |
|         |             | canvas (ground colour, board 880 max)    | right panel 320          |
|         |             | bottom shelf 272 (340 when Vane has a note)                     |
```

- Outline: the board's name and Close, "Add a block" with `/`, the blocks on the board with the question each reads.
- Right panel tabs: Block, Look, When clicked.
- Bottom shelf, three columns: Questions (200), Steps or SQL with Run (360), Results (the rest) with row count and time, read only. Vane's suggestion sits at the top of the middle column; the steps it wrote carry a 2 px accent line on the left until kept.
- The selected block has a 2 px primary outline and a tag above its corner.
- Forms and documents use the same grid; only the catalogue and the canvas change (`studio-form`, `studio-document`, `studio-report`).

## Management

A full-page takeover with no rail, reached from the panel foot.

```
| sidebar 260 | list 380 (record pages) | record or page                  |
```

- Sidebar: back arrow and "Management"; search; groups with a 12 px muted head and 32 px items; the Corelith logo at the foot. The sidebar scrolls the active item into view.
- Tree: People (Users, Departments, Job grades) · Operations (Sites, Sections) · Shop (Tills, Till rules, Posting, Fiscal device) · Compliance (Permits, Inspections, Incidents, Training) · Company (General, Branding, Templates, Reports, Activity) · Apps (Billing, Integrations, Marketplace, Vane) · My account (Profile, Notifications, Appearance).
- Record pages (job grades): list header with title, count, search and New (`N`); rows of code, name and count; the record with its title, Rename, Retire, More and Close; sections Details (label 160 px, control 320 px), the people on it, Activity.
- Settings pages: a finding sentence, then form sections (title and one line on the left, rows on the right).
