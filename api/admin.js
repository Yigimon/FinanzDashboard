// Admin-Endpoint. Nur User "admin".
import { db, ensureSchema, userIdFromRequest, isAdmin, readBody, newToken, hashPassword, getSetting, setSetting, logAudit } from './_db.js';

const DATA_TABLES = ['items', 'categories', 'positions', 'accounts', 'goals', 'history', 'years', 'settings'];
const ALL_TABLES  = ['users', 'sessions', 'items', 'categories', 'positions', 'accounts', 'goals', 'history', 'years', 'settings', 'meta', 'audit', 'login_attempts'];
const SESSION_TTL = 1000 * 60 * 60 * 24 * 90;

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const adminId = await userIdFromRequest(req);
    if (!adminId || !(await isAdmin(adminId))) { res.status(403).json({ error: 'forbidden' }); return; }

    if (req.method === 'GET') { res.status(200).json(await overview()); return; }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const out = await action(adminId, body);
      res.status(out.status || 200).json(out.body);
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}

async function overview() {
  const users = (await db().execute('SELECT id, username, created_at, last_login, blocked, data_version FROM users ORDER BY id')).rows;
  const out = [];
  const totals = {};
  DATA_TABLES.forEach(t => totals[t] = 0);
  for (const u of users) {
    const counts = {};
    for (const t of DATA_TABLES) {
      const c = await db().execute({ sql: `SELECT COUNT(*) n FROM ${t} WHERE user_id=?`, args: [u.id] });
      counts[t] = Number(c.rows[0].n); totals[t] += counts[t];
    }
    const s = await db().execute({ sql: 'SELECT COUNT(*) n FROM sessions WHERE user_id=?', args: [u.id] });
    out.push({ id: Number(u.id), username: u.username, createdAt: Number(u.created_at) || null,
      lastLogin: Number(u.last_login) || null, blocked: !!Number(u.blocked), version: Number(u.data_version),
      sessions: Number(s.rows[0].n), counts });
  }
  const audit = (await db().execute('SELECT ts, actor, action, target, detail FROM audit ORDER BY id DESC LIMIT 50')).rows
    .map(r => ({ ts: Number(r.ts), actor: r.actor, action: r.action, target: r.target, detail: r.detail }));
  const failed = (await db().execute('SELECT ts, username FROM login_attempts WHERE ok=0 ORDER BY id DESC LIMIT 30')).rows
    .map(r => ({ ts: Number(r.ts), username: r.username }));
  return {
    users: out,
    stats: { userCount: users.length, totals },
    settings: { registration_enabled: (await getSetting('registration_enabled', '1')) === '1',
                seed_new_users: (await getSetting('seed_new_users', '1')) === '1' },
    audit, failedLogins: failed
  };
}

async function usernameOf(id) {
  const r = await db().execute({ sql: 'SELECT username FROM users WHERE id=?', args: [id] });
  return r.rows.length ? r.rows[0].username : null;
}

