/* =========================================================
   KASAKU — Zero-Lag Optimistic UI & Cloud Sync Engine
   ========================================================= */

const STORAGE_KEY = 'kasaku_state_v2';
const UNSYNCED_KEY = 'kasaku_unsynced_v2';

// Fast Toast without heavy bounce animation
const Toast = Swal.mixin({
  toast: true,
  position: 'top',
  showConfirmButton: false,
  timer: 1400,
  animation: false
});

const DEFAULT_STATE = {
  wallets: [
    { id: 'w_tunai', name: 'Tunai', balance: 500000, icon: 'fa-wallet', color: '#0ea5e9' },
    { id: 'w_bank', name: 'Rekening Bank', balance: 2500000, icon: 'fa-building-columns', color: '#2563eb' },
    { id: 'w_qris', name: 'QRIS / E-Wallet', balance: 350000, icon: 'fa-qrcode', color: '#10b981' }
  ],
  categories: [
    { id: 'c_makan', name: 'Makan & Kopi', type: 'expense', icon: 'fa-mug-hot', color: '#f43f5e' },
    { id: 'c_transport', name: 'Transport & BBM', type: 'expense', icon: 'fa-motorcycle', color: '#f59e0b' },
    { id: 'c_belanja', name: 'Belanja & Kebutuhan', type: 'expense', icon: 'fa-bag-shopping', color: '#8b5cf6' },
    { id: 'c_tagihan', name: 'Tagihan & Utilitas', type: 'expense', icon: 'fa-file-invoice-dollar', color: '#0ea5e9' },
    { id: 'c_hiburan', name: 'Hiburan & Hobi', type: 'expense', icon: 'fa-gamepad', color: '#ec4899' },
    { id: 'c_gaji', name: 'Gaji & Tunjangan', type: 'income', icon: 'fa-money-bill-wave', color: '#059669' },
    { id: 'c_bonus', name: 'Bonus & Lainnya', type: 'income', icon: 'fa-sack-dollar', color: '#06b6d4' }
  ],
  transactions: [],
  recurringBills: [],
  wishlist: [],
  settings: {
    gasUrl: '',
    lastSync: ''
  }
};

let state = loadState();
let selectedMonth = new Date().getMonth();
let selectedYear = new Date().getFullYear();
let hideBalances = false;
let activeCatTab = 'expense';

// =========================================================
// 1. ZERO-LAG EXECUTION & RENDER BATCHING ENGINE
// =========================================================
let isActionLocked = false;
function runFastAction(fn) {
  if (isActionLocked) return;
  isActionLocked = true;
  requestAnimationFrame(() => {
    try {
      fn();
    } finally {
      setTimeout(() => { isActionLocked = false; }, 110);
    }
  });
}

let isRenderPending = false;
function scheduleRender() {
  if (isRenderPending) return;
  isRenderPending = true;
  requestAnimationFrame(() => {
    isRenderPending = false;
    renderAll();
  });
}

let syncTimer = null;
function saveAndSyncOptimistic() {
  // 1. Instant local persistence (<2ms)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleRender();

  // 2. Debounced background cloud sync (800ms)
  if (!state.settings.gasUrl) {
    updateSyncStatus('Offline Ready • Lokal', false);
    return;
  }

  localStorage.setItem(UNSYNCED_KEY, '1');
  updateSyncStatus('Menyimpan ke Cloud...', true);
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushToCloudBackground();
  }, 800);
}

async function pushToCloudBackground() {
  const url = state.settings.gasUrl;
  if (!url) return;

  if (!navigator.onLine) {
    updateSyncStatus('Menunggu Internet (Antrean)', false);
    return;
  }

  try {
    updateSyncStatus('Menyinkronkan...', true);
    const payload = {
      action: 'SYNC_ALL',
      timestamp: new Date().toISOString(),
      state: {
        wallets: state.wallets,
        categories: state.categories,
        transactions: state.transactions,
        recurringBills: state.recurringBills,
        wishlist: state.wishlist
      }
    };

    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    localStorage.removeItem(UNSYNCED_KEY);
    state.settings.lastSync = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateSyncStatus(`Tersinkron • ${state.settings.lastSync}`, false);
  } catch (err) {
    updateSyncStatus('Gagal Sync (Tersimpan Lokal)', false);
  }
}

