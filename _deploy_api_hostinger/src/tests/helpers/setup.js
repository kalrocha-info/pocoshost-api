import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

export const testPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function seedCategories() {
  await testPool.query(`
    INSERT INTO property_categories (slug, name, description)
    VALUES
      ('chale', 'Chalé', 'Chalés e cabanas'),
      ('pousada', 'Pousada', 'Pousadas'),
      ('casa', 'Casa', 'Casas'),
      ('apartamento', 'Apartamento', 'Apartamentos'),
      ('sitio', 'Sítio', 'Sítios'),
      ('hotel', 'Hotel', 'Hotéis')
    ON CONFLICT (slug) DO NOTHING
  `);
}

// Criar tabelas na DB de teste antes de todos os testes
beforeAll(async () => {
  const sql = readFileSync(
    path.join(__dirname, '../../db/migrations/001_create_tables.sql'), 'utf8'
  );
  await testPool.query(sql);
  await seedCategories();
});

// Limpar todas as tabelas entre cada ficheiro de teste (ordem respeita FK)
afterEach(async () => {
  await testPool.query(`
    TRUNCATE TABLE reviews, payments, favorites, reservations, properties, users, property_categories
    RESTART IDENTITY CASCADE
  `);
  await seedCategories();
});

// Fechar pool após todos os testes
afterAll(async () => {
  await testPool.end();
});
