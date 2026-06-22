-- Patch operacional - flag para diferenciar dados de teste e dados reais.
-- Execute uma vez no Neon antes dos scripts de marcacao/limpeza.
-- Nao remove dados.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS users_is_test_data_idx ON users(is_test_data);
CREATE INDEX IF NOT EXISTS properties_is_test_data_idx ON properties(is_test_data);
CREATE INDEX IF NOT EXISTS reservations_is_test_data_idx ON reservations(is_test_data);
CREATE INDEX IF NOT EXISTS payments_is_test_data_idx ON payments(is_test_data);
CREATE INDEX IF NOT EXISTS favorites_is_test_data_idx ON favorites(is_test_data);
CREATE INDEX IF NOT EXISTS reviews_is_test_data_idx ON reviews(is_test_data);

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
