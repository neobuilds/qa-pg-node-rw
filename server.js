// QA fixture: reads and writes one row in the PostgreSQL database named by the env.
require('dotenv').config({ path: __dirname + '/.env' });
const http = require('http');
const { Client } = require('pg');

function cfg(database) {
  return {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: database || process.env.DB_DATABASE,
  };
}

async function rw(tag) {
  const c = new Client(cfg());
  await c.connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS qa_rows (id serial PRIMARY KEY, tag text NOT NULL, at timestamptz DEFAULT now())');
    if (tag) await c.query('INSERT INTO qa_rows (tag) VALUES ($1)', [tag]);
    const who = await c.query('SELECT current_database() AS db, current_user AS usr, inet_server_port() AS port');
    const rows = await c.query('SELECT id, tag FROM qa_rows ORDER BY id');
    return { ok: true, ...who.rows[0], rows: rows.rows };
  } finally { await c.end(); }
}

async function cross(db) {
  const c = new Client(cfg(db));
  try { await c.connect(); await c.query('SELECT 1'); await c.end(); return { ok: true, reached: db }; }
  catch (e) { return { ok: false, refused: db, code: e.code || null, message: String(e.message).slice(0, 120) }; }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let out;
  try {
    if (u.pathname === '/pgrw') out = await rw(u.searchParams.get('tag'));
    else if (u.pathname === '/pgcross') out = await cross(u.searchParams.get('db'));
    else out = { ok: true, app: 'qa-pg-node-rw', env_connection: process.env.DB_CONNECTION || null };
    res.writeHead(200, { 'content-type': 'application/json' });
  } catch (e) {
    out = { ok: false, error: e.code || 'error', message: String(e.message).slice(0, 120) };
    res.writeHead(500, { 'content-type': 'application/json' });
  }
  res.end(JSON.stringify(out));
}).listen(Number(process.env.PORT || 3000), () => console.log('listening'));
