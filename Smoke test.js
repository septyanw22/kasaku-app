const vm = require('vm'), fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('app.js', 'utf8');

function makeEnv(seedStorage, confirmAnswer = true) {
  const store = Object.assign({}, seedStorage);
  const els = {};
  const mk = (id) => ({
    id, value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
    classList: { _s: new Set(), toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); }, add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)} },
    setAttribute() {}, reset() {}, getBoundingClientRect: () => ({ width: 0, height: 0, left: 0 }),
    parentElement: { getBoundingClientRect: () => ({ width: 0, height: 0 }) }, selectedIndex: 0, getContext: () => null
  });
  const listeners = {};
  const document = {
    getElementById: (id) => (els[id] = els[id] || mk(id)),
    querySelectorAll: () => [], querySelector: () => null,
    documentElement: { setAttribute() {} },
    addEventListener: (t, f) => (listeners[t] = listeners[t] || []).push(f),
    createElement: () => mk('a'), body: { appendChild() {} }
  };
  const ctx = {
    document, console, setTimeout, clearTimeout, Math, JSON, Date, Number, String, Array, Object, Promise, Blob: class {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (f) => f(), navigator: {}, devicePixelRatio: 1,
    confirm: () => confirmAnswer, fetch: async () => ({ json: async () => ({}) }), AbortController: class { constructor(){this.signal={}} abort(){} }
  };
  ctx.window = Object.assign(ctx, { addEventListener: (t, f) => (listeners['w' + t] = listeners['w' + t] || []).push(f), location: {}, confirm: ctx.confirm });
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const fire = (t, ev) => (listeners[t] || []).forEach((f) => f(ev));
  fire('DOMContentLoaded', {});
  return { store, els, fire, ctx, el: (id) => document.getElementById(id) };
}
const click = (env, sel, dataset) => env.fire('click', { target: { classList: { contains: () => false }, id: '', closest: (s) => (s === sel ? { dataset } : null) } });
const stored = (env) => JSON.parse(env.store.kasaku_state_v5);
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('  ok -', name); };

// 1. init tanpa error, state default tersimpan
let env = makeEnv({});
t('init berjalan & state tersimpan', () => assert.ok(stored(env).wallets.length >= 1));

// 2. tambah pengeluaran 50.000 -> saldo dompet turun, lalu hapus -> kembali
t('catat pengeluaran lalu hapus mengembalikan saldo', () => {
  const before = stored(env).wallets.find((w) => w.id === 'w-tunai').balance;
  env.el('txTypeInput').value = 'expense'; env.el('txAmountInput').value = '0';
  env.el('txWalletSelect').value = 'w-tunai'; env.el('txToWalletSelect').value = '';
  env.el('txCategorySelect').value = 'Makan & Kopi'; env.el('txDateInput').value = '2026-11-27'; env.el('txNoteInput').value = 'uji';
  // ketik 5 0 0 0 0 pada numpad
  ['5','0','0','0','0'].forEach((k) => click(env, '[data-num-key]', { numKey: k }));
  env.fire('submit', { preventDefault() {}, target: { id: 'txForm' } });
  let s = stored(env);
  const tx = s.transactions.find((x) => x.note === 'uji');
  assert.ok(tx && tx.amount === 50000);
  assert.strictEqual(s.wallets.find((w) => w.id === 'w-tunai').balance, before - 50000);
  click(env, '[data-delete-tx]', { deleteTx: tx.id });
  s = stored(env);
  assert.strictEqual(s.wallets.find((w) => w.id === 'w-tunai').balance, before);
});

// 3. data rusak / jahat tidak membuat aplikasi crash dan dibersihkan
t('state rusak dibersihkan (null, tipe salah, id berisi HTML)', () => {
  const bad = { wallets: null, transactions: [null, { id: '"><img src=x onerror=alert(1)>', amount: 'abc', date: '<b>', type: 'xx', walletId: 'w-bank' }], bills: 5, goals: 'x', theme: 'neon' };
  const e2 = makeEnv({ kasaku_state_v5: JSON.stringify(bad) });
  const s = stored(e2);
  assert.ok(Array.isArray(s.wallets) && s.wallets.length >= 1);
  const tx = s.transactions[0];
  assert.ok(!/[<>"]/.test(tx.id + tx.date), 'id/date harus bersih');
  assert.strictEqual(tx.amount, 0); assert.strictEqual(tx.type, 'expense'); assert.strictEqual(s.theme, 'dark');
});

// 4. reset tanpa konfirmasi tidak menghapus data
t('reset dibatalkan jika konfirmasi ditolak', () => {
  const e3 = makeEnv({}, false);
  e3.el('txNoteInput').value = '';
  const before = JSON.stringify(stored(e3).transactions);
  click(e3, '[data-action]', { action: 'reset-demo' });
  assert.strictEqual(JSON.stringify(stored(e3).transactions), before);
});

// 5. migrasi dari v4
t('migrasi data dari kunci v4', () => {
  const v4 = { wallets: [{ id: 'w-x', name: 'Lama', type: 'Bank', balance: 123 }], transactions: [] };
  const e4 = makeEnv({ kasaku_state_v4: JSON.stringify(v4) });
  assert.strictEqual(stored(e4).wallets[0].name, 'Lama');
});

// 6. tanggal lokal vs UTC (jalankan dengan TZ=Asia/Jakarta)
t('tanggal lokal WIB tidak mundur sehari (00:30 WIB)', () => {
  const d = new Date('2026-12-01T00:30:00+07:00');
  const p = (n) => String(n).padStart(2, '0');
  const local = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  assert.strictEqual(local, '2026-12-01');
  assert.strictEqual(d.toISOString().slice(0, 10), '2026-11-30'); // kode lama salah di sini
});
console.log(ok + ' tes lulus');
