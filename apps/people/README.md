# @corelithzw/people

The People host: the workforce product on its own Vercel project and host
(`*.people.corelith.co.zw`), composed from the people module and what it
requires — compliance, the books, documents, notifications, records, workflow
and the offline runtime — on the kernel and the shell.

What is written here by hand is this host's own: its module list
(`manifests.ts`), its wiring (`modules.ts`, `modules.client.ts`), its
navigation, management areas and workspace catalogue (`lib/`), its offline
scope (`lib/host/`), the app shell it renders (`components/`), its styles,
root layout and root page, and the search box's route (`app/api/v2/records/
search`), whose arms are the modules this host runs. Everything else under
`app/` is composed:
`pnpm compose apps/people platform shell people compliance books documents
notifications records offline` writes one re-export per route and page.
