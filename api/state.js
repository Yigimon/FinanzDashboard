// Serverless-API für den geteilten Finanz-Cockpit-Datensatz (Turso / libSQL = gehostetes SQLite).
// GET  /api/state  → gibt alle gespeicherten Slices als Objekt zurück
// POST /api/state  → upsertet die im Body übergebenen Slices
// Auth: Header 'x-app-password' muss APP_PASSWORD entsprechen.
import { createClient } from '@libsql/client';

// Erlaubte State-Slices (entsprechen den localStorage 'fc:*' bzw. 'ft:*'-Keys im Frontend).
// Füge hier zusätzliche Keys hinzu, wenn weitere Apps (z.B. Fitness) synct werden sollen.
const KEYS = ['items', 'cats', 'positions', 'accounts', 'goals', 'history', 'years', 'settings', 'profiles', 'weightEntries'];

let _db = null;
function db() {
  if (_db) return _db;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL fehlt');
  _db = createClient({ url, authToken });
  return _db;
}

async function ensureSchema() {
  await db().execute('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER)');
}

function readBody(req) {
  // Vercel parst JSON-Bodies i.d.R. automatisch; Fallback für rohe Strings/Streams.
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); }
    }
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  // Passwort-Schutz (geteilter Zugang, kein User-Login).
  const expected = process.env.APP_PASSWORD;
  const given = req.headers['x-app-password'];
  if (!expected || given !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rs = await db().execute('SELECT k, v FROM kv');
      const out = {};
      for (const row of rs.rows) {
        try { out[row.k] = JSON.parse(row.v); } catch { /* defekte Zeile überspringen */ }
      }
      res.status(200).json(out);
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const now = Date.now();
      const stmts = [];
      for (const k of KEYS) {
        if (body[k] === undefined) continue;
        stmts.push({
          sql: 'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at',
          args: [k, JSON.stringify(body[k]), now]
        });
      }
      if (stmts.length) await db().batch(stmts, 'write');
      res.status(200).json({ ok: true, saved: stmts.length });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}
