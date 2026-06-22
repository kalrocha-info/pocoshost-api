-- Auditoria somente leitura - Producao PoçosHost - 10/06/2026
-- Execute no SQL Editor do Neon.
-- Este script nao altera dados nem estrutura: apenas SELECT.

-- 01. Resumo de volume por tabela principal
SELECT '01_resumo_users' AS check_name, role, COUNT(*) AS total
  FROM users
 GROUP BY role
 ORDER BY role;

SELECT '01_resumo_properties' AS check_name,
       CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status,
       COUNT(*) AS total
  FROM properties
 GROUP BY is_active
 ORDER BY status;

SELECT '01_resumo_reservations' AS check_name, status, COUNT(*) AS total
  FROM reservations
 GROUP BY status
 ORDER BY status;

SELECT '01_resumo_payments' AS check_name, status, COUNT(*) AS total
  FROM payments
 GROUP BY status
 ORDER BY status;

-- 02. Usuarios sem campos obrigatorios ou criticos
SELECT '02_users_campos_criticos' AS check_name,
       id, email, full_name, role, email_verified, account_status, is_anonymized, created_date
  FROM users
 WHERE email IS NULL
    OR email = ''
    OR full_name IS NULL
    OR full_name = ''
    OR role NOT IN ('guest', 'host', 'admin')
    OR email_verified IS DISTINCT FROM TRUE
    OR account_status IS NULL
    OR account_status NOT IN ('active', 'blocked')
 ORDER BY created_date DESC;

-- 03. Administradores que nao estao aptos a logar
SELECT '03_admins_nao_aptos' AS check_name,
       id, email, full_name, role, email_verified, account_status, is_anonymized, created_date
  FROM users
 WHERE role = 'admin'
   AND (
     email_verified IS DISTINCT FROM TRUE
     OR account_status IS DISTINCT FROM 'active'
     OR is_anonymized IS DISTINCT FROM FALSE
   )
 ORDER BY created_date DESC;

-- 04. Documentos duplicados em contas ativas/nao anonimizadas
SELECT '04_documentos_duplicados' AS check_name,
       regexp_replace(document_number, '\D', '', 'g') AS documento_normalizado,
       COUNT(*) AS total,
       string_agg(email, ', ' ORDER BY email) AS emails
  FROM users
 WHERE document_number IS NOT NULL
   AND regexp_replace(document_number, '\D', '', 'g') <> ''
   AND is_anonymized = FALSE
 GROUP BY regexp_replace(document_number, '\D', '', 'g')
HAVING COUNT(*) > 1
 ORDER BY total DESC, documento_normalizado;

-- 05. Anfitrioes sem wallet Asaas para split
SELECT '05_hosts_sem_wallet' AS check_name,
       id, email, full_name, account_status, email_verified, created_date
  FROM users
 WHERE role = 'host'
   AND is_anonymized = FALSE
   AND (asaas_wallet_id IS NULL OR asaas_wallet_id = '')
 ORDER BY created_date DESC;

-- 06. Imoveis sem anfitriao valido ou dados de dono inconsistentes
SELECT '06_properties_dono_invalido' AS check_name,
       p.id, p.title, p.city, p.is_active, p.created_by, p.host_name, p.host_email,
       owner.email AS owner_email, owner.full_name AS owner_name, owner.role AS owner_role,
       owner.account_status AS owner_account_status
  FROM properties p
  LEFT JOIN users owner ON owner.id = p.created_by
 WHERE p.created_by IS NULL
    OR owner.id IS NULL
    OR owner.role <> 'host'
    OR p.host_email IS NULL
    OR p.host_email = ''
    OR p.host_name IS NULL
    OR p.host_name = ''
 ORDER BY p.created_date DESC;

-- 07. Imoveis ativos de anfitrioes bloqueados ou anonimizados
SELECT '07_properties_ativas_host_bloqueado' AS check_name,
       p.id, p.title, p.city, p.is_active, p.created_by,
       owner.email AS owner_email, owner.full_name AS owner_name,
       owner.account_status, owner.is_anonymized
  FROM properties p
  JOIN users owner ON owner.id = p.created_by
 WHERE p.is_active = TRUE
   AND (
     owner.account_status = 'blocked'
     OR owner.is_anonymized = TRUE
   )
 ORDER BY p.created_date DESC;

-- 08. Reservas orfas ou com participantes inconsistentes
SELECT '08_reservations_orfas' AS check_name,
       r.id, r.property_id, r.property_title, r.guest_id, r.guest_email, r.host_email,
       r.status, r.check_in, r.check_out, r.created_date,
       p.id AS property_exists,
       guest.email AS guest_user_email
  FROM reservations r
  LEFT JOIN properties p ON p.id = r.property_id
  LEFT JOIN users guest ON guest.id = r.guest_id
 WHERE p.id IS NULL
    OR (r.guest_id IS NOT NULL AND guest.id IS NULL)
    OR r.property_id IS NULL
 ORDER BY r.created_date DESC;

