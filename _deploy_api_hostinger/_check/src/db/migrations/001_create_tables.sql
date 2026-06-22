-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'guest',
  avatar_url TEXT,
  phone VARCHAR(50),
  document_type VARCHAR(20),
  document_number VARCHAR(100),
  company_name VARCHAR(255),
  address_info TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de categorias de imóveis
CREATE TABLE IF NOT EXISTS property_categories (
  slug VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de imóveis
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  city VARCHAR(255) NOT NULL,
  state VARCHAR(100),
  address TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  category VARCHAR(100) REFERENCES property_categories(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  price_per_night NUMERIC(10, 2) NOT NULL,
  max_guests INTEGER,
  bedrooms INTEGER,
  bathrooms INTEGER,
  photos TEXT[] DEFAULT '{}',
  cover_photo TEXT,
  rules TEXT,
  rating NUMERIC(3, 2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  host_name VARCHAR(255),
  host_email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de reservas
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  property_title VARCHAR(255),
  guest_id UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_email VARCHAR(255),
  guest_name VARCHAR(255),
  host_email VARCHAR(255),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests INTEGER NOT NULL DEFAULT 1,
  total_price NUMERIC(10, 2) NOT NULL,
  platform_fee NUMERIC(10, 2) NOT NULL,
  host_net NUMERIC(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  expired_at TIMESTAMPTZ,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de pagamentos
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  property_title VARCHAR(255),
  guest_email VARCHAR(255),
  host_email VARCHAR(255),
  total_amount NUMERIC(10, 2) NOT NULL,
  platform_fee NUMERIC(10, 2) NOT NULL,
  host_net NUMERIC(10, 2) NOT NULL,
  card_last4 VARCHAR(4),
  status VARCHAR(50) NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded','pending')),
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de favoritos
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_email VARCHAR(255),
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, user_id)
);

-- Tabela de avaliações
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  guest_name VARCHAR(255),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campos de conciliação com gateway de pagamento (Asaas)
ALTER TABLE users ADD COLUMN IF NOT EXISTS asaas_wallet_id VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS billing_type VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_status VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_payment_id_idx
  ON payments(gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_reservation_id_idx
  ON payments(reservation_id);

-- Prazo de retenção temporária da agenda enquanto o pagamento não é concluído
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
UPDATE reservations
   SET expires_at = created_date + INTERVAL '30 minutes'
 WHERE expires_at IS NULL;
ALTER TABLE reservations ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 minutes');
ALTER TABLE reservations ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
UPDATE reservations
   SET status = 'cancelled',
       expired_at = COALESCE(expired_at, NOW()),
       updated_date = NOW()
 WHERE status = 'pending'
   AND expires_at <= NOW();
CREATE INDEX IF NOT EXISTS reservations_pending_expiration_idx
  ON reservations(expires_at)
  WHERE status = 'pending';

-- Campos LGPD para anonimização de contas
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- Campos de verificação de e-mail
-- Contas existentes antes desta migration são preservadas como verificadas;
-- novos cadastros passam a nascer não verificados pelo default abaixo.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
UPDATE users
   SET email_verified = TRUE,
       email_verified_at = COALESCE(email_verified_at, created_date, NOW())
 WHERE email_verified IS NULL;
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_email_verification_token_hash_idx
  ON users(email_verification_token_hash)
  WHERE email_verification_token_hash IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_password_reset_token_hash_idx
  ON users(password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;
