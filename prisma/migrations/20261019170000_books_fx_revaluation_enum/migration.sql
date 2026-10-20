-- P3 (books-final §5.9, approved 19 Oct): the month-end revaluation of foreign-currency balances posts
-- under its own source type, on the last day of the month, and is reversed on the 1st.
-- Its own migration: a value added to an enum cannot be used in the transaction that adds it.
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'FX_REVALUATION';
