-- Operação administrativa de manutenção/preparação de imóveis.
CREATE TABLE IF NOT EXISTS service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  specialty VARCHAR(120),
  city VARCHAR(150),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  service_provider_id UUID REFERENCES service_providers(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  service_type VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (service_type IN ('inspection', 'cleaning', 'repair', 'renovation', 'setup', 'other')),
  status VARCHAR(30) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'quoted', 'approved', 'scheduled', 'in_progress', 'done', 'cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  description TEXT,
  provider_amount NUMERIC(12,2)
    CHECK (provider_amount IS NULL OR provider_amount >= 0),
  coordination_fee NUMERIC(12,2)
    CHECK (coordination_fee IS NULL OR coordination_fee >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  scheduled_for TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (contact_id IS NOT NULL OR property_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS maintenance_order_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES maintenance_orders(id) ON DELETE CASCADE,
  photo_type VARCHAR(20) NOT NULL DEFAULT 'other'
    CHECK (photo_type IN ('before', 'after', 'receipt', 'other')),
  url TEXT NOT NULL,
  caption VARCHAR(500),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_orders_contact_idx
  ON maintenance_orders(contact_id, updated_date DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_orders_property_idx
  ON maintenance_orders(property_id, updated_date DESC)
  WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_orders_status_idx
  ON maintenance_orders(status, priority);

CREATE INDEX IF NOT EXISTS maintenance_order_photos_order_idx
  ON maintenance_order_photos(order_id, created_date DESC);
