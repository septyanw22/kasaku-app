/**
 * KASAKU v3 — Core Application Logic
 * Features: Editable Recurring Bills + Due Alerts, Wallet Transfers + Admin Fee,
 * Savings Goals (Celengan), Custom Payday Cycle, Search/Filter, & Button Morphing
 */

const STORAGE_KEY = 'kasaku_ledger_v1';

const DEFAULT_EXPENSE_CATEGORIES = [
  'Makan & Kopi',
  'Transportasi',
  'Tagihan',
  'Belanja',
  'Kesehatan',
  'Hiburan',
  'Keluarga',
  'Lainnya'
];

const DEFAULT_INCOME_CATEGORIES = [
  'Gaji',
  'Tunjangan / Bonus',
  'Hasil Usaha',
  'Investasi',
  'Lainnya'
];

const DEFAULT_WALLETS = ['QRIS / E-Wallet', 'Tunai', 'Rekening Bank'];

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

let appState = {
  transactions: [],
  budgets: [],
  bills: [],
  wishlist: [],
  goals: [],
  categories: {
    expense: [...DEFAULT_EXPENSE_CATEGORIES],
    income: [...DEFAULT_INCOME_CATEGORIES]
  },
  wallets: [...DEFAULT_WALLETS],
  settings: {
    gasUrl: '',
    theme: 'light',
    privacyMode: false,
    lastSync: '',
    cycleStartDay: 1
  }
};

let currentTxType = 'expense';
let currentNumpadRaw = '0';
let editingTxId = null;
let editingBillId = null;
let editingGoalId = null;
let depositingGoalId = null;
let editingWalletOldName = null;
let editingCategoryState = null;
let activeManageCatTab = 'expense';
let reportFilterType = 'all';
let reportSearchQuery = '';
let lastSavedTxId = null;
let prevNetBalance = 0;
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
  renderAll(true);
  registerServiceWorker();
});

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const txs = Array.isArray(parsed.transactions) ? parsed.transactions : [];

      const expCats = Array.isArray(parsed.categories?.expense) && parsed.categories.expense.length
        ? parsed.categories.expense
        : [...DEFAULT_EXPENSE_CATEGORIES];

      const incCats = Array.isArray(parsed.categories?.income) && parsed.categories.income.length
        ? parsed.categories.income
        : [...DEFAULT_INCOME_CATEGORIES];

      const wallets = Array.isArray(parsed.wallets) && parsed.wallets.length
        ? parsed.wallets
        : [...DEFAULT_WALLETS];

      txs.forEach((t) => {
        if (t.wallet && !wallets.includes(t.wallet)) wallets.push(t.wallet);
        if (t.toWallet && !wallets.includes(t.toWallet)) wallets.push(t.toWallet);
        if (t.type === 'expense' && t.category && !expCats.includes(t.category)) expCats.push(t.category);
        if (t.type === 'income' && t.category && !incCats.includes(t.category)) incCats.push(t.category);
      });

      appState = {
        transactions: txs,
        budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
        bills: Array.isArray(parsed.bills) ? parsed.bills : [],
        wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        categories: { expense: expCats, income: incCats },
        wallets,
        settings: {
          gasUrl: parsed.settings?.gasUrl || '',
          theme: parsed.settings?.theme || 'light',
          privacyMode: Boolean(parsed.settings?.privacyMode),
          lastSync: parsed.settings?.lastSync || '',
          cycleStartDay: Math.min(28, Math.max(1, Number(parsed.settings?.cycleStartDay) || 1))
        }
      };
    }
  } catch (err) {
    console.error('Gagal membaca localStorage:', err);
  }
}

function saveState(triggerAutoSync = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  refreshDynamicSelects();
  renderAll(false);
  if (triggerAutoSync && appState.settings.gasUrl && navigator.onLine) {
    pushSyncToCloud(true);
  }
}

/* =========================================================
   DATE, CYCLE & MOTION HELPERS
   ========================================================= */
function formatIDR(num) {
  const value = Math.round(Number(num) || 0);
  const prefix = value < 0 ? '-Rp ' : 'Rp ';
  return prefix + Math.abs(value).toLocaleString('id-ID');
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTodayISO() {
  return toISODate(new Date());
}

function getCurrentPeriodYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getActiveCycleInfo() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = appState.settings.cycleStartDay || 1;

  let startDate;
  let endDate;

  if (startDay === 1) {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (today.getDate() >= startDay) {
    startDate = new Date(today.getFullYear(), today.getMonth(), startDay);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, startDay - 1);
  } else {
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, startDay);
    endDate = new Date(today.getFullYear(), today.getMonth(), startDay - 1);
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const remainingDays = Math.max(1, Math.round((endDate - today) / msPerDay) + 1);

  return {
    startISO: toISODate(startDate),
    endISO: toISODate(endDate),
    remainingDays,
    isCustomCycle: startDay !== 1
  };
}

function triggerHaptic(ms = 10) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (_) {}
  }
}

function triggerButtonMorph(btnEl, successLabel = 'Tersimpan', callback = null) {
  if (!btnEl) {
    if (callback) callback();
    return;
  }
  const labelSpan = btnEl.querySelector('.btn-label') || btnEl;
  const originalHTML = labelSpan.innerHTML;

  btnEl.classList.add('is-morphing');
  triggerHaptic(14);

  setTimeout(() => {
    btnEl.classList.add('is-success');
    labelSpan.innerHTML = `
      <svg class="morph-check-svg" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
      <span>${escapeHTML(successLabel)}</span>
    `;
  }, 110);

  setTimeout(() => {
    btnEl.classList.remove('is-morphing', 'is-success');
    labelSpan.innerHTML = originalHTML;
    if (callback) callback();
  }, 680);
}

function animateCurrencyRoll(el, startVal, endVal) {
  if (!el) return;
  if (startVal === endVal || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = formatIDR(endVal);
    return;
  }
  const duration = 400;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (endVal - startVal) * eased);
    el.textContent = formatIDR(current);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  if (modalId === 'modal-tx') document.body.classList.add('tx-sheet-open');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  if (modalId === 'modal-tx') document.body.classList.remove('tx-sheet-open');
}

/* =========================================================
   SELECTORS & EVENT BINDINGS
   ========================================================= */
