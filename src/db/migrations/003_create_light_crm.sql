-- CRM leve para relacionamento com hóspedes, anfitriões e parceiros.
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  contact_type VARCHAR(30) NOT NULL DEFAULT 'guest'
    CHECK (contact_type IN ('guest', 'host', 'partner')),
  stage VARCHAR(30) NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead', 'contacted', 'qualified', 'onboarding', 'active', 'inactive')),
  source VARCHAR(100),
  summary TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  next_action_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  activity_type VARCHAR(30) NOT NULL DEFAULT 'note'
    CHECK (activity_type IN ('note', 'call', 'email', 'meeting', 'task')),
  content TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contacts_stage_idx ON crm_contacts(stage);
CREATE INDEX IF NOT EXISTS crm_contacts_type_idx ON crm_contacts(contact_type);
CREATE INDEX IF NOT EXISTS crm_contacts_next_action_idx
  ON crm_contacts(next_action_at)
  WHERE next_action_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_search_idx
  ON crm_contacts(LOWER(full_name), LOWER(email));
CREATE INDEX IF NOT EXISTS crm_activities_contact_idx
  ON crm_activities(contact_id, created_date DESC);
CREATE INDEX IF NOT EXISTS crm_activities_due_idx
  ON crm_activities(due_at)
  WHERE due_at IS NOT NULL AND completed_at IS NULL;

-- Mantém os dados básicos dos contactos associados a contas sincronizados.
CREATE OR REPLACE FUNCTION sync_user_to_crm_contact()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IN ('guest', 'host') AND NEW.is_anonymized = FALSE THEN
    INSERT INTO crm_contacts (
      user_id, full_name, email, phone, contact_type, stage, source
    )
    VALUES (
      NEW.id, NEW.full_name, NEW.email, NEW.phone, NEW.role, 'active', 'platform'
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

DROP TRIGGER IF EXISTS users_sync_crm_contact_trigger ON users;
CREATE TRIGGER users_sync_crm_contact_trigger
AFTER INSERT OR UPDATE OF full_name, email, phone, role, is_anonymized
ON users
FOR EACH ROW
EXECUTE FUNCTION sync_user_to_crm_contact();

INSERT INTO crm_contacts (
  user_id, full_name, email, phone, contact_type, stage, source, created_date, updated_date
)
SELECT
  id, full_name, email, phone, role, 'active', 'platform', created_date, updated_date
FROM users
WHERE role IN ('guest', 'host')
  AND is_anonymized = FALSE
ON CONFLICT (user_id) DO NOTHING;
