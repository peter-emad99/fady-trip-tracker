// Local "mock mode": the whole app runs against fake data in the browser, with no Supabase, Google
// Drive or login. Start it with `npm run dev:mock`. Only used by the dev server; production builds
// leave it out (see src/dev/setup.js).
//
// What it fakes:
//   - a signed-in admin user (tester@example.test)
//   - the Supabase tables (trips, expenses, categories, trip_budgets) and RPCs
//   - the /api/receipts and /api/organize-receipts serverless functions
// Data is kept in localStorage (key "trippy.mockDb"), so changes survive a reload.
// A small "Mock data" badge (bottom-left) can switch to offline mode and reset the data.

const DB_KEY = 'trippy.mockDb';
const OFFLINE_KEY = 'trippy.mockOffline';
const USER = { id: 'mock-user', email: 'tester@example.test', aud: 'authenticated', role: 'authenticated' };

function seedData() {
  const cats = ['Food', 'Hotel', 'Transport', 'Shopping', 'Tickets', 'Coffee'];
  const people = ['Fady', 'Peter', 'Mina', ''];
  const notes = ['Dinner at the marina', '', 'تاكسي من المطار', 'Souvenirs'];
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  return {
    trips: [
      { id: 'trip-1', name: 'Sharm El Sheikh', received_amount: 60000, start_date: day(6), end_date: day(-1), status: 'active', created_at: day(10), user_id: USER.id },
      { id: 'trip-2', name: 'رحلة الإسكندرية', received_amount: 5000, start_date: day(60), end_date: day(58), status: 'active', created_at: day(70), user_id: USER.id },
      { id: 'trip-3', name: 'Cairo weekend', received_amount: 3000, start_date: day(90), end_date: null, status: 'active', created_at: day(95), user_id: USER.id },
    ],
    expenses: [
      ...Array.from({ length: 14 }, (_, i) => ({
        id: `exp-${i}`,
        trip_id: 'trip-1',
        category: cats[i % cats.length],
        cost: [450.5, 9000, 300, 1200, 250, 95][i % 6],
        date: day(i % 7),
        created_at: new Date(Date.now() - i * 3600e3).toISOString(),
        assigned_to: people[i % 4],
        notes: notes[i % 4],
        receipt_urls: i % 3 === 0 ? [`/api/receipts?id=mock-receipt-${i}`] : [],
        receipt_url: i % 3 === 0 ? `/api/receipts?id=mock-receipt-${i}` : null,
        trip_budget_id: i % 5 === 0 ? 'budget-1' : null,
        user_id: USER.id,
      })),
      { id: 'exp-a', trip_id: 'trip-2', category: 'Food', cost: 6200, date: day(59), created_at: day(59), assigned_to: '', notes: 'غداء سمك', receipt_urls: [], receipt_url: null, trip_budget_id: null, user_id: USER.id },
      { id: 'exp-b', trip_id: 'trip-3', category: 'Food', cost: 2600, date: day(90), created_at: day(90), assigned_to: '', notes: '', receipt_urls: [], receipt_url: null, trip_budget_id: null, user_id: USER.id },
    ],
    categories: cats.map((name, i) => ({ id: `cat-${i}`, name, color: null, icon: null, user_id: i < 3 ? null : USER.id })),
    trip_budgets: [
      { id: 'budget-1', trip_id: 'trip-1', name: 'Food & restaurants', amount: 10000, created_at: day(10) },
      { id: 'budget-2', trip_id: 'trip-1', name: 'Hotels', amount: 30000, created_at: day(10) },
    ],
  };
}

let db;
const loadDb = () => {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY)) || seedData();
  } catch {
    return seedData();
  }
};
const saveDb = () => localStorage.setItem(DB_KEY, JSON.stringify(db));

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const empty = (status = 204) => new Response(null, { status });