function refreshDynamicSelects() {
  const expOptions = appState.categories.expense
    .map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`)
    .join('');
  document.getElementById('budget-cat-select').innerHTML = expOptions;
  document.getElementById('bill-category').innerHTML = expOptions;

  const walletOptions = appState.wallets
    .map((w) => `<option value="${escapeHTML(w)}">${escapeHTML(w)}</option>`)
    .join('');
  document.getElementById('tx-wallet').innerHTML = walletOptions;
  document.getElementById('tx-from-wallet').innerHTML = walletOptions;
  document.getElementById('tx-to-wallet').innerHTML = walletOptions;
  document.getElementById('bill-wallet').innerHTML = walletOptions;

  document.getElementById('deposit-wallet').innerHTML =
    `<option value="">— Tanpa Potong Saldo Dompet —</option>` + walletOptions;
}

function initSelectors() {
  refreshDynamicSelects();

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

  const cycleSel = document.getElementById('input-cycle-day');
  let cycleHtml = '';
  for (let d = 1; d <= 28; d++) {
    const label = d === 1 ? 'Tanggal 1 (Kalender)' : `Tanggal ${d}`;
    cycleHtml += `<option value="${d}" ${d === appState.settings.cycleStartDay ? 'selected' : ''}>${label}</option>`;
  }
  cycleSel.innerHTML = cycleHtml;

  document.getElementById('input-gas-url').value = appState.settings.gasUrl;
}

function bindEvents() {
  // Bottom Tab Navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('btn-see-all-tx').addEventListener('click', () => switchTab('view-report'));
  document.getElementById('btn-see-all-bills').addEventListener('click', () => {
    switchTab('view-tools');
    document.getElementById('section-recurring-bills').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btn-see-goals-shortcut').addEventListener('click', () => {
    switchTab('view-budget');
    openGoalModal();
  });
  document.getElementById('btn-manage-wallets-shortcut').addEventListener('click', () => {
    switchTab('view-tools');
    document.getElementById('section-manage-wallets').scrollIntoView({ behavior: 'smooth' });
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
  document.getElementById('btn-sync-quick').addEventListener('click', syncBidirectional);

  // Open / Toggle Transaction Modal via Morphing FAB
  document.getElementById('btn-open-tx-modal').addEventListener('click', () => {
    if (document.getElementById('modal-tx').classList.contains('open')) {
      closeModal('modal-tx');
    } else {
      openTxModal();
    }
  });

  // Switch Expense / Income / Transfer inside Tx Modal
  document.querySelectorAll('[data-tx-type]').forEach((btn) => {
    btn.addEventListener('click', () => setTxType(btn.dataset.txType));
  });

  // Custom Numpad Keys
  document.querySelectorAll('.pad-key[data-key]').forEach((keyBtn) => {
    keyBtn.addEventListener('click', () => {
      triggerHaptic(8);
      handleNumpadKey(keyBtn.dataset.key);
    });
  });

  // Quick Chip Adders
  document.querySelectorAll('.chip-add').forEach((chip) => {
    chip.addEventListener('click', () => {
      triggerHaptic(8);
      const add = Number(chip.dataset.addVal) || 0;
      const current = Number(currentNumpadRaw) || 0;
      currentNumpadRaw = String(current + add);
      updateNumpadDisplay(true);
    });
  });

  // Physical Keyboard Support when Tx Modal is Open
  document.addEventListener('keydown', (e) => {
    const txModalOpen = document.getElementById('modal-tx').classList.contains('open');
    if (!txModalOpen) return;

    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'SELECT') {
      if (e.key === 'Escape') closeModal('modal-tx');
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      flashNumpadKey(e.key);
      handleNumpadKey(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      flashNumpadKey('BACK');
      handleNumpadKey('BACK');
    } else if (e.key === 'Delete' || e.key.toLowerCase() === 'c') {
      e.preventDefault();
      flashNumpadKey('CLEAR');
      handleNumpadKey('CLEAR');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      saveTransactionFromModal();
    } else if (e.key === 'Escape') {
      closeModal('modal-tx');
    }
  });

  // Save Transaction
  document.getElementById('btn-save-tx').addEventListener('click', saveTransactionFromModal);

  // Close Modals
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  // Budget Modal
  document.getElementById('btn-open-budget-modal').addEventListener('click', () => openBudgetModal());
  document.getElementById('btn-save-budget').addEventListener('click', saveBudgetEnvelope);

  // Savings Goals Modal & Deposit
  document.getElementById('btn-open-goal-modal').addEventListener('click', () => openGoalModal());
  document.getElementById('btn-save-goal').addEventListener('click', saveGoalForm);
  document.getElementById('btn-confirm-deposit').addEventListener('click', confirmGoalDeposit);

  // Report Filters, Search & Exports
  document.getElementById('report-month-select').addEventListener('change', renderReportView);
  document.getElementById('report-year-select').addEventListener('change', renderReportView);
  document.getElementById('rep-search-input').addEventListener('input', (e) => {
    reportSearchQuery = e.target.value.trim().toLowerCase();
    renderReportTxListOnly();
  });
  document.querySelectorAll('[data-filter-type]').forEach((chip) => {
    chip.addEventListener('click', () => {
      reportFilterType = chip.dataset.filterType;
      document.querySelectorAll('[data-filter-type]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      renderReportTxListOnly();
    });
  });
  document.getElementById('btn-export-csv').addEventListener('click', exportMonthlyCSV);
  document.getElementById('btn-print-pdf').addEventListener('click', printMonthlyReceipt);

  // Recurring Bills Modal (Add & Edit)
  document.getElementById('btn-open-bill-modal').addEventListener('click', () => openBillModal());
  document.getElementById('btn-save-bill').addEventListener('click', saveRecurringBillForm);

  // Wishlist Modal
  document.getElementById('btn-open-wish-modal').addEventListener('click', () => {
    document.getElementById('wish-name').value = '';
    document.getElementById('wish-price').value = '';
    document.getElementById('wish-note').value = '';
    openModal('modal-wish');
  });
  document.getElementById('btn-save-wish').addEventListener('click', saveWishlistItem);

  // Wallet Management Modal
  document.getElementById('btn-open-wallet-modal').addEventListener('click', () => openWalletModal());
  document.getElementById('btn-save-wallet').addEventListener('click', saveWalletForm);

  // Category Management Tabs & Modal
  document.querySelectorAll('[data-cat-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setManageCatTab(btn.dataset.catTab);
      renderCategoryManager();
    });
  });
  document.getElementById('btn-open-category-modal').addEventListener('click', () =>
    openCategoryModal(activeManageCatTab)
  );
  document.getElementById('btn-save-category').addEventListener('click', saveCategoryForm);

  // Payday Cycle Setting
  document.getElementById('input-cycle-day').addEventListener('change', (e) => {
    appState.settings.cycleStartDay = Number(e.target.value) || 1;
    saveState(false);
    showToast(`Siklus buku kas diatur mulai tgl ${appState.settings.cycleStartDay}.`);
  });

  // Settings & Sync
  document.getElementById('btn-save-gas-url').addEventListener('click', (e) => {
    const url = document.getElementById('input-gas-url').value.trim();
    appState.settings.gasUrl = url;
    saveState(false);
    triggerButtonMorph(e.currentTarget, 'Tersimpan');
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

function flashNumpadKey(key) {
  const btn = document.querySelector(`.pad-key[data-key="${key}"]`);
  if (!btn) return;
  btn.classList.add('key-active');
  setTimeout(() => btn.classList.remove('key-active'), 140);
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
  document.getElementById('meta-theme-color').setAttribute('content', isDark ? '#1B1E26' : '#E6EAF0');
}

function applyPrivacy(enabled) {
  document.body.classList.toggle('privacy-active', enabled);
  document.getElementById('icon-eye-open').classList.toggle('hidden', enabled);
  document.getElementById('icon-eye-closed').classList.toggle('hidden', !enabled);
}

/* =========================================================
   WALLET & CATEGORY CRUD (WITH CASCADE RENAME)
   ========================================================= */
function openWalletModal(oldName = null) {
  editingWalletOldName = oldName;
  const titleEl = document.getElementById('modal-wallet-title');
  const inputEl = document.getElementById('wallet-name-input');
  const btnLabel = document.querySelector('#btn-save-wallet .btn-label');

  if (oldName) {
    titleEl.textContent = 'Ubah Nama Dompet / Akun';
    inputEl.value = oldName;
    btnLabel.textContent = 'Perbarui Nama Dompet';
  } else {
    titleEl.textContent = 'Tambah Dompet / Akun';
    inputEl.value = '';
    btnLabel.textContent = 'Simpan Dompet';
  }
  openModal('modal-wallet');
  setTimeout(() => inputEl.focus(), 180);
}

function saveWalletForm() {
  const newName = document.getElementById('wallet-name-input').value.trim();
  if (!newName) {
    showToast('Nama dompet tidak boleh kosong.');
    return;
  }

  const duplicate = appState.wallets.some(
    (w) => w.toLowerCase() === newName.toLowerCase() && w !== editingWalletOldName
  );
  if (duplicate) {
    showToast('Nama dompet tersebut sudah ada.');
    return;
  }

  if (editingWalletOldName) {
    const idx = appState.wallets.indexOf(editingWalletOldName);
    if (idx !== -1) {
      appState.wallets[idx] = newName;
      appState.transactions.forEach((t) => {
        if (t.wallet === editingWalletOldName) t.wallet = newName;
        if (t.toWallet === editingWalletOldName) t.toWallet = newName;
      });
      appState.bills.forEach((b) => {
        if (b.wallet === editingWalletOldName) b.wallet = newName;
      });
    }
    showToast(`Dompet diubah menjadi "${newName}".`);
  } else {
    appState.wallets.push(newName);
    showToast(`Dompet "${newName}" ditambahkan.`);
  }

  triggerButtonMorph(document.getElementById('btn-save-wallet'), 'Tersimpan', () => {
    closeModal('modal-wallet');
    saveState(true);
  });
}

function deleteWallet(name) {
  if (appState.wallets.length <= 1) {
    showToast('Minimal harus menyisakan 1 dompet aktif.');
    return;
  }

  const txCount = appState.transactions.filter((t) => t.wallet === name || t.toWallet === name).length;
  const msg = txCount > 0
    ? `Dompet "${name}" memiliki ${txCount} transaksi. Hapus dari daftar dompet aktif? (Riwayat transaksi lama tetap aman).`
    : `Hapus dompet "${name}"?`;

  if (!confirm(msg)) return;
  appState.wallets = appState.wallets.filter((w) => w !== name);
  showToast(`Dompet "${name}" dihapus.`);
  saveState(true);
}

function setManageCatTab(type) {
  activeManageCatTab = type;
  document.getElementById('btn-cat-tab-expense').classList.toggle('active', type === 'expense');
  document.getElementById('btn-cat-tab-income').classList.toggle('active', type === 'income');
  const glider = document.getElementById('cat-switch-glider');
  glider.style.transform = type === 'income' ? 'translateX(100%)' : 'translateX(0%)';
}

function openCategoryModal(type = 'expense', oldName = null) {
  editingCategoryState = oldName ? { type, oldName } : null;
  const titleEl = document.getElementById('modal-category-title');
  const typeSel = document.getElementById('category-type-select');
  const inputEl = document.getElementById('category-name-input');
  const btnLabel = document.querySelector('#btn-save-category .btn-label');

  typeSel.value = type;
  typeSel.disabled = Boolean(oldName);

  if (oldName) {
    titleEl.textContent = 'Ubah Nama Kategori';
    inputEl.value = oldName;
    btnLabel.textContent = 'Perbarui Kategori';
  } else {
    titleEl.textContent = 'Tambah Kategori Baru';
    inputEl.value = '';
    btnLabel.textContent = 'Simpan Kategori';
  }
  openModal('modal-category');
  setTimeout(() => inputEl.focus(), 180);
}

function saveCategoryForm() {
  const type = document.getElementById('category-type-select').value;
  const newName = document.getElementById('category-name-input').value.trim();

  if (!newName) {
    showToast('Nama kategori tidak boleh kosong.');
    return;
  }

  const list = appState.categories[type] || [];
  const oldName = editingCategoryState ? editingCategoryState.oldName : null;

  const duplicate = list.some(
    (c) => c.toLowerCase() === newName.toLowerCase() && c !== oldName
  );
  if (duplicate) {
    showToast('Kategori tersebut sudah terdaftar.');
    return;
  }

  if (oldName) {
    const idx = list.indexOf(oldName);
    if (idx !== -1) {
      list[idx] = newName;
      appState.transactions.forEach((t) => {
        if (t.type === type && t.category === oldName) t.category = newName;
      });
      if (type === 'expense') {
        appState.budgets.forEach((b) => {
          if (b.category === oldName) b.category = newName;
        });
        appState.bills.forEach((b) => {
          if (b.category === oldName) b.category = newName;
        });
      }
    }
    showToast(`Kategori diubah menjadi "${newName}".`);
  } else {
    list.push(newName);
    showToast(`Kategori "${newName}" ditambahkan.`);
  }

  setManageCatTab(type);
  triggerButtonMorph(document.getElementById('btn-save-category'), 'Tersimpan', () => {
    closeModal('modal-category');
    saveState(true);
  });
}

function deleteCategory(type, name) {
  const list = appState.categories[type] || [];
  if (list.length <= 1) {
    showToast('Minimal harus menyisakan 1 kategori.');
    return;
  }

  if (!confirm(`Hapus kategori "${name}"?`)) return;
  appState.categories[type] = list.filter((c) => c !== name);
  showToast(`Kategori "${name}" dihapus.`);
  saveState(true);
}

/* =========================================================
   TRANSACTION MODAL (EXPENSE / INCOME / TRANSFER) & NUMPAD
   ========================================================= */
function openTxModal(txToEdit = null) {
  refreshDynamicSelects();

  if (txToEdit) {
    editingTxId = txToEdit.id;
    setTxType(txToEdit.type, txToEdit.category);
    currentNumpadRaw = String(Math.round(txToEdit.amount));

    if (txToEdit.type === 'transfer') {
      document.getElementById('tx-from-wallet').value = txToEdit.wallet;
      document.getElementById('tx-to-wallet').value = txToEdit.toWallet || appState.wallets[1] || appState.wallets[0];
      document.getElementById('tx-transfer-fee').value = txToEdit.fee || '';
    } else {
      const walletSel = document.getElementById('tx-wallet');
      if (![...walletSel.options].some((o) => o.value === txToEdit.wallet)) {
        walletSel.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(txToEdit.wallet)}">${escapeHTML(txToEdit.wallet)}</option>`);
      }
      walletSel.value = txToEdit.wallet;
    }

    document.getElementById('tx-date').value = txToEdit.date;
    document.getElementById('tx-note').value = txToEdit.note || '';
    document.querySelector('#btn-save-tx .btn-label').textContent = 'PERBARUI TRANSAKSI';
  } else {
    editingTxId = null;
    setTxType('expense');
    currentNumpadRaw = '0';
    if (appState.wallets.length >= 2) {
      document.getElementById('tx-from-wallet').value = appState.wallets[0];
      document.getElementById('tx-to-wallet').value = appState.wallets[1];
    }
    document.getElementById('tx-transfer-fee').value = '';
    document.getElementById('tx-date').value = getTodayISO();
    document.getElementById('tx-note').value = '';
    document.querySelector('#btn-save-tx .btn-label').textContent = 'SIMPAN TRANSAKSI';
  }
  updateNumpadDisplay(false);
  openModal('modal-tx');
}

