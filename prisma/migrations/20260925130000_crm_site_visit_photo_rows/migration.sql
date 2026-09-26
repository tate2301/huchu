-- Site-visit photos become rows, and each one says where it was taken.
--
-- A visit report kept its photographs as a JSON array on the appointment:
-- a URL, a file name and a caption. That is a picture of *somewhere*. The
-- point of a site photo is that it is evidence of a particular place on a
-- particular day, and a JSON blob had nowhere to say either. `CrmSiteVisitPhoto`
-- was built for exactly this -- latitude, longitude, the device's capture time,
-- an idempotency key minted on the phone -- and nothing wrote to it. Now the
-- report does, and the array goes.
--
-- The tenant also chooses which camera app its reps are pointed at, because a
-- phone's own camera app strips or never records the location often enough
-- that "please geotag your photos" has to come with a recommendation.

-- 1. The recommended camera app. Null means the default, applied in code.
ALTER TABLE "Company" ADD COLUMN "fieldCameraAppName" TEXT,
ADD COLUMN "fieldCameraAppUrl" TEXT;

-- 2. The name the file had on the phone. The array carried it, and a list of
--    attachments with no names reads "Photo, Photo, Photo".
ALTER TABLE "CrmSiteVisitPhoto" ADD COLUMN "fileName" TEXT;

-- 3. Carry every photo across before the column goes.
--
--    The array was written by the report sheet as
--    { url, fileName, contentType, size, kind: "PHOTO" | "FILE", caption }.
--
--    - `blobPathname` is the record the row is keyed on. The array never kept
--      it, but a blob URL is its store's host followed by the pathname, so it
--      is the URL with the scheme, host and any query string taken off.
--    - `contentType` was always sent in practice. Where it is missing, the old
--      `kind` is the only evidence of what the file was, and the report now
--      decides "is this a photo" from the content type, so a PHOTO keeps being
--      drawn as one.
--    - `clientPhotoId` is minted on the phone for new photos. These were never
--      given one, so they get a deterministic stand-in that cannot collide
--      with a UUID.
--    - Nothing here knows where or when these were taken, so the location and
--      capture time stay empty -- which is the truth about them.
--    - `createdAt` keeps the array's order: the report lists photos oldest
--      first, and the array's order is the order they were added.
INSERT INTO "CrmSiteVisitPhoto" (
  "id",
  "companyId",
  "appointmentId",
  "blobPathname",
  "url",
  "contentType",
  "size",
  "caption",
  "fileName",
  "clientPhotoId",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  appointment."companyId",
  appointment."id",
  regexp_replace(
    regexp_replace(photo.value ->> 'url', '^[A-Za-z][A-Za-z0-9+.-]*://[^/]*/?', ''),
    '[?#].*$',
    ''
  ),
  photo.value ->> 'url',
  COALESCE(
    NULLIF(btrim(photo.value ->> 'contentType'), ''),
    CASE WHEN photo.value ->> 'kind' = 'FILE' THEN 'application/octet-stream' ELSE 'image/jpeg' END
  ),
  CASE
    WHEN jsonb_typeof(photo.value -> 'size') = 'number'
      THEN GREATEST(0, LEAST(2147483647, round((photo.value ->> 'size')::numeric)))::integer
    ELSE 0
  END,
  NULLIF(btrim(photo.value ->> 'caption'), ''),
  NULLIF(btrim(photo.value ->> 'fileName'), ''),
  'legacy-' || appointment."id" || '-' || photo.position,
  COALESCE(appointment."reportCompletedAt", appointment."updatedAt")
    + (photo.position * INTERVAL '1 millisecond')
FROM "CrmAppointment" AS appointment
-- The CASE rather than a WHERE on the appointment: a column that somehow holds
-- an object must be skipped, and jsonb_array_elements raises on one before any
-- filter on the outer row is guaranteed to have run.
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(appointment."photos") = 'array' THEN appointment."photos" ELSE '[]'::jsonb END
) WITH ORDINALITY AS photo(value, position)
WHERE jsonb_typeof(photo.value) = 'object'
  AND NULLIF(btrim(photo.value ->> 'url'), '') IS NOT NULL;

ALTER TABLE "CrmAppointment" DROP COLUMN "photos";
