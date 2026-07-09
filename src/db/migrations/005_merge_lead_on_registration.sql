-- Converte o lead anónimo em contacto vinculado quando a mesma pessoa cria uma conta.
CREATE OR REPLACE FUNCTION sync_user_to_crm_contact()
RETURNS TRIGGER AS $$
DECLARE
  matched_contact_id UUID;
BEGIN
  IF NEW.role IN ('guest', 'host') AND NEW.is_anonymized = FALSE THEN
    IF TG_OP = 'INSERT' THEN
      SELECT id
        INTO matched_contact_id
        FROM crm_contacts
       WHERE user_id IS NULL
         AND email IS NOT NULL
         AND LOWER(email) = LOWER(NEW.email)
       ORDER BY updated_date DESC
       LIMIT 1
       FOR UPDATE;
    END IF;

    IF matched_contact_id IS NOT NULL THEN
      UPDATE crm_contacts
         SET user_id = NEW.id,
             full_name = NEW.full_name,
             email = NEW.email,
             phone = COALESCE(NEW.phone, phone),
             contact_type = NEW.role,
             stage = CASE WHEN NEW.role = 'host' THEN 'onboarding' ELSE 'active' END,
             stage_changed_at = NOW(),
             source = COALESCE(source, 'platform'),
             updated_date = NOW()
       WHERE id = matched_contact_id;
    ELSE
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
    END IF;
  ELSE
    DELETE FROM crm_contacts WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
