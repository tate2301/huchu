-- A saved view keeps a list's whole state.
--
-- A saved view stored its filters, sort, columns, grouping and board-or-table
-- in columns of its own, and never the search: the leads page kept the search
-- box apart from the filters, so a view saved with a search came back without
-- it. A view is now one list's `ViewState` (lib/crm/registers/types.ts) — the
-- search, every filter, the sort, the layout, the grouping and the columns —
-- under the list it is a view of, checked against that list when it is
-- written.
--
-- Every existing view is a view of leads: only the leads page could save one,
-- and the sidebar opened every one of them there whatever its `entity` said.
-- Each is folded into the leads list's state:
--
--   filters.q                          -> q
--   filters.stages                     -> filters.stage
--   filters.mineOnly                   -> filters.owner ["me"]
--   filters.assignedToIds, unassigned  -> filters.owner, the ids and "none"
--   filters.channels                   -> filters.channel
--   filters.sources                    -> filters.source
--   filters.valueMin, valueMax         -> filters.value {min, max}
--   filters.createdFrom, createdTo     -> filters.created {from, to}, as days
--   filters.overdueOnly                -> filters.overdue
--   filters.archived                   -> filters.archived
--   sort {field, direction}            -> sort {key, dir}
--   viewType                           -> layout: a board stays a board,
--                                         anything else is a table
--   columns                            -> columns, by the list's column ids
--
-- Anything a view held that the leads list has no answer for is left out,
-- rather than stored as a state no screen can read. `groupBy` was never
-- written by any screen and goes with its column.

CREATE TYPE "CrmRegister" AS ENUM (
  'LEAD',
  'DEAL',
  'PERSON',
  'COMPANY',
  'SITE',
  'TASK',
  'FOLLOW_UP',
  'SITE_VISIT',
  'PROJECT',
  'WORK_ORDER',
  'QUOTE',
  'INVOICE',
  'RECEIPT',
  'COLLECTION',
  'REQUISITION',
  'COST_ENTRY',
  'DAILY_REPORT',
  'INTAKE_FORM',
  'WORKFLOW',
  'WORKFLOW_RUN',
  'REP'
);

ALTER TABLE "CrmSavedView"
  ADD COLUMN "register" "CrmRegister",
  ADD COLUMN "state" JSONB;

-- The strings in `value` (when it is an array) that are among `allowed`, or
-- any string when `allowed` is null — sorted, once each — or null for none.
CREATE FUNCTION "_saved_view_list"(value jsonb, allowed text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_agg(DISTINCT item ORDER BY item)
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END
  ) AS item
  WHERE btrim(item) <> ''
    AND length(item) <= 120
    AND (allowed IS NULL OR item = ANY (allowed));
$$;

