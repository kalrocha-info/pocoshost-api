-- Contratos de Gestão e Balancetes Mensais

-- Contratos de co-gestão com proprietários/anfitriões
CREATE TABLE IF NOT EXISTS management_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  contract_number VARCHAR(50) UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'suspended', 'terminated')),
  management_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00
    CHECK (management_fee_pct >= 0 AND management_fee_pct <= 100),
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date > start_date)
);

-- Balancetes mensais de contrato (liquidação por período)
CREATE TABLE IF NOT EXISTS contract_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES management_contracts(id) ON DELETE CASCADE,
  reference_month CHAR(7) NOT NULL,            -- formato: YYYY-MM
  gross_revenue NUMERIC(12,2) NOT NULL DEFAULT 0.00
    CHECK (gross_revenue >= 0),
  management_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00
    CHECK (management_fee >= 0),
  operational_expenses NUMERIC(12,2) NOT NULL DEFAULT 0.00
    CHECK (operational_expenses >= 0),
  net_owner_payout NUMERIC(12,2) GENERATED ALWAYS AS
    (gross_revenue - management_fee - operational_expenses) STORED,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'paid')),
  notes TEXT,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, reference_month)
);

CREATE INDEX IF NOT EXISTS management_contracts_property_idx
  ON management_contracts(property_id, status);

CREATE INDEX IF NOT EXISTS management_contracts_host_idx
  ON management_contracts(host_user_id, status);

CREATE INDEX IF NOT EXISTS contract_statements_contract_idx
  ON contract_statements(contract_id, reference_month DESC);

CREATE INDEX IF NOT EXISTS contract_statements_status_idx
  ON contract_statements(status, reference_month DESC);