// A grey "receipt" picture for any receipt id
async function receiptImage(id) {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 420;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f4f4f5';
  g.fillRect(0, 0, 300, 420);
  g.fillStyle = '#52525b';
  g.font = 'bold 22px sans-serif';
  g.fillText('MOCK RECEIPT', 60, 190);
  g.font = '12px monospace';
  g.fillText(id.slice(0, 32), 20, 230);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
  return new Response(blob, { headers: { 'content-type': 'image/jpeg' } });
}

// Just enough of PostgREST: eq./neq. filters, select, single-row reads, insert, upsert, update, delete
function handleTable(table, url, method, headers, body) {
  const rows = db[table] || (db[table] = []);
  const filters = [...url.searchParams].filter(([, v]) => /^(eq|neq|is)\./.test(v));
  const matches = (row) =>
    filters.every(([key, v]) => {
      if (v.startsWith('eq.')) return String(row[key]) === decodeURIComponent(v.slice(3));
      if (v.startsWith('neq.')) return String(row[key]) !== decodeURIComponent(v.slice(4));
      return v === 'is.null' ? row[key] == null : row[key] != null;
    });

  if (method === 'GET' || method === 'HEAD') {
    const out = rows.filter(matches);
    if ((headers.get('accept') || '').includes('vnd.pgrst.object')) {
      return out[0] ? json(out[0]) : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
    }
    return json(out);
  }

  const wantsRows = (headers.get('prefer') || '').includes('return=representation');

  // Same rule as the database trigger (supabase/migrations/20261012000000_lock_categories.sql):
  // a category used by expenses can't be renamed or deleted
  if (table === 'categories' && (method === 'DELETE' || (method === 'PATCH' && body && 'name' in body))) {
    const used = rows.filter(matches).find((c) => db.expenses.some((e) => e.category === c.name));
    if (used) {
      return json({ code: 'P0001', message: `Category "${used.name}" is used by expenses, so it can't be renamed or deleted` }, 400);
    }
  }
  if (method === 'POST') {
    const upsert = (headers.get('prefer') || '').includes('merge-duplicates');
    const added = [];
    for (const input of [].concat(body)) {
      const existing = upsert && rows.find((r) => r.id === input.id);
      if (existing) Object.assign(existing, input);
      else {
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...input };
        rows.push(row);
        added.push(row);
      }
    }
    saveDb();
    return wantsRows ? json(added, 201) : empty(201);
  }
  if (method === 'PATCH') {
    const changed = rows.filter(matches);
    changed.forEach((r) => Object.assign(r, body));
    saveDb();
    return wantsRows ? json(changed) : empty();
  }
  if (method === 'DELETE') {
    const removed = rows.filter(matches);
    db[table] = rows.filter((r) => !matches(r));
    // Same foreign keys as the real database
    if (table === 'trips') {
      const ids = new Set(removed.map((t) => t.id));
      db.expenses = db.expenses.filter((e) => !ids.has(e.trip_id));
      db.trip_budgets = db.trip_budgets.filter((b) => !ids.has(b.trip_id));
    }
    if (table === 'trip_budgets') {
      const ids = new Set(removed.map((b) => b.id));
      db.expenses.forEach((e) => {
        if (ids.has(e.trip_budget_id)) e.trip_budget_id = null;
      });
    }
    saveDb();
    return wantsRows ? json(removed) : empty();
  }
  return empty();
}

function handleRpc(name) {
  if (name === 'is_admin') return json(true);
  if (name === 'get_usage_stats') {
    return json({
      db_size_bytes: 21e6,
      tables: Object.keys(db).map((t) => ({ name: t, rows: db[t].length, total_bytes: db[t].length * 900 })),
      storage_buckets: [],
    });
  }
  return json([]);
}

