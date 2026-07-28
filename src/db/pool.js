import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

function createPoolConfig () {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    }
  }
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  }
}

const POOL_SINGLETON_KEY = 'pocoshost_pg_pool'
export const pool = globalThis[POOL_SINGLETON_KEY] ??= new pg.Pool(createPoolConfig())

if (!globalThis.__pocoshost_pg_pool_error_handler_registered) {
  globalThis[POOL_SINGLETON_KEY].on('error', (err) => {
    console.error('❌ Erro inesperado no pool PostgreSQL:', err.message)
    if (process.env.NODE_ENV !== 'production') {
      process.exit(-1)
    }
  })
  globalThis.__pocoshost_pg_pool_error_handler_registered = true
}

if (process.env.DATABASE_URL) {
  console.log('📦 PostgreSQL: usando DATABASE_URL')
} else {
  console.log(`📦 PostgreSQL: conectando em ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`)
}

export async function testConnection () {
  try {
    const client = await globalThis[POOL_SINGLETON_KEY].connect()
    const result = await client.query('SELECT NOW() as now')
    client.release()
    console.log('✅ PostgreSQL conectado:', result.rows[0].now)
    return true
  } catch (err) {
    console.error('❌ Falha ao conectar no PostgreSQL:', err.message)
    return false
  }
}
