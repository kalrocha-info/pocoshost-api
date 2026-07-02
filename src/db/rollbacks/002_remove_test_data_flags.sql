-- Rollback manual e destrutivo da migration 002.
-- Execute somente se nenhum processo operacional depender de is_test_data.

DROP INDEX IF EXISTS reviews_is_test_data_idx;
DROP INDEX IF EXISTS favorites_is_test_data_idx;
DROP INDEX IF EXISTS payments_is_test_data_idx;
DROP INDEX IF EXISTS reservations_is_test_data_idx;
DROP INDEX IF EXISTS properties_is_test_data_idx;
DROP INDEX IF EXISTS users_is_test_data_idx;

ALTER TABLE reviews DROP COLUMN IF EXISTS is_test_data;
ALTER TABLE favorites DROP COLUMN IF EXISTS is_test_data;
ALTER TABLE payments DROP COLUMN IF EXISTS is_test_data;
ALTER TABLE reservations DROP COLUMN IF EXISTS is_test_data;
ALTER TABLE properties DROP COLUMN IF EXISTS is_test_data;
ALTER TABLE users DROP COLUMN IF EXISTS is_test_data;
