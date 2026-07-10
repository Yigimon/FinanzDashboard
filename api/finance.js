// Finanz-Daten-Endpoint (pro Nutzer, normalisiert). Auth via Bearer-Session-Token.
// GET  /api/finance  → { ...slices, version }
// POST /api/finance  Body { baseVersion, ...slices } → { ok, version } | 409 { conflict, ...slices, version }
import { db, ensureSchema, userIdFromRequest, readBody } from './_db.js';
import { readSlices, writeSlices } from './_finance.js';

const SLICES = ['items', 'cats', 'positions', 'accounts', 'goals', 'history', 'years', 'settings'];

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const userId = await userIdFromRequest(req);
    if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

    if (req.method === 'GET') {
      const state = await readSlices(userId);
      state.version = await getVersion(userId);
      res.status(200).json(state);
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const current = await getVersion(userId);
      // Optimistische Nebenläufigkeit: hat jemand anderes seit dem letzten Pull geschrieben?
      if (body.baseVersion !== undefined && Number(body.baseVersion) !== current) {
        const state = await readSlices(userId);
        state.version = current;
        state.conflict = true;
        res.status(409).json(state);
        return;
      }
      const slices = {};
      for (const k of SLICES) if (body[k] !== undefined) slices[k] = body[k];
      const next = current + 1;
      await writeSlices(userId, slices, [
        { sql: 'UPDATE users SET data_version=? WHERE id=?', args: [next, userId] }
      ]);
      res.status(200).json({ ok: true, version: next });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}

async function getVersion(userId) {
  const rs = await db().execute({ sql: 'SELECT data_version FROM users WHERE id=?', args: [userId] });
  return rs.rows.length ? Number(rs.rows[0].data_version) : 0;
}
