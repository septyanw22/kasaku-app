/**
 * KASAKU — Core Application Logic (Offline-First + Cloud Sync)
 */

const STORAGE_KEY = 'kasaku_ledger_v1';

const EXPENSE_CATEGORIES = [
  'Makan & Kopi',
  'Transportasi',
  'Tagihan',
  'Belanja',
  'Kesehatan',
  'Hiburan',
  'Keluarga',
  'Lainnya'
];

const INCOME_CATEGORIES = [
  'Gaji',
  'Tunjangan / Bonus',
  'Hasil Usaha',
  'Investasi',
  'Lainnya'
];

const WALLETS = ['QRIS / E-Wallet', 'Tunai', 'Rekening Bank'];

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

let appState = {
  transactions: [],
  budgets: [], // { category, limit, updatedAt }
  bills: [],   // { id, name, amount, category, wallet, dueDay, paidPeriod, updatedAt }
  wishlist: [], // { id, name, price, note, createdAt, unlockAt, purchased, updatedAt }
  settings: {
    gasUrl: '',
    theme: 'light',
    privacyMode: false,
    lastSync: ''
  }
};

let currentTxType = 'expense';
let currentNumpadRaw = '0';
let editingTxId = null;
let cashflowChartInstance = null;

/* =========================================================
   INITIALIZATION & STORAGE
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyTheme(appState.settings.theme);
  applyPrivacy(appState.settings.privacyMode);
  initSelectors();
  bindEvents();
  renderAll();
  registerServiceWorker();
});

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appState = {
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
        bills: Array.isArray(parsed.bills) ? parsed.bills : [],
        wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : [],
        settings: {
          gasUrl: parsed.settings?.gasUrl || '',
          theme: parsed.settings?.theme || 'light',
          privacyMode: Boolean(parsed.settings?.privacyMode),
          lastSync: parsed.settings?.lastSync || ''
        }
      };
    }
  } catch (err) {
    console.error('Gagal membaca localStorage:', err);
  }
}

function saveState(triggerAutoSync = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  renderAll();
  if (triggerAutoSync && appState.settings.gasUrl && navigator.onLine) {
    pushSyncToCloud(true);
  }
}

/* =========================================================
   HELPERS (FORMATTING, DATES, SECURITY)
   ========================================================= */
function formatIDR(num) {
  const value = Math.round(Number(num) || 0);
  const prefix = value < 0 ? '-Rp ' : 'Rp ';
  return prefix + Math.abs(value).toLocaleString('id-ID');
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentPeriodYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const el = document.getElementById('toast-box');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 2600);
}

/* =========================================================
   SELECTORS & EVENT BINDINGS
   ========================================================= */
