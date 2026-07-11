// Gemeinsames DB-/Auth-Modul für die Finanz-Cockpit-Accounts (Turso / libSQL).
// Dateiname mit '_' → Vercel behandelt es NICHT als Endpoint.
import { createClient } from '@libsql/client';
import crypto from 'node:crypto';

let _db = null;
export function db() {
  if (_db) return _db;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL fehlt');
  _db = createClient({ url, authToken });
  return _db;
}

let schemaReady = null;
export function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL, data_version INTEGER NOT NULL DEFAULT 0, created_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER, expires_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS items (user_id INTEGER, id INTEGER, name TEXT, amount REAL, type TEXT, cat TEXT, interval TEXT, ref INTEGER, start TEXT, end TEXT, once TEXT, date TEXT, merchant TEXT, PRIMARY KEY(user_id,id))`,
      `CREATE TABLE IF NOT EXISTS categories (user_id INTEGER, name TEXT, icon TEXT, PRIMARY KEY(user_id,name))`,
      `CREATE TABLE IF NOT EXISTS positions (user_id INTEGER, id INTEGER, name TEXT, kind TEXT, value REAL, rate REAL, ret REAL, PRIMARY KEY(user_id,id))`,
      `CREATE TABLE IF NOT EXISTS accounts (user_id INTEGER, id INTEGER, name TEXT, kind TEXT, balance REAL, PRIMARY KEY(user_id,id))`,
      `CREATE TABLE IF NOT EXISTS goals (user_id INTEGER, id INTEGER, name TEXT, icon TEXT, target REAL, saved REAL, rate REAL, PRIMARY KEY(user_id,id))`,
      `CREATE TABLE IF NOT EXISTS history (user_id INTEGER, month TEXT, inc REAL, exp REAL, saldo REAL, depot REAL, liquid REAL, by_cat_json TEXT, PRIMARY KEY(user_id,month))`,
      `CREATE TABLE IF NOT EXISTS years (user_id INTEGER, year TEXT, data_json TEXT, PRIMARY KEY(user_id,year))`,
      `CREATE TABLE IF NOT EXISTS settings (user_id INTEGER PRIMARY KEY, data_json TEXT)`,
      `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
      `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, actor TEXT, action TEXT, target TEXT, detail TEXT)`,
      `CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, username TEXT, ok INTEGER, ip TEXT)`
    ];
    for (const s of ddl) await db().execute(s);
    // Nachträgliche Spalten für bestehende (bereits deployte) users-Tabelle — Fehler ignorieren wenn schon da.
    await tryExec('ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0');
    await tryExec('ALTER TABLE users ADD COLUMN last_login INTEGER');
    await db().execute("INSERT OR IGNORE INTO meta (k, v) VALUES ('registration_enabled', '1')");
    await db().execute("INSERT OR IGNORE INTO meta (k, v) VALUES ('seed_new_users', '1')");
    await seedAdmin();
  })();
  return schemaReady;
}

async function tryExec(sql) { try { await db().execute(sql); } catch (e) { /* Spalte existiert bereits */ } }

export async function getSetting(key, fallback) {
  const rs = await db().execute({ sql: 'SELECT v FROM meta WHERE k = ?', args: [key] });
  return rs.rows.length ? rs.rows[0].v : fallback;
}
export async function setSetting(key, value) {
  await db().execute({ sql: "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", args: [key, String(value)] });
}
export async function logAudit(actor, action, target, detail) {
  try { await db().execute({ sql: 'INSERT INTO audit (ts, actor, action, target, detail) VALUES (?,?,?,?,?)',
    args: [Date.now(), actor || '', action || '', target || '', detail || ''] }); } catch (e) {}
}

async function seedAdmin() {
  const rs = await db().execute({ sql: 'SELECT id FROM users WHERE username = ?', args: ['admin'] });
  if (rs.rows.length) return;
  await db().execute({ sql: 'INSERT INTO users (username, pw_hash, data_version, created_at) VALUES (?,?,0,?)',
    args: ['admin', hashPassword('admin'), Date.now()] });
}

// Adminrechte sind an den festen Benutzernamen "admin" gebunden (kein Rollen-Feld nötig).
export async function isAdmin(userId) {
  if (!userId) return false;
  const rs = await db().execute({ sql: 'SELECT username FROM users WHERE id = ?', args: [userId] });
  return rs.rows.length > 0 && rs.rows[0].username === 'admin';
}

// ---------- Passwort-Hashing (scrypt + Salt, timing-safe) ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + '$' + hash;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function newToken() { return crypto.randomBytes(32).toString('hex'); }

// ---------- Session-Auflösung ----------
export async function userIdFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-session-token'] || '');
  if (!token) return null;
  const rs = await db().execute({ sql: 'SELECT user_id, expires_at FROM sessions WHERE token = ?', args: [token] });
  if (!rs.rows.length) return null;
  const row = rs.rows[0];
  if (row.expires_at && Number(row.expires_at) < Date.now()) return null;
  return Number(row.user_id);
}

// ---------- Body-Parsing (Vercel parst JSON oft schon; Fallback für Streams) ----------
export function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (typeof req.body === 'string') { try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); } }
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
