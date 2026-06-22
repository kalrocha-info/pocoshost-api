import { pool } from './pool.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const sql = readFileSync(path.join(__dirname, 'migrations/001_create_tables.sql'), 'utf8');
  await pool.query(sql);
}

async function migrateFromCli() {
  try {
    await runMigrations();
    console.log('Migrations executadas com sucesso.');
  } catch (err) {
    console.error('Erro nas migrations:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateFromCli();
}