async function pullFromCloud() {
  const url = state.settings.gasUrl;
  if (!url) {
    Toast.fire({ icon: 'warning', title: 'Isi URL Google Apps Script dulu' });
    return;
  }

  try {
    updateSyncStatus('Mengambil data Cloud...', true);
    const res = await fetch(`${url}?action=GET_ALL&t=${Date.now()}`);
    const data = await res.json();

    if (data && data.status === 'ok' && data.state) {
      state.wallets = Array.isArray(data.state.wallets) && data.state.wallets.length ? data.state.wallets : state.wallets;
      state.categories = Array.isArray(data.state.categories) && data.state.categories.length ? data.state.categories : state.categories;
      state.transactions = Array.isArray(data.state.transactions) ? data.state.transactions : [];
      state.recurringBills = Array.isArray(data.state.recurringBills) ? data.state.recurringBills : [];
      state.wishlist = Array.isArray(data.state.wishlist) ? data.state.wishlist : [];
      state.settings.lastSync = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      localStorage.removeItem(UNSYNCED_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      scheduleRender();
      updateSyncStatus(`Tersinkron • ${state.settings.lastSync}`, false);
      Toast.fire({ icon: 'success', title: 'Data Cloud berhasil ditarik' });
    } else {
      throw new Error('Format respons tidak valid');
    }
  } catch (err) {
    updateSyncStatus('Gagal Tarik Data', false);
    Toast.fire({ icon: 'error', title: 'Gagal terhubung ke GAS' });
  }
}

function updateSyncStatus(text, spinning) {
  const el = document.getElementById('syncStatusText');
  const icon = document.getElementById('syncIcon');
  if (el) el.textContent = text;
  if (icon) {
    if (spinning) icon.classList.add('spin-sync');
    else icon.classList.remove('spin-sync');
  }
}

// =========================================================
// 2. HELPERS & STATE INITIALIZATION
// =========================================================
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) }
    };
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function formatRp(num) {
  if (hideBalances) return 'Rp ••••••';
  const val = Number(num) || 0;
  return 'Rp ' + val.toLocaleString('id-ID');
}

function todayStr() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function getWallet(id) {
  return state.wallets.find(w => w.id === id) || { name: 'Dompet', icon: 'fa-wallet', color: '#2563eb' };
}

function getCategory(id) {
  return state.categories.find(c => c.id === id) || { name: 'Umum', icon: 'fa-tag', color: '#64748b' };
}

// =========================================================
// 3. TRANSACTION LOGIC (ADD, EDIT, DELETE + BALANCE SYNC)
// =========================================================
function applyTxEffect(tx, multiplier = 1) {
  const amt = (Number(tx.amount) || 0) * multiplier;
  const src = state.wallets.find(w => w.id === tx.walletId);
  if (tx.type === 'expense' && src) {
    src.balance -= amt;
  } else if (tx.type === 'income' && src) {
    src.balance += amt;
  } else if (tx.type === 'transfer') {
    const dst = state.wallets.find(w => w.id === tx.toWalletId);
    if (src) src.balance -= amt;
    if (dst) dst.balance += amt;
  }
}

function openTransactionModal(txId = null, defaultType = 'expense') {
  populateSelectOptions();
  const form = document.getElementById('formTransaction');
  form.reset();

  const btnDel = document.getElementById('btnDeleteTx');
  if (txId) {
    const tx = state.transactions.find(t => t.id === txId);
    if (!tx) return;
    document.getElementById('txModalTitle').textContent = 'Edit Transaksi';
    document.getElementById('txId').value = tx.id;
    setTxTypeUI(tx.type);
    document.getElementById('txAmount').value = tx.amount;
    document.getElementById('txWallet').value = tx.walletId;
    if (tx.toWalletId) document.getElementById('txToWallet').value = tx.toWalletId;
    if (tx.categoryId) document.getElementById('txCategory').value = tx.categoryId;
    document.getElementById('txDate').value = tx.date;
    document.getElementById('txNote').value = tx.note || '';
    btnDel.style.display = 'inline-flex';
  } else {
    document.getElementById('txModalTitle').textContent = 'Catat Transaksi';
    document.getElementById('txId').value = '';
    setTxTypeUI(defaultType);
    document.getElementById('txDate').value = todayStr();
    btnDel.style.display = 'none';
  }

  openModal('modalTransaction');
}