function initSelectors() {
  // Budget & Bill Category dropdowns
  const budgetCatSelect = document.getElementById('budget-cat-select');
  const billCatSelect = document.getElementById('bill-category');
  const catOptions = EXPENSE_CATEGORIES.map(
    (c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`
  ).join('');
  budgetCatSelect.innerHTML = catOptions;
  billCatSelect.innerHTML = catOptions;

  // Report Month & Year selectors
  const now = new Date();
  const monthSel = document.getElementById('report-month-select');
  monthSel.innerHTML = MONTH_NAMES.map(
    (name, idx) => `<option value="${idx}" ${idx === now.getMonth() ? 'selected' : ''}>${name}</option>`
  ).join('');

  const yearSel = document.getElementById('report-year-select');
  const currentYear = now.getFullYear();
  let yearsHtml = '';
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    yearsHtml += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
  }
  yearSel.innerHTML = yearsHtml;

  document.getElementById('input-gas-url').value = appState.settings.gasUrl;
}

function bindEvents() {
  // Bottom Tab Navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      switchTab(targetId);
    });
  });

  document.getElementById('btn-see-all-tx').addEventListener('click', () => {
    switchTab('view-report');
  });

  // Theme & Privacy
  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const next = appState.settings.theme === 'light' ? 'dark' : 'light';
    appState.settings.theme = next;
    applyTheme(next);
    saveState(false);
  });

  document.getElementById('btn-privacy-toggle').addEventListener('click', () => {
    appState.settings.privacyMode = !appState.settings.privacyMode;
    applyPrivacy(appState.settings.privacyMode);
    saveState(false);
  });

  // Quick Sync Header Button
  document.getElementById('btn-sync-quick').addEventListener('click', () => {
    syncBidirectional();
  });

  // Open Transaction Modal
  document.getElementById('btn-open-tx-modal').addEventListener('click', () => {
    openTxModal();
  });

  // Switch Income / Expense inside Tx Modal
  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTxType(btn.dataset.txType);
    });
  });

  // Custom Numpad Keys
  document.querySelectorAll('.pad-key[data-key]').forEach((keyBtn) => {
    keyBtn.addEventListener('click', () => {
      handleNumpadKey(keyBtn.dataset.key);
    });
  });

  // Quick Chip Adders
  document.querySelectorAll('.chip-add').forEach((chip) => {
    chip.addEventListener('click', () => {
      const add = Number(chip.dataset.addVal) || 0;
      const current = Number(currentNumpadRaw) || 0;
      currentNumpadRaw = String(current + add);
      updateNumpadDisplay();
    });
  });

  // Save Transaction
  document.getElementById('btn-save-tx').addEventListener('click', saveTransactionFromModal);

  // Close Modals
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.closeModal).classList.add('hidden');
    });
  });

  // Budget Modal
  document.getElementById('btn-open-budget-modal').addEventListener('click', () => {
    document.getElementById('budget-limit-input').value = '';
    document.getElementById('modal-budget').classList.remove('hidden');
  });
  document.getElementById('btn-save-budget').addEventListener('click', saveBudgetEnvelope);

  // Report Filters & Exports
  document.getElementById('report-month-select').addEventListener('change', renderReportView);
  document.getElementById('report-year-select').addEventListener('change', renderReportView);
  document.getElementById('btn-export-csv').addEventListener('click', exportMonthlyCSV);
  document.getElementById('btn-print-pdf').addEventListener('click', printMonthlyReceipt);

  // Recurring Bills Modal
  document.getElementById('btn-open-bill-modal').addEventListener('click', () => {
    document.getElementById('bill-name').value = '';
    document.getElementById('bill-amount').value = '';
    document.getElementById('modal-bill').classList.remove('hidden');
  });
  document.getElementById('btn-save-bill').addEventListener('click', saveRecurringBill);

  // Wishlist Modal
  document.getElementById('btn-open-wish-modal').addEventListener('click', () => {
    document.getElementById('wish-name').value = '';
    document.getElementById('wish-price').value = '';
    document.getElementById('wish-note').value = '';
    document.getElementById('modal-wish').classList.remove('hidden');
  });
  document.getElementById('btn-save-wish').addEventListener('click', saveWishlistItem);

  // Settings & Sync
  document.getElementById('btn-save-gas-url').addEventListener('click', () => {
    const url = document.getElementById('input-gas-url').value.trim();
    appState.settings.gasUrl = url;
    saveState(false);
    showToast('URL Google Apps Script disimpan.');
  });

  document.getElementById('btn-sync-now').addEventListener('click', () => {
    const url = document.getElementById('input-gas-url').value.trim();
    appState.settings.gasUrl = url;
    saveState(false);
    syncBidirectional();
  });

  document.getElementById('btn-backup-json').addEventListener('click', exportBackupJSON);
  document.getElementById('input-restore-json').addEventListener('change', importBackupJSON);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  const activeNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (activeNav) activeNav.classList.add('active');
  if (tabId === 'view-report') renderReportView();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  document.getElementById('icon-moon').classList.toggle('hidden', isDark);
  document.getElementById('icon-sun').classList.toggle('hidden', !isDark);
  document.getElementById('meta-theme-color').setAttribute('content', isDark ? '#111215' : '#F4F1EA');
}

function applyPrivacy(enabled) {
  document.body.classList.toggle('privacy-active', enabled);
  document.getElementById('icon-eye-open').classList.toggle('hidden', enabled);
  document.getElementById('icon-eye-closed').classList.toggle('hidden', !enabled);
}

/* =========================================================
   TRANSACTION MODAL & CUSTOM NUMPAD
   ========================================================= */
function openTxModal(txToEdit = null) {
  if (txToEdit) {
    editingTxId = txToEdit.id;
    setTxType(txToEdit.type);
    currentNumpadRaw = String(Math.round(txToEdit.amount));
    document.getElementById('tx-category').value = txToEdit.category;
    document.getElementById('tx-wallet').value = txToEdit.wallet;
    document.getElementById('tx-date').value = txToEdit.date;
    document.getElementById('tx-note').value = txToEdit.note || '';
    document.getElementById('btn-save-tx').textContent = 'PERBARUI TRANSAKSI';
  } else {
    editingTxId = null;
    setTxType('expense');
    currentNumpadRaw = '0';
    document.getElementById('tx-date').value = getTodayISO();
    document.getElementById('tx-note').value = '';
    document.getElementById('btn-save-tx').textContent = 'SIMPAN TRANSAKSI';
  }
  updateNumpadDisplay();
  document.getElementById('modal-tx').classList.remove('hidden');
}

function setTxType(type) {
  currentTxType = type;
  document.getElementById('btn-type-expense').classList.toggle('active', type === 'expense');
  document.getElementById('btn-type-income').classList.toggle('active', type === 'income');

  const list = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  document.getElementById('tx-category').innerHTML = list
    .map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`)
    .join('');
}

function handleNumpadKey(key) {
  if (key === 'CLEAR') {
    currentNumpadRaw = '0';
  } else if (key === 'BACK') {
    currentNumpadRaw = currentNumpadRaw.length > 1 ? currentNumpadRaw.slice(0, -1) : '0';
  } else if (key === '000') {
    if (currentNumpadRaw !== '0' && currentNumpadRaw.length <= 9) {
      currentNumpadRaw += '000';
    }
  } else {
    if (currentNumpadRaw === '0') {
      currentNumpadRaw = key;
    } else if (currentNumpadRaw.length < 12) {
      currentNumpadRaw += key;
    }
  }
  updateNumpadDisplay();
}

function updateNumpadDisplay() {
  const num = Number(currentNumpadRaw) || 0;
  document.getElementById('numpad-display').textContent = num.toLocaleString('id-ID');
}

function saveTransactionFromModal() {
  const amount = Number(currentNumpadRaw) || 0;
  if (amount <= 0) {
    showToast('Masukkan nominal lebih dari Rp 0.');
    return;
  }

  const category = document.getElementById('tx-category').value;
  const wallet = document.getElementById('tx-wallet').value;
  const date = document.getElementById('tx-date').value || getTodayISO();
  const note = document.getElementById('tx-note').value.trim();
  const nowISO = new Date().toISOString();

  if (editingTxId) {
    const idx = appState.transactions.findIndex((t) => t.id === editingTxId);
    if (idx !== -1) {
      appState.transactions[idx] = {
        ...appState.transactions[idx],
        type: currentTxType,
        amount,
        category,
        wallet,
        date,
        note,
        updatedAt: nowISO
      };
    }
    showToast('Transaksi diperbarui.');
  } else {
    appState.transactions.push({
      id: uid('tx'),
      type: currentTxType,
      amount,
      category,
      wallet,
      date,
      note,
      updatedAt: nowISO
    });
    showToast('Transaksi tercatat.');
  }

  document.getElementById('modal-tx').classList.add('hidden');
  saveState(true);
}

function deleteTransaction(id) {
  if (!confirm('Hapus transaksi ini dari catatan?')) return;
  appState.transactions = appState.transactions.filter((t) => t.id !== id);
  showToast('Transaksi dihapus.');
  saveState(true);
}

/* =========================================================
   RENDERING ENGINE (DASHBOARD, BUDGETS, REPORTS, TOOLS)
   ========================================================= */
function renderAll() {
  const now = new Date();
  document.getElementById('header-period-label').textContent =
    `Buku Kas • ${MONTH_NAMES[now.getMonth()].slice(0, 3)} ${now.getFullYear()}`;

  renderDashboard();
  renderBudgetsView();
  renderReportView();
  renderToolsView();
}

function renderDashboard() {
  const now = new Date();
  const ym = getCurrentPeriodYM();

  let totalIncomeAll = 0;
  let totalExpenseAll = 0;
  let monthIncome = 0;
  let monthExpense = 0;
  const walletBalances = { 'QRIS / E-Wallet': 0, 'Tunai': 0, 'Rekening Bank': 0 };

  appState.transactions.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    const isThisMonth = tx.date && tx.date.startsWith(ym);

    if (tx.type === 'income') {
      totalIncomeAll += amt;
      if (isThisMonth) monthIncome += amt;
      if (walletBalances[tx.wallet] !== undefined) walletBalances[tx.wallet] += amt;
    } else {
      totalExpenseAll += amt;
      if (isThisMonth) monthExpense += amt;
      if (walletBalances[tx.wallet] !== undefined) walletBalances[tx.wallet] -= amt;
    }
  });

  const netBalance = totalIncomeAll - totalExpenseAll;
  document.getElementById('dash-net-balance').textContent = formatIDR(netBalance);
  document.getElementById('dash-month-in').textContent = formatIDR(monthIncome);
  document.getElementById('dash-month-out').textContent = formatIDR(monthExpense);

  // Kalkulasi "Sisa Napas" (Safe-to-Spend Harian)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);
  const totalBudgetLimit = appState.budgets.reduce((sum, b) => sum + (Number(b.limit) || 0), 0);

  let remainingPool = 0;
  let hintText = '';

  if (totalBudgetLimit > 0) {
    remainingPool = Math.max(0, totalBudgetLimit - monthExpense);
    hintText = `Sisa pagu anggaran ${formatIDR(remainingPool)} ÷ ${remainingDays} hari.`;
  } else {
    remainingPool = Math.max(0, monthIncome - monthExpense);
    hintText = `Sisa arus kas bulan ini ${formatIDR(remainingPool)} ÷ ${remainingDays} hari.`;
  }

  const dailySafe = Math.floor(remainingPool / remainingDays);
  document.getElementById('dash-days-left').textContent = `${remainingDays} hari tersisa`;
  document.getElementById('dash-daily-safe').innerHTML = `${formatIDR(dailySafe)}<span class="unit">/hari</span>`;
  document.getElementById('dash-safe-caption').textContent = hintText;

  // Render Wallet Strip
  document.getElementById('dash-wallet-list').innerHTML = WALLETS.map(
    (w) => `
      <div class="wallet-tile">
        <span class="wallet-name">${escapeHTML(w)}</span>
        <span class="wallet-bal money-val">${formatIDR(walletBalances[w])}</span>
      </div>
    `
  ).join('');

  // Render 5 Recent Transactions
  const sorted = [...appState.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const recent = sorted.slice(0, 5);
  const recentContainer = document.getElementById('dash-recent-tx');

  if (recent.length === 0) {
    recentContainer.innerHTML = `<div class="empty-state">Belum ada catatan transaksi. Tekan tombol <strong>+</strong> di bawah untuk mulai mencatat.</div>`;
  } else {
    recentContainer.innerHTML = recent.map((tx) => buildTxRowHTML(tx)).join('');
    bindTxRowActions(recentContainer);
  }

  // Sync Badge
  const badge = document.getElementById('sync-badge');
  if (appState.settings.lastSync) {
    badge.textContent = 'Tersinkron';
    badge.classList.add('synced');
  } else {
    badge.textContent = 'Lokal';
    badge.classList.remove('synced');
  }
}

