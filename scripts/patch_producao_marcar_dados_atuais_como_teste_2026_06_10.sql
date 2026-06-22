-- Marca os dados atuais como dados de teste.
-- Preserva uma conta admin operacional como dado real para nao perder acesso ao painel.
--
-- IMPORTANTE:
-- 1. Execute primeiro: patch_producao_flag_dados_teste_2026_06_10.sql
-- 2. Ajuste o e-mail abaixo se quiser preservar outro admin como operacional.

WITH config AS (
  SELECT 'admin@pocoshost.com.br'::text AS admin_operacional_email
)
UPDATE users u
   SET is_test_data = CASE WHEN u.email = config.admin_operacional_email THEN FALSE ELSE TRUE END,
       email_verified = CASE WHEN u.email = config.admin_operacional_email THEN TRUE ELSE u.email_verified END,
       account_status = CASE WHEN u.email = config.admin_operacional_email THEN 'active' ELSE u.account_status END,
       updated_date = NOW()
  FROM config;

UPDATE properties SET is_test_data = TRUE, updated_date = NOW();
UPDATE reservations SET is_test_data = TRUE, updated_date = NOW();
UPDATE payments SET is_test_data = TRUE, updated_date = NOW();
UPDATE favorites SET is_test_data = TRUE;
UPDATE reviews SET is_test_data = TRUE, updated_date = NOW();

SELECT 'users' AS table_name, is_test_data, COUNT(*) AS total
  FROM users
 GROUP BY is_test_data
UNION ALL
SELECT 'properties', is_test_data, COUNT(*)
  FROM properties
 GROUP BY is_test_data
UNION ALL
SELECT 'reservations', is_test_data, COUNT(*)
  FROM reservations
 GROUP BY is_test_data
UNION ALL
SELECT 'payments', is_test_data, COUNT(*)
  FROM payments
 GROUP BY is_test_data
UNION ALL
SELECT 'favorites', is_test_data, COUNT(*)
  FROM favorites
 GROUP BY is_test_data
UNION ALL
SELECT 'reviews', is_test_data, COUNT(*)
  FROM reviews
 GROUP BY is_test_data
ORDER BY table_name, is_test_data;