function setTxTypeUI(type) {
  document.getElementById('txType').value = type;
  document.querySelectorAll('#txTypeSegment .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });

  const isTransfer = type === 'transfer';
  document.getElementById('txToWalletGroup').style.display = isTransfer ? 'flex' : 'none';
  document.getElementById('txCategoryGroup').style.display = isTransfer ? 'none' : 'flex';
  document.getElementById('txWalletLabel').textContent = isTransfer ? 'Dari Dompet' : 'Dompet';

  if (!isTransfer) {
    const catSelect = document.getElementById('txCategory');
    const filtered = state.categories.filter(c => c.type === type);
    catSelect.innerHTML = filtered.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

function handleSaveTransaction(e) {
  e.preventDefault();
  runFastAction(() => {
    const id = document.getElementById('txId').value;
    const type = document.getElementById('txType').value;
    const amount = Number(document.getElementById('txAmount').value);
    const walletId = document.getElementById('txWallet').value;
    const toWalletId = document.getElementById('txToWallet').value;
    const categoryId = document.getElementById('txCategory').value;
    const date = document.getElementById('txDate').value;
    const note = document.getElementById('txNote').value.trim();

    if (!amount || amount <= 0) return;
    if (type === 'transfer' && walletId === toWalletId) {
      Toast.fire({ icon: 'warning', title: 'Pilih dompet tujuan berbeda' });
      return;
    }

    if (id) {
      const idx = state.transactions.findIndex(t => t.id === id);
      if (idx > -1) {
        // Revert previous balance effect first
        applyTxEffect(state.transactions[idx], -1);
        const updated = {
          ...state.transactions[idx],
          type, amount, walletId,
          toWalletId: type === 'transfer' ? toWalletId : '',
          categoryId: type === 'transfer' ? '' : categoryId,
          date, note
        };
        state.transactions[idx] = updated;
        applyTxEffect(updated, 1);
      }
    } else {
      const newTx = {
        id: uid('tx'),
        type, amount, walletId,
        toWalletId: type === 'transfer' ? toWalletId : '',
        categoryId: type === 'transfer' ? '' : categoryId,
        date, note,
        createdAt: new Date().toISOString()
      };
      state.transactions.unshift(newTx);
      applyTxEffect(newTx, 1);
    }

    closeModal('modalTransaction');
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Transaksi tersimpan' });
  });
}

function handleDeleteTransaction() {
  runFastAction(() => {
    const id = document.getElementById('txId').value;
    const idx = state.transactions.findIndex(t => t.id === id);
    if (idx > -1) {
      applyTxEffect(state.transactions[idx], -1);
      state.transactions.splice(idx, 1);
      closeModal('modalTransaction');
      saveAndSyncOptimistic();
      Toast.fire({ icon: 'success', title: 'Transaksi dihapus' });
    }
  });
}

// =========================================================
// 4. EDITABLE RECURRING BILLS
// =========================================================
function openBillModal(billId = null) {
  populateSelectOptions();
  const form = document.getElementById('formBill');
  form.reset();

  const catSelect = document.getElementById('billCategory');
  catSelect.innerHTML = state.categories
    .filter(c => c.type === 'expense')
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join('');

  const btnDel = document.getElementById('btnDeleteBill');
  if (billId) {
    const b = state.recurringBills.find(item => item.id === billId);
    if (!b) return;
    document.getElementById('billModalTitle').textContent = 'Edit Tagihan Rutin';
    document.getElementById('billId').value = b.id;
    document.getElementById('billTitle').value = b.title;
    document.getElementById('billAmount').value = b.amount;
    document.getElementById('billDueDate').value = b.dueDate;
    document.getElementById('billWallet').value = b.walletId;
    document.getElementById('billCategory').value = b.categoryId;
    document.getElementById('billCycle').value = b.cycle || 'monthly';
    btnDel.style.display = 'inline-flex';
  } else {
    document.getElementById('billModalTitle').textContent = 'Tambah Tagihan Rutin';
    document.getElementById('billId').value = '';
    document.getElementById('billDueDate').value = todayStr();
    btnDel.style.display = 'none';
  }
  openModal('modalBill');
}

function handleSaveBill(e) {
  e.preventDefault();
  runFastAction(() => {
    const id = document.getElementById('billId').value;
    const payload = {
      title: document.getElementById('billTitle').value.trim(),
      amount: Number(document.getElementById('billAmount').value),
      dueDate: document.getElementById('billDueDate').value,
      walletId: document.getElementById('billWallet').value,
      categoryId: document.getElementById('billCategory').value,
      cycle: document.getElementById('billCycle').value
    };

    if (id) {
      const idx = state.recurringBills.findIndex(b => b.id === id);
      if (idx > -1) state.recurringBills[idx] = { ...state.recurringBills[idx], ...payload };
    } else {
      state.recurringBills.push({ id: uid('bill'), ...payload, lastPaidDate: '' });
    }

    closeModal('modalBill');
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Tagihan rutin disimpan' });
  });
}

function handleDeleteBill() {
  runFastAction(() => {
    const id = document.getElementById('billId').value;
    state.recurringBills = state.recurringBills.filter(b => b.id !== id);
    closeModal('modalBill');
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Tagihan dihapus' });
  });
}

function payRecurringBill(billId) {
  runFastAction(() => {
    const bill = state.recurringBills.find(b => b.id === billId);
    if (!bill) return;

    // 1. Record actual expense transaction
    const tx = {
      id: uid('tx'),
      type: 'expense',
      amount: Number(bill.amount),
      walletId: bill.walletId,
      toWalletId: '',
      categoryId: bill.categoryId,
      date: todayStr(),
      note: `Tagihan: ${bill.title}`,
      createdAt: new Date().toISOString()
    };
    state.transactions.unshift(tx);
    applyTxEffect(tx, 1);

    // 2. Advance next due date according to cycle
    const d = new Date(bill.dueDate + 'T00:00:00');
    if (bill.cycle === 'weekly') d.setDate(d.getDate() + 7);
    else if (bill.cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);

    bill.dueDate = d.toISOString().slice(0, 10);
    bill.lastPaidDate = todayStr();

    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: `${bill.title} dibayar & jadwal diperbarui` });
  });
}

// =========================================================
// 5. WALLETS, CATEGORIES & WISHLIST COOLDOWN
// =========================================================
function openWalletModal(walletId = null) {
  const form = document.getElementById('formWallet');
  form.reset();
  const btnDel = document.getElementById('btnDeleteWallet');

  if (walletId) {
    const w = state.wallets.find(item => item.id === walletId);
    if (!w) return;
    document.getElementById('walletModalTitle').textContent = 'Edit Dompet';
    document.getElementById('walletId').value = w.id;
    document.getElementById('walletName').value = w.name;
    document.getElementById('walletBalance').value = w.balance;
    document.getElementById('walletIcon').value = w.icon;
    document.getElementById('walletColor').value = w.color;
    btnDel.style.display = state.wallets.length > 1 ? 'inline-flex' : 'none';
  } else {
    document.getElementById('walletModalTitle').textContent = 'Tambah Dompet';
    document.getElementById('walletId').value = '';
    btnDel.style.display = 'none';
  }
  openModal('modalWallet');
}

function handleSaveWallet(e) {
  e.preventDefault();
  runFastAction(() => {
    const id = document.getElementById('walletId').value;
    const payload = {
      name: document.getElementById('walletName').value.trim(),
      balance: Number(document.getElementById('walletBalance').value) || 0,
      icon: document.getElementById('walletIcon').value,
      color: document.getElementById('walletColor').value
    };

    if (id) {
      const idx = state.wallets.findIndex(w => w.id === id);
      if (idx > -1) state.wallets[idx] = { ...state.wallets[idx], ...payload };
    } else {
      state.wallets.push({ id: uid('w'), ...payload });
    }

    closeModal('modalWallet');
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Dompet tersimpan' });
  });
}

function handleDeleteWallet() {
  runFastAction(() => {
    const id = document.getElementById('walletId').value;
    if (state.wallets.length <= 1) return;
    state.wallets = state.wallets.filter(w => w.id !== id);
    closeModal('modalWallet');
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Dompet dihapus' });
  });
}

function openCategoryModal(catId = null) {
  const form = document.getElementById('formCategory');
  form.reset();
  const btnDel = document.getElementById('btnDeleteCat');

  if (catId) {
    const c = state.categories.find(item => item.id === catId);
    if (!c) return;
    document.getElementById('catModalTitle').textContent = 'Edit Kategori';
    document.getElementById('catId').value = c.id;
    document.getElementById('catName').value = c.name;
    document.getElementById('catType').value = c.type;
    document.getElementById('catIcon').value = c.icon;
    document.getElementById('catColor').value = c.color;
    btnDel.style.display = 'inline-flex';
  } else {
    document.getElementById('catModalTitle').textContent = 'Tambah Kategori';
    document.getElementById('catId').value = '';
    document.getElementById('catType').value = activeCatTab;
    btnDel.style.display = 'none';
  }
  openModal('modalCategory');
}

function handleSaveCategory(e) {
  e.preventDefault();
  runFastAction(() => {
    const id = document.getElementById('catId').value;
    const payload = {
      name: document.getElementById('catName').value.trim(),
      type: document.getElementById('catType').value,
      icon: document.getElementById('catIcon').value,
      color: document.getElementById('catColor').value
    };

    if (id) {
      const idx = state.categories.findIndex(c => c.id === id);
      if (idx > -1) state.categories[idx] = { ...state.categories[idx], ...payload };
    } else {
      state.categories.push({ id: uid('c'), ...payload });
    }

    closeModal('modalCategory');
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Kategori tersimpan' });
  });
}

function handleDeleteCategory() {
  runFastAction(() => {
    const id = document.getElementById('catId').value;
    state.categories = state.categories.filter(c => c.id !== id);
    closeModal('modalCategory');
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Kategori dihapus' });
  });
}

function openWishlistModal() {
  populateSelectOptions();
  document.getElementById('formWishlist').reset();
  document.getElementById('wishCategory').innerHTML = state.categories
    .filter(c => c.type === 'expense')
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join('');
  openModal('modalWishlist');
}

function handleSaveWishlist(e) {
  e.preventDefault();
  runFastAction(() => {
    state.wishlist.unshift({
      id: uid('wish'),
      title: document.getElementById('wishTitle').value.trim(),
      price: Number(document.getElementById('wishPrice').value),
      cooldownHours: Number(document.getElementById('wishHours').value),
      walletId: document.getElementById('wishWallet').value,
      categoryId: document.getElementById('wishCategory').value,
      createdAt: new Date().toISOString()
    });
    closeModal('modalWishlist');
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Wishlist masuk masa cooldown' });
  });
}

function buyWishlistItem(wishId) {
  runFastAction(() => {
    const item = state.wishlist.find(w => w.id === wishId);
    if (!item) return;
    const tx = {
      id: uid('tx'),
      type: 'expense',
      amount: Number(item.price),
      walletId: item.walletId,
      toWalletId: '',
      categoryId: item.categoryId,
      date: todayStr(),
      note: `Wishlist: ${item.title}`,
      createdAt: new Date().toISOString()
    };
    state.transactions.unshift(tx);
    applyTxEffect(tx, 1);
    state.wishlist = state.wishlist.filter(w => w.id !== wishId);
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Berhasil dibeli & dicatat' });
  });
}

function removeWishlistItem(wishId) {
  runFastAction(() => {
    state.wishlist = state.wishlist.filter(w => w.id !== wishId);
    saveAndSyncOptimistic();
    Toast.fire({ icon: 'success', title: 'Keinginan dibatalkan — hemat!' });
  });
}

// =========================================================
// 6. RENDERING ENGINE
// =========================================================
function populateSelectOptions() {
  const walletOptions = state.wallets
    .map(w => `<option value="${w.id}">${w.name} (${formatRp(w.balance)})</option>`)
    .join('');

  ['txWallet', 'txToWallet', 'billWallet', 'wishWallet'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = walletOptions;
  });

  const filterWallet = document.getElementById('txWalletFilter');
  if (filterWallet) {
    const prev = filterWallet.value;
    filterWallet.innerHTML = `<option value="all">Semua Dompet</option>` +
      state.wallets.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    filterWallet.value = prev || 'all';
  }
}

