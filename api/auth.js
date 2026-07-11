// Auth-Endpoint für Finanz-Cockpit-Accounts.
// POST /api/auth  Body { action: 'register'|'login'|'logout'|'me', username, password }
import { db, ensureSchema, hashPassword, verifyPassword, newToken, userIdFromRequest, readBody, getSetting, logAudit } from './_db.js';
import { writeSlices } from './_finance.js';

const SESSION_TTL = 1000 * 60 * 60 * 24 * 90; // 90 Tage

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  try {
    await ensureSchema();
    const body = await readBody(req);
    switch (body.action) {
      case 'register': return await register(body, res);
      case 'login':    return await login(body, res);
      case 'logout':   return await logout(req, res);
      case 'me':       return await me(req, res);
      default:         res.status(400).json({ error: 'unknown action' });
    }
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}

async function createSession(userId) {
  const token = newToken();
  const now = Date.now();
  await db().execute({ sql: 'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)',
    args: [token, userId, now, now + SESSION_TTL] });
  return token;
}

async function register(body, res) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (username.length < 3) { res.status(400).json({ error: 'Benutzername zu kurz (min. 3 Zeichen).' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'Passwort zu kurz (min. 6 Zeichen).' }); return; }

  // Registrierung global abschaltbar (admin). "admin" darf immer entstehen (Seed).
  if (username !== 'admin' && (await getSetting('registration_enabled', '1')) !== '1') {
    res.status(403).json({ error: 'Registrierung derzeit deaktiviert.' }); return;
  }

  const exists = await db().execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] });
  if (exists.rows.length) { res.status(409).json({ error: 'Benutzername bereits vergeben.' }); return; }

  const ins = await db().execute({ sql: 'INSERT INTO users (username, pw_hash, data_version, created_at) VALUES (?,?,0,?)',
    args: [username, hashPassword(password), Date.now()] });
  const userId = Number(ins.lastInsertRowid);

  const migrated = await claimLegacyIfFirst(userId);
  const token = await createSession(userId);
  await touchLogin(userId);
  const seed = (await getSetting('seed_new_users', '1')) === '1';
  await logAudit(username, 'register', username, '');
  res.status(200).json({ token, username, migrated, seed });
}

async function login(body, res) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const rs = await db().execute({ sql: 'SELECT id, pw_hash, blocked FROM users WHERE username = ?', args: [username] });
  const ok = !!(rs.rows.length && verifyPassword(password, rs.rows[0].pw_hash));
  await logAttempt(username, ok ? 1 : 0);
  if (!ok) { res.status(401).json({ error: 'Benutzername oder Passwort falsch.' }); return; }
  if (Number(rs.rows[0].blocked)) { res.status(403).json({ error: 'Konto gesperrt.' }); return; }
  const userId = Number(rs.rows[0].id);
  const token = await createSession(userId);
  await touchLogin(userId);
  res.status(200).json({ token, username });
}

async function touchLogin(userId) {
  try { await db().execute({ sql: 'UPDATE users SET last_login = ? WHERE id = ?', args: [Date.now(), userId] }); } catch (e) {}
}
async function logAttempt(username, ok) {
  try { await db().execute({ sql: 'INSERT INTO login_attempts (ts, username, ok, ip) VALUES (?,?,?,?)',
    args: [Date.now(), username, ok, ''] }); } catch (e) {}
}

async function logout(req, res) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-session-token'] || '');
  if (token) await db().execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
  res.status(200).json({ ok: true });
}

async function me(req, res) {
  const userId = await userIdFromRequest(req);
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }
  const rs = await db().execute({ sql: 'SELECT username FROM users WHERE id = ?', args: [userId] });
  res.status(200).json({ username: rs.rows.length ? rs.rows[0].username : null });
}

// Bestandsdaten (geteilter kv-Blob aus der Zeit vor den Accounts) einmalig dem
// ersten registrierten Nutzer zuordnen.
async function claimLegacyIfFirst(userId) {
  const claimed = await db().execute({ sql: "SELECT v FROM meta WHERE k = 'legacy_claimed'", args: [] });
  if (claimed.rows.length) return false;
  let legacy = {};
  try {
    const rs = await db().execute("SELECT k, v FROM kv");
    for (const row of rs.rows) { try { legacy[row.k] = JSON.parse(row.v); } catch {} }
  } catch { /* kv existiert nicht → keine Legacy-Daten */ }

  const hasData = ['items','cats','positions','accounts','goals','history','years','settings']
    .some(k => legacy[k] !== undefined);
  // Immer beanspruchen (auch wenn leer), damit spätere Nutzer nicht erneut importieren.
  await db().execute({ sql: "INSERT INTO meta (k, v) VALUES ('legacy_claimed', ?)", args: [String(userId)] });
  if (!hasData) return false;

  await writeSlices(userId, legacy);
  return true;
}