export function installMockBackend() {
  db = loadDb();
  const supabaseHost = new URL(import.meta.env.VITE_SUPABASE_URL).host;
  const storageKey = `sb-${supabaseHost.split('.')[0]}-auth-token`;

  // A session that looks valid, so the app starts signed in
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 3600;
  const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USER.id, exp: expiresAt, role: 'authenticated' })}.mock`;
  localStorage.setItem(
    storageKey,
    JSON.stringify({ access_token: token, refresh_token: 'mock', expires_at: expiresAt, expires_in: 86400, token_type: 'bearer', user: USER }),
  );

  // Offline switch: browsers don't let pages set navigator.onLine, so it's overridden here
  let offline = localStorage.getItem(OFFLINE_KEY) === '1';
  Object.defineProperty(Navigator.prototype, 'onLine', { get: () => !offline, configurable: true });
  const setOffline = (value) => {
    offline = value;
    localStorage.setItem(OFFLINE_KEY, value ? '1' : '0');
    window.dispatchEvent(new Event(value ? 'offline' : 'online'));
    renderBadge();
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
    const method = (init.method || input.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || input.headers);
    const isApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
    const isSupabase = url.host === supabaseHost;
    if (!isApi && !isSupabase) return realFetch(input, init);

    await new Promise((resolve) => setTimeout(resolve, 150)); // feel like a network
    if (offline) throw new TypeError('Failed to fetch');

    if (isApi) {
      if (url.pathname === '/api/receipts' && method === 'GET') return receiptImage(url.searchParams.get('id') || '');
      if (url.pathname === '/api/receipts' && method === 'POST') {
        const id = `mock-upload-${crypto.randomUUID()}`;
        return json({ id, url: `/api/receipts?id=${id}` });
      }
      if (url.pathname === '/api/usage') {
        return json({ usage: 5e9, limit: 15e9, receiptsBytes: 2e8, receiptsCount: 42, accountEmail: 'drive@example.test' });
      }
      return json({ ok: true });
    }

    if (url.pathname.startsWith('/auth/v1/user')) return json(USER);
    if (url.pathname.startsWith('/auth/v1/logout')) return empty();
    if (url.pathname.startsWith('/auth/v1/')) return json({ error: 'Login is not available in mock mode' }, 400);
    if (url.pathname.startsWith('/rest/v1/rpc/')) return handleRpc(url.pathname.split('/').pop());
    if (url.pathname.startsWith('/rest/v1/')) {
      const body = init.body ? JSON.parse(init.body) : null;
      return handleTable(url.pathname.split('/').pop(), url, method, headers, body);
    }
    return json({ message: 'Not mocked' }, 404);
  };

  // Receipt <img> tags don't go through fetch, so point them at a generated picture
  const imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() {
      return imgSrc.get.call(this);
    },
    set(value) {
      if (typeof value === 'string' && value.startsWith('/api/receipts?id=')) {
        const img = this;
        receiptImage(value.split('=').pop())
          .then((res) => res.blob())
          .then((blob) => imgSrc.set.call(img, URL.createObjectURL(blob)));
        return;
      }
      imgSrc.set.call(this, value);
    },
  });

  // Badge with the offline switch and a reset button
  const badge = document.createElement('div');
  badge.style.cssText =
    'position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:9999;display:flex;gap:6px;align-items:center;' +
    'font:600 11px system-ui;background:#111827;color:#fff;padding:6px 8px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  const button = (label, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:#374151;color:#fff;border:0;border-radius:999px;padding:4px 8px;font:inherit;cursor:pointer';
    b.onclick = onClick;
    return b;
  };
  function renderBadge() {
    badge.replaceChildren(
      Object.assign(document.createElement('span'), { textContent: offline ? 'Mock data · OFFLINE' : 'Mock data' }),
      button(offline ? 'Go online' : 'Go offline', () => setOffline(!offline)),
      button('Reset', () => {
        localStorage.removeItem(DB_KEY);
        localStorage.removeItem('trippy.queryCache');
        localStorage.removeItem('trippy.outbox');
        window.location.reload();
      }),
    );
  }
  renderBadge();
  const mount = () => document.body.appendChild(badge);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  console.info('[mock] Trippy is running on fake data. Use the badge (bottom-left) to go offline or reset.');
}
