-- Limpa apenas dados marcados como teste.
-- NAO execute antes de revisar o SELECT de pre-visualizacao.
--
-- Ordem de delecao:
-- payments/favorites/reviews -> reservations -> properties -> users de teste.
-- A conta admin operacional preservada com is_test_data = FALSE permanece.

BEGIN;

-- Pre-visualizacao
SELECT 'users_test' AS item, COUNT(*) AS total FROM users WHERE is_test_data = TRUE
UNION ALL
SELECT 'properties_test', COUNT(*) FROM properties WHERE is_test_data = TRUE
UNION ALL
SELECT 'reservations_test', COUNT(*) FROM reservations WHERE is_test_data = TRUE
UNION ALL
SELECT 'payments_test', COUNT(*) FROM payments WHERE is_test_data = TRUE
UNION ALL
SELECT 'favorites_test', COUNT(*) FROM favorites WHERE is_test_data = TRUE
UNION ALL
SELECT 'reviews_test', COUNT(*) FROM reviews WHERE is_test_data = TRUE;

-- Se a pre-visualizacao estiver incorreta, execute ROLLBACK manualmente em vez de COMMIT.

DELETE FROM payments WHERE is_test_data = TRUE;
DELETE FROM favorites WHERE is_test_data = TRUE;
DELETE FROM reviews WHERE is_test_data = TRUE;
DELETE FROM reservations WHERE is_test_data = TRUE;
DELETE FROM properties WHERE is_test_data = TRUE;
DELETE FROM users WHERE is_test_data = TRUE;

-- Validacao pos-limpeza dentro da transacao
SELECT 'users_test_remaining' AS item, COUNT(*) AS total FROM users WHERE is_test_data = TRUE
UNION ALL
SELECT 'properties_test_remaining', COUNT(*) FROM properties WHERE is_test_data = TRUE
UNION ALL
SELECT 'reservations_test_remaining', COUNT(*) FROM reservations WHERE is_test_data = TRUE
UNION ALL
SELECT 'payments_test_remaining', COUNT(*) FROM payments WHERE is_test_data = TRUE
UNION ALL
SELECT 'favorites_test_remaining', COUNT(*) FROM favorites WHERE is_test_data = TRUE
UNION ALL
SELECT 'reviews_test_remaining', COUNT(*) FROM reviews WHERE is_test_data = TRUE;

COMMIT;