-- A stored instant as the day it was picked on. The old filter stored the
-- reader's local midnight (and the last moment of the last day) as a UTC
-- instant; half a day on (and back) lands on the day that was picked, in any
-- time zone within twelve hours of UTC. Null for anything that is not one.
CREATE FUNCTION "_saved_view_day"(value jsonb, shift interval) RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN
    RETURN NULL;
  END IF;
  RETURN to_char(((value #>> '{}')::timestamptz + shift) AT TIME ZONE 'UTC', 'YYYY-MM-DD');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- The leads table's columns by the list's own ids, in the order they were
-- chosen, once each; null when none survive.
CREATE FUNCTION "_saved_view_columns"(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_agg(id ORDER BY first)
  FROM (
    SELECT id, min(position) AS first
    FROM (
      SELECT
        CASE item
          WHEN 'leadNo' THEN 'name'
          WHEN 'client' THEN 'company'
          WHEN 'nextTask' THEN 'next'
          WHEN 'updatedAt' THEN 'updated'
          ELSE item
        END AS id,
        position
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS t(item, position)
    ) AS renamed
    WHERE id IN (
      'name', 'ref', 'company', 'stage', 'value', 'owner', 'next', 'source',
      'channel', 'contact', 'email', 'phone', 'created', 'updated'
    )
    GROUP BY id
  ) AS kept;
$$;

CREATE FUNCTION "_saved_view_state"(f jsonb, s jsonb, view_type text, cols jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'q', NULLIF(left(btrim(f ->> 'q'), 200), ''),
    'filters', jsonb_build_object(
      'stage', "_saved_view_list"(f -> 'stages', ARRAY[
        'NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT', 'QUOTED', 'INVOICED', 'WON', 'LOST'
      ]),
      'owner', CASE
        WHEN f -> 'mineOnly' = 'true'::jsonb THEN '["me"]'::jsonb
        ELSE "_saved_view_list"(
          CASE WHEN jsonb_typeof(f -> 'assignedToIds') = 'array' THEN f -> 'assignedToIds' ELSE '[]'::jsonb END
            || CASE WHEN f -> 'unassigned' = 'true'::jsonb THEN '["none"]'::jsonb ELSE '[]'::jsonb END,
          NULL
        )
      END,
      'channel', "_saved_view_list"(f -> 'channels', ARRAY[
        'MANUAL', 'WEB_FORM', 'WEBHOOK', 'SOCIAL', 'ADS', 'REFERRAL', 'OTHER'
      ]),
      'source', "_saved_view_list"(f -> 'sources', NULL),
      'value', NULLIF(jsonb_strip_nulls(jsonb_build_object(
        'min', CASE WHEN jsonb_typeof(f -> 'valueMin') = 'number' THEN f -> 'valueMin' END,
        'max', CASE WHEN jsonb_typeof(f -> 'valueMax') = 'number' THEN f -> 'valueMax' END
      )), '{}'::jsonb),
      'created', NULLIF(jsonb_strip_nulls(jsonb_build_object(
        'from', "_saved_view_day"(f -> 'createdFrom', interval '12 hours'),
        'to', "_saved_view_day"(f -> 'createdTo', interval '-12 hours')
      )), '{}'::jsonb),
      'overdue', CASE WHEN f -> 'overdueOnly' = 'true'::jsonb THEN 'true'::jsonb END,
      'archived', CASE WHEN f -> 'archived' = 'true'::jsonb THEN 'true'::jsonb END
    ),
    'sort', CASE
      WHEN s ->> 'field' IN ('createdAt', 'updatedAt', 'estimatedValue', 'leadNo', 'title', 'stage')
        AND s ->> 'direction' IN ('asc', 'desc')
      THEN jsonb_build_object(
        'key', CASE s ->> 'field'
          WHEN 'createdAt' THEN 'created'
          WHEN 'updatedAt' THEN 'updated'
          WHEN 'estimatedValue' THEN 'value'
          WHEN 'leadNo' THEN 'ref'
          ELSE s ->> 'field'
        END,
        'dir', s ->> 'direction'
      )
    END,
    'layout', CASE WHEN view_type = 'BOARD' THEN 'BOARD' ELSE 'TABLE' END,
    'columns', "_saved_view_columns"(cols)
  ));
$$;

UPDATE "CrmSavedView"
SET "register" = 'LEAD',
    "state" = "_saved_view_state"(
      CASE WHEN jsonb_typeof("filters") = 'object' THEN "filters" ELSE '{}'::jsonb END,
      CASE WHEN jsonb_typeof("sort") = 'object' THEN "sort" ELSE '{}'::jsonb END,
      "viewType"::text,
      "columns"
    );

DROP FUNCTION "_saved_view_state"(jsonb, jsonb, text, jsonb);
DROP FUNCTION "_saved_view_columns"(jsonb);
DROP FUNCTION "_saved_view_day"(jsonb, interval);
DROP FUNCTION "_saved_view_list"(jsonb, text[]);

ALTER TABLE "CrmSavedView"
  ALTER COLUMN "register" SET NOT NULL,
  ALTER COLUMN "state" SET NOT NULL;

DROP INDEX "CrmSavedView_companyId_entity_isShared_idx";

ALTER TABLE "CrmSavedView"
  DROP COLUMN "entity",
  DROP COLUMN "viewType",
  DROP COLUMN "filters",
  DROP COLUMN "sort",
  DROP COLUMN "columns",
  DROP COLUMN "groupBy";

DROP TYPE "CrmViewType";

CREATE INDEX "CrmSavedView_companyId_register_isShared_idx"
  ON "CrmSavedView"("companyId", "register", "isShared");
