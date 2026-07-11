// Admin-Endpoint. Nur User "admin" darf zugreifen.
// GET  /api/admin              -> Userliste + Zeilen-Counts pro Tabelle
// POST /api/admin {action:'delete-user', userId} -> User + alle Daten löschen
import { db, ensureSchema, userIdFromRequest, isAdmin, readBody } from './_db.js';

const DATA_TABLES = ['items', 'categories', 'positions', 'accounts', 'goals', 'history', 'years', 'settings'];

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const userId = await userIdFromRequest(req);
    if (!userId || !(await isAdmin(userId))) { res.status(403).json({ error: 'forbidden' }); return; }

    if (req.method === 'GET') {
      const users = await db().execute('SELECT id, username, created_at, data_version FROM users ORDER BY id');
      const out = [];
      for (const u of users.rows) {
        const counts = {};
        for (const t of DATA_TABLES) {
          const c = await db().execute({ sql: `SELECT COUNT(*) as n FROM ${t} WHERE user_id=?`, args: [u.id] });
          counts[t] = Number(c.rows[0].n);
        }
        out.push({ id: Number(u.id), username: u.username, createdAt: Number(u.created_at) || null, version: Number(u.data_version), counts });
      }
      res.status(200).json({ users: out });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.action === 'delete-user') {
        const targetId = Number(body.userId);
        if (!targetId) { res.status(400).json({ error: 'userId fehlt' }); return; }
        if (targetId === userId) { res.status(400).json({ error: 'Eigenes Konto kann hier nicht gelöscht werden.' }); return; }
        const stmts = [
          ...DATA_TABLES.map(t => ({ sql: `DELETE FROM ${t} WHERE user_id=?`, args: [targetId] })),
          { sql: 'DELETE FROM sessions WHERE user_id=?', args: [targetId] },
          { sql: 'DELETE FROM users WHERE id=?', args: [targetId] }
        ];
        await db().batch(stmts, 'write');
        res.status(200).json({ ok: true });
        return;
      }
      res.status(400).json({ error: 'unknown action' });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}
