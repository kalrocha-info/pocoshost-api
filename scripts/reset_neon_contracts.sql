-- reset_neon_contracts.sql — Limpa resíduos de migrações 008/009 no Neon
-- Executar via: psql "$DATABASE_URL" -f scripts/reset_neon_contracts.sql
-- OU via node lendo o arquivo

BEGIN;

-- Remove triggers órfãos (somente se existirem)
DROP TRIGGER IF EXISTS update_contract_expenses_updated_at ON contract_expenses;
DROP TRIGGER IF EXISTS trigger_recalculate_statement_expenses ON contract_expenses;
DROP TRIGGER IF EXISTS update_contract_statements_updated_at ON contract_statements;
DROP TRIGGER IF EXISTS update_management_contracts_updated_at ON management_contracts;

-- Remove funções órfãs
DROP FUNCTION IF EXISTS recalculate_statement_expenses() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Remove tabelas órfãs (Cascade limpa dependências)
DROP TABLE IF EXISTS contract_expenses CASCADE;
DROP TABLE IF EXISTS contract_statements CASCADE;
DROP TABLE IF EXISTS management_contracts CASCADE;

-- Remove registros de migrations para re-aplicar
DELETE FROM schema_migrations
WHERE name IN ('008_create_contracts.sql', '009_create_contract_expenses.sql');

COMMIT;