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
