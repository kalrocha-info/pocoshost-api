DROP TRIGGER IF EXISTS properties_promote_host_crm_trigger ON properties;
DROP FUNCTION IF EXISTS promote_host_crm_on_property();
DROP INDEX IF EXISTS crm_contacts_utm_source_idx;

ALTER TABLE crm_contacts
  DROP COLUMN IF EXISTS utm_source,
  DROP COLUMN IF EXISTS utm_medium,
  DROP COLUMN IF EXISTS utm_campaign,
  DROP COLUMN IF EXISTS utm_content,
  DROP COLUMN IF EXISTS utm_term,
  DROP COLUMN IF EXISTS landing_page,
  DROP COLUMN IF EXISTS referrer,
  DROP COLUMN IF EXISTS privacy_accepted_at,
  DROP COLUMN IF EXISTS contact_consent_at,
  DROP COLUMN IF EXISTS marketing_consent,
  DROP COLUMN IF EXISTS marketing_consent_at,
  DROP COLUMN IF EXISTS loss_reason,
  DROP COLUMN IF EXISTS stage_changed_at;
