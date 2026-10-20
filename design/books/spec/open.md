# Open

Build with the placeholder shown. Don't invent the rest; ask the owner.

## Waiting for the owner

1. **What "Accounting advanced" holds.** Built as Tax, Close the month and Ledger. Keep the set in one config so it can change.
2. **Whether the $10 screens can be bought on their own**, or only on top of a product plan. Built as an add-on in Billing ("Add Books, $10 a month" opens Billing).
3. **Where the ledger starts for a workspace that never had Books.** Needs an opening-balances step and a start date. Not drawn. Until decided, the core posts from the day Books is switched on and the trial balance carries an opening balance plug (Retained earnings in the fixture).
4. **Who may reopen a month.** Built as the owner and the outside accountant, with a reason.
5. **The admin workflows gate**: whether Corelith staff (superusers) need the owner's consent for change mode in Books. Built as change mode with the session number on every act.
6. **ZWG as a base currency.** Built USD base only; ZWG documents post in USD at the frozen rate.
7. **ZIMRA items flagged in the spec**: the fourth provisional tax date ("Date to confirm", a setting) and the withholding threshold (a setting).

## Icons v2

The full platform pack (500+ icons, fill duo by default) runs separately; the prompt is in Documents/Corelith/Icons/PROMPT.md. When it lands, swap `icons/` for v2 and set the default style to fill duo. Until then build with v1, behind the `Icon` component.

## Not drawn yet

Year end; Cost centres; Takings (Bank & cash); the record pages for a quote, a credit note, a purchase order, a supplier and a journal; the opening-balances step; a Campus (school) workspace's fees view for the bursar. Build these from the List and Record patterns of the drawn screens only after the owner has seen them.

## The spec

The owner's own spec, "Books, final form", is the source for scope. If `spec/books-final-form.md` is present, read it: where it and this folder differ on behaviour or scope, it wins and you note the difference in `NOTES.md`. Where it is silent, this folder decides.