function buildTxRowHTML(tx) {
  const isInc = tx.type === 'income';
  const sign = isInc ? '+' : '-';
  const cls = isInc ? 'text-income' : 'text-expense';
  const noteStr = tx.note ? ` • ${escapeHTML(tx.note)}` : '';

  return `
    <div class="tx-row">
      <div class="tx-left">
        <span class="tx-cat">${escapeHTML(tx.category)}</span>
        <span class="tx-meta">${escapeHTML(tx.date)} • ${escapeHTML(tx.wallet)}${noteStr}</span>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${cls} money-val">${sign}${formatIDR(tx.amount)}</span>
        <div class="tx-actions">
          <button type="button" class="mini-action-btn edit" data-edit-id="${tx.id}">Edit</button>
          <button type="button" class="mini-action-btn del" data-del-id="${tx.id}">Hapus</button>
        </div>
      </div>
    </div>
  `;
}

function bindTxRowActions(container) {
  container.querySelectorAll('[data-edit-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = appState.transactions.find((t) => t.id === btn.dataset.editId);
      if (tx) openTxModal(tx);
    });
  });
  container.querySelectorAll('[data-del-id]').forEach((btn) => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.delId));
  });
}

/* =========================================================
   ENVELOPE BUDGETING
   ========================================================= */