function setTxType(type, preserveCat = null) {
  currentTxType = type;

  // Slide & morph switch glider
  document.getElementById('btn-type-expense').classList.toggle('active', type === 'expense');
  document.getElementById('btn-type-income').classList.toggle('active', type === 'income');
  document.getElementById('btn-type-transfer').classList.toggle('active', type === 'transfer');

  const glider = document.getElementById('tx-switch-glider');
  glider.className = `switch-glider ${type}`;
  const indexMap = { expense: 0, income: 1, transfer: 2 };
  glider.style.transform = `translateX(${indexMap[type] * 100}%)`;

  const isTransfer = type === 'transfer';
  document.getElementById('tx-standard-fields').classList.toggle('hidden', isTransfer);
  document.getElementById('tx-transfer-fields').classList.toggle('hidden', !isTransfer);

  if (!isTransfer) {
    const list = [...(appState.categories[type] || [])];
    if (preserveCat && !list.includes(preserveCat)) list.push(preserveCat);

    const catSel = document.getElementById('tx-category');
    catSel.innerHTML = list
      .map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`)
      .join('');
    if (preserveCat) catSel.value = preserveCat;
  }
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
  updateNumpadDisplay(true);
}

function updateNumpadDisplay(pulse = false) {
  const num = Number(currentNumpadRaw) || 0;
  const el = document.getElementById('numpad-display');
  el.textContent = num.toLocaleString('id-ID');
  if (pulse) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
}

function saveTransactionFromModal() {
  const amount = Number(currentNumpadRaw) || 0;
  if (amount <= 0) {
    showToast('Masukkan nominal lebih dari Rp 0.');
    return;
  }

  const date = document.getElementById('tx-date').value || getTodayISO();
  const note = document.getElementById('tx-note').value.trim();
  const nowISO = new Date().toISOString();

  let payload = {
    type: currentTxType,
    amount,
    date,
    note,
    updatedAt: nowISO
  };

  if (currentTxType === 'transfer') {
    const fromWallet = document.getElementById('tx-from-wallet').value;
    const toWallet = document.getElementById('tx-to-wallet').value;
    const fee = Math.max(0, Number(document.getElementById('tx-transfer-fee').value) || 0);

    if (fromWallet === toWallet) {
      showToast('Dompet asal dan tujuan tidak boleh sama.');
      return;
    }
    payload.category = 'Transfer Antar Dompet';
    payload.wallet = fromWallet;
    payload.toWallet = toWallet;
    payload.fee = fee;
  } else {
    payload.category = document.getElementById('tx-category').value;
    payload.wallet = document.getElementById('tx-wallet').value;
  }

  if (editingTxId) {
    const idx = appState.transactions.findIndex((t) => t.id === editingTxId);
    if (idx !== -1) {
      appState.transactions[idx] = { ...appState.transactions[idx], ...payload };
      lastSavedTxId = editingTxId;
    }
    showToast('Transaksi diperbarui.');
  } else {
    const newId = uid('tx');
    appState.transactions.push({ id: newId, ...payload });
    lastSavedTxId = newId;
    showToast(currentTxType === 'transfer' ? 'Transfer saldo tercatat.' : 'Transaksi tercatat.');
  }

  triggerButtonMorph(document.getElementById('btn-save-tx'), 'Tersimpan!', () => {
    closeModal('modal-tx');
    saveState(true);
  });
}

function deleteTransaction(id) {
  if (!confirm('Hapus transaksi ini dari catatan?')) return;
  appState.transactions = appState.transactions.filter((t) => t.id !== id);
  showToast('Transaksi dihapus.');
  saveState(true);
}

/* =========================================================
   RENDERING ENGINE (DASHBOARD, BUDGETS, GOALS, REPORTS, TOOLS)
   ========================================================= */
function renderAll(isInitial = false) {
  const now = new Date();
  document.getElementById('header-period-label').textContent =
    `Buku Kas • ${MONTH_NAMES[now.getMonth()].slice(0, 3)} ${now.getFullYear()}`;

  renderDashboard(isInitial);
  renderBudgetsAndGoalsView();
  renderReportView();
  renderToolsView();
}

function renderDashboard(isInitial = false) {
  const cycle = getActiveCycleInfo();

  let totalIncomeAll = 0;
  let totalExpenseAll = 0;
  let cycleIncome = 0;
  let cycleExpense = 0;
  const walletBalances = {};
  appState.wallets.forEach((w) => {
    walletBalances[w] = 0;
  });

  appState.transactions.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    const inCycle = tx.date && tx.date >= cycle.startISO && tx.date <= cycle.endISO;

    if (tx.type === 'income') {
      totalIncomeAll += amt;
      if (inCycle) cycleIncome += amt;
      if (walletBalances[tx.wallet] !== undefined) walletBalances[tx.wallet] += amt;
    } else if (tx.type === 'transfer') {
      const fee = Number(tx.fee) || 0;
      if (walletBalances[tx.wallet] !== undefined) walletBalances[tx.wallet] -= (amt + fee);
      if (tx.toWallet && walletBalances[tx.toWallet] !== undefined) walletBalances[tx.toWallet] += amt;
      if (fee > 0) {
        totalExpenseAll += fee;
        if (inCycle) cycleExpense += fee;
      }
    } else {
      totalExpenseAll += amt;
      if (inCycle) cycleExpense += amt;
      if (walletBalances[tx.wallet] !== undefined) walletBalances[tx.wallet] -= amt;
    }
  });

  const netBalance = totalIncomeAll - totalExpenseAll;
  const netEl = document.getElementById('dash-net-balance');
  animateCurrencyRoll(netEl, isInitial ? 0 : prevNetBalance, netBalance);
  prevNetBalance = netBalance;

  document.getElementById('dash-month-in').textContent = formatIDR(cycleIncome);
  document.getElementById('dash-month-out').textContent = formatIDR(cycleExpense);

  // Kalkulasi "Sisa Napas" (Safe-to-Spend Harian sesuai siklus)
  const totalBudgetLimit = appState.budgets.reduce((sum, b) => sum + (Number(b.limit) || 0), 0);
  let remainingPool = 0;
  let hintText = '';

  if (totalBudgetLimit > 0) {
    remainingPool = Math.max(0, totalBudgetLimit - cycleExpense);
    hintText = `Sisa pagu anggaran ${formatIDR(remainingPool)} ÷ ${cycle.remainingDays} hari.`;
  } else {
    remainingPool = Math.max(0, cycleIncome - cycleExpense);
    hintText = `Sisa arus kas siklus ini ${formatIDR(remainingPool)} ÷ ${cycle.remainingDays} hari.`;
  }

  const dailySafe = Math.floor(remainingPool / cycle.remainingDays);
  document.getElementById('dash-days-left').textContent = `${cycle.remainingDays} hari tersisa`;
  document.getElementById('dash-daily-safe').innerHTML = `${formatIDR(dailySafe)}<span class="unit">/hari</span>`;
  document.getElementById('dash-safe-caption').textContent = hintText;

  // Due Recurring Bills Alert Banner (Due <= 5 days or Overdue)
  renderDashboardDueBills();

  // Flexible Wallet Strip
  document.getElementById('dash-wallet-list').innerHTML = appState.wallets
    .map(
      (w) => `
        <div class="wallet-tile">
          <span class="wallet-name">${escapeHTML(w)}</span>
          <span class="wallet-bal money-val">${formatIDR(walletBalances[w] || 0)}</span>
        </div>
      `
    )
    .join('');

  // Mini Savings Goals Strip
  const goalsStripEl = document.getElementById('dash-goals-strip');
  if (appState.goals.length === 0) {
    goalsStripEl.innerHTML = `<div class="neu-card empty-state" style="width:100%">Belum ada target tabungan. Klik <strong>+ Target</strong> untuk mulai menabung terarah.</div>`;
  } else {
    goalsStripEl.innerHTML = appState.goals
      .map((g) => {
        const pct = Math.min(100, Math.round(((Number(g.saved) || 0) / Math.max(1, Number(g.target) || 1)) * 100));
        return `
          <div class="goal-mini-tile">
            <div class="goal-mini-top">
              <span class="goal-mini-name">${escapeHTML(g.name)}</span>
              <span class="goal-mini-pct">${pct}%</span>
            </div>
            <div class="progress-track mini">
              <div class="progress-fill brand" style="width: ${pct}%"></div>
            </div>
            <div class="tx-meta money-val" style="margin-top:5px">${formatIDR(g.saved)} / ${formatIDR(g.target)}</div>
          </div>
        `;
      })
      .join('');
  }

  // 5 Recent Transactions
  const sorted = [...appState.transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)
  );
  const recent = sorted.slice(0, 5);
  const recentContainer = document.getElementById('dash-recent-tx');

  if (recent.length === 0) {
    recentContainer.innerHTML = `<div class="empty-state">Belum ada catatan transaksi. Tekan tombol <strong>+</strong> di bawah untuk mulai mencatat.</div>`;
  } else {
    recentContainer.innerHTML = recent.map((tx) => buildTxRowHTML(tx)).join('');
    bindTxRowActions(recentContainer);
    lastSavedTxId = null;
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

function getBillDueStatus(bill) {
  const currentYM = getCurrentPeriodYM();
  if (bill.paidPeriod === currentYM) {
    return { isPaid: true, daysDiff: 999, label: 'Lunas', badgeClass: 'safe' };
  }
  const now = new Date();
  const todayDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const effectiveDueDay = Math.min(daysInMonth, Number(bill.dueDay) || 1);
  const diff = effectiveDueDay - todayDay;

  if (diff < 0) {
    return { isPaid: false, daysDiff: diff, label: `Terlambat ${Math.abs(diff)} hr`, badgeClass: 'urgent' };
  }
  if (diff === 0) {
    return { isPaid: false, daysDiff: 0, label: 'Jatuh Tempo Hari Ini', badgeClass: 'urgent' };
  }
  if (diff <= 5) {
    return { isPaid: false, daysDiff: diff, label: `H-${diff} (Tgl ${effectiveDueDay})`, badgeClass: 'soon' };
  }
  return { isPaid: false, daysDiff: diff, label: `Tgl ${effectiveDueDay}`, badgeClass: 'safe' };
}

function renderDashboardDueBills() {
  const wrap = document.getElementById('dash-due-bills-wrap');
  const listEl = document.getElementById('dash-due-bills-list');

  const urgentBills = appState.bills
    .map((b) => ({ bill: b, status: getBillDueStatus(b) }))
    .filter((item) => !item.status.isPaid && item.status.daysDiff <= 5)
    .sort((a, b) => a.status.daysDiff - b.status.daysDiff);

  if (urgentBills.length === 0) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  listEl.innerHTML = urgentBills
    .map(({ bill, status }) => `
      <div class="neu-card tool-row">
        <div>
          <div class="tx-cat">
            <span>${escapeHTML(bill.name)}</span>
            <span class="due-badge ${status.badgeClass}">${status.label}</span>
          </div>
          <div class="tx-meta money-val">${formatIDR(bill.amount)} • ${escapeHTML(bill.wallet)}</div>
        </div>
        <div class="action-row-sm">
          <button type="button" class="neu-btn btn-pill-sm morph-btn" data-dash-pay-bill="${bill.id}">
            <span class="btn-label">Bayar</span>
          </button>
        </div>
      </div>
    `)
    .join('');

  listEl.querySelectorAll('[data-dash-pay-bill]').forEach((btn) => {
    btn.addEventListener('click', () => payRecurringBill(btn.dataset.dashPayBill, btn));
  });
}

function buildTxRowHTML(tx) {
  const isTransfer = tx.type === 'transfer';
  const isInc = tx.type === 'income';
  const sign = isTransfer ? '⇄ ' : isInc ? '+' : '-';
  const cls = isTransfer ? 'text-transfer' : isInc ? 'text-income' : 'text-expense';
  const noteStr = tx.note ? ` • ${escapeHTML(tx.note)}` : '';
  const flashClass = tx.id === lastSavedTxId ? 'flash-new' : '';

  const titleText = isTransfer
    ? `${escapeHTML(tx.wallet)} → ${escapeHTML(tx.toWallet || '-')}`
    : escapeHTML(tx.category);

  const subMeta = isTransfer
    ? `${escapeHTML(tx.date)} • Transfer${tx.fee ? ` (Admin ${formatIDR(tx.fee)})` : ''}${noteStr}`
    : `${escapeHTML(tx.date)} • ${escapeHTML(tx.wallet)}${noteStr}`;

  return `
    <div class="tx-row ${flashClass}">
      <div class="tx-left">
        <span class="tx-cat">${titleText}</span>
        <span class="tx-meta">${subMeta}</span>
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
   ENVELOPE BUDGETING & SAVINGS GOALS (CELENGAN)
   ========================================================= */
function openBudgetModal(catToEdit = null, currentLimit = '') {
  refreshDynamicSelects();
  const titleEl = document.getElementById('modal-budget-title');
  const catSel = document.getElementById('budget-cat-select');
  const limitInp = document.getElementById('budget-limit-input');

  if (catToEdit) {
    titleEl.textContent = `Edit Pagu: ${catToEdit}`;
    catSel.value = catToEdit;
    catSel.disabled = true;
    limitInp.value = currentLimit;
  } else {
    titleEl.textContent = 'Atur Batas Anggaran';
    catSel.disabled = false;
    limitInp.value = '';
  }
  openModal('modal-budget');
}

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

  triggerButtonMorph(document.getElementById('btn-save-budget'), 'Tersimpan', () => {
    closeModal('modal-budget');
    showToast(`Pos anggaran ${category} disimpan.`);
    saveState(true);
  });
}

function deleteBudgetEnvelope(category) {
  if (!confirm(`Hapus pos anggaran "${category}"?`)) return;
  appState.budgets = appState.budgets.filter((b) => b.category !== category);
  showToast(`Pos anggaran ${category} dihapus.`);
  saveState(true);
}

function openGoalModal(goalToEdit = null) {
  editingGoalId = goalToEdit ? goalToEdit.id : null;
  const titleEl = document.getElementById('modal-goal-title');
  const nameInp = document.getElementById('goal-name');
  const targetInp = document.getElementById('goal-target');
  const savedInp = document.getElementById('goal-saved');
  const deadlineInp = document.getElementById('goal-deadline');

  if (goalToEdit) {
    titleEl.textContent = 'Edit Target Tabungan';
    nameInp.value = goalToEdit.name;
    targetInp.value = goalToEdit.target;
    savedInp.value = goalToEdit.saved;
    deadlineInp.value = goalToEdit.deadline || '';
  } else {
    titleEl.textContent = 'Target Tabungan Baru';
    nameInp.value = '';
    targetInp.value = '';
    savedInp.value = '0';
    deadlineInp.value = '';
  }
  openModal('modal-goal');
}

function saveGoalForm() {
  const name = document.getElementById('goal-name').value.trim();
  const target = Number(document.getElementById('goal-target').value) || 0;
  const saved = Math.max(0, Number(document.getElementById('goal-saved').value) || 0);
  const deadline = document.getElementById('goal-deadline').value || '';

  if (!name || target <= 0) {
    showToast('Isi nama target dan nominal target > Rp 0.');
    return;
  }

  const nowISO = new Date().toISOString();
  if (editingGoalId) {
    const idx = appState.goals.findIndex((g) => g.id === editingGoalId);
    if (idx !== -1) {
      appState.goals[idx] = { ...appState.goals[idx], name, target, saved, deadline, updatedAt: nowISO };
    }
    showToast(`Target "${name}" diperbarui.`);
  } else {
    appState.goals.push({
      id: uid('goal'),
      name,
      target,
      saved,
      deadline,
      updatedAt: nowISO
    });
    showToast(`Target "${name}" ditambahkan.`);
  }

  triggerButtonMorph(document.getElementById('btn-save-goal'), 'Tersimpan', () => {
    closeModal('modal-goal');
    saveState(true);
  });
}

function openGoalDepositModal(goalId) {
  const goal = appState.goals.find((g) => g.id === goalId);
  if (!goal) return;
  depositingGoalId = goalId;
  refreshDynamicSelects();
  document.getElementById('modal-deposit-title').textContent = `Nabung: ${goal.name}`;
  document.getElementById('deposit-amount').value = '';
  openModal('modal-goal-deposit');
}

function confirmGoalDeposit() {
  const goal = appState.goals.find((g) => g.id === depositingGoalId);
  if (!goal) return;

  const amount = Number(document.getElementById('deposit-amount').value) || 0;
  const wallet = document.getElementById('deposit-wallet').value;

  if (amount <= 0) {
    showToast('Masukkan nominal setoran > Rp 0.');
    return;
  }

  const nowISO = new Date().toISOString();
  goal.saved = (Number(goal.saved) || 0) + amount;
  goal.updatedAt = nowISO;

  if (wallet) {
    const cat = appState.categories.expense.includes('Tabungan')
      ? 'Tabungan'
      : appState.categories.expense[appState.categories.expense.length - 1] || 'Lainnya';

    appState.transactions.push({
      id: uid('tx'),
      type: 'expense',
      amount,
      category: cat,
      wallet,
      date: getTodayISO(),
      note: `Celengan: ${goal.name}`,
      updatedAt: nowISO
    });
  }

  triggerButtonMorph(document.getElementById('btn-confirm-deposit'), 'Tersimpan', () => {
    closeModal('modal-goal-deposit');
    showToast(`+${formatIDR(amount)} masuk ke ${goal.name}!`);
    saveState(true);
  });
}

function deleteGoal(goalId) {
  if (!confirm('Hapus target tabungan ini?')) return;
  appState.goals = appState.goals.filter((g) => g.id !== goalId);
  showToast('Target tabungan dihapus.');
  saveState(true);
}

function renderBudgetsAndGoalsView() {
  const cycle = getActiveCycleInfo();
  const spentByCat = {};

  appState.transactions.forEach((tx) => {
    if (tx.type === 'expense' && tx.date && tx.date >= cycle.startISO && tx.date <= cycle.endISO) {
      spentByCat[tx.category] = (spentByCat[tx.category] || 0) + (Number(tx.amount) || 0);
    }
  });

  let totalLimit = 0;
  let totalSpentInBudgeted = 0;

  const listEl = document.getElementById('budget-list');
  if (appState.budgets.length === 0) {
    document.getElementById('budget-total-summary').textContent = 'Rp 0 / Rp 0';
    document.getElementById('budget-total-pct').textContent = '0%';
    listEl.innerHTML = `<div class="neu-card empty-state">Belum ada pos anggaran. Tekan <strong>+ Atur Pos</strong> untuk membatasi pengeluaran.</div>`;
  } else {
    listEl.innerHTML = appState.budgets
      .map((b, idx) => {
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
          <div class="neu-card reveal-card" style="--i: ${idx + 2}">
            <div class="budget-item-top">
              <span class="budget-cat-name">${escapeHTML(b.category)}</span>
              <span class="budget-numbers money-val">${formatIDR(spent)} / ${formatIDR(limit)}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${barClass}" style="width: ${barWidth}%"></div>
            </div>
            <div class="budget-footer">
              <span class="money-val">${sisaLabel} (${rawPct}%)</span>
              <div class="tx-actions">
                <button type="button" class="mini-action-btn edit" data-edit-budget="${escapeHTML(b.category)}" data-limit="${limit}">Edit</button>
                <button type="button" class="mini-action-btn del" data-del-budget="${escapeHTML(b.category)}">Hapus</button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-edit-budget]').forEach((btn) => {
      btn.addEventListener('click', () => openBudgetModal(btn.dataset.editBudget, btn.dataset.limit));
    });
    listEl.querySelectorAll('[data-del-budget]').forEach((btn) => {
      btn.addEventListener('click', () => deleteBudgetEnvelope(btn.dataset.delBudget));
    });

    const overallPct = totalLimit > 0 ? Math.round((totalSpentInBudgeted / totalLimit) * 100) : 0;
    document.getElementById('budget-total-summary').textContent = `${formatIDR(totalSpentInBudgeted)} / ${formatIDR(totalLimit)}`;
    document.getElementById('budget-total-pct').textContent = `${overallPct}%`;
  }

  // Render Savings Goals List
  const goalsListEl = document.getElementById('goals-list');
  if (appState.goals.length === 0) {
    goalsListEl.innerHTML = `<div class="neu-card empty-state">Belum ada celengan target. Tekan <strong>+ Target</strong> untuk membuat target tabungan.</div>`;
  } else {
    goalsListEl.innerHTML = appState.goals
      .map((g) => {
        const saved = Number(g.saved) || 0;
        const target = Math.max(1, Number(g.target) || 1);
        const pct = Math.min(100, Math.round((saved / target) * 100));
        const deadlineText = g.deadline ? ` • Target ${g.deadline}` : '';

        return `
          <div class="neu-card">
            <div class="budget-item-top">
              <span class="budget-cat-name">${escapeHTML(g.name)}</span>
              <span class="budget-numbers money-val">${formatIDR(saved)} / ${formatIDR(target)}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${pct >= 100 ? '' : 'brand'}" style="width: ${pct}%"></div>
            </div>
            <div class="budget-footer">
              <span>Terkumpul ${pct}%${deadlineText}</span>
              <div class="action-row-sm">
                <button type="button" class="neu-btn btn-pill-sm" data-deposit-goal="${g.id}">+ Nabung</button>
                <button type="button" class="mini-action-btn edit" data-edit-goal="${g.id}">Edit</button>
                <button type="button" class="mini-action-btn del" data-del-goal="${g.id}">✕</button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    goalsListEl.querySelectorAll('[data-deposit-goal]').forEach((btn) =>
      btn.addEventListener('click', () => openGoalDepositModal(btn.dataset.depositGoal))
    );
    goalsListEl.querySelectorAll('[data-edit-goal]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const g = appState.goals.find((item) => item.id === btn.dataset.editGoal);
        if (g) openGoalModal(g);
      })
    );
    goalsListEl.querySelectorAll('[data-del-goal]').forEach((btn) =>
      btn.addEventListener('click', () => deleteGoal(btn.dataset.delGoal))
    );
  }
}

/* =========================================================
   MONTHLY RESUME, SEARCH/FILTER, AUDIT & CHART
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
    } else if (t.type === 'transfer') {
      const fee = Number(t.fee) || 0;
      if (fee > 0) {
        exp += fee;
        catTotals['Biaya Admin Transfer'] = (catTotals['Biaya Admin Transfer'] || 0) + fee;
      }
    } else {
      exp += amt;
      catTotals[t.category] = (catTotals[t.category] || 0) + amt;
    }
  });

  const savingsRate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
  const srEl = document.getElementById('rep-savings-rate');
  srEl.textContent = `${savingsRate}%`;
  srEl.className = `kpi-val ${savingsRate >= 20 ? 'text-income' : savingsRate < 0 ? 'text-expense' : ''}`;
  document.getElementById('rep-savings-note').textContent =
    inc > 0 ? `Surplus ${formatIDR(inc - exp)}` : 'Belum ada pemasukan periode ini';

  const prevDate = new Date(y, m - 1, 1);
  const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevExp = appState.transactions
    .filter((t) => t.date && t.date.startsWith(prevYM))
    .reduce((sum, t) => {
      if (t.type === 'expense') return sum + (Number(t.amount) || 0);
      if (t.type === 'transfer') return sum + (Number(t.fee) || 0);
      return sum;
    }, 0);

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

  renderReportTxListOnly();
  renderDailyCashflowChart(m, y, txs);
}

function renderReportTxListOnly() {
  const { m, y, txs } = getSelectedPeriodTxs();
  const filtered = txs.filter((t) => {
    if (reportFilterType !== 'all' && t.type !== reportFilterType) return false;
    if (reportSearchQuery) {
      const hay = `${t.category} ${t.wallet} ${t.toWallet || ''} ${t.note || ''}`.toLowerCase();
      if (!hay.includes(reportSearchQuery)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const fullListEl = document.getElementById('rep-full-tx-list');
  if (sorted.length === 0) {
    fullListEl.innerHTML = `<div class="empty-state">Tidak ada transaksi yang cocok di ${MONTH_NAMES[m]} ${y}.</div>`;
  } else {
    fullListEl.innerHTML = sorted.map((t) => buildTxRowHTML(t)).join('');
    bindTxRowActions(fullListEl);
  }
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
      else if (t.type === 'transfer') dailyExp[day - 1] += Number(t.fee) || 0;
      else dailyExp[day - 1] += Number(t.amount) || 0;
    }
  });

  if (cashflowChartInstance) {
    cashflowChartInstance.destroy();
  }

  const isDark = appState.settings.theme === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(163,177,198,0.35)';
  const tickColor = isDark ? '#8C97AB' : '#626E82';

  cashflowChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: dailyInc,
          backgroundColor: isDark ? '#2ED199' : '#0E8A5D',
          borderRadius: 4
        },
        {
          label: 'Pengeluaran',
          data: dailyExp,
          backgroundColor: isDark ? '#FA7066' : '#D6453A',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
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

  const headers = ['Tanggal', 'Tipe', 'Kategori', 'Dompet Asal', 'Dompet Tujuan', 'Nominal', 'Biaya Admin', 'Catatan'];
  const rows = txs.map((t) => [
    t.date,
    t.type === 'income' ? 'Pemasukan' : t.type === 'transfer' ? 'Transfer' : 'Pengeluaran',
    `"${(t.category || '').replace(/"/g, '""')}"`,
    `"${(t.wallet || '').replace(/"/g, '""')}"`,
    `"${(t.toWallet || '').replace(/"/g, '""')}"`,
    t.amount,
    t.fee || 0,
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
  const exp = txs.reduce((s, t) => {
    if (t.type === 'expense') return s + Number(t.amount);
    if (t.type === 'transfer') return s + (Number(t.fee) || 0);
    return s;
  }, 0);

  document.getElementById('print-period-text').textContent = `Periode: ${MONTH_NAMES[m]} ${y}`;
  document.getElementById('print-summary-rows').innerHTML = `
    <div class="receipt-summary-item"><span>Total Pemasukan:</span><strong>${formatIDR(inc)}</strong></div>
    <div class="receipt-summary-item"><span>Total Pengeluaran:</span><strong>${formatIDR(exp)}</strong></div>
    <div class="receipt-summary-item"><span>Selisih Bersih:</span><strong>${formatIDR(inc - exp)}</strong></div>
  `;

  const tbody = document.querySelector('#print-tx-table tbody');
  tbody.innerHTML = txs
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const sign = t.type === 'income' ? '+' : t.type === 'transfer' ? '⇄' : '-';
      const walletCol = t.type === 'transfer' ? `${t.wallet} → ${t.toWallet}` : t.wallet;
      return `
        <tr>
          <td>${escapeHTML(t.date)}</td>
          <td>${escapeHTML(t.category)}</td>
          <td>${escapeHTML(t.note || '-')}</td>
          <td>${escapeHTML(walletCol)}</td>
          <td style="text-align:right">${sign}${formatIDR(t.amount)}</td>
        </tr>
      `;
    })
    .join('');

  window.print();
}

