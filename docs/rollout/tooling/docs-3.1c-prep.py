import pathlib
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:50]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)
ROW = ("| 2026-09-06 | — | **Phase 3.1c-prep executed: the sidebar model builder and the quick actions in the shell; the books' documents in books.** "
       "Three things a second host would otherwise copy from the first. The sidebar model's builder — gating, profile resolution, the assembly of "
       "curated and module sections, the home target — is the shell's (`buildWorkspaceSidebarModel` in `packages/shell/workspace-model.ts`), reading "
       "the navigation the host registered, and takes the arrangement as a `WorkspaceCatalogue` the host writes next to its module list: which modules "
       "exist, the order they surface in, each profile's curated sections, its icon and owner module, the two special cases (the books' consolidated "
       "section, retail's feature gate) as hooks. The legacy host's catalogue keeps every definition verbatim; same model for the same inputs. The "
       "quick actions are data keyed by vertical product — hrefs and icons, no module code — so they are the shell's too. The books' printable "
       "documents (invoice, quotation, receipt, credit note) resolved in the host's legacy document source; they are the books' now "
       "(`packages/modules/books/document-sources.ts`), registered by the host with the feature keys that open them, and the legacy source keeps the "
       "mine's reports and the executive dashboard. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)
edit("packages/shell/README.md",
     "sidebar-model.ts  what the sidebar renders; a host resolves it from the person's role, features and profile\n",
     "sidebar-model.ts  what the sidebar renders; a host resolves it from the person's role, features and profile\nworkspace-model.ts   the builder that resolves it (`buildWorkspaceSidebarModel`) from the host's `WorkspaceCatalogue`: its modules, profiles and arrangement, data next to its module list\nprimary-actions.ts   the quick-create actions per vertical product: hrefs and icons\n")
edit("packages/modules/books/README.md",
     "manifest.ts                      id \"books\"; requires documents, notifications\n",
     "document-sources.ts              the printable sales documents (invoice, quotation, receipt, credit note) and the features that open them; a host registers the source\nmanifest.ts                      id \"books\"; requires documents, notifications\n")
edit("AGENTS.md",
     "The shell never imports a module.\n",
     "The shell never imports a module. The sidebar model is built by the shell (`@corelithzw/shell/workspace-model`) from a host's `WorkspaceCatalogue` — the host's `lib/workspaces.ts` is that catalogue (its modules, profiles and arrangement) and a one-line `getWorkspaceSidebarModel`; a new host writes its own catalogue, never a second builder.\n")
print("done")