function renderAll() {
  populateSelectOptions();
  renderDashboard();
  renderAllTransactions();
  renderWalletsAndCategories();
  renderBillsAndWishlist();
}

function renderDashboard() {
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  document.getElementById('currentMonthLabel').textContent = `${monthNames[selectedMonth]} ${selectedYear}`;

  const totalBal = state.wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
  document.getElementById('totalBalanceDisplay').textContent = formatRp(totalBal);

  const monthTxs = state.transactions.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });

  let income = 0;
  let expense = 0;
  const catTotals = {};

  monthTxs.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    if (t.type === 'expense') {
      expense += amt;
      catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + amt;
    }
  });

  document.getElementById('monthIncomeDisplay').textContent = formatRp(income);
  document.getElementById('monthExpenseDisplay').textContent = formatRp(expense);

  const net = income - expense;
  const badge = document.getElementById('netCashflowBadge');
  badge.textContent = `${net >= 0 ? 'Surplus' : 'Defisit'} ${formatRp(Math.abs(net))}`;

  // Category Breakdown
  const breakdownEl = document.getElementById('categoryBreakdownList');
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  if (!sortedCats.length) {
    breakdownEl.innerHTML = `<div class="empty-state">Belum ada pengeluaran pada bulan ini.</div>`;
  } else {
    breakdownEl.innerHTML = sortedCats.map(([catId, val]) => {
      const cat = getCategory(catId);
      const pct = expense > 0 ? Math.round((val / expense) * 100) : 0;
      return `
        <div class="cat-bar-row">
          <div class="cat-bar-top">
            <span><i class="fa-solid ${cat.icon}" style="color:${cat.color}"></i> ${cat.name} (${pct}%)</span>
            <span>${formatRp(val)}</span>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width:${pct}%;background:${cat.color}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Upcoming Bills (Top 2)
  const dashBillsEl = document.getElementById('dashboardBillsList');
  const sortedBills = [...state.recurringBills].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 2);
  if (!sortedBills.length) {
    dashBillsEl.innerHTML = `<div class="neu-card empty-state">Belum ada jadwal tagihan rutin.</div>`;
  } else {
    dashBillsEl.innerHTML = sortedBills.map(b => renderBillCardHTML(b)).join('');
  }

  // Recent Transactions (Top 6)
  const recentEl = document.getElementById('recentTransactionsList');
  const recent = state.transactions.slice(0, 6);
  recentEl.innerHTML = recent.length
    ? recent.map(t => renderTxCardHTML(t)).join('')
    : `<div class="neu-card empty-state">Belum ada transaksi. Tekan tombol + di bawah untuk mulai mencatat.</div>`;
}

function renderAllTransactions() {
  const q = (document.getElementById('txSearchInput').value || '').toLowerCase();
  const typeF = document.getElementById('txTypeFilter').value;
  const walletF = document.getElementById('txWalletFilter').value;

  const filtered = state.transactions.filter(t => {
    if (typeF !== 'all' && t.type !== typeF) return false;
    if (walletF !== 'all' && t.walletId !== walletF && t.toWalletId !== walletF) return false;
    if (q) {
      const cat = getCategory(t.categoryId).name.toLowerCase();
      const note = (t.note || '').toLowerCase();
      if (!cat.includes(q) && !note.includes(q)) return false;
    }
    return true;
  });

  document.getElementById('txCountBadge').textContent = `${filtered.length} item`;
  const listEl = document.getElementById('allTransactionsList');
  listEl.innerHTML = filtered.length
    ? filtered.slice(0, 80).map(t => renderTxCardHTML(t)).join('')
    : `<div class="neu-card empty-state">Tidak ada transaksi yang cocok dengan filter.</div>`;
}

function renderTxCardHTML(t) {
  const w = getWallet(t.walletId);
  let title = '';
  let icon = 'fa-tag';
  let color = '#2563eb';
  let sign = '-';

  if (t.type === 'transfer') {
    const dst = getWallet(t.toWalletId);
    title = `${w.name} → ${dst.name}`;
    icon = 'fa-right-left';
    color = '#0284c7';
    sign = '';
  } else {
    const cat = getCategory(t.categoryId);
    title = t.note || cat.name;
    icon = cat.icon;
    color = cat.color;
    sign = t.type === 'income' ? '+' : '-';
  }

  return `
    <div class="tx-item" data-edit-tx="${t.id}">
      <div class="item-left">
        <div class="item-icon" style="background:${color}">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="item-meta">
          <p class="item-title">${escapeHTML(title)}</p>
          <p class="item-sub">${t.date} • ${escapeHTML(w.name)}</p>
        </div>
      </div>
      <div class="item-amount ${t.type}">${sign}${formatRp(t.amount)}</div>
    </div>
  `;
}

function renderWalletsAndCategories() {
  const grid = document.getElementById('walletsGrid');
  grid.innerHTML = state.wallets.map(w => `
    <div class="wallet-card" data-edit-wallet="${w.id}">
      <div class="wallet-card-top">
        <div class="wallet-badge" style="background:${w.color}">
          <i class="fa-solid ${w.icon}"></i>
        </div>
        <i class="fa-solid fa-pen" style="font-size:0.75rem;color:#64748b"></i>
      </div>
      <p class="wallet-name">${escapeHTML(w.name)}</p>
      <p class="wallet-bal">${formatRp(w.balance)}</p>
    </div>
  `).join('');

  const catList = document.getElementById('categoriesList');
  const cats = state.categories.filter(c => c.type === activeCatTab);
  catList.innerHTML = cats.map(c => `
    <div class="tx-item" data-edit-cat="${c.id}">
      <div class="item-left">
        <div class="item-icon" style="background:${c.color}">
          <i class="fa-solid ${c.icon}"></i>
        </div>
        <div class="item-meta">
          <p class="item-title">${escapeHTML(c.name)}</p>
          <p class="item-sub">${c.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</p>
        </div>
      </div>
      <i class="fa-solid fa-pen" style="color:#64748b;font-size:0.85rem"></i>
    </div>
  `).join('');
}

function renderBillsAndWishlist() {
  const billsEl = document.getElementById('billsFullList');
  const sorted = [...state.recurringBills].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  billsEl.innerHTML = sorted.length
    ? sorted.map(b => renderBillCardHTML(b)).join('')
    : `<div class="neu-card empty-state">Belum ada tagihan rutin. Tambahkan listrik, internet, atau cicilan Anda.</div>`;

  const wishEl = document.getElementById('wishlistContainer');
  if (!state.wishlist.length) {
    wishEl.innerHTML = `<div class="neu-card empty-state">Wishlist Cooldown kosong. Gunakan fitur ini sebelum membeli barang impulsif.</div>`;
  } else {
    wishEl.innerHTML = state.wishlist.map(item => {
      const created = new Date(item.createdAt).getTime();
      const unlockAt = created + (item.cooldownHours * 3600 * 1000);
      const remainingMs = unlockAt - Date.now();
      const unlocked = remainingMs <= 0;
      const hrsLeft = Math.max(1, Math.ceil(remainingMs / 3600000));

      return `
        <div class="tx-item" style="cursor:default;">
          <div class="item-left">
            <div class="item-icon" style="background:${unlocked ? '#059669' : '#d97706'}">
              <i class="fa-solid ${unlocked ? 'fa-lock-open' : 'fa-hourglass-half'}"></i>
            </div>
            <div class="item-meta">
              <p class="item-title">${escapeHTML(item.title)}</p>
              <p class="item-sub">${formatRp(item.price)} • ${unlocked ? 'Masa tunggu selesai!' : `Tunggu ${hrsLeft} jam lagi`}</p>
            </div>
          </div>
          <div class="bill-actions">
            ${unlocked ? `<button type="button" class="neu-pill-btn morph-btn primary-pill" data-buy-wish="${item.id}">Beli</button>` : ''}
            <button type="button" class="neu-mini-btn morph-btn" data-del-wish="${item.id}" title="Batalkan">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderBillCardHTML(b) {
  const cat = getCategory(b.categoryId);
  const w = getWallet(b.walletId);
  const today = new Date(todayStr() + 'T00:00:00');
  const due = new Date(b.dueDate + 'T00:00:00');
  const diffDays = Math.round((due - today) / 86400000);

  let chip = `<span class="due-chip safe">H-${diffDays}</span>`;
  if (diffDays < 0) chip = `<span class="due-chip overdue">Telat ${Math.abs(diffDays)}h</span>`;
  else if (diffDays === 0) chip = `<span class="due-chip overdue">Hari Ini</span>`;
  else if (diffDays <= 3) chip = `<span class="due-chip soon">H-${diffDays}</span>`;

  return `
    <div class="tx-item" style="cursor:default;">
      <div class="item-left">
        <div class="item-icon" style="background:${cat.color}">
          <i class="fa-solid ${cat.icon}"></i>
        </div>
        <div class="item-meta">
          <p class="item-title">${escapeHTML(b.title)} ${chip}</p>
          <p class="item-sub">${formatRp(b.amount)} • ${w.name} (${b.dueDate})</p>
        </div>
      </div>
      <div class="bill-actions">
        <button type="button" class="neu-mini-btn morph-btn" data-edit-bill="${b.id}" title="Edit Tagihan">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button type="button" class="neu-pill-btn morph-btn primary-pill" data-pay-bill="${b.id}">
          Bayar
        </button>
      </div>
    </div>
  `;
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// =========================================================
// 7. NAVIGATION, MODALS & EVENT DELEGATION
// =========================================================
function switchView(target) {
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const sec = document.getElementById(`view-${target}`);
  if (sec) sec.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-target="${target}"]`);
  if (nav) nav.classList.add('active');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  // Initial render
  renderAll();
  document.getElementById('inputGasUrl').value = state.settings.gasUrl || '';

  if (localStorage.getItem(UNSYNCED_KEY) && state.settings.gasUrl) {
    pushToCloudBackground();
  } else if (state.settings.gasUrl) {
    updateSyncStatus(state.settings.lastSync ? `Tersinkron • ${state.settings.lastSync}` : 'Cloud Siap', false);
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Online auto-retry sync
  window.addEventListener('online', () => {
    if (localStorage.getItem(UNSYNCED_KEY)) pushToCloudBackground();
  });

  // Bottom nav & internal nav links
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => runFastAction(() => switchView(btn.dataset.target)));
  });

  document.querySelectorAll('[data-nav-target]').forEach(btn => {
    btn.addEventListener('click', () => runFastAction(() => switchView(btn.dataset.navTarget)));
  });

  // Month switcher
  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    runFastAction(() => {
      selectedMonth--;
      if (selectedMonth < 0) { selectedMonth = 11; selectedYear--; }
      renderDashboard();
    });
  });

  document.getElementById('btnNextMonth').addEventListener('click', () => {
    runFastAction(() => {
      selectedMonth++;
      if (selectedMonth > 11) { selectedMonth = 0; selectedYear++; }
      renderDashboard();
    });
  });

  // Privacy toggle
  document.getElementById('btnTogglePrivacy').addEventListener('click', () => {
    runFastAction(() => {
      hideBalances = !hideBalances;
      document.getElementById('privacyIcon').className = hideBalances ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      scheduleRender();
    });
  });

  // Quick action buttons & FAB
  document.getElementById('btnFabAdd').addEventListener('click', () => runFastAction(() => openTransactionModal(null, 'expense')));
  document.querySelectorAll('[data-quick-type]').forEach(btn => {
    btn.addEventListener('click', () => runFastAction(() => openTransactionModal(null, btn.dataset.quickType)));
  });

  // Segment switch in transaction modal
  document.querySelectorAll('#txTypeSegment .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setTxTypeUI(btn.dataset.type));
  });

  // Category tab switch
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      runFastAction(() => {
        activeCatTab = tab.dataset.catTab;
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t === tab));
        renderWalletsAndCategories();
      });
    });
  });

  // Filters
  document.getElementById('txSearchInput').addEventListener('input', () => renderAllTransactions());
  document.getElementById('txTypeFilter').addEventListener('change', () => renderAllTransactions());
  document.getElementById('txWalletFilter').addEventListener('change', () => renderAllTransactions());

  // Add buttons
  document.getElementById('btnAddWallet').addEventListener('click', () => runFastAction(() => openWalletModal(null)));
  document.getElementById('btnAddCategory').addEventListener('click', () => runFastAction(() => openCategoryModal(null)));
  document.getElementById('btnAddBill').addEventListener('click', () => runFastAction(() => openBillModal(null)));
  document.getElementById('btnAddWishlist').addEventListener('click', () => runFastAction(() => openWishlistModal()));

  // Settings & Sync
  document.getElementById('btnOpenSettings').addEventListener('click', () => runFastAction(() => openModal('modalSettings')));
  document.getElementById('btnQuickSync').addEventListener('click', () => runFastAction(() => pushToCloudBackground()));

  document.getElementById('btnSaveGasUrl').addEventListener('click', () => {
    runFastAction(() => {
      state.settings.gasUrl = document.getElementById('inputGasUrl').value.trim();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      Toast.fire({ icon: 'success', title: 'URL GAS tersimpan' });
      if (state.settings.gasUrl) pushToCloudBackground();
    });
  });

  document.getElementById('btnPullCloud').addEventListener('click', () => runFastAction(() => pullFromCloud()));

  // JSON Backup & Restore
  document.getElementById('btnExportJson').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kasaku-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('inputImportJson').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (imported.wallets && imported.transactions) {
          state = { ...structuredClone(DEFAULT_STATE), ...imported };
          saveAndSyncOptimistic();
          closeModal('modalSettings');
          Toast.fire({ icon: 'success', title: 'Backup berhasil dipulihkan' });
        }
      } catch (err) {
        Toast.fire({ icon: 'error', title: 'File JSON tidak valid' });
      }
    };
    reader.readAsText(file);
  });

  // Form Submits & Deletes
  document.getElementById('formTransaction').addEventListener('submit', handleSaveTransaction);
  document.getElementById('btnDeleteTx').addEventListener('click', handleDeleteTransaction);

  document.getElementById('formBill').addEventListener('submit', handleSaveBill);
  document.getElementById('btnDeleteBill').addEventListener('click', handleDeleteBill);

  document.getElementById('formWallet').addEventListener('submit', handleSaveWallet);
  document.getElementById('btnDeleteWallet').addEventListener('click', handleDeleteWallet);

  document.getElementById('formCategory').addEventListener('submit', handleSaveCategory);
  document.getElementById('btnDeleteCat').addEventListener('click', handleDeleteCategory);

  document.getElementById('formWishlist').addEventListener('submit', handleSaveWishlist);

  // Close Modal Buttons & Backdrop Click
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-backdrop').forEach(bg => {
    bg.addEventListener('click', (e) => {
      if (e.target === bg) closeModal(bg.id);
    });
  });

  // Delegated list item actions (zero listener overhead)
  document.getElementById('appMain').addEventListener('click', (e) => {
    const editTx = e.target.closest('[data-edit-tx]');
    if (editTx) return runFastAction(() => openTransactionModal(editTx.dataset.editTx));

    const editWallet = e.target.closest('[data-edit-wallet]');
    if (editWallet) return runFastAction(() => openWalletModal(editWallet.dataset.editWallet));

    const editCat = e.target.closest('[data-edit-cat]');
    if (editCat) return runFastAction(() => openCategoryModal(editCat.dataset.editCat));

    const editBill = e.target.closest('[data-edit-bill]');
    if (editBill) return runFastAction(() => openBillModal(editBill.dataset.editBill));

    const payBill = e.target.closest('[data-pay-bill]');
    if (payBill) return payRecurringBill(payBill.dataset.payBill);

    const buyWish = e.target.closest('[data-buy-wish]');
    if (buyWish) return buyWishlistItem(buyWish.dataset.buyWish);

    const delWish = e.target.closest('[data-del-wish]');
    if (delWish) return removeWishlistItem(delWish.dataset.delWish);
  });
});
