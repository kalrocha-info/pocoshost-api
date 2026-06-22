-- Patch operacional 10/06/2026
-- Objetivo:
-- 1. Criar colunas de status/anonimizacao caso a migration automatica nao tenha rodado.
-- 2. Garantir que administradores existentes possam autenticar apos a regra de e-mail verificado.
-- 3. Preservar comportamento seguro para bloqueio/desbloqueio administrativo.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active', 'blocked'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

UPDATE users
   SET email_verified = TRUE,
       email_verified_at = COALESCE(email_verified_at, created_date, NOW())
 WHERE email_verified IS NULL;

ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;

UPDATE users
   SET email_verified = TRUE,
       email_verified_at = COALESCE(email_verified_at, created_date, NOW()),
       account_status = COALESCE(account_status, 'active'),
       updated_date = NOW()
 WHERE role = 'admin'
   AND is_anonymized = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS users_document_number_active_unique_idx
  ON users ((regexp_replace(document_number, '\D', '', 'g')))
  WHERE document_number IS NOT NULL
    AND regexp_replace(document_number, '\D', '', 'g') <> ''
    AND is_anonymized = FALSE;

SELECT email, role, email_verified, account_status, is_anonymized
  FROM users
 WHERE role = 'admin'
 ORDER BY created_date;
