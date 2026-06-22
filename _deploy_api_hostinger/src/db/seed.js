import { pool } from './pool.js';
import bcrypt from 'bcryptjs';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Usuário demo admin
    const passwordHash = await bcrypt.hash('demo1234', 10);
    const userRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, email_verified = TRUE, email_verified_at = COALESCE(users.email_verified_at, NOW())
       RETURNING id, email`,
      ['Carlos Alberto', 'admin@pocoshost.test', passwordHash, 'admin']
    );
    const adminId = userRes.rows[0].id;

    // Utilizadores E2E (Playwright smoke.spec.js)
    const guestHash = await bcrypt.hash('123456', 10);
    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at)
       VALUES ($1, $2, $3, 'guest', TRUE, NOW())
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, email_verified = TRUE, email_verified_at = COALESCE(users.email_verified_at, NOW())`,
      ['Hóspede Demo', 'guest@pocoshost.test', guestHash]
    );
    const hostHash = await bcrypt.hash('123456', 10);
    const hostRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, document_type, document_number, email_verified, email_verified_at)
       VALUES ($1, $2, $3, 'host', 'cpf', '00000000000', TRUE, NOW())
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, email_verified = TRUE, email_verified_at = COALESCE(users.email_verified_at, NOW())
       RETURNING id`,
      ['Anfitrião Demo', 'host@pocoshost.test', hostHash]
    );
    const hostId = hostRes.rows[0]?.id ?? adminId;

    // Categorias base
    const categories = [
      { slug: 'chale', name: 'Chalé' },
      { slug: 'pousada', name: 'Pousada' },
      { slug: 'casa', name: 'Casa' },
      { slug: 'apartamento', name: 'Apartamento' },
      { slug: 'sitio', name: 'Sítio' },
      { slug: 'hotel', name: 'Hotel' },
      { slug: 'quarto', name: 'Quarto Privativo' },
      { slug: 'chacara', name: 'Chácara' },
      { slug: 'piscina', name: 'Área com Piscina' }
    ];
    for (const c of categories) {
      await client.query(
        'INSERT INTO property_categories (slug, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [c.slug, c.name]
      );
    }

    // Imóveis de demonstração
    const properties = [
      {
        title: 'Pousada Vista da Serra',
        city: 'Poços de Caldas', state: 'MG',
        address: 'Serra de São Domingos, Poços de Caldas',
        category: 'pousada', tags: ['wifi','piscina','familia'],
        price_per_night: 320, rating: 4.9, review_count: 34,
        max_guests: 4, bedrooms: 2, bathrooms: 1,
        host_name: 'Marina', host_email: 'admin@pocoshost.test',
        cover_photo: 'https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=900&q=80',
        photos: ['https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=1200&q=80','https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80','https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80'],
        description: 'Hospedagem aconchegante com vista para a serra, café da manhã regional e fácil acesso aos principais pontos turísticos.',
        rules: 'Check-in a partir das 14h. Não são permitidas festas.',
        latitude: -21.7878, longitude: -46.5614,
      },
      {
        title: 'Chalé Romântico da Mantiqueira',
        city: 'Andradas', state: 'MG',
        category: 'chale', tags: ['wifi','rural','churrasco','pet_friendly'],
        price_per_night: 450, rating: 4.8, review_count: 21,
        max_guests: 2, bedrooms: 1, bathrooms: 1,
        host_name: 'Rafael', host_email: 'admin@pocoshost.test',
        cover_photo: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=900&q=80',
        photos: ['https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=1200&q=80','https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?w=1200&q=80'],
        description: 'Chalé reservado para casais, cercado por natureza e céu estrelado.',
        rules: 'Aceitamos pets de pequeno porte. Silêncio após 22h.',
        latitude: null, longitude: null,
      },
      {
        title: 'Apartamento no Centro Histórico',
        city: 'Poços de Caldas', state: 'MG',
        category: 'apartamento', tags: ['wifi','economico','cozinha'],
        price_per_night: 210, rating: 4.7, review_count: 16,
        max_guests: 3, bedrooms: 1, bathrooms: 1,
        host_name: 'Clara', host_email: 'admin@pocoshost.test',
        cover_photo: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&q=80',
        photos: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80','https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80'],
        description: 'Apartamento prático, iluminado e perto de cafés, parques e comércio local.',
        rules: null, latitude: null, longitude: null,
      },
      {
        title: 'Casa com Piscina e Área Gourmet',
        city: 'Caldas', state: 'MG',
        category: 'casa', tags: ['piscina','churrasco','familia'],
        price_per_night: 590, rating: 4.9, review_count: 42,
        max_guests: 8, bedrooms: 3, bathrooms: 2,
        host_name: 'Paulo', host_email: 'admin@pocoshost.test',
        cover_photo: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80',
        photos: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80','https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80'],
        description: 'Casa espaçosa para famílias, com piscina privativa e área gourmet completa.',
        rules: null, latitude: null, longitude: null,
      },
    ];

    let firstPropertyId = null;
    for (const p of properties) {
      const res = await client.query(
        `INSERT INTO properties
           (title, description, city, state, address, latitude, longitude, category, tags,
            price_per_night, max_guests, bedrooms, bathrooms, photos, cover_photo, rules,
            rating, review_count, host_name, host_email, is_active, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,true,$21)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [p.title, p.description, p.city, p.state, p.address ?? null,
         p.latitude, p.longitude, p.category, p.tags,
         p.price_per_night, p.max_guests, p.bedrooms, p.bathrooms,
         p.photos, p.cover_photo, p.rules,
         p.rating, p.review_count, p.host_name, p.host_email, adminId]
      );
      if (!firstPropertyId && res.rows[0]) firstPropertyId = res.rows[0].id;
    }

    // Review de demonstração
    if (firstPropertyId) {
      await client.query(
        `INSERT INTO reviews (property_id, user_id, user_email, guest_name, rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [firstPropertyId, adminId, 'admin@pocoshost.test', 'Ana', 5, 'Lugar lindo, limpo e muito acolhedor. A vista é especial.']
      );
    }

    await client.query('COMMIT');
    console.log('✅ Seed executado com sucesso.');
    console.log('   Admin: admin@pocoshost.test / demo1234');
    console.log('   Hóspede (E2E): guest@pocoshost.test / 123456');
    console.log('   Anfitrião (E2E): host@pocoshost.test / 123456');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro no seed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