/* =========================================================
   TOOLS VIEW: EDITABLE RECURRING BILLS, WISHLIST, WALLETS, CATEGORIES
   ========================================================= */
function openBillModal(billToEdit = null) {
  refreshDynamicSelects();
  editingBillId = billToEdit ? billToEdit.id : null;

  const titleEl = document.getElementById('modal-bill-title');
  const nameInp = document.getElementById('bill-name');
  const amtInp = document.getElementById('bill-amount');
  const dueInp = document.getElementById('bill-due-day');
  const catSel = document.getElementById('bill-category');
  const walSel = document.getElementById('bill-wallet');
  const statusWrap = document.getElementById('bill-edit-status-wrap');
  const statusSel = document.getElementById('bill-status-select');
  const btnLabel = document.querySelector('#btn-save-bill .btn-label');

  if (billToEdit) {
    titleEl.textContent = 'Edit Tagihan Rutin';
    nameInp.value = billToEdit.name;
    amtInp.value = billToEdit.amount;
    dueInp.value = billToEdit.dueDay;
    if ([...catSel.options].some((o) => o.value === billToEdit.category)) catSel.value = billToEdit.category;
    if ([...walSel.options].some((o) => o.value === billToEdit.wallet)) walSel.value = billToEdit.wallet;

    statusWrap.classList.remove('hidden');
    statusSel.value = billToEdit.paidPeriod === getCurrentPeriodYM() ? 'paid' : 'unpaid';
    btnLabel.textContent = 'Perbarui Tagihan';
  } else {
    titleEl.textContent = 'Tambah Tagihan Rutin';
    nameInp.value = '';
    amtInp.value = '';
    dueInp.value = '15';
    statusWrap.classList.add('hidden');
    btnLabel.textContent = 'Simpan Tagihan';
  }

  openModal('modal-bill');
}

