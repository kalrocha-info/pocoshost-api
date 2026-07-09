-- Dados qualificados do imóvel para leads de gestão/anfitrião.
CREATE TABLE IF NOT EXISTS host_lead_profiles (
  contact_id UUID PRIMARY KEY REFERENCES crm_contacts(id) ON DELETE CASCADE,
  property_type VARCHAR(30) NOT NULL
    CHECK (property_type IN ('casa', 'apartamento', 'chale', 'pousada', 'sitio', 'hotel', 'outro')),
  city VARCHAR(150) NOT NULL,
  neighborhood VARCHAR(150),
  bedrooms SMALLINT
    CHECK (bedrooms IS NULL OR (bedrooms >= 0 AND bedrooms <= 20)),
  management_interest VARCHAR(40) NOT NULL DEFAULT 'complete_management'
    CHECK (management_interest IN ('complete_management', 'direct_listing', 'maintenance_only', 'unsure')),
  property_status VARCHAR(30) NOT NULL DEFAULT 'unknown'
    CHECK (property_status IN ('ready', 'needs_adjustments', 'under_renovation', 'planning', 'unknown')),
  accepts_maintenance_coordination BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS host_lead_profiles_interest_idx
  ON host_lead_profiles(management_interest);

CREATE INDEX IF NOT EXISTS host_lead_profiles_location_idx
  ON host_lead_profiles(LOWER(city), LOWER(neighborhood));
