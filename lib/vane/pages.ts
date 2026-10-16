/**
 * The pages a card's button or a chat answer can open, and the filters each
 * reads from its address, so Vane's links land on just the records it means
 * (from the pages' own query readers; see each path). A page that reads no
 * filters is opened on the record itself instead.
 */
export const VANE_PAGES_GUIDE = `Pages you can link to, with the filters each reads from its address. Always add the filters that show only the records the card is about.
- /books/invoices (lib/books/invoices.ts readInvoiceQuery): view=all|owed|overdue|paid|drafts, customer=<customer id>, q=<invoice number or customer name>, period=this-month|last-month|this-year. "/books/invoices?view=overdue&customer=<id>". One invoice: /books/invoices/<id>.
- /books/bank: account=<bank account id>, tab=to-match|matched|everything.
- /crm/deals: view=all|mine|closing|quiet|unassigned|won|lost, status=OPEN|WON|LOST, owner=me|<user id>, stage=<stage id>, company=<client id>, overdue=1, stale=1, q=<text>. One deal: /crm/deals/<id>.
- /crm/leads: view=all|mine|open|attention|unassigned, stage=<lead stage>, owner=me|<user id>, overdue=1, q=<text>. One lead: /crm/leads/<id>.
- One company: /crm/companies/<client id>. One person: /crm/people/<person id>.
- /crm/quotes and /crm/tasks read no filters: link to the deal or lead instead. One quote: /crm/quotes/<CrmLeadDocument id> (the draft tool's link).
- /crm/knowledge: the knowledge base. One document: /crm/knowledge/<docId>.
- /retail/sales: tab=today|refunds|voids|all, till=<till id>, cashier=<user id>, shift=<shift id>, when=today|yesterday|this-week|7d|30d|this-month, flagged=only.
- /retail/shifts: state=open|short|over|not-counted|balanced|needs-sign-off, till=<till id>, cashier=<user id>.
- /retail/stock: tab=all|below|out|toomuch, category=<id>, site=<id>.
- /retail/buying/orders: tab=open|drafts|received|all, supplier=<id>, late=late. One order: /retail/buying/orders/<id>.
- /maintenance/work-orders: the equipment work orders. One work order: /maintenance/work-orders/<id>.
- /schools/finance/arrears: who owes fees, by how long. A fee reminder you proposed opens on its own page, from its action.
- /vane/plans/<plan id> for one of your plans.`;
