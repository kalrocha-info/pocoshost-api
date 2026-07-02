-- Identifica dados operacionais criados para teste sem misturá-los a dados reais.
-- A marcação de registros existentes continua sendo uma decisão operacional separada.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE favorites
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS users_is_test_data_idx ON users(is_test_data);
CREATE INDEX IF NOT EXISTS properties_is_test_data_idx ON properties(is_test_data);
CREATE INDEX IF NOT EXISTS reservations_is_test_data_idx ON reservations(is_test_data);
CREATE INDEX IF NOT EXISTS payments_is_test_data_idx ON payments(is_test_data);
CREATE INDEX IF NOT EXISTS favorites_is_test_data_idx ON favorites(is_test_data);
CREATE INDEX IF NOT EXISTS reviews_is_test_data_idx ON reviews(is_test_data);
