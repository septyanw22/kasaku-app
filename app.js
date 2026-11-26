// app.js — Logika Lengkap KASAKU (Google Apps Script Edition)
const STORAGE_KEY = 'kasaku_gas_state_v1';
const GAS_URL_KEY = 'kasaku_gas_webapp_url';

// Opsional: Tempel URL Web App GAS Anda di sini agar otomatis terisi di perangkat baru
const DEFAULT_GAS_URL = '';

const DEFAULT_CATEGORIES = [
  { type: 'expense', name: 'Rumah Tangga' },
  { type: 'expense', name: 'Bensin, Makan Nova' },
  { type: 'expense', name: 'Sekolah Nad' },
  { type: 'expense', name: 'Daycare' },
  { type: 'expense', name: 'Orang Rumah' },
  { type: 'expense', name: 'Listrik, Wifi, Pulsa' },
  { type: 'expense', name: 'Sabtu Minggu' },
  { type: 'expense', name: 'Skincare Nova' },
  { type: 'expense', name: 'Popok, Susu' },
  { type: 'expense', name: 'Insidental' },
  { type: 'expense', name: 'Persembahan Nova' },
  { type: 'income', name: 'Gaji' },
  { type: 'income', name: 'Tunjangan / Bonus' },
  { type: 'income', name: 'Hasil Usaha' },
  { type: 'income', name: 'Investasi' },
  { type: 'income', name: 'Lainnya' },
];

const DEFAULT_WALLETS = ['Seabank', 'Tabungan Blu'];

let state = {
  categories: [...DEFAULT_CATEGORIES],
  wallets: [...DEFAULT_WALLETS],
  transactions: [],
  budgets: [],
  bills: [],
  wishlist: [],
  lastSync: '',
};

// ==========================================
// HELPER UMUM
// ==========================================
function formatRupiah(num) {
  return 'Rp ' + (Number(num) || 0).toLocaleString('id-ID');
}

function getCurrentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function getGasUrl() {
  return (localStorage.getItem(GAS_URL_KEY) || DEFAULT_GAS_URL || '').trim();
}

function setSyncBadge(text, statusType = 'ok') {
  const btn = document.getElementById('headerSyncBtn');
  if (!btn) return;
  btn.textContent = text;
  if (statusType === 'error') btn.style.color = 'var(--danger)';
  else if (statusType === 'busy') btn.style.color = 'var(--warning)';
  else btn.style.color = 'var(--accent-teal)';
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadLocalState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state = {
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : [...DEFAULT_CATEGORIES],
      wallets: Array.isArray(parsed.wallets) && parsed.wallets.length ? parsed.wallets : [...DEFAULT_WALLETS],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
      bills: Array.isArray(parsed.bills) ? parsed.bills : [],
      wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : [],
      lastSync: parsed.lastSync || '',
    };
  } catch (e) {
    console.error('Gagal membaca cache lokal:', e);
  }
}

// ==========================================
// SINKRONISASI GOOGLE APPS SCRIPT (GET & POST)
// ==========================================
async function pullFromGas(silent = false) {
  const url = getGasUrl();
  if (!url) {
    setSyncBadge('URL GAS Belum Diisi', 'busy');
    return;
  }

  try {
    setSyncBadge('Menarik data...', 'busy');
    const res = await fetch(url, { method: 'GET' });
    const json = await res.json();

    if (json.status !== 'ok' || !json.data) {
      throw new Error(json.message || 'Respons GAS tidak valid');
    }

    const d = json.data;
    state.categories = Array.isArray(d.categories) && d.categories.length ? d.categories : [...DEFAULT_CATEGORIES];
    state.wallets = Array.isArray(d.wallets) && d.wallets.length ? d.wallets : [...DEFAULT_WALLETS];
    state.transactions = Array.isArray(d.transactions) ? d.transactions : [];
    state.budgets = Array.isArray(d.budgets) ? d.budgets : [];
    state.bills = Array.isArray(d.bills) ? d.bills : [];
    state.wishlist = Array.isArray(d.wishlist) ? d.wishlist : [];
    state.lastSync = new Date().toLocaleString('id-ID');

    saveLocalState();
    renderAll();
    setSyncBadge('Tersinkron ✓', 'ok');
    if (!silent) alert('Data berhasil ditarik dari Database Kasaku!');
  } catch (err) {
    console.error('Pull GAS error:', err);
    setSyncBadge('Mode Offline', 'error');
    if (!silent) alert('Gagal menarik data dari Google Sheets: ' + err.message);
  }
}

