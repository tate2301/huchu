-- One question definition, everywhere.
--
-- An intake form's questions and a template's questions were two shapes of
-- the same idea: intake stored `{ key, label, type, helpText, options: [{value,
-- label}] }` with seven type names, a template's field block stored `{ key,
-- label, fieldType, help, options: ["…"] }` flat on the block with eleven.
-- `lib/forms/fields.ts` is now the one definition, and this brings stored rows
-- onto it:
--
--   CrmIntakeForm.fields   textarea -> longText, multiselect -> multiSelect,
--                          helpText -> help
--   CrmTemplate.blocks     a field block becomes { id, type: "field", field: {…} }
--                          with `fieldType` -> `type`, choices as {value, label},
--                          and the key made snake_case — at the top level and
--                          inside side-by-side blocks, which nest one deep.
--
-- No column changes. Nothing is dropped: every setting a question had is
-- carried into the new shape. Both columns are rewritten in place, so this is
-- safe to re-run — a block that already wraps a `field` is left alone.

CREATE OR REPLACE FUNCTION "_one_field_key"(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN slug = '' THEN 'question'
    WHEN slug ~ '^[0-9]' THEN 'q_' || slug
    ELSE slug
  END
  FROM (
    -- Word breaks first, then case: `visitDate` is visit_date, not visitdate.
    SELECT btrim(
      regexp_replace(
        lower(regexp_replace(coalesce(raw, ''), '([a-z0-9])([A-Z])', '\1_\2', 'g')),
        '[^a-z0-9]+', '_', 'g'
      ),
      '_'
    ) AS slug
  ) AS s;
$$;

CREATE OR REPLACE FUNCTION "_one_field_intake"(f jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT (f - 'helpText' - 'type')
    || jsonb_build_object(
         'type',
         CASE f->>'type'
           WHEN 'textarea' THEN 'longText'
           WHEN 'multiselect' THEN 'multiSelect'
           ELSE f->>'type'
         END
       )
    || CASE
         WHEN coalesce(f->>'helpText', '') <> '' THEN jsonb_build_object('help', f->'helpText')
         ELSE '{}'::jsonb
       END;
$$;

CREATE OR REPLACE FUNCTION "_one_field_block"(b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN b->>'type' = 'field' AND NOT (b ? 'field') THEN
      jsonb_build_object(
        'id', b->'id',
        'type', 'field',
        'field', jsonb_strip_nulls(jsonb_build_object(
          'key', "_one_field_key"(coalesce(b->>'key', b->>'id')),
          'label', CASE
                     WHEN coalesce(btrim(b->>'label'), '') = '' THEN coalesce(b->>'key', 'Question')
                     ELSE b->>'label'
                   END,
          'type', coalesce(b->>'fieldType', 'text'),
          'required', coalesce((b->>'required')::boolean, false),
          'placeholder', b->'placeholder',
          'help', b->'help',
          'prefill', b->'prefill',
          'options', (
            SELECT jsonb_agg(jsonb_build_object('value', o, 'label', o) ORDER BY ord)
            FROM jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(b->'options') = 'array' THEN b->'options' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS t(o, ord)
            WHERE btrim(o) <> ''
          )
        ))
      )
    ELSE b
  END;
$$;

UPDATE "CrmIntakeForm"
SET "fields" = (
  SELECT coalesce(jsonb_agg("_one_field_intake"(f) ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements("fields") WITH ORDINALITY AS t(f, ord)
)
WHERE jsonb_typeof("fields") = 'array';

UPDATE "CrmTemplate"
SET "blocks" = (
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN b->>'type' = 'columns' THEN b || jsonb_build_object(
        'left', (
          SELECT coalesce(jsonb_agg("_one_field_block"(c) ORDER BY o), '[]'::jsonb)
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(b->'left') = 'array' THEN b->'left' ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS l(c, o)
        ),
        'right', (
          SELECT coalesce(jsonb_agg("_one_field_block"(c) ORDER BY o), '[]'::jsonb)
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(b->'right') = 'array' THEN b->'right' ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS r(c, o)
        )
      )
      ELSE "_one_field_block"(b)
    END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements("blocks") WITH ORDINALITY AS t(b, ord)
)
WHERE jsonb_typeof("blocks") = 'array';

DROP FUNCTION "_one_field_block"(jsonb);
DROP FUNCTION "_one_field_intake"(jsonb);
DROP FUNCTION "_one_field_key"(text);
