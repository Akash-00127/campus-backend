// Explicitly prepares only the isolated integration database, never application data.
require('dotenv').config();
const { Client } = require('pg');
async function main() {
  const url = new URL(process.env.TEST_DATABASE_URL || 'postgresql://campus_test@127.0.0.1:55439/campus_drop_test');
  if (url.pathname !== '/campus_drop_test') throw new Error('TEST_DATABASE_URL must use campus_drop_test.');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['campus_drop_test']);
    if (!existing.rowCount) await client.query('CREATE DATABASE campus_drop_test');
  } finally { await client.end(); }
  process.env.DATABASE_URL = url.href;
  const { dataSource } = require('../dist/database/data-source');
  await dataSource.initialize();
  try { await dataSource.runMigrations(); } finally { await dataSource.destroy(); }
  console.log('Isolated integration database is ready.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