function saveBudgetEnvelope() {
  const category = document.getElementById('budget-cat-select').value;
  const limit = Number(document.getElementById('budget-limit-input').value) || 0;

  if (limit <= 0) {
    showToast('Masukkan batas anggaran lebih dari Rp 0.');
    return;
  }

  const existingIdx = appState.budgets.findIndex((b) => b.category === category);
  const record = { category, limit, updatedAt: new Date().toISOString() };

  if (existingIdx !== -1) {
    appState.budgets[existingIdx] = record;
  } else {
    appState.budgets.push(record);
  }

  document.getElementById('modal-budget').classList.add('hidden');
  showToast(`Pos anggaran ${category} disimpan.`);
  saveState(true);
}

function deleteBudgetEnvelope(category) {
  appState.budgets = appState.budgets.filter((b) => b.category !== category);
  showToast(`Pos anggaran ${category} dihapus.`);
  saveState(true);
}

function renderBudgetsView() {
  const ym = getCurrentPeriodYM();
  const spentByCat = {};

  appState.transactions.forEach((tx) => {
    if (tx.type === 'expense' && tx.date && tx.date.startsWith(ym)) {
      spentByCat[tx.category] = (spentByCat[tx.category] || 0) + (Number(tx.amount) || 0);
    }
  });

  let totalLimit = 0;
  let totalSpentInBudgeted = 0;

  const listEl = document.getElementById('budget-list');
  if (appState.budgets.length === 0) {
    document.getElementById('budget-total-summary').textContent = 'Rp 0 / Rp 0';
    document.getElementById('budget-total-pct').textContent = '0%';
    listEl.innerHTML = `<div class="ledger-card empty-state">Belum ada pos anggaran. Tekan <strong>+ Atur Pos</strong> untuk membatasi pengeluaran bulanan.</div>`;
    return;
  }

  listEl.innerHTML = appState.budgets
    .map((b) => {
      const spent = spentByCat[b.category] || 0;
      const limit = Number(b.limit) || 1;
      totalLimit += limit;
      totalSpentInBudgeted += spent;

      const rawPct = Math.round((spent / limit) * 100);
      const barWidth = Math.min(100, rawPct);
      let barClass = '';
      if (rawPct > 95) barClass = 'danger';
      else if (rawPct >= 75) barClass = 'warn';

      const sisa = limit - spent;
      const sisaLabel = sisa >= 0 ? `Sisa ${formatIDR(sisa)}` : `Overbudget ${formatIDR(Math.abs(sisa))}`;

      return `
        <div class="ledger-card">
          <div class="budget-item-top">
            <span class="budget-cat-name">${escapeHTML(b.category)}</span>
            <span class="budget-numbers money-val">${formatIDR(spent)} / ${formatIDR(limit)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${barClass}" style="width: ${barWidth}%"></div>
          </div>
          <div class="budget-footer">
            <span class="money-val">${sisaLabel} (${rawPct}%)</span>
            <button type="button" class="mini-action-btn del" data-del-budget="${escapeHTML(b.category)}">Hapus</button>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('[data-del-budget]').forEach((btn) => {
    btn.addEventListener('click', () => deleteBudgetEnvelope(btn.dataset.delBudget));
  });

  const overallPct = totalLimit > 0 ? Math.round((totalSpentInBudgeted / totalLimit) * 100) : 0;
  document.getElementById('budget-total-summary').textContent = `${formatIDR(totalSpentInBudgeted)} / ${formatIDR(totalLimit)}`;
  document.getElementById('budget-total-pct').textContent = `${overallPct}%`;
}

/* =========================================================
   MONTHLY RESUME, AUDIT & CHART
   ========================================================= */
function getSelectedPeriodTxs() {
  const m = Number(document.getElementById('report-month-select').value);
  const y = Number(document.getElementById('report-year-select').value);
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
  const txs = appState.transactions.filter((t) => t.date && t.date.startsWith(ym));
  return { m, y, ym, txs };
}

function renderReportView() {
  const { m, y, txs } = getSelectedPeriodTxs();

  let inc = 0;
  let exp = 0;
  const catTotals = {};

  txs.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      inc += amt;
    } else {
      exp += amt;
      catTotals[t.category] = (catTotals[t.category] || 0) + amt;
    }
  });

  // Savings Rate
  const savingsRate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
  const srEl = document.getElementById('rep-savings-rate');
  srEl.textContent = `${savingsRate}%`;
  srEl.className = `kpi-val ${savingsRate >= 20 ? 'text-income' : savingsRate < 0 ? 'text-expense' : ''}`;
  document.getElementById('rep-savings-note').textContent =
    inc > 0 ? `Surplus ${formatIDR(inc - exp)}` : 'Belum ada pemasukan periode ini';

  // Month-over-Month Expense Comparison
  const prevDate = new Date(y, m - 1, 1);
  const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevExp = appState.transactions
    .filter((t) => t.type === 'expense' && t.date && t.date.startsWith(prevYM))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const momEl = document.getElementById('rep-mom-diff');
  const momNote = document.getElementById('rep-mom-note');
  if (prevExp === 0) {
    momEl.textContent = '—';
    momEl.className = 'kpi-val';
    momNote.textContent = 'Data bulan lalu kosong';
  } else {
    const diffPct = Math.round(((exp - prevExp) / prevExp) * 100);
    if (diffPct <= 0) {
      momEl.textContent = `${Math.abs(diffPct)}% Hemat`;
      momEl.className = 'kpi-val text-income';
      momNote.textContent = `Turun dari ${formatIDR(prevExp)}`;
    } else {
      momEl.textContent = `+${diffPct}% Boros`;
      momEl.className = 'kpi-val text-expense';
      momNote.textContent = `Naik dari ${formatIDR(prevExp)}`;
    }
  }

  // Top 3 Pos Bocor
  const leaks = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const leaksEl = document.getElementById('rep-top-leaks');
  if (leaks.length === 0) {
    leaksEl.innerHTML = `<div class="empty-state">Belum ada data pengeluaran pada periode ini.</div>`;
  } else {
    leaksEl.innerHTML = leaks
      .map(([cat, val], idx) => {
        const share = exp > 0 ? Math.round((val / exp) * 100) : 0;
        return `
          <div class="tx-row">
            <div class="tx-left">
              <span class="tx-cat">#${idx + 1} ${escapeHTML(cat)}</span>
              <span class="tx-meta">${share}% dari total pengeluaran</span>
            </div>
            <div class="tx-right">
              <span class="tx-amount text-expense money-val">${formatIDR(val)}</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Full Transaction List for Period
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  const fullListEl = document.getElementById('rep-full-tx-list');
  if (sorted.length === 0) {
    fullListEl.innerHTML = `<div class="empty-state">Tidak ada transaksi di ${MONTH_NAMES[m]} ${y}.</div>`;
  } else {
    fullListEl.innerHTML = sorted.map((t) => buildTxRowHTML(t)).join('');
    bindTxRowActions(fullListEl);
  }

  renderDailyCashflowChart(m, y, txs);
}

function renderDailyCashflowChart(monthIdx, year, txs) {
  const canvas = document.getElementById('cashflow-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const daysCount = new Date(year, monthIdx + 1, 0).getDate();
  const labels = Array.from({ length: daysCount }, (_, i) => String(i + 1));
  const dailyInc = new Array(daysCount).fill(0);
  const dailyExp = new Array(daysCount).fill(0);

  txs.forEach((t) => {
    const day = Number(t.date.split('-')[2]) || 0;
    if (day >= 1 && day <= daysCount) {
      if (t.type === 'income') dailyInc[day - 1] += Number(t.amount) || 0;
      else dailyExp[day - 1] += Number(t.amount) || 0;
    }
  });

  if (cashflowChartInstance) {
    cashflowChartInstance.destroy();
  }

  const isDark = appState.settings.theme === 'dark';
  const gridColor = isDark ? '#2A2D35' : '#E5E0D5';
  const tickColor = isDark ? '#9CA3AF' : '#64625C';

  cashflowChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: dailyInc,
          backgroundColor: isDark ? '#34D399' : '#1E5631',
          borderRadius: 2
        },
        {
          label: 'Pengeluaran',
          data: dailyExp,
          backgroundColor: isDark ? '#F87171' : '#C84B31',
          borderRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 10 }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 10 },
            callback: (val) => (val >= 1000 ? `${val / 1000}k` : val)
          }
        }
      }
    }
  });
}

