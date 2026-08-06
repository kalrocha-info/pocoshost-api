-- Migration 009: Despesas Operacionais por Contrato de Gestão

CREATE TABLE IF NOT EXISTS contract_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES management_contracts(id) ON DELETE CASCADE,
  statement_id UUID REFERENCES contract_statements(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'maintenance'
    CHECK (category IN ('cleaning', 'maintenance', 'ota_fee', 'tax', 'supply', 'other')),
  description VARCHAR(255) NOT NULL,
  amount NUMERIC(12,2) NOT NULL
    CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contract_expenses_contract_idx
  ON contract_expenses(contract_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS contract_expenses_statement_idx
  ON contract_expenses(statement_id)
  WHERE statement_id IS NOT NULL;
