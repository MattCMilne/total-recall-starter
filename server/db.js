import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. See docs/ENV.md.');
  process.exit(1);
}

// Railway's internal Postgres URL needs no TLS. Public proxy URLs do.
const needsTls = !/localhost|127\.0\.0\.1|\.railway\.internal/.test(url) && process.env.DATABASE_SSL !== 'off';
// The app keeps its tables in its own Postgres schema, so it can share a database with your
// memory library (from earlier lessons) without any table name clashing.
const SCHEMA = (process.env.DATABASE_SCHEMA || 'tr_app').replace(/[^a-z0-9_]/gi, '') || 'tr_app';
export const pool = new pg.Pool({
  connectionString: url,
  ssl: needsTls ? { rejectUnauthorized: false } : undefined,
  max: 10,
  options: `-c search_path=${SCHEMA},public`,
});

export const q = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
export const many = async (text, params) => (await pool.query(text, params)).rows;

export async function migrate() {
  const sql = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
  await pool.query(`SET search_path TO "${SCHEMA}", public`);
  await pool.query(sql);
}

export async function audit(userId, action, target = '') {
  await q('INSERT INTO audit_log (user_id, action, target) VALUES ($1, $2, $3)', [userId, action, String(target).slice(0, 300)]);
}