function saveRecurringBillForm() {
  const name = document.getElementById('bill-name').value.trim();
  const amount = Number(document.getElementById('bill-amount').value) || 0;
  const dueDay = Math.min(31, Math.max(1, Number(document.getElementById('bill-due-day').value) || 1));
  const category = document.getElementById('bill-category').value;
  const wallet = document.getElementById('bill-wallet').value;

  if (!name || amount <= 0) {
    showToast('Lengkapi nama dan nominal tagihan.');
    return;
  }

  const nowISO = new Date().toISOString();

  if (editingBillId) {
    const idx = appState.bills.findIndex((b) => b.id === editingBillId);
    if (idx !== -1) {
      const statusVal = document.getElementById('bill-status-select').value;
      const paidPeriod = statusVal === 'paid' ? getCurrentPeriodYM() : '';
      appState.bills[idx] = {
        ...appState.bills[idx],
        name,
        amount,
        dueDay,
        category,
        wallet,
        paidPeriod,
        updatedAt: nowISO
      };
    }
    showToast(`Tagihan "${name}" diperbarui.`);
  } else {
    appState.bills.push({
      id: uid('bill'),
      name,
      amount,
      category,
      wallet,
      dueDay,
      paidPeriod: '',
      updatedAt: nowISO
    });
    showToast('Tagihan rutin ditambahkan.');
  }

  triggerButtonMorph(document.getElementById('btn-save-bill'), 'Tersimpan', () => {
    closeModal('modal-bill');
    saveState(true);
  });
}