async function pushToGas(silent = true) {
  saveLocalState();
  const url = getGasUrl();
  if (!url) {
    setSyncBadge('Tersimpan Lokal', 'busy');
    return;
  }

  try {
    setSyncBadge('Menyinkronkan...', 'busy');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'syncAll',
        data: {
          categories: state.categories,
          wallets: state.wallets,
          transactions: state.transactions,
          budgets: state.budgets,
          bills: state.bills,
          wishlist: state.wishlist,
        },
      }),
    });

    const json = await res.json();
    if (json.status !== 'ok') {
      throw new Error(json.message || 'Gagal menulis ke Google Sheets');
    }

    state.lastSync = new Date().toLocaleString('id-ID');
    saveLocalState();
    updateLastSyncLabel();
    setSyncBadge('Tersinkron ✓', 'ok');
    if (!silent) alert('Data berhasil dikirim ke Database Kasaku!');
  } catch (err) {
    console.error('Push GAS error:', err);
    setSyncBadge('Gagal Sync Cloud', 'error');
    if (!silent) alert('Gagal mengirim data ke Google Sheets: ' + err.message);
  }
}

function updateLastSyncLabel() {
  const el = document.getElementById('lastSyncTime');
  if (el) el.textContent = 'Terakhir sinkron: ' + (state.lastSync || '-');
}

// ==========================================
// NAVIGASI & INISIALISASI AWAL
// ==========================================
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach((sec) => sec.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.target);
    if (target) target.classList.add('active');
  });
});

const monthFilterEl = document.getElementById('monthFilter');
monthFilterEl.value = getCurrentMonthStr();
monthFilterEl.addEventListener('change', renderAll);
document.getElementById('txDate').value = getTodayStr();

document.getElementById('headerSyncBtn').addEventListener('click', () => pullFromGas(false));

// ==========================================
// RENDER DROPDOWN KATEGORI & DOMPET
// ==========================================
function populateFormOptions() {
  const currentTxType = document.getElementById('txType').value || 'expense';
  const txCatSel = document.getElementById('txCategory');
  const prevTxCat = txCatSel.value;

  const filteredCats = state.categories.filter((c) => c.type === currentTxType);
  txCatSel.innerHTML = filteredCats
    .map((c) => `<option value="${c.name}">${c.name}</option>`)
    .join('');
  if (filteredCats.some((c) => c.name === prevTxCat)) txCatSel.value = prevTxCat;

  const expenseCats = state.categories.filter((c) => c.type === 'expense');
  ['billCategory', 'budgetCategory'].forEach((id) => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = expenseCats.map((c) => `<option value="${c.name}">${c.name}</option>`).join('');
    if (expenseCats.some((c) => c.name === prev)) sel.value = prev;
  });

  ['txWallet', 'billWallet'].forEach((id) => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = state.wallets.map((w) => `<option value="${w}">${w}</option>`).join('');
    if (state.wallets.includes(prev)) sel.value = prev;
  });

  const filterWal = document.getElementById('txFilterWallet');
  const prevFilter = filterWal.value;
  filterWal.innerHTML =
    '<option value="all">Semua Dompet</option>' +
    state.wallets.map((w) => `<option value="${w}">${w}</option>`).join('');
  if ([...state.wallets, 'all'].includes(prevFilter)) filterWal.value = prevFilter;
}

