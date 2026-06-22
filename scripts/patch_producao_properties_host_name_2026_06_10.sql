-- Patch seguro - preencher host_name/host_email em imoveis cujo created_by ja aponta para host real.
-- Este script nao altera donos, roles, reservas ou pagamentos.
-- Execute no Neon apos revisar o SELECT de pre-visualizacao.

-- Pre-visualizacao do que sera alterado
SELECT p.id,
       p.title,
       p.host_name AS host_name_atual,
       owner.full_name AS host_name_novo,
       p.host_email AS host_email_atual,
       owner.email AS host_email_novo
  FROM properties p
  JOIN users owner ON owner.id = p.created_by
 WHERE owner.role = 'host'
   AND (
     p.host_name IS NULL
     OR p.host_name = ''
     OR p.host_email IS NULL
     OR p.host_email = ''
   )
 ORDER BY p.created_date DESC;

-- Correcao segura
UPDATE properties p
   SET host_name = COALESCE(NULLIF(p.host_name, ''), owner.full_name),
       host_email = COALESCE(NULLIF(p.host_email, ''), owner.email),
       updated_date = NOW()
  FROM users owner
 WHERE owner.id = p.created_by
   AND owner.role = 'host'
   AND (
     p.host_name IS NULL
     OR p.host_name = ''
     OR p.host_email IS NULL
     OR p.host_email = ''
   );

-- Validacao pos-correcao do bloco afetado
SELECT p.id,
       p.title,
       p.host_name,
       p.host_email,
       owner.full_name AS owner_name,
       owner.email AS owner_email,
       owner.role AS owner_role
  FROM properties p
  JOIN users owner ON owner.id = p.created_by
 WHERE owner.role = 'host'
 ORDER BY p.created_date DESC;
