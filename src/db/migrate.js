import { pool } from './pool.js'
import { createHash } from 'crypto'
import { readdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, 'migrations')
const migrationLockKey = 'pocoshost_schema_migrations'

function getMigrationFiles () {
  return readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()
}

function checksum (sql) {
  return createHash('sha256').update(sql).digest('hex')
}

export async function runMigrations () {
  const client = await pool.connect()

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [migrationLockKey])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const appliedResult = await client.query(
      'SELECT name, checksum FROM schema_migrations ORDER BY name'
    )
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum.trim()]))

    for (const file of getMigrationFiles()) {
      const sql = readFileSync(path.join(migrationsDir, file), 'utf8')
      const fileChecksum = checksum(sql)
      const appliedChecksum = applied.get(file)

      if (appliedChecksum) {
        if (appliedChecksum !== fileChecksum) {
          throw new Error(`Migration aplicada foi alterada: ${file}`)
        }
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [file, fileChecksum]
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [migrationLockKey])
      .catch(() => {})
    client.release()
  }
}

async function migrateFromCli () {
  try {
    await runMigrations()
    console.log('Migrations executadas com sucesso.')
  } catch (err) {
    console.error('Erro nas migrations:', err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateFromCli()
}