function payRecurringBill(billId, btnEl = null) {
  const bill = appState.bills.find((b) => b.id === billId);
  if (!bill) return;

  const currentYM = getCurrentPeriodYM();
  if (bill.paidPeriod === currentYM) return;

  const commitPayment = () => {
    const nowISO = new Date().toISOString();
    bill.paidPeriod = currentYM;
    bill.updatedAt = nowISO;

    const newId = uid('tx');
    appState.transactions.push({
      id: newId,
      type: 'expense',
      amount: bill.amount,
      category: bill.category,
      wallet: bill.wallet,
      date: getTodayISO(),
      note: `Tagihan: ${bill.name}`,
      updatedAt: nowISO
    });
    lastSavedTxId = newId;

    showToast(`Tagihan ${bill.name} lunas & tercatat.`);
    saveState(true);
  };

  if (btnEl) {
    triggerButtonMorph(btnEl, 'Lunas', commitPayment);
  } else {
    commitPayment();
  }
}

function deleteRecurringBill(billId) {
  if (!confirm('Hapus jadwal tagihan rutin ini?')) return;
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

  triggerButtonMorph(document.getElementById('btn-save-wish'), 'Terkunci 7 Hari', () => {
    closeModal('modal-wish');
    showToast('Wishlist masuk masa tunggu 7 hari.');
    saveState(true);
  });
}

