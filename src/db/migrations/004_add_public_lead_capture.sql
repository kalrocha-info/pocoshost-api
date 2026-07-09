-- Atribuição, consentimento e ciclo de vida para captação pública de leads.
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS utm_source VARCHAR(150),
  ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(150),
  ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(200),
  ADD COLUMN IF NOT EXISTS utm_content VARCHAR(200),
  ADD COLUMN IF NOT EXISTS utm_term VARCHAR(200),
  ADD COLUMN IF NOT EXISTS landing_page TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loss_reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS crm_contacts_utm_source_idx
  ON crm_contacts(utm_source)
  WHERE utm_source IS NOT NULL;

-- Novas contas de anfitrião ainda precisam concluir o onboarding e publicar um imóvel.
CREATE OR REPLACE FUNCTION sync_user_to_crm_contact()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IN ('guest', 'host') AND NEW.is_anonymized = FALSE THEN
    INSERT INTO crm_contacts (
      user_id, full_name, email, phone, contact_type, stage, source
    )
    VALUES (
      NEW.id,
      NEW.full_name,
      NEW.email,
      NEW.phone,
      NEW.role,
      CASE WHEN NEW.role = 'host' THEN 'onboarding' ELSE 'active' END,
      'platform'
    )
    ON CONFLICT (user_id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          contact_type = EXCLUDED.contact_type,
          updated_date = NOW();
  ELSE
    DELETE FROM crm_contacts WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A publicação do primeiro imóvel conclui automaticamente o onboarding comercial.
CREATE OR REPLACE FUNCTION promote_host_crm_on_property()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND NEW.is_active = TRUE THEN
    UPDATE crm_contacts
       SET stage = 'active',
           stage_changed_at = NOW(),
           updated_date = NOW()
     WHERE user_id = NEW.created_by
       AND contact_type = 'host'
       AND stage IN ('lead', 'contacted', 'qualified', 'onboarding');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS properties_promote_host_crm_trigger ON properties;
CREATE TRIGGER properties_promote_host_crm_trigger
AFTER INSERT OR UPDATE OF is_active, created_by
ON properties
FOR EACH ROW
EXECUTE FUNCTION promote_host_crm_on_property();
