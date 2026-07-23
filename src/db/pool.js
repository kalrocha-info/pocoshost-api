import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

/**
 * Configuração do Pool PostgreSQL (Singleton Pattern)
 *
 * Inicializa o pool uma única vez e reutiliza em toda a aplicação.
 * Isso evita múltiplas conexões em ambientes compartilhados (ex: Hostinger).
 *
 * Suporta dois modos de configuração:
 * 1. DATABASE_URL (usado por Neon, Supabase, Railway, Heroku)
 * 2. Variáveis individuais (DB_HOST, DB_PORT, etc.)
 *
 * Em produção, DATABASE_URL é preferido pois já inclui SSL.
 */

function createPoolConfig () {
  if (process.env.DATABASE_URL) {
    // Modo DATABASE_URL (produção com Neon/Supabase/Railway)
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      // Pool settings para produção
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    }
  }
  // Modo variáveis individuais (desenvolvimento local)
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // Pool settings para desenvolvimento
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  }
}

// Singleton: usar globalThis para garantir uma única instância entre módulos
const POOL_SINGLETON_KEY = '__pocoshost_pg_pool__'
export const pool = globalThis[POOL_SINGLETON_KEY] ??= new Pool(createPoolConfig())

// Registrar handler de erro uma única vez
if (!globalThis.__pocoshost_pg_pool_error_handler_registered) {
  pool.on('error', (err) => {
    console.error('❌ Erro inesperado no pool PostgreSQL:', err.message)
    // Em produção, não crashar o servidor por erro de conexão
    if (process.env.NODE_ENV !== 'production') {
      process.exit(-1)
    }
  })
  globalThis.__pocoshost_pg_pool_error_handler_registered = true
}

// Log de inicialização
if (process.env.DATABASE_URL) {
  console.log('📦 PostgreSQL: usando DATABASE_URL')
} else {
  console.log(`📦 PostgreSQL: conectando em ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`)
}

// Função para testar conexão
export async function testConnection () {
  try {
    const client = await pool.connect()
    const result = await client.query('SELECT NOW() as now')
    client.release()
    console.log('✅ PostgreSQL conectado:', result.rows[0].now)
    return true
  } catch (err) {
    console.error('❌ Falha ao conectar no PostgreSQL:', err.message)
    return false
  }
}
