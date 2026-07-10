// Normalisierte Tabellen ↔ Frontend-Slices für das Finanz-Cockpit.
// _-Präfix → kein Vercel-Endpoint.
import { db } from './_db.js';

const cell = (x) => (x === undefined ? null : x);
const safeJson = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

// Liest den vollständigen State eines Nutzers in exakt den Slice-Formen, die das Frontend erwartet.
export async function readSlices(userId) {
  const q = (sql) => db().execute({ sql, args: [userId] });
  const [items, cats, positions, accounts, goals, history, years, settings] = await Promise.all([
    q('SELECT id,name,amount,type,cat,interval,ref,start,end,once,date,merchant FROM items WHERE user_id=?'),
    q('SELECT name,icon FROM categories WHERE user_id=?'),
    q('SELECT id,name,kind,value,rate,ret FROM positions WHERE user_id=?'),
    q('SELECT id,name,kind,balance FROM accounts WHERE user_id=?'),
    q('SELECT id,name,icon,target,saved,rate FROM goals WHERE user_id=?'),
    q('SELECT month,inc,exp,saldo,depot,liquid,by_cat_json FROM history WHERE user_id=?'),
    q('SELECT year,data_json FROM years WHERE user_id=?'),
    q('SELECT data_json FROM settings WHERE user_id=?')
  ]);
  return {
    items: items.rows.map(r => ({
      id: Number(r.id), name: r.name, amount: r.amount, type: r.type, cat: r.cat,
      interval: r.interval === 'w' ? 'w' : Number(r.interval),
      ref: r.ref == null ? 0 : Number(r.ref),
      start: r.start ?? null, end: r.end ?? null, once: r.once ?? null,
      date: r.date ?? null, merchant: r.merchant ?? ''
    })),
    cats: cats.rows.map(r => ({ n: r.name, i: r.icon })),
    positions: positions.rows.map(r => ({ id: Number(r.id), name: r.name, kind: r.kind, value: r.value, rate: r.rate, ret: r.ret })),
    accounts: accounts.rows.map(r => ({ id: Number(r.id), name: r.name, kind: r.kind, balance: r.balance })),
    goals: goals.rows.map(r => ({ id: Number(r.id), name: r.name, icon: r.icon, target: r.target, saved: r.saved, rate: r.rate })),
    history: history.rows.map(r => ({ month: r.month, inc: r.inc, exp: r.exp, saldo: r.saldo, depot: r.depot, liquid: r.liquid, byCat: safeJson(r.by_cat_json, {}) })),
    years: years.rows.map(r => safeJson(r.data_json, {})),
    settings: settings.rows.length ? safeJson(settings.rows[0].data_json, {}) : {}
  };
}

// Ersetzt pro übergebenem Slice den Bestand des Nutzers (Delete + Insert), atomar in einem Batch.
// extraStmts werden mit in denselben Batch aufgenommen (z.B. Versions-Bump).
export async function writeSlices(userId, slices, extraStmts = []) {
  const stmts = [];
  const del = (table) => stmts.push({ sql: `DELETE FROM ${table} WHERE user_id=?`, args: [userId] });

  if (slices.items !== undefined) {
    del('items');
    for (const it of slices.items || []) stmts.push({
      sql: 'INSERT INTO items (user_id,id,name,amount,type,cat,interval,ref,start,end,once,date,merchant) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [userId, cell(it.id), cell(it.name), cell(it.amount), cell(it.type), cell(it.cat), String(it.interval), cell(it.ref), cell(it.start), cell(it.end), cell(it.once), cell(it.date), cell(it.merchant ?? '')]
    });
  }
  if (slices.cats !== undefined) {
    del('categories');
    for (const c of slices.cats || []) stmts.push({
      sql: 'INSERT INTO categories (user_id,name,icon) VALUES (?,?,?)', args: [userId, cell(c.n), cell(c.i)]
    });
  }
  if (slices.positions !== undefined) {
    del('positions');
    for (const p of slices.positions || []) stmts.push({
      sql: 'INSERT INTO positions (user_id,id,name,kind,value,rate,ret) VALUES (?,?,?,?,?,?,?)',
      args: [userId, cell(p.id), cell(p.name), cell(p.kind), cell(p.value), cell(p.rate), cell(p.ret)]
    });
  }
  if (slices.accounts !== undefined) {
    del('accounts');
    for (const a of slices.accounts || []) stmts.push({
      sql: 'INSERT INTO accounts (user_id,id,name,kind,balance) VALUES (?,?,?,?,?)',
      args: [userId, cell(a.id), cell(a.name), cell(a.kind), cell(a.balance)]
    });
  }
  if (slices.goals !== undefined) {
    del('goals');
    for (const g of slices.goals || []) stmts.push({
      sql: 'INSERT INTO goals (user_id,id,name,icon,target,saved,rate) VALUES (?,?,?,?,?,?,?)',
      args: [userId, cell(g.id), cell(g.name), cell(g.icon), cell(g.target), cell(g.saved), cell(g.rate)]
    });
  }
  if (slices.history !== undefined) {
    del('history');
    for (const h of slices.history || []) stmts.push({
      sql: 'INSERT INTO history (user_id,month,inc,exp,saldo,depot,liquid,by_cat_json) VALUES (?,?,?,?,?,?,?,?)',
      args: [userId, cell(h.month), cell(h.inc), cell(h.exp), cell(h.saldo), cell(h.depot), cell(h.liquid), JSON.stringify(h.byCat || {})]
    });
  }
  if (slices.years !== undefined) {
    del('years');
    for (const y of slices.years || []) stmts.push({
      sql: 'INSERT INTO years (user_id,year,data_json) VALUES (?,?,?)', args: [userId, cell(y.year), JSON.stringify(y)]
    });
  }
  if (slices.settings !== undefined) {
    stmts.push({ sql: 'DELETE FROM settings WHERE user_id=?', args: [userId] });
    stmts.push({ sql: 'INSERT INTO settings (user_id,data_json) VALUES (?,?)', args: [userId, JSON.stringify(slices.settings || {})] });
  }

  for (const s of extraStmts) stmts.push(s);
  if (stmts.length) await db().batch(stmts, 'write');
}
