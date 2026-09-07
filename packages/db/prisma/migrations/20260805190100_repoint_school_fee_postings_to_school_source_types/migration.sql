-- S-2.3 — move school fee postings already in the ledger onto their own kinds.
--
-- This is not tidying. Idempotency of a school fee posting is the pair
-- (sourceType, sourceId) on JournalEntry, and `createJournalEntryFromSource`
-- refuses to post again only when it finds an entry under **both**. The moment
-- `toPostingSourceType` starts returning SCHOOL_FEE_RECEIPT, a receipt already
-- posted as SALES_RECEIPT no longer matches, the lookup misses, and a second
-- journal entry is written for money that only moved once. Every replay, every
-- retry of a PENDING event, and every re-issue would double-count.
--
-- The source ids have always carried the document kind as a prefix, so they say
-- unambiguously which entries are a school's:
--
--   SCHOOL_FEE_INVOICE:<id>       was SALES_INVOICE
--   SCHOOL_FEE_RECEIPT:<id>       was SALES_RECEIPT
--   SCHOOL_FEE_RECEIPT_VOID:<id>  was SALES_RECEIPT
--   SCHOOL_FEE_REFUND:<id>        was SALES_RECEIPT
--   SCHOOL_FEE_WAIVER:<id>        was SALES_WRITE_OFF
--   SCHOOL_FEE_WRITEOFF:<id>      was SALES_WRITE_OFF
--
-- `starts_with` rather than LIKE: an underscore is a LIKE wildcard, and these
-- prefixes are nothing but underscores.
--
-- The journal *lines* are untouched. Old entries keep the accounts the retail
-- rules chose — tuition in Retail Sales Revenue, bursaries in Bad Debt — and
-- reclassifying posted history is a bookkeeping decision for the school's
-- accountant, not something a migration should do behind their back. What this
-- guarantees is that nothing posts twice from here on.
--
-- AccountingIntegrationEvent.eventKey embeds the source type, so it is rebuilt
-- to exactly what `buildAccountingEventKey` will compute on the next attempt:
-- lowercased, whitespace hyphenated, `<companyId>:accounting:auto-post:<type>:<sourceId>`.
-- The NOT EXISTS guard skips the rare row whose new key is already taken rather
-- than failing the whole migration on a unique violation.
--
-- Rollback: reverse each mapping, swapping the SET and WHERE source types, and
-- rebuild the event keys the same way with the retail type.

-- ── JournalEntry ────────────────────────────────────────────────────────────

UPDATE "JournalEntry" SET "sourceType" = 'SCHOOL_FEE_INVOICE'
 WHERE "sourceType" = 'SALES_INVOICE'   AND starts_with("sourceId", 'SCHOOL_FEE_INVOICE:');

UPDATE "JournalEntry" SET "sourceType" = 'SCHOOL_FEE_RECEIPT'
 WHERE "sourceType" = 'SALES_RECEIPT'   AND starts_with("sourceId", 'SCHOOL_FEE_RECEIPT:');

UPDATE "JournalEntry" SET "sourceType" = 'SCHOOL_FEE_RECEIPT_VOID'
 WHERE "sourceType" = 'SALES_RECEIPT'   AND starts_with("sourceId", 'SCHOOL_FEE_RECEIPT_VOID:');

UPDATE "JournalEntry" SET "sourceType" = 'SCHOOL_FEE_REFUND'
 WHERE "sourceType" = 'SALES_RECEIPT'   AND starts_with("sourceId", 'SCHOOL_FEE_REFUND:');

UPDATE "JournalEntry" SET "sourceType" = 'SCHOOL_FEE_WAIVER'
 WHERE "sourceType" = 'SALES_WRITE_OFF' AND starts_with("sourceId", 'SCHOOL_FEE_WAIVER:');

UPDATE "JournalEntry" SET "sourceType" = 'SCHOOL_FEE_WRITE_OFF'
 WHERE "sourceType" = 'SALES_WRITE_OFF' AND starts_with("sourceId", 'SCHOOL_FEE_WRITEOFF:');

-- ── AccountingIntegrationEvent ──────────────────────────────────────────────

DO $$
DECLARE
    mapping   record;
    mappings  text[][] := ARRAY[
        ['SALES_INVOICE',   'SCHOOL_FEE_INVOICE',      'SCHOOL_FEE_INVOICE:'],
        ['SALES_RECEIPT',   'SCHOOL_FEE_RECEIPT',      'SCHOOL_FEE_RECEIPT:'],
        ['SALES_RECEIPT',   'SCHOOL_FEE_RECEIPT_VOID', 'SCHOOL_FEE_RECEIPT_VOID:'],
        ['SALES_RECEIPT',   'SCHOOL_FEE_REFUND',       'SCHOOL_FEE_REFUND:'],
        ['SALES_WRITE_OFF', 'SCHOOL_FEE_WAIVER',       'SCHOOL_FEE_WAIVER:'],
        ['SALES_WRITE_OFF', 'SCHOOL_FEE_WRITE_OFF',    'SCHOOL_FEE_WRITEOFF:']
    ];
    i int;
BEGIN
    FOR i IN 1 .. array_length(mappings, 1) LOOP
        EXECUTE format(
            'UPDATE "AccountingIntegrationEvent" AS e
                SET "sourceType" = %L::"AccountingSourceType",
                    "eventKey"   = lower(regexp_replace(e."companyId", ''\s+'', ''-'', ''g''))
                                   || '':accounting:auto-post:'' || %L
                                   || '':'' || lower(regexp_replace(e."sourceId", ''\s+'', ''-'', ''g''))
              WHERE e."sourceType" = %L::"AccountingSourceType"
                AND e."sourceId" IS NOT NULL
                AND starts_with(e."sourceId", %L)
                AND NOT EXISTS (
                      SELECT 1 FROM "AccountingIntegrationEvent" other
                       WHERE other."eventKey" =
                             lower(regexp_replace(e."companyId", ''\s+'', ''-'', ''g''))
                             || '':accounting:auto-post:'' || %L
                             || '':'' || lower(regexp_replace(e."sourceId", ''\s+'', ''-'', ''g''))
                    )',
            mappings[i][2], lower(mappings[i][2]), mappings[i][1], mappings[i][3], lower(mappings[i][2])
        );
    END LOOP;
END $$;