-- 09. Reservas com datas ou valores invalidos
SELECT '09_reservations_datas_valores_invalidos' AS check_name,
       id, property_id, property_title, status, check_in, check_out,
       guests, total_price, platform_fee, host_net, created_date
  FROM reservations
 WHERE check_in IS NULL
    OR check_out IS NULL
    OR check_out <= check_in
    OR guests <= 0
    OR total_price < 0
    OR platform_fee < 0
    OR host_net < 0
    OR ABS((platform_fee + host_net) - total_price) > 0.02
 ORDER BY created_date DESC;

-- 10. Reservas ativas sobrepostas no mesmo imovel
SELECT '10_reservations_sobrepostas' AS check_name,
       r1.property_id,
       r1.id AS reservation_1,
       r1.status AS status_1,
       r1.check_in AS check_in_1,
       r1.check_out AS check_out_1,
       r2.id AS reservation_2,
       r2.status AS status_2,
       r2.check_in AS check_in_2,
       r2.check_out AS check_out_2
  FROM reservations r1
  JOIN reservations r2
    ON r1.property_id = r2.property_id
   AND r1.id < r2.id
   AND r1.status IN ('pending', 'approved', 'confirmed')
   AND r2.status IN ('pending', 'approved', 'confirmed')
   AND r1.check_in < r2.check_out
   AND r2.check_in < r1.check_out
 ORDER BY r1.property_id, r1.check_in;

-- 11. Reservas pendentes/aprovadas expiradas que ainda nao foram canceladas
SELECT '11_reservations_expiradas_ativas' AS check_name,
       id, property_id, property_title, status, expires_at, expired_at, created_date
  FROM reservations
 WHERE status IN ('pending', 'approved')
   AND expires_at IS NOT NULL
   AND expires_at <= NOW()
 ORDER BY expires_at;

-- 12. Pagamentos orfaos, duplicados ou divergentes da reserva
SELECT '12_payments_inconsistentes' AS check_name,
       pay.id, pay.reservation_id, pay.status AS payment_status, pay.total_amount,
       pay.platform_fee, pay.host_net, pay.gateway_payment_id, pay.created_date,
       r.id AS reservation_exists, r.status AS reservation_status, r.total_price AS reservation_total
  FROM payments pay
  LEFT JOIN reservations r ON r.id = pay.reservation_id
 WHERE r.id IS NULL
    OR ABS(pay.total_amount - r.total_price) > 0.02
    OR ABS((pay.platform_fee + pay.host_net) - pay.total_amount) > 0.02
    OR (pay.status = 'paid' AND r.status NOT IN ('confirmed', 'completed'))
 ORDER BY pay.created_date DESC;

SELECT '12_payments_reserva_duplicada' AS check_name,
       reservation_id, COUNT(*) AS total, string_agg(id::text, ', ' ORDER BY created_date) AS payment_ids
  FROM payments
 GROUP BY reservation_id
HAVING COUNT(*) > 1
 ORDER BY total DESC;

-- 13. Payments com gateway_payment_id duplicado preenchido
SELECT '13_gateway_payment_id_duplicado' AS check_name,
       gateway_payment_id, COUNT(*) AS total, string_agg(id::text, ', ' ORDER BY created_date) AS payment_ids
  FROM payments
 WHERE gateway_payment_id IS NOT NULL
   AND gateway_payment_id <> ''
 GROUP BY gateway_payment_id
HAVING COUNT(*) > 1
 ORDER BY total DESC;

-- 14. Favoritos orfaos
SELECT '14_favorites_orfaos' AS check_name,
       f.id, f.property_id, f.user_id, f.user_email, f.created_date,
       p.id AS property_exists, u.id AS user_exists
  FROM favorites f
  LEFT JOIN properties p ON p.id = f.property_id
  LEFT JOIN users u ON u.id = f.user_id
 WHERE p.id IS NULL
    OR u.id IS NULL
 ORDER BY f.created_date DESC;

-- 15. Reviews orfas ou invalidas
SELECT '15_reviews_inconsistentes' AS check_name,
       r.id, r.property_id, r.user_id, r.user_email, r.rating, r.created_date,
       p.id AS property_exists, u.id AS user_exists
  FROM reviews r
  LEFT JOIN properties p ON p.id = r.property_id
  LEFT JOIN users u ON u.id = r.user_id
 WHERE p.id IS NULL
    OR (r.user_id IS NOT NULL AND u.id IS NULL)
    OR r.rating < 1
    OR r.rating > 5
 ORDER BY r.created_date DESC;

-- 16. Categorias referenciadas por imoveis mas ausentes
SELECT '16_categories_ausentes' AS check_name,
       p.category AS category_slug, COUNT(*) AS total_properties
  FROM properties p
  LEFT JOIN property_categories c ON c.slug = p.category
 WHERE p.category IS NOT NULL
   AND c.slug IS NULL
 GROUP BY p.category
 ORDER BY total_properties DESC;