// ==========================================
// RENDER DASHBOARD (RINGKASAN)
// ==========================================
function renderDashboard() {
  const selectedMonth = monthFilterEl.value;
  let totalBalance = 0;
  const walletBalances = {};
  state.wallets.forEach((w) => (walletBalances[w] = 0));

  let monthlyIncome = 0;
  let monthlyExpense = 0;
  const expenseByCategory = {};

  state.transactions.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    const delta = tx.type === 'income' ? amt : -amt;
    totalBalance += delta;
    walletBalances[tx.wallet] = (walletBalances[tx.wallet] || 0) + delta;

    if (tx.date && tx.date.startsWith(selectedMonth)) {
      if (tx.type === 'income') {
        monthlyIncome += amt;
      } else {
        monthlyExpense += amt;
        expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + amt;
      }
    }
  });

  document.getElementById('totalBalance').textContent = formatRupiah(totalBalance);
  document.getElementById('monthlyIncome').textContent = formatRupiah(monthlyIncome);
  document.getElementById('monthlyExpense').textContent = formatRupiah(monthlyExpense);

  // Saldo per dompet
  document.getElementById('walletSummaryList').innerHTML = Object.entries(walletBalances)
    .map(
      ([w, bal]) => `
      <div class="item-row" style="margin-bottom:8px; padding:10px 14px;">
        <span style="font-weight:600; font-size:14px;">${w}</span>
        <strong style="color:${bal < 0 ? 'var(--danger)' : 'var(--text-primary)'}; font-size:14px;">${formatRupiah(bal)}</strong>
      </div>
    `
    )
    .join('');

  // Status Anggaran di Dashboard
  const dashBudgetEl = document.getElementById('dashboardBudgetList');
  if (state.budgets.length === 0) {
    dashBudgetEl.innerHTML = '<p class="label-muted">Belum ada batas anggaran yang diatur.</p>';
  } else {
    dashBudgetEl.innerHTML = state.budgets
      .map((b) => {
        const spent = expenseByCategory[b.category] || 0;
        const limit = Number(b.limit) || 1;
        const pct = Math.min(100, Math.round((spent / limit) * 100));
        const barColor = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--accent-primary)';
        return `
          <div style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; font-size:13px;">
              <strong>${b.category}</strong>
              <span>${formatRupiah(spent)} / ${formatRupiah(limit)} (${pct}%)</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct}%; background:${barColor};"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Transaksi Terbaru
  const recentTx = [...state.transactions]
    .filter((tx) => tx.date && tx.date.startsWith(selectedMonth))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  const recentEl = document.getElementById('recentTransactionsList');
  if (recentTx.length === 0) {
    recentEl.innerHTML = '<p class="label-muted">Belum ada transaksi pada periode ini.</p>';
  } else {
    recentEl.innerHTML = recentTx
      .map(
        (tx) => `
        <div class="item-row">
          <div>
            <strong style="font-size:14px; display:block;">${tx.note || tx.category}</strong>
            <span class="label-muted" style="margin:2px 0 0;">${tx.date} • ${tx.wallet} • ${tx.category}</span>
          </div>
          <strong style="color:${tx.type === 'income' ? 'var(--success)' : 'var(--danger)'}; font-size:14px;">
            ${tx.type === 'income' ? '+' : '-'}${formatRupiah(tx.amount)}
          </strong>
        </div>
      `
      )
      .join('');
  }
}

// ==========================================
// TRANSAKSI (TAMBAH, EDIT, HAPUS, FILTER)
// ==========================================
const btnExpense = document.getElementById('btnTypeExpense');
const btnIncome = document.getElementById('btnTypeIncome');
const txTypeInput = document.getElementById('txType');

function setTxType(type) {
  txTypeInput.value = type;
  btnExpense.classList.toggle('active', type === 'expense');
  btnIncome.classList.toggle('active', type === 'income');
  populateFormOptions();
}

btnExpense.addEventListener('click', () => setTxType('expense'));
btnIncome.addEventListener('click', () => setTxType('income'));

document.getElementById('transactionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const existingId = document.getElementById('txId').value;
  const txObj = {
    id: existingId || generateId('tx'),
    type: txTypeInput.value,
    amount: Number(document.getElementById('txAmount').value),
    category: document.getElementById('txCategory').value,
    wallet: document.getElementById('txWallet').value,
    date: document.getElementById('txDate').value,
    note: document.getElementById('txNote').value.trim(),
    updatedAt: new Date().toISOString(),
  };

  if (existingId) {
    const idx = state.transactions.findIndex((t) => t.id === existingId);
    if (idx !== -1) state.transactions[idx] = txObj;
  } else {
    state.transactions.unshift(txObj);
  }

  resetTxForm();
  renderAll();
  await pushToGas(true);
});

function editTransaction(id) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;

  document.getElementById('txFormTitle').textContent = 'Edit Transaksi';
  document.getElementById('txId').value = tx.id;
  setTxType(tx.type);
  document.getElementById('txAmount').value = tx.amount;
  document.getElementById('txCategory').value = tx.category;
  document.getElementById('txWallet').value = tx.wallet;
  document.getElementById('txDate').value = tx.date;
  document.getElementById('txNote').value = tx.note || '';
  document.getElementById('txSubmitBtn').textContent = 'Perbarui Transaksi';
  document.getElementById('txCancelEditBtn').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetTxForm() {
  document.getElementById('transactionForm').reset();
  document.getElementById('txId').value = '';
  document.getElementById('txFormTitle').textContent = 'Catat Transaksi Baru';
  document.getElementById('txSubmitBtn').textContent = 'Simpan Transaksi';
  document.getElementById('txCancelEditBtn').style.display = 'none';
  document.getElementById('txDate').value = getTodayStr();
  setTxType('expense');
}

document.getElementById('txCancelEditBtn').addEventListener('click', resetTxForm);

async function deleteTransaction(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  state.transactions = state.transactions.filter((t) => t.id !== id);
  renderAll();
  await pushToGas(true);
}

document.getElementById('txSearch').addEventListener('input', renderTransactions);
document.getElementById('txFilterType').addEventListener('change', renderTransactions);
document.getElementById('txFilterWallet').addEventListener('change', renderTransactions);

function renderTransactions() {
  const selectedMonth = monthFilterEl.value;
  const keyword = document.getElementById('txSearch').value.toLowerCase();
  const filterType = document.getElementById('txFilterType').value;
  const filterWallet = document.getElementById('txFilterWallet').value;

  const filtered = [...state.transactions]
    .filter((tx) => {
      const matchMonth = !selectedMonth || (tx.date && tx.date.startsWith(selectedMonth));
      const matchKey =
        !keyword ||
        (tx.note && tx.note.toLowerCase().includes(keyword)) ||
        (tx.category && tx.category.toLowerCase().includes(keyword));
      const matchType = filterType === 'all' || tx.type === filterType;
      const matchWallet = filterWallet === 'all' || tx.wallet === filterWallet;
      return matchMonth && matchKey && matchType && matchWallet;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const listEl = document.getElementById('transactionList');
  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="label-muted">Tidak ada transaksi yang cocok.</p>';
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (tx) => `
      <div class="item-row" style="flex-direction:column; align-items:stretch;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <strong style="font-size:14px;">${tx.note || tx.category}</strong>
            <span class="label-muted" style="margin:2px 0 0;">${tx.date} • ${tx.wallet} • ${tx.category}</span>
          </div>
          <strong style="color:${tx.type === 'income' ? 'var(--success)' : 'var(--danger)'}; font-size:14px;">
            ${tx.type === 'income' ? '+' : '-'}${formatRupiah(tx.amount)}
          </strong>
        </div>
        <div class="item-actions">
          <button type="button" class="neu-btn morph-btn btn-sm" onclick="editTransaction('${tx.id}')">Edit</button>
          <button type="button" class="neu-btn morph-btn btn-sm" style="color:var(--danger);" onclick="deleteTransaction('${tx.id}')">Hapus</button>
        </div>
      </div>
    `
    )
    .join('');
}

// ==========================================
// TAGIHAN RUTIN (EDITABLE + COUNTDOWN)
// ==========================================
function getBillCountdownInfo(bill) {
  const currentPeriod = getCurrentMonthStr();
  const isPaid = bill.paidPeriod === currentPeriod;

  if (isPaid) {
    return {
      isPaid: true,
      diffDays: 999,
      badgeClass: 'badge-success',
      label: `Lunas (${currentPeriod})`,
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(now.getFullYear(), now.getMonth(), Number(bill.dueDay));
  const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { isPaid: false, diffDays, badgeClass: 'badge-danger', label: `Terlambat ${Math.abs(diffDays)} hari` };
  }
  if (diffDays === 0) {
    return { isPaid: false, diffDays, badgeClass: 'badge-danger', label: 'Jatuh Tempo Hari Ini!' };
  }
  if (diffDays <= 5) {
    return { isPaid: false, diffDays, badgeClass: 'badge-warn', label: `H-${diffDays} (Tgl ${bill.dueDay})` };
  }
  return { isPaid: false, diffDays, badgeClass: 'badge-info', label: `H-${diffDays} (Tgl ${bill.dueDay})` };
}

document.getElementById('billForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const existingId = document.getElementById('billId').value;
  const paidOpt = document.getElementById('billPaidPeriod').value;
  const paidPeriod = paidOpt === 'current' ? getCurrentMonthStr() : '';

  const billObj = {
    id: existingId || generateId('bill'),
    name: document.getElementById('billName').value.trim(),
    amount: Number(document.getElementById('billAmount').value),
    category: document.getElementById('billCategory').value,
    wallet: document.getElementById('billWallet').value,
    dueDay: Number(document.getElementById('billDueDay').value),
    paidPeriod,
    updatedAt: new Date().toISOString(),
  };

  if (existingId) {
    const idx = state.bills.findIndex((b) => b.id === existingId);
    if (idx !== -1) state.bills[idx] = billObj;
  } else {
    state.bills.push(billObj);
  }

  resetBillForm();
  renderAll();
  await pushToGas(true);
});

function editBill(id) {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) return;

  document.getElementById('billFormTitle').textContent = 'Edit Tagihan Rutin';
  document.getElementById('billId').value = bill.id;
  document.getElementById('billName').value = bill.name;
  document.getElementById('billAmount').value = bill.amount;
  document.getElementById('billCategory').value = bill.category;
  document.getElementById('billWallet').value = bill.wallet;
  document.getElementById('billDueDay').value = bill.dueDay;
  document.getElementById('billPaidPeriod').value =
    bill.paidPeriod === getCurrentMonthStr() ? 'current' : '';
  document.getElementById('billSubmitBtn').textContent = 'Simpan Perubahan';
  document.getElementById('billCancelEditBtn').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetBillForm() {
  document.getElementById('billForm').reset();
  document.getElementById('billId').value = '';
  document.getElementById('billFormTitle').textContent = 'Tambah Tagihan Rutin';
  document.getElementById('billSubmitBtn').textContent = 'Simpan Tagihan';
  document.getElementById('billCancelEditBtn').style.display = 'none';
}

document.getElementById('billCancelEditBtn').addEventListener('click', resetBillForm);

async function togglePayBill(id) {
  const idx = state.bills.findIndex((b) => b.id === id);
  if (idx === -1) return;

  const bill = state.bills[idx];
  const currentPeriod = getCurrentMonthStr();
  const isPaid = bill.paidPeriod === currentPeriod;

  state.bills[idx] = {
    ...bill,
    paidPeriod: isPaid ? '' : currentPeriod,
    updatedAt: new Date().toISOString(),
  };

  if (!isPaid && confirm(`Catat pembayaran "${bill.name}" (${formatRupiah(bill.amount)}) ke Transaksi pengeluaran ${bill.wallet}?`)) {
    state.transactions.unshift({
      id: generateId('tx'),
      type: 'expense',
      amount: bill.amount,
      category: bill.category,
      wallet: bill.wallet,
      date: getTodayStr(),
      note: `Tagihan: ${bill.name} (${currentPeriod})`,
      updatedAt: new Date().toISOString(),
    });
  }

  renderAll();
  await pushToGas(true);
}

async function deleteBill(id) {
  if (!confirm('Hapus tagihan rutin ini?')) return;
  state.bills = state.bills.filter((b) => b.id !== id);
  renderAll();
  await pushToGas(true);
}

function renderBills() {
  const totalBills = state.bills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
  document.getElementById('totalBillsSummary').textContent = 'Total: ' + formatRupiah(totalBills);

  const listEl = document.getElementById('billsList');
  if (state.bills.length === 0) {
    listEl.innerHTML = '<p class="label-muted">Belum ada tagihan rutin.</p>';
    return;
  }

  listEl.innerHTML = state.bills
    .map((bill) => {
      const info = getBillCountdownInfo(bill);
      return `
        <div class="item-row" style="flex-direction:column; align-items:stretch;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div>
              <strong style="font-size:15px;">${bill.name}</strong>
              <span class="label-muted" style="margin:2px 0 6px;">${bill.wallet} • ${bill.category}</span>
              <span class="badge ${info.badgeClass}">${info.label}</span>
            </div>
            <strong style="font-size:15px;">${formatRupiah(bill.amount)}</strong>
          </div>
          <div class="item-actions">
            <button type="button" class="neu-btn morph-btn btn-sm" style="color:${info.isPaid ? 'var(--text-secondary)' : 'var(--success)'};" onclick="togglePayBill('${bill.id}')">
              ${info.isPaid ? 'Batal Lunas' : 'Tandai Lunas'}
            </button>
            <button type="button" class="neu-btn morph-btn btn-sm" onclick="editBill('${bill.id}')">Edit</button>
            <button type="button" class="neu-btn morph-btn btn-sm" style="color:var(--danger);" onclick="deleteBill('${bill.id}')">Hapus</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDueReminders() {
  const banner = document.getElementById('dueReminderBanner');
  const content = document.getElementById('dueReminderContent');

  const urgent = state.bills
    .map((b) => ({ bill: b, info: getBillCountdownInfo(b) }))
    .filter((item) => !item.info.isPaid && item.info.diffDays <= 5);

  if (urgent.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'block';
  content.innerHTML = urgent
    .map(
      ({ bill, info }) =>
        `<div>• <strong>${bill.name}</strong> (${formatRupiah(bill.amount)} via ${bill.wallet}) — <strong>${info.label}</strong></div>`
    )
    .join('');
}

// ==========================================
// ANGGARAN & WISHLIST ANTI-IMPULSIF
// ==========================================
document.getElementById('budgetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const category = document.getElementById('budgetCategory').value;
  const limit = Number(document.getElementById('budgetLimit').value);

  const idx = state.budgets.findIndex((b) => b.category === category);
  const obj = { category, limit, updatedAt: new Date().toISOString() };

  if (idx !== -1) state.budgets[idx] = obj;
  else state.budgets.push(obj);

  document.getElementById('budgetForm').reset();
  renderAll();
  await pushToGas(true);
});

async function deleteBudget(category) {
  if (!confirm(`Hapus anggaran untuk "${category}"?`)) return;
  state.budgets = state.budgets.filter((b) => b.category !== category);
  renderAll();
  await pushToGas(true);
}

function renderBudgets() {
  const listEl = document.getElementById('budgetManageList');
  if (state.budgets.length === 0) {
    listEl.innerHTML = '<p class="label-muted">Belum ada anggaran kategori.</p>';
    return;
  }

  listEl.innerHTML = state.budgets
    .map(
      (b) => `
      <div class="item-row" style="padding:10px 14px;">
        <div>
          <strong style="font-size:14px;">${b.category}</strong>
          <span class="label-muted" style="margin:2px 0 0;">Limit: ${formatRupiah(b.limit)}</span>
        </div>
        <button type="button" class="neu-btn morph-btn btn-sm" style="color:var(--danger);" onclick="deleteBudget('${b.category.replace(/'/g, "\\'")}')">Hapus</button>
      </div>
    `
    )
    .join('');
}

document.getElementById('wishlistForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const now = new Date();
  const unlock = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  state.wishlist.unshift({
    id: generateId('wish'),
    name: document.getElementById('wishName').value.trim(),
    price: Number(document.getElementById('wishPrice').value),
    note: document.getElementById('wishNote').value.trim(),
    createdAt: now.toISOString(),
    unlockAt: unlock.toISOString(),
    purchased: false,
    updatedAt: now.toISOString(),
  });

  document.getElementById('wishlistForm').reset();
  renderAll();
  await pushToGas(true);
});

async function markWishlistPurchased(id) {
  const idx = state.wishlist.findIndex((w) => w.id === id);
  if (idx === -1) return;
  state.wishlist[idx].purchased = true;
  state.wishlist[idx].updatedAt = new Date().toISOString();
  renderAll();
  await pushToGas(true);
}

async function deleteWishlist(id) {
  if (!confirm('Hapus item wishlist ini?')) return;
  state.wishlist = state.wishlist.filter((w) => w.id !== id);
  renderAll();
  await pushToGas(true);
}

function renderWishlist() {
  const container = document.getElementById('wishlistContainer');
  if (state.wishlist.length === 0) {
    container.innerHTML = '<p class="label-muted">Belum ada daftar wishlist.</p>';
    return;
  }

  const now = Date.now();
  container.innerHTML = state.wishlist
    .map((w) => {
      const unlockMs = w.unlockAt ? new Date(w.unlockAt).getTime() : 0;
      const isUnlocked = now >= unlockMs;
      const hoursLeft = Math.max(1, Math.ceil((unlockMs - now) / (1000 * 60 * 60)));

      return `
        <div class="item-row" style="flex-direction:column; align-items:stretch;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <strong style="font-size:14px;">${w.name}</strong>
              ${w.note ? `<span class="label-muted">${w.note}</span>` : ''}
              <span class="badge ${w.purchased ? 'badge-success' : isUnlocked ? 'badge-info' : 'badge-warn'}">
                ${w.purchased ? 'Sudah Dibeli' : isUnlocked ? 'Masa Tunggu Selesai' : `Terkunci (${hoursLeft} jam lagi)`}
              </span>
            </div>
            <strong style="font-size:14px;">${formatRupiah(w.price)}</strong>
          </div>
          <div class="item-actions">
            ${!w.purchased && isUnlocked ? `<button type="button" class="neu-btn morph-btn btn-sm" style="color:var(--success);" onclick="markWishlistPurchased('${w.id}')">Tandai Dibeli</button>` : ''}
            <button type="button" class="neu-btn morph-btn btn-sm" style="color:var(--danger);" onclick="deleteWishlist('${w.id}')">Hapus</button>
          </div>
        </div>
      `;
    })
    .join('');
}

// ==========================================
// ALAT: PENGATURAN GAS, DOMPET, KATEGORI & JSON
// ==========================================
document.getElementById('gasUrlInput').value = getGasUrl();

document.getElementById('btnSaveGasUrl').addEventListener('click', async () => {
  const val = document.getElementById('gasUrlInput').value.trim();
  localStorage.setItem(GAS_URL_KEY, val);
  await pullFromGas(false);
});

document.getElementById('btnPullCloud').addEventListener('click', () => pullFromGas(false));
document.getElementById('btnPushCloud').addEventListener('click', () => pushToGas(false));

document.getElementById('customWalletForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newWalletName');
  const name = input.value.trim();
  if (!name || state.wallets.includes(name)) return;

  state.wallets.push(name);
  input.value = '';
  renderAll();
  await pushToGas(true);
});

