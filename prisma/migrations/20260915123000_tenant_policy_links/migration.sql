-- Where a tenant publishes its Privacy Policy and Terms.
--
-- The public intake form (/f/<token>) collects a stranger's name, phone,
-- email and photographs, and said nothing about what happens to them. It now
-- links to the tenant's own published policies.
--
-- Whole URLs, not paths derived from `website`: each tenant publishes on its
-- own domain and not all of them use /privacy and /terms. Per tenant, because
-- the CRM serves more than one company and one deployment-wide link would be
-- the wrong company's policy on everybody else's form.

ALTER TABLE "CompanyBranding"
  ADD COLUMN "privacyPolicyUrl" TEXT,
  ADD COLUMN "termsUrl"         TEXT;