function buyWishlistItem(wishId) {
  const item = appState.wishlist.find((w) => w.id === wishId);
  if (!item) return;

  const nowISO = new Date().toISOString();
  item.purchased = true;
  item.updatedAt = nowISO;

  const defaultCat = appState.categories.expense.includes('Belanja')
    ? 'Belanja'
    : appState.categories.expense[0];
  const defaultWallet = appState.wallets[0] || 'Tunai';

  const newId = uid('tx');
  appState.transactions.push({
    id: newId,
    type: 'expense',
    amount: item.price,
    category: defaultCat,
    wallet: defaultWallet,
    date: getTodayISO(),
    note: `Wishlist: ${item.name}`,
    updatedAt: nowISO
  });
  lastSavedTxId = newId;

  showToast(`${item.name} dibeli & dicatat sebagai pengeluaran.`);
  saveState(true);
}

function deleteWishlistItem(wishId) {
  appState.wishlist = appState.wishlist.filter((w) => w.id !== wishId);
  showToast('Item wishlist dihapus.');
  saveState(true);
}

function renderCategoryManager() {
  const listEl = document.getElementById('tools-category-list');
  const cats = appState.categories[activeManageCatTab] || [];

  listEl.innerHTML = cats
    .map(
      (cat) => `
        <div class="cat-pill">
          <span>${escapeHTML(cat)}</span>
          <div class="cat-pill-actions">
            <button type="button" class="pill-icon-btn" data-rename-cat="${escapeHTML(cat)}" title="Ubah nama">✎</button>
            <button type="button" class="pill-icon-btn del" data-del-cat="${escapeHTML(cat)}" title="Hapus">✕</button>
          </div>
        </div>
      `
    )
    .join('');

  listEl.querySelectorAll('[data-rename-cat]').forEach((btn) =>
    btn.addEventListener('click', () => openCategoryModal(activeManageCatTab, btn.dataset.renameCat))
  );
  listEl.querySelectorAll('[data-del-cat]').forEach((btn) =>
    btn.addEventListener('click', () => deleteCategory(activeManageCatTab, btn.dataset.delCat))
  );
}

