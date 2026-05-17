import pg from 'pg';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'pocoshost',
  user: 'pocoshost',
  password: 'Zoey@Maya9',
});

async function reset() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
  console.log('Schema resetado com sucesso.');
}

reset().catch(console.error);
