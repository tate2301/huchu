# @corelithzw/crm

The CRM host: the CRM product on its own Vercel project and host
(`*.crm.corelith.co.zw`), composed from the CRM module and what it requires —
stock, the books, people, documents, notifications, records, workflow and the
offline runtime — on the kernel and the shell.

What is written here by hand is this host's own: its module list
(`manifests.ts`), its wiring (`modules.ts`, `modules.client.ts`), its
navigation, management areas and workspace catalogue (`lib/`), its offline
scope (`lib/host/`), the app shell it renders (`components/`), its styles,
root layout and root page, and the search box's route (`app/api/v2/records/
search`), whose arms are the modules this host runs. Everything else under
`app/` is composed:
`pnpm compose apps/crm platform shell crm stock books documents notifications
people records offline` writes one re-export per route and page.