async function deleteWallet(name) {
  if (!confirm(`Hapus dompet "${name}"?`)) return;
  state.wallets = state.wallets.filter((w) => w !== name);
  renderAll();
  await pushToGas(true);
}

document.getElementById('customCategoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('newCategoryType').value;
  const input = document.getElementById('newCategoryName');
  const name = input.value.trim();
  if (!name) return;

  if (!state.categories.some((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase())) {
    state.categories.push({ type, name });
  }
  input.value = '';
  renderAll();
  await pushToGas(true);
});

async function deleteCategory(type, name) {
  if (!confirm(`Hapus kategori "${name}"?`)) return;
  state.categories = state.categories.filter((c) => !(c.type === type && c.name === name));
  renderAll();
  await pushToGas(true);
}

function renderToolsLists() {
  document.getElementById('walletList').innerHTML = state.wallets
    .map(
      (w) => `
      <span class="neu-inset chip-item">
        ${w}
        <button type="button" class="chip-del" onclick="deleteWallet('${w.replace(/'/g, "\\'")}')">×</button>
      </span>
    `
    )
    .join('');

  document.getElementById('categoryList').innerHTML = state.categories
    .map(
      (c) => `
      <span class="neu-inset chip-item">
        <small style="color:var(--accent-primary); font-weight:700;">[${c.type === 'income' ? '+' : '-'}]</small> ${c.name}
        <button type="button" class="chip-del" onclick="deleteCategory('${c.type}', '${c.name.replace(/'/g, "\\'")}')">×</button>
      </span>
    `
    )
    .join('');
}

document.getElementById('btnExportJson').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kasaku-backup-${getTodayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importJsonInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    state = {
      categories: imported.categories || state.categories,
      wallets: imported.wallets || state.wallets,
      transactions: imported.transactions || state.transactions,
      budgets: imported.budgets || state.budgets,
      bills: imported.bills || state.bills,
      wishlist: imported.wishlist || state.wishlist,
      lastSync: state.lastSync,
    };
    renderAll();
    await pushToGas(false);
  } catch (err) {
    alert('File JSON tidak valid: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// ==========================================
// RENDER SEMUA & STARTUP
// ==========================================
function renderAll() {
  populateFormOptions();
  renderDashboard();
  renderTransactions();
  renderBills();
  renderBudgets();
  renderWishlist();
  renderDueReminders();
  renderToolsLists();
  updateLastSyncLabel();
}

loadLocalState();
renderAll();
if (getGasUrl()) {
  pullFromGas(true);
}
