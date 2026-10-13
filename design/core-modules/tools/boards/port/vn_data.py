# Vane job templates. Each reads through report templates and writes only to its own tables or to drafts.
# (id, group, name, kind, trigger, reads (report templates), Vane does alone, the person presses, lands in, routed to, state)
# kind: Issue | Suggestion | Plan | Draft | Answer
J = [
 # Books
 ('books.past-terms', 'Books', 'Invoices past their terms', 'Issue', 'Every few minutes', 'Invoices · Owed to us, by age', 'Works out who is later than they usually pay', 'Open the statements', 'For you · Books', 'Managers, accounts', 'Reuse'),
 ('books.won-no-invoice', 'Books', 'Won deal with no invoice', 'Suggestion', 'Deal marked won', 'Deals · Quotes · Invoices', 'Drafts the invoice from the accepted quote', 'Open the draft, then Issue (I)', 'Books → Invoices, as a draft', 'The deal’s owner', 'Draft'),
 ('books.vat-plan', 'Books', 'VAT return for the month', 'Plan', '06:00, 1st of the month', 'VAT summary · Trial balance', 'Prepares the return, finds tax codes for bill lines', 'Review and finalise, then file', 'Plans · Books → VAT returns', 'Accounts', 'Plan'),
 ('books.postings', 'Books', 'Postings that missed the ledger', 'Issue', 'Every few minutes', 'Posting rules, failures', 'Finds the rule that failed and why', 'Replay', 'For you · Books', 'Accounts', 'Reuse'),
 ('books.close-check', 'Books', 'Close checklist', 'Plan', 'Last day of the month', 'Trial balance · Journals', 'Checks each account agrees and drafts the accruals', 'Post the journals, close the period', 'Plans · Books → Periods', 'Accounts', 'Plan'),
 # Sales and CRM
 ('crm.quote-waiting', 'Sales and CRM', 'Quote waiting to be sent', 'Suggestion', 'Quote drafted 2 days ago', 'Quotes · Site visit forms', 'Writes the message that goes with it', 'Send the quote (S)', 'For you · Site visits', 'The fitter who measured', 'Draft'),
 ('crm.quote-price', 'Sales and CRM', 'Quote priced off the list', 'Issue', 'Quote drafted', 'Quotes · price list', 'Compares each line with the price list', 'Change the line', 'In the document builder', 'The quote’s owner', 'New'),
 ('crm.visit-no-quote', 'Sales and CRM', 'Visit that drafted no quote', 'Suggestion', 'Visit finished', 'Site visit forms', 'Finds the question left blank that the quote needs', 'Open the visit', 'For you · Site visits', 'The fitter', 'New'),
 # Reports
 ('reports.explain', 'Reports', 'Explain a figure', 'Answer', 'Asked on a report', 'The report open on screen, as filtered', 'Answers in two sentences, with the rows it used', 'Open the rows', 'The Vane panel', 'Whoever asked', 'New'),
 ('reports.block', 'Reports', 'A block for a built report', 'Draft', 'Asked in the builder', 'The report’s own sources', 'Writes the question and shows the rows, marked as Vane’s', 'Keep (Ctrl ↵)', 'The builder, until kept', 'Whoever asked', 'New'),
 ('reports.template', 'Reports', 'Save the view you keep making', 'Suggestion', 'The same view opened 3 Mondays running', 'Report views opened', 'Names the template and what it keeps', 'Save as a template', 'For you · Reports', 'Whoever opens it', 'Needs a log'),
 ('reports.notes', 'Reports', 'Notes on the week', 'Suggestion', 'Monday 06:00', 'Each Insights topic', 'Writes one note per topic that moved, with what to do', 'The note’s own button', 'Insights · Do something about it', 'Managers', 'New'),
 # Forms and documents
 ('forms.required', 'Forms and documents', 'A question people skip', 'Suggestion', 'Weekly, per form', 'Site visit answers · Site visit forms', 'Drafts the change: make it required', 'Keep, then Publish', 'The form builder, until kept', 'Whoever owns the form', 'Reuse'),
 ('forms.option', 'Forms and documents', 'An answer people keep typing', 'Suggestion', 'Weekly, per form', 'Site visit answers', 'Drafts a new option from the Other answers', 'Keep, then Publish', 'The form builder, until kept', 'Whoever owns the form', 'New'),
 ('forms.factor', 'Forms and documents', 'A quote line that runs short', 'Suggestion', 'Monthly', 'Site visit forms · Invoices', 'Compares measured with what was invoiced', 'Keep the new factor', 'The form’s quote lines', 'Whoever owns the form', 'New'),
 ('forms.new', 'Forms and documents', 'A form from a template', 'Draft', 'Asked', 'Templates from Corelith · this workspace’s forms', 'Copies the closest template and fits it', 'Keep, then Publish', 'Build, as a draft reps do not see', 'Whoever asked', 'Draft'),
 ('docs.email', 'Forms and documents', 'The message that goes with a document', 'Draft', 'Document ready to send', 'The document · the customer', 'Writes the email or WhatsApp text', 'Send (S)', 'Beside the document', 'Whoever sends it', 'Draft'),
 # People and pay
 ('pay.run-check', 'People and pay', 'Pay run lines to look at', 'Issue', 'Run drafted', 'Pay by employee · Employees', 'Checks each person against last month', 'Submit the run', 'Payroll → the run · For you', 'Payroll', 'New'),
 ('pay.returns', 'People and pay', 'P2 and NSSA for the month', 'Plan', '06:00, 1st of the month', 'Pay by employee', 'Prepares the P2 and NSSA schedule', 'File, then mark filed', 'Plans · Payroll → Returns', 'Payroll', 'Plan'),
 ('people.leave-cover', 'People and pay', 'Leave that needs cover', 'Suggestion', 'Leave requested', 'Leave · Rosters', 'Finds who is free to cover', 'Approve, with cover (A)', 'People → Leave', 'The approver', 'Approval'),
 ('people.contract', 'People and pay', 'Contract ending', 'Suggestion', '30 days before the end', 'Employees', 'Drafts the new end date', 'Open the draft', 'People → the person', 'Managers', 'Draft'),
 # Retail
 ('retail.short', 'Retail', 'Short cash-up', 'Issue', 'Shift closed', 'Till shifts · Till variances', 'Looks for the same till, shift or cashier before', 'Show the sales', 'For you · The floor', 'Shop managers', 'Reuse'),
 ('retail.reorder', 'Retail', 'Stock to reorder', 'Suggestion', '06:00', 'Stock to reorder · suppliers', 'Drafts one order per usual supplier', 'Send the order', 'Buying → Orders, as drafts', 'Shop managers', 'Draft'),
 # Schools
 ('schools.fees', 'Schools', 'Families who paid nothing', 'Suggestion', '06:00, weekly in term', 'Fees owed, by class', 'Drafts each family’s reminder', 'Send the reminders', 'Fees → Arrears', 'Bursar', 'Draft'),
 ('schools.registers', 'Schools', 'Registers not in', 'Issue', '10:00 each school day', 'Registers', 'Lists the classes and their teachers', 'Open the registers', 'For you · Today', 'Deputy head', 'Reuse'),
 # Gold mine
 ('mine.breakdown', 'Gold mine', 'The same breakdown again', 'Suggestion', 'Downtime logged', 'Downtime · Maintenance work orders', 'Drafts the work order with the history', 'Raise the work order', 'Maintenance, as a draft', 'Engineer', 'Draft'),
 ('mine.unsold', 'Gold mine', 'Bars poured, not sold', 'Issue', '06:00', 'Gold chain', 'Lists the bars and their days waiting', 'Open the gold chain', 'For you · Gold', 'Managers', 'Reuse'),
]

STATES = {'Reuse': ('Reuses code', 'ok'), 'Draft': ('Writes a draft', 'info'), 'Plan': ('Makes a plan', 'info'), 'New': ('New', 'neutral'), 'Approval': ('Goes to approval', 'info'), 'Needs a log': ('Needs a log', 'warn')}
