import 'dotenv/config'
import pg from 'pg'
import { runMigrations } from '../../db/migrate.js'

const { Pool } = pg

export const testPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
})

async function seedCategories () {
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
  `)
}

// Criar tabelas na DB de teste antes de todos os testes
beforeAll(async () => {
  await runMigrations()
  await seedCategories()
})

// Limpar todas as tabelas entre cada ficheiro de teste (ordem respeita FK)
afterEach(async () => {
  await testPool.query(`
    TRUNCATE TABLE
      contract_statements,
      management_contracts,
      maintenance_order_photos,
      maintenance_orders,
      service_providers,
      reviews,
      payments,
      favorites,
      reservations,
      properties,
      users,
      property_categories
    RESTART IDENTITY CASCADE
  `)
  await seedCategories()
})

// Fechar pool após todos os testes
afterAll(async () => {
  await testPool.end()
})
