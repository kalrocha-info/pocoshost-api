import { pool } from './pool.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = readFileSync(path.join(__dirname, 'migrations/001_create_tables.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Migrations executadas com sucesso.');
  } catch (err) {
    console.error('❌ Erro nas migrations:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
