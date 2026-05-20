import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

/**
 * Configuração do Pool PostgreSQL
 * 
 * Suporta dois modos de configuração:
 * 1. DATABASE_URL (usado por Neon, Supabase, Railway, Heroku)
 * 2. Variáveis individuais (DB_HOST, DB_PORT, etc.)
 * 
 * Em produção, DATABASE_URL é preferido pois já inclui SSL.
 */

let poolConfig;

if (process.env.DATABASE_URL) {
  // Modo DATABASE_URL (produção com Neon/Supabase/Railway)
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' 
      ? { rejectUnauthorized: false } 
      : false,
    // Pool settings para produção
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
  console.log('📦 PostgreSQL: usando DATABASE_URL');
} else {
  // Modo variáveis individuais (desenvolvimento local)
  poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // Pool settings para desenvolvimento
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  console.log(`📦 PostgreSQL: conectando em ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
}

export const pool = new Pool(poolConfig);

// Handler de erros do pool
pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool PostgreSQL:', err.message);
  // Em produção, não crashar o servidor por erro de conexão
  if (process.env.NODE_ENV !== 'production') {
    process.exit(-1);
  }
});

// Função para testar conexão
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now');
    client.release();
    console.log('✅ PostgreSQL conectado:', result.rows[0].now);
    return true;
  } catch (err) {
    console.error('❌ Falha ao conectar no PostgreSQL:', err.message);
    return false;
  }
}