async function action(adminId, body) {
  const actor = 'admin';
  const targetId = Number(body.userId);

  switch (body.action) {
    case 'delete-user': {
      if (!targetId) return err('userId fehlt');
      if (targetId === adminId) return err('Eigenes Konto nicht löschbar.');
      const name = await usernameOf(targetId);
      await db().batch([
        ...DATA_TABLES.map(t => ({ sql: `DELETE FROM ${t} WHERE user_id=?`, args: [targetId] })),
        { sql: 'DELETE FROM sessions WHERE user_id=?', args: [targetId] },
        { sql: 'DELETE FROM users WHERE id=?', args: [targetId] }
      ], 'write');
      await logAudit(actor, 'delete-user', name || String(targetId), '');
      return ok();
    }
    case 'reset-password': {
      if (!targetId) return err('userId fehlt');
      const pw = String(body.newPassword || '');
      if (pw.length < 6) return err('Passwort zu kurz (min. 6).');
      await db().execute({ sql: 'UPDATE users SET pw_hash=? WHERE id=?', args: [hashPassword(pw), targetId] });
      await logAudit(actor, 'reset-password', await usernameOf(targetId) || String(targetId), '');
      return ok();
    }
    case 'set-blocked': {
      if (!targetId) return err('userId fehlt');
      if (targetId === adminId) return err('Eigenes Konto nicht sperrbar.');
      const blocked = body.blocked ? 1 : 0;
      await db().execute({ sql: 'UPDATE users SET blocked=? WHERE id=?', args: [blocked, targetId] });
      if (blocked) await db().execute({ sql: 'DELETE FROM sessions WHERE user_id=?', args: [targetId] });
      await logAudit(actor, blocked ? 'block' : 'unblock', await usernameOf(targetId) || String(targetId), '');
      return ok();
    }
    case 'rename-user': {
      if (!targetId) return err('userId fehlt');
      const newName = String(body.newName || '').trim();
      if (newName.length < 3) return err('Name zu kurz (min. 3).');
      const clash = await db().execute({ sql: 'SELECT id FROM users WHERE username=? AND id<>?', args: [newName, targetId] });
      if (clash.rows.length) return err('Name bereits vergeben.');
      const oldName = await usernameOf(targetId);
      await db().execute({ sql: 'UPDATE users SET username=? WHERE id=?', args: [newName, targetId] });
      await logAudit(actor, 'rename', oldName + '→' + newName, '');
      return ok();
    }
    case 'kick-sessions': {
      if (!targetId) return err('userId fehlt');
      await db().execute({ sql: 'DELETE FROM sessions WHERE user_id=?', args: [targetId] });
      await logAudit(actor, 'kick-sessions', await usernameOf(targetId) || String(targetId), '');
      return ok();
    }
    case 'impersonate': {
      if (!targetId) return err('userId fehlt');
      const name = await usernameOf(targetId);
      if (!name) return err('Nutzer nicht gefunden.');
      const token = newToken();
      const now = Date.now();
      await db().execute({ sql: 'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)',
        args: [token, targetId, now, now + SESSION_TTL] });
      await logAudit(actor, 'impersonate', name, '');
      return { status: 200, body: { token, username: name } };
    }
    case 'cleanup-orphans': {
      let removed = 0;
      for (const t of DATA_TABLES) {
        const r = await db().execute(`DELETE FROM ${t} WHERE user_id NOT IN (SELECT id FROM users)`);
        removed += Number(r.rowsAffected || 0);
      }
      await db().execute('DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)');
      await logAudit(actor, 'cleanup-orphans', '', String(removed));
      return { status: 200, body: { ok: true, removed } };
    }
    case 'set-setting': {
      const key = String(body.key || '');
      if (!['registration_enabled', 'seed_new_users'].includes(key)) return err('Unbekannte Einstellung.');
      await setSetting(key, body.value ? '1' : '0');
      await logAudit(actor, 'set-setting', key, body.value ? '1' : '0');
      return ok();
    }
    case 'export-db': {
      const dump = { app: 'finanz-cockpit-admin', version: 1, exportedAt: Date.now(), tables: {} };
      for (const t of ALL_TABLES) {
        try {
          const rs = await db().execute(`SELECT * FROM ${t}`);
          // Nur benannte Spalten übernehmen (libsql-Rows sind array-artig — sonst numerische Keys).
          dump.tables[t] = rs.rows.map(r => Object.fromEntries(rs.columns.map(c => [c, r[c]])));
        } catch { dump.tables[t] = []; }
      }
      await logAudit(actor, 'export-db', '', '');
      return { status: 200, body: dump };
    }
    case 'import-db': {
      const dump = body.dump;
      if (!dump || dump.app !== 'finanz-cockpit-admin' || !dump.tables) return err('Ungültige Backup-Datei.');
      // sessions NICHT ersetzen → aktuelle Admin-Session bleibt gültig.
      const restore = ['users', 'items', 'categories', 'positions', 'accounts', 'goals', 'history', 'years', 'settings', 'meta'];
      const stmts = [];
      for (const t of restore) {
        const rows = Array.isArray(dump.tables[t]) ? dump.tables[t] : [];
        stmts.push({ sql: `DELETE FROM ${t}`, args: [] });
        for (const row of rows) {
          const cols = Object.keys(row);
          if (!cols.length) continue;
          stmts.push({ sql: `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
            args: cols.map(c => row[c] === undefined ? null : row[c]) });
        }
      }
      await db().batch(stmts, 'write');
      await logAudit(actor, 'import-db', '', '');
      return { status: 200, body: { ok: true } };
    }
    default: return err('unknown action', 400);
  }
}

function ok() { return { status: 200, body: { ok: true } }; }
function err(msg, status) { return { status: status || 400, body: { error: msg } }; }