function exportMonthlyCSV() {
  const { m, y, txs } = getSelectedPeriodTxs();
  if (txs.length === 0) {
    showToast('Tidak ada data transaksi untuk diekspor.');
    return;
  }

  const headers = ['Tanggal', 'Tipe', 'Kategori', 'Dompet', 'Nominal', 'Catatan'];
  const rows = txs.map((t) => [
    t.date,
    t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
    `"${(t.category || '').replace(/"/g, '""')}"`,
    `"${(t.wallet || '').replace(/"/g, '""')}"`,
    t.amount,
    `"${(t.note || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KASAKU_${MONTH_NAMES[m]}_${y}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('File CSV berhasil diunduh.');
}

function printMonthlyReceipt() {
  const { m, y, txs } = getSelectedPeriodTxs();
  const inc = txs.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const exp = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  document.getElementById('print-period-text').textContent = `Periode: ${MONTH_NAMES[m]} ${y}`;
  document.getElementById('print-summary-rows').innerHTML = `
    <div class="receipt-summary-item"><span>Total Pemasukan:</span><strong>${formatIDR(inc)}</strong></div>
    <div class="receipt-summary-item"><span>Total Pengeluaran:</span><strong>${formatIDR(exp)}</strong></div>
    <div class="receipt-summary-item"><span>Selisih Bersih:</span><strong>${formatIDR(inc - exp)}</strong></div>
  `;

  const tbody = document.querySelector('#print-tx-table tbody');
  tbody.innerHTML = txs
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (t) => `
      <tr>
        <td>${escapeHTML(t.date)}</td>
        <td>${escapeHTML(t.category)}</td>
        <td>${escapeHTML(t.note || '-')}</td>
        <td>${escapeHTML(t.wallet)}</td>
        <td style="text-align:right">${t.type === 'income' ? '+' : '-'}${formatIDR(t.amount)}</td>
      </tr>
    `
    )
    .join('');

  window.print();
}

/* =========================================================
   SMART TOOLS: RECURRING BILLS & 7-DAY WISHLIST COOLDOWN
   ========================================================= */
function saveRecurringBill() {
  const name = document.getElementById('bill-name').value.trim();
  const amount = Number(document.getElementById('bill-amount').value) || 0;
  const dueDay = Math.min(31, Math.max(1, Number(document.getElementById('bill-due-day').value) || 1));
  const category = document.getElementById('bill-category').value;
  const wallet = document.getElementById('bill-wallet').value;

  if (!name || amount <= 0) {
    showToast('Lengkapi nama dan nominal tagihan.');
    return;
  }

  appState.bills.push({
    id: uid('bill'),
    name,
    amount,
    category,
    wallet,
    dueDay,
    paidPeriod: '',
    updatedAt: new Date().toISOString()
  });

  document.getElementById('modal-bill').classList.add('hidden');
  showToast('Tagihan rutin ditambahkan.');
  saveState(true);
}

function payRecurringBill(billId) {
  const bill = appState.bills.find((b) => b.id === billId);
  if (!bill) return;

  const currentYM = getCurrentPeriodYM();
  if (bill.paidPeriod === currentYM) return;

  const nowISO = new Date().toISOString();
  bill.paidPeriod = currentYM;
  bill.updatedAt = nowISO;

  appState.transactions.push({
    id: uid('tx'),
    type: 'expense',
    amount: bill.amount,
    category: bill.category,
    wallet: bill.wallet,
    date: getTodayISO(),
    note: `Tagihan: ${bill.name}`,
    updatedAt: nowISO
  });

  showToast(`Tagihan ${bill.name} lunas & tercatat.`);
  saveState(true);
}

function deleteRecurringBill(billId) {
  appState.bills = appState.bills.filter((b) => b.id !== billId);
  showToast('Tagihan dihapus.');
  saveState(true);
}

function saveWishlistItem() {
  const name = document.getElementById('wish-name').value.trim();
  const price = Number(document.getElementById('wish-price').value) || 0;
  const note = document.getElementById('wish-note').value.trim();

  if (!name || price <= 0) {
    showToast('Isi nama barang dan estimasi harga.');
    return;
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  appState.wishlist.push({
    id: uid('wish'),
    name,
    price,
    note,
    createdAt: new Date(now).toISOString(),
    unlockAt: new Date(now + sevenDaysMs).toISOString(),
    purchased: false,
    updatedAt: new Date(now).toISOString()
  });

  document.getElementById('modal-wish').classList.add('hidden');
  showToast('Wishlist masuk masa tunggu 7 hari.');
  saveState(true);
}

function buyWishlistItem(wishId) {
  const item = appState.wishlist.find((w) => w.id === wishId);
  if (!item) return;

  const nowISO = new Date().toISOString();
  item.purchased = true;
  item.updatedAt = nowISO;

  appState.transactions.push({
    id: uid('tx'),
    type: 'expense',
    amount: item.price,
    category: 'Belanja',
    wallet: 'QRIS / E-Wallet',
    date: getTodayISO(),
    note: `Wishlist: ${item.name}`,
    updatedAt: nowISO
  });

  showToast(`${item.name} dibeli & dicatat sebagai pengeluaran.`);
  saveState(true);
}

function deleteWishlistItem(wishId) {
  appState.wishlist = appState.wishlist.filter((w) => w.id !== wishId);
  showToast('Item wishlist dihapus.');
  saveState(true);
}

function renderToolsView() {
  const currentYM = getCurrentPeriodYM();
  const billListEl = document.getElementById('tools-bill-list');

  if (appState.bills.length === 0) {
    billListEl.innerHTML = `<div class="ledger-card empty-state">Belum ada jadwal tagihan rutin.</div>`;
  } else {
    billListEl.innerHTML = appState.bills
      .map((b) => {
        const isPaid = b.paidPeriod === currentYM;
        return `
          <div class="ledger-card tool-row">
            <div>
              <div class="tx-cat">${escapeHTML(b.name)}</div>
              <div class="tx-meta money-val">${formatIDR(b.amount)} • Jatuh tempo tgl ${b.dueDay}</div>
            </div>
            <div class="action-row-sm">
              ${
                isPaid
                  ? `<span class="badge-paid">Lunas</span>`
                  : `<button type="button" class="btn-outline-sm" data-pay-bill="${b.id}">Tandai Lunas</button>`
              }
              <button type="button" class="mini-action-btn del" data-del-bill="${b.id}">✕</button>
            </div>
          </div>
        `;
      })
      .join('');

    billListEl.querySelectorAll('[data-pay-bill]').forEach((btn) =>
      btn.addEventListener('click', () => payRecurringBill(btn.dataset.payBill))
    );
    billListEl.querySelectorAll('[data-del-bill]').forEach((btn) =>
      btn.addEventListener('click', () => deleteRecurringBill(btn.dataset.delBill))
    );
  }

  // Wishlist Cooldown List
  const wishListEl = document.getElementById('tools-wish-list');
  const activeWishes = appState.wishlist.filter((w) => !w.purchased);

  if (activeWishes.length === 0) {
    wishListEl.innerHTML = `<div class="ledger-card empty-state">Wishlist kosong. Catat barang incaran agar tidak lapar mata.</div>`;
  } else {
    const nowMs = Date.now();
    wishListEl.innerHTML = activeWishes
      .map((w) => {
        const unlockMs = new Date(w.unlockAt).getTime();
        const diffMs = unlockMs - nowMs;
        const isUnlocked = diffMs <= 0;
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60));

        const statusLabel = isUnlocked
          ? 'Masa tunggu selesai. Masih yakin mau beli?'
          : daysLeft > 1
            ? `Terkunci: ${daysLeft} hari lagi`
            : `Terkunci: ${hoursLeft} jam lagi`;

        return `
          <div class="ledger-card tool-row">
            <div>
              <div class="tx-cat">${escapeHTML(w.name)}</div>
              <div class="tx-meta money-val">${formatIDR(w.price)}${w.note ? ` • ${escapeHTML(w.note)}` : ''}</div>
              <span class="cooldown-tag">${statusLabel}</span>
            </div>
            <div class="action-row-sm">
              <button type="button" class="btn-outline-sm" ${isUnlocked ? '' : 'disabled'} data-buy-wish="${w.id}">
                Beli
              </button>
              <button type="button" class="mini-action-btn del" data-del-wish="${w.id}">✕</button>
            </div>
          </div>
        `;
      })
      .join('');

    wishListEl.querySelectorAll('[data-buy-wish]').forEach((btn) =>
      btn.addEventListener('click', () => buyWishlistItem(btn.dataset.buyWish))
    );
    wishListEl.querySelectorAll('[data-del-wish]').forEach((btn) =>
      btn.addEventListener('click', () => deleteWishlistItem(btn.dataset.delWish))
    );
  }

  document.getElementById('settings-last-sync').textContent = appState.settings.lastSync
    ? `Sinkron terakhir: ${new Date(appState.settings.lastSync).toLocaleString('id-ID')}`
    : 'Belum pernah disinkronkan ke cloud.';
}

/* =========================================================
   CLOUD SYNC (GOOGLE APPS SCRIPT) & JSON BACKUP
   ========================================================= */
async function pushSyncToCloud(silent = false) {
  const url = appState.settings.gasUrl;
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'syncAll',
        data: {
          transactions: appState.transactions,
          budgets: appState.budgets,
          bills: appState.bills,
          wishlist: appState.wishlist
        }
      })
    });
    const json = await res.json();
    if (json.status === 'success') {
      appState.settings.lastSync = json.syncedAt || new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
      renderDashboard();
      renderToolsView();
      if (!silent) showToast('Data tersinkron ke Google Sheets.');
    } else if (!silent) {
      showToast('Gagal sync: ' + (json.message || 'Error server'));
    }
  } catch (err) {
    if (!silent) showToast('Offline atau URL GAS tidak terjangkau.');
  }
}

async function syncBidirectional() {
  const url = appState.settings.gasUrl;
  if (!url) {
    showToast('Masukkan URL Google Apps Script di tab Alat.');
    switchTab('view-tools');
    return;
  }

  const syncBtn = document.getElementById('btn-sync-quick');
  syncBtn.classList.add('spinning');

  try {
    // Jika lokal masih kosong, tarik data dari cloud terlebih dahulu
    if (appState.transactions.length === 0 && appState.budgets.length === 0) {
      const getRes = await fetch(url);
      const getJson = await getRes.json();
      if (getJson.status === 'success' && getJson.data) {
        appState.transactions = getJson.data.transactions || [];
        appState.budgets = getJson.data.budgets || [];
        appState.bills = getJson.data.bills || [];
        appState.wishlist = getJson.data.wishlist || [];
        appState.settings.lastSync = new Date().toISOString();
        saveState(false);
        showToast('Data dipulihkan dari Google Sheets.');
        return;
      }
    }
    await pushSyncToCloud(false);
  } catch (err) {
    showToast('Gagal terhubung ke Google Sheets.');
  } finally {
    syncBtn.classList.remove('spinning');
  }
}

function exportBackupJSON() {
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KASAKU_Backup_${getTodayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Cadangan JSON diunduh.');
}

function importBackupJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported.transactions)) throw new Error('Format tidak valid');
      appState.transactions = imported.transactions || [];
      appState.budgets = imported.budgets || [];
      appState.bills = imported.bills || [];
      appState.wishlist = imported.wishlist || [];
      saveState(true);
      showToast('Data berhasil dipulihkan dari JSON.');
    } catch (err) {
      showToast('File JSON cadangan tidak valid.');
    }
  };
  reader.readAsText(file);
}

/* =========================================================
   SERVICE WORKER REGISTRATION
   ========================================================= */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }
}