function renderToolsView() {
  // 1. Recurring Bills (Editable + Morph Pay)
  const billListEl = document.getElementById('tools-bill-list');

  if (appState.bills.length === 0) {
    billListEl.innerHTML = `<div class="neu-card empty-state">Belum ada jadwal tagihan rutin.</div>`;
  } else {
    billListEl.innerHTML = appState.bills
      .map((b) => {
        const status = getBillDueStatus(b);
        return `
          <div class="neu-card tool-row">
            <div style="min-width:0">
              <div class="tx-cat">
                <span>${escapeHTML(b.name)}</span>
                ${!status.isPaid ? `<span class="due-badge ${status.badgeClass}">${status.label}</span>` : ''}
              </div>
              <div class="tx-meta money-val">${formatIDR(b.amount)} • ${escapeHTML(b.category)} (${escapeHTML(b.wallet)})</div>
            </div>
            <div class="action-row-sm" style="flex-shrink:0">
              ${
                status.isPaid
                  ? `<span class="badge-paid">✓ Lunas</span>`
                  : `<button type="button" class="neu-btn btn-pill-sm morph-btn" data-pay-bill="${b.id}"><span class="btn-label">Bayar</span></button>`
              }
              <button type="button" class="mini-action-btn edit" data-edit-bill="${b.id}" title="Edit Tagihan">✎</button>
              <button type="button" class="mini-action-btn del" data-del-bill="${b.id}" title="Hapus">✕</button>
            </div>
          </div>
        `;
      })
      .join('');

    billListEl.querySelectorAll('[data-pay-bill]').forEach((btn) =>
      btn.addEventListener('click', () => payRecurringBill(btn.dataset.payBill, btn))
    );
    billListEl.querySelectorAll('[data-edit-bill]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const b = appState.bills.find((item) => item.id === btn.dataset.editBill);
        if (b) openBillModal(b);
      })
    );
    billListEl.querySelectorAll('[data-del-bill]').forEach((btn) =>
      btn.addEventListener('click', () => deleteRecurringBill(btn.dataset.delBill))
    );
  }

  // 2. Wishlist Cooldown List
  const wishListEl = document.getElementById('tools-wish-list');
  const activeWishes = appState.wishlist.filter((w) => !w.purchased);

  if (activeWishes.length === 0) {
    wishListEl.innerHTML = `<div class="neu-card empty-state">Wishlist kosong. Catat barang incaran agar tidak lapar mata.</div>`;
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
          <div class="neu-card tool-row">
            <div>
              <div class="tx-cat">${escapeHTML(w.name)}</div>
              <div class="tx-meta money-val">${formatIDR(w.price)}${w.note ? ` • ${escapeHTML(w.note)}` : ''}</div>
              <span class="cooldown-tag">${statusLabel}</span>
            </div>
            <div class="action-row-sm">
              <button type="button" class="neu-btn btn-pill-sm" ${isUnlocked ? '' : 'disabled'} data-buy-wish="${w.id}">
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

  // 3. Wallet Manager List
  const walletListEl = document.getElementById('tools-wallet-list');
  walletListEl.innerHTML = appState.wallets
    .map((w) => {
      const txCount = appState.transactions.filter((t) => t.wallet === w || t.toWallet === w).length;
      return `
        <div class="tx-row">
          <div class="tx-left">
            <span class="tx-cat">${escapeHTML(w)}</span>
            <span class="tx-meta">${txCount} transaksi tercatat</span>
          </div>
          <div class="action-row-sm">
            <button type="button" class="neu-btn btn-pill-sm" data-rename-wallet="${escapeHTML(w)}">Rename</button>
            <button type="button" class="mini-action-btn del" data-del-wallet="${escapeHTML(w)}">Hapus</button>
          </div>
        </div>
      `;
    })
    .join('');

  walletListEl.querySelectorAll('[data-rename-wallet]').forEach((btn) =>
    btn.addEventListener('click', () => openWalletModal(btn.dataset.renameWallet))
  );
  walletListEl.querySelectorAll('[data-del-wallet]').forEach((btn) =>
    btn.addEventListener('click', () => deleteWallet(btn.dataset.delWallet))
  );

  // 4. Category Manager
  renderCategoryManager();

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
          wishlist: appState.wishlist,
          goals: appState.goals,
          categories: appState.categories,
          wallets: appState.wallets
        }
      })
    });
    const json = await res.json();
    if (json.status === 'success') {
      appState.settings.lastSync = json.syncedAt || new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
      renderDashboard(false);
      renderToolsView();
      if (!silent) {
        triggerButtonMorph(document.getElementById('btn-sync-now'), 'Tersinkron');
        showToast('Data tersinkron ke Google Sheets.');
      }
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
    if (appState.transactions.length === 0 && appState.budgets.length === 0) {
      const getRes = await fetch(url);
      const getJson = await getRes.json();
      if (getJson.status === 'success' && getJson.data) {
        appState.transactions = getJson.data.transactions || [];
        appState.budgets = getJson.data.budgets || [];
        appState.bills = getJson.data.bills || [];
        appState.wishlist = getJson.data.wishlist || [];
        appState.goals = getJson.data.goals || [];
        if (getJson.data.categories) appState.categories = getJson.data.categories;
        if (getJson.data.wallets) appState.wallets = getJson.data.wallets;
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
      appState.goals = imported.goals || [];
      if (imported.categories) appState.categories = imported.categories;
      if (imported.wallets) appState.wallets = imported.wallets;
      if (imported.settings?.cycleStartDay) appState.settings.cycleStartDay = imported.settings.cycleStartDay;
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
