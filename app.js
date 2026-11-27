/**
 * KASAKU v5 — Core Application Logic (Neon Glass Morph Edition)
 * Fixes & Upgrades:
 * - Full Cloud Sync parity (includes templates & cycleStartDay)
 * - Double-tap race guard on Recurring Bills & Form Submitters
 * - Cascade category rename across transactions, budgets, bills, AND templates
 * - O(1) Map-based Chart daily aggregation & Neon Chart.js palette
 * - End-of-cycle Runway Forecast, 1-Tap Quick Date Pills, & 1-Tap Duplicate Tx
 * - Global Escape key modal handler & Safe Local Data Reset
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

const DEFAULT_TEMPLATES = [
  { id: 'tpl_kopi', label: '☕ Kopi 20rb', type: 'expense', amount: 20000, category: 'Makan & Kopi', note: 'Kopi' },
  { id: 'tpl_makan', label: '🍜 Makan 25rb', type: 'expense', amount: 25000, category: 'Makan & Kopi', note: 'Makan' },
  { id: 'tpl_bensin', label: '⛽ Bensin 30rb', type: 'expense', amount: 30000, category: 'Transportasi', note: 'Bensin' },
  { id: 'tpl_parkir', label: '🅿️ Parkir 5rb', type: 'expense', amount: 5000, category: 'Transportasi', note: 'Parkir' }
];

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
  templates: [...DEFAULT_TEMPLATES],
  categories: {
    expense: [...DEFAULT_EXPENSE_CATEGORIES],
    income: [...DEFAULT_INCOME_CATEGORIES]
  },
  wallets: [...DEFAULT_WALLETS],
  settings: {
    gasUrl: '',
    theme: 'dark',
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
let reportPeriodMode = 'calendar'; // 'calendar' | 'cycle'
let reportChartMode = 'bar';       // 'bar' | 'doughnut'
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
  handleLaunchShortcut();
  registerServiceWorker();
});

function handleLaunchShortcut() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action === 'expense' || action === 'income') {
    openTxModal();
    setTxType(action);
  }
}

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

      const templates = Array.isArray(parsed.templates)
        ? parsed.templates
        : [...DEFAULT_TEMPLATES];

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
        templates,
        categories: { expense: expCats, income: incCats },
        wallets,
        settings: {
          gasUrl: parsed.settings?.gasUrl || '',
          theme: parsed.settings?.theme || 'dark',
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
   DATE, CYCLE & LIQUID MORPH MOTION HELPERS
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

function getYesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
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
  const elapsedDays = Math.max(1, Math.round((today - startDate) / msPerDay) + 1);
  const remainingDays = Math.max(1, Math.round((endDate - today) / msPerDay) + 1);

  return {
    startISO: toISODate(startDate),
    endISO: toISODate(endDate),
    elapsedDays,
    remainingDays,
    isCustomCycle: startDay !== 1
  };
}

function getCycleRangeForMonth(monthIdx, year) {
  const startDay = appState.settings.cycleStartDay || 1;
  if (reportPeriodMode === 'calendar' || startDay === 1) {
    const start = new Date(year, monthIdx, 1);
    const end = new Date(year, monthIdx + 1, 0);
    return { startISO: toISODate(start), endISO: toISODate(end) };
  }
  const start = new Date(year, monthIdx, startDay);
  const end = new Date(year, monthIdx + 1, startDay - 1);
  return { startISO: toISODate(start), endISO: toISODate(end) };
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
  if (btnEl.dataset.morphBusy === '1') return;
  btnEl.dataset.morphBusy = '1';

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
    btnEl.dataset.morphBusy = '0';
    if (callback) callback();
  }, 660);
}

function animateCurrencyRoll(el, startVal, endVal) {
  if (!el) return;
  if (startVal === endVal || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = formatIDR(endVal);
    return;
  }
  const duration = 420;
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

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop.open').forEach((m) => closeModal(m.id));
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
    btn.addEventListener('click', () => {
      triggerHaptic(8);
      switchTab(btn.dataset.tab);
    });
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
    triggerHaptic(10);
    const next = appState.settings.theme === 'light' ? 'dark' : 'light';
    appState.settings.theme = next;
    applyTheme(next);
    saveState(false);
  });

  document.getElementById('btn-privacy-toggle').addEventListener('click', () => {
    triggerHaptic(10);
    appState.settings.privacyMode = !appState.settings.privacyMode;
    applyPrivacy(appState.settings.privacyMode);
    saveState(false);
  });

  // Quick Sync Header Button
  document.getElementById('btn-sync-quick').addEventListener('click', syncBidirectional);

  // Open / Toggle Transaction Modal via Liquid Morphing FAB
  document.getElementById('btn-open-tx-modal').addEventListener('click', () => {
    triggerHaptic(12);
    if (document.getElementById('modal-tx').classList.contains('open')) {
      closeModal('modal-tx');
    } else {
      openTxModal();
    }
  });

  // Quick Date Pills inside Transaction Modal
  document.querySelectorAll('[data-quick-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      triggerHaptic(8);
      document.getElementById('tx-date').value =
        btn.dataset.quickDate === 'yesterday' ? getYesterdayISO() : getTodayISO();
    });
  });

  // Save current modal input as 1-tap template
  document.getElementById('btn-save-as-template').addEventListener('click', saveCurrentAsTemplate);

  // Switch Expense / Income / Transfer inside Tx Modal
  document.querySelectorAll('[data-tx-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      triggerHaptic(8);
      setTxType(btn.dataset.txType);
    });
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

  // Sanitize numeric inputs against exponential 'e', '+', '-'
  document.querySelectorAll('input[type="number"]').forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
    });
  });

  // Global Keyboard Support (Escape closes any open modal + Numpad shortcuts)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
      return;
    }

    const txModalOpen = document.getElementById('modal-tx').classList.contains('open');
    if (!txModalOpen) return;

    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'SELECT') return;

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

  // Report Filters, Dual-Cycle Switch, Chart Morph Switch, Search & Exports
  document.getElementById('report-month-select').addEventListener('change', renderReportView);
  document.getElementById('report-year-select').addEventListener('change', renderReportView);

  document.querySelectorAll('[data-rep-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      triggerHaptic(8);
      reportPeriodMode = btn.dataset.repMode;
      document.getElementById('btn-rep-mode-calendar').classList.toggle('active', reportPeriodMode === 'calendar');
      document.getElementById('btn-rep-mode-cycle').classList.toggle('active', reportPeriodMode === 'cycle');
      document.getElementById('rep-cycle-switch-glider').style.transform =
        reportPeriodMode === 'cycle' ? 'translateX(100%)' : 'translateX(0%)';
      renderReportView();
    });
  });

  document.querySelectorAll('[data-chart-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      triggerHaptic(8);
      reportChartMode = btn.dataset.chartMode;
      document.getElementById('btn-chart-bar').classList.toggle('active', reportChartMode === 'bar');
      document.getElementById('btn-chart-doughnut').classList.toggle('active', reportChartMode === 'doughnut');
      document.getElementById('chart-switch-glider').style.transform =
        reportChartMode === 'doughnut' ? 'translateX(100%)' : 'translateX(0%)';
      document.getElementById('rep-chart-title').textContent =
        reportChartMode === 'bar' ? 'TREN ARUS KAS HARIAN' : 'KOMPOSISI PENGELUARAN';
      renderReportView();
    });
  });

  document.getElementById('rep-search-input').addEventListener('input', (e) => {
    reportSearchQuery = e.target.value.trim().toLowerCase();
    renderReportTxListOnly();
  });
  document.querySelectorAll('[data-filter-type]').forEach((chip) => {
    chip.addEventListener('click', () => {
      triggerHaptic(8);
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
      triggerHaptic(8);
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
    pushSyncToCloud(false);
  });

  document.getElementById('btn-pull-cloud').addEventListener('click', pullFromCloudForce);

  document.getElementById('btn-backup-json').addEventListener('click', exportBackupJSON);
  document.getElementById('input-restore-json').addEventListener('change', importBackupJSON);

  document.getElementById('btn-reset-local-data').addEventListener('click', resetLocalDeviceData);
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
  document.getElementById('meta-theme-color').setAttribute('content', isDark ? '#060811' : '#EEF2FB');
  if (document.getElementById('view-report')?.classList.contains('active')) {
    renderReportView();
  }
}

function applyPrivacy(enabled) {
  document.body.classList.toggle('privacy-active', enabled);
  document.getElementById('icon-eye-open').classList.toggle('hidden', enabled);
  document.getElementById('icon-eye-closed').classList.toggle('hidden', !enabled);
}

/* =========================================================
   1-TAP SMART TEMPLATES
   ========================================================= */
function renderQuickTemplates() {
  const strip = document.getElementById('quick-template-strip');
  const bar = document.getElementById('quick-template-bar');
  if (!strip || !bar) return;

  if (currentTxType === 'transfer') {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');

  const matching = appState.templates.filter((t) => t.type === currentTxType);
  if (matching.length === 0) {
    strip.innerHTML = `<span class="tx-meta" style="padding:4px">Isi nominal & kategori, lalu tekan + Pin untuk simpan template.</span>`;
    return;
  }

  strip.innerHTML = matching
    .map(
      (t) => `
        <button type="button" class="glass-btn tpl-chip" data-apply-tpl="${t.id}">
          <span>${escapeHTML(t.label)}</span>
          <span class="tpl-del-x" data-del-tpl="${t.id}" title="Hapus template">✕</span>
        </button>
      `
    )
    .join('');

  strip.querySelectorAll('[data-apply-tpl]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.dataset.delTpl) {
        e.stopPropagation();
        appState.templates = appState.templates.filter((item) => item.id !== e.target.dataset.delTpl);
        saveState(true);
        renderQuickTemplates();
        showToast('Template dihapus.');
        return;
      }
      const tpl = appState.templates.find((item) => item.id === btn.dataset.applyTpl);
      if (!tpl) return;
      triggerHaptic(12);
      currentNumpadRaw = String(Math.round(tpl.amount));
      updateNumpadDisplay(true);
      const catSel = document.getElementById('tx-category');
      if ([...catSel.options].some((o) => o.value === tpl.category)) {
        catSel.value = tpl.category;
      }
      document.getElementById('tx-note').value = tpl.note || '';
      showToast(`Template "${tpl.label}" diterapkan.`);
    });
  });
}

function saveCurrentAsTemplate() {
  if (currentTxType === 'transfer') return;
  const amount = Number(currentNumpadRaw) || 0;
  if (amount <= 0) {
    showToast('Masukkan nominal terlebih dahulu sebelum membuat template.');
    return;
  }
  const category = document.getElementById('tx-category').value;
  const note = document.getElementById('tx-note').value.trim();
  const shortAmt = amount >= 1000 ? `${Math.round(amount / 1000)}rb` : `${amount}`;
  const titleBase = note || category;
  const label = `${titleBase} ${shortAmt}`;

  appState.templates.unshift({
    id: uid('tpl'),
    label,
    type: currentTxType,
    amount,
    category,
    note: note || category
  });
  if (appState.templates.length > 10) appState.templates.pop();

  triggerButtonMorph(document.getElementById('btn-save-as-template'), 'Disematkan');
  saveState(true);
  renderQuickTemplates();
  showToast(`Template "${label}" disematkan.`);
}

/* =========================================================
   WALLET & CATEGORY CRUD (WITH FULL CASCADE RENAME)
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
      appState.templates.forEach((tpl) => {
        if (tpl.type === type && tpl.category === oldName) tpl.category = newName;
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

  renderQuickTemplates();
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

function duplicateTransaction(id) {
  const src = appState.transactions.find((t) => t.id === id);
  if (!src) return;
  const newId = uid('tx');
  appState.transactions.push({
    ...src,
    id: newId,
    date: getTodayISO(),
    updatedAt: new Date().toISOString()
  });
  lastSavedTxId = newId;
  triggerHaptic(12);
  showToast(`Transaksi "${src.category}" diduplikasi ke hari ini.`);
  saveState(true);
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
  const currentYM = getCurrentPeriodYM();

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

  // Hitung total tagihan rutin yang belum lunas bulan ini agar Sisa Napas realistis
  const unpaidBillsTotal = appState.bills
    .filter((b) => b.paidPeriod !== currentYM)
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  const totalBudgetLimit = appState.budgets.reduce((sum, b) => sum + (Number(b.limit) || 0), 0);
  let remainingPool = 0;
  let hintText = '';

  if (totalBudgetLimit > 0) {
    remainingPool = Math.max(0, totalBudgetLimit - cycleExpense - unpaidBillsTotal);
    hintText = unpaidBillsTotal > 0
      ? `Sisa pagu setelah amankan tagihan (${formatIDR(unpaidBillsTotal)}): ${formatIDR(remainingPool)} ÷ ${cycle.remainingDays} hr.`
      : `Sisa pagu anggaran ${formatIDR(remainingPool)} ÷ ${cycle.remainingDays} hari.`;
  } else {
    remainingPool = Math.max(0, cycleIncome - cycleExpense - unpaidBillsTotal);
    hintText = unpaidBillsTotal > 0
      ? `Sisa arus kas setelah amankan tagihan (${formatIDR(unpaidBillsTotal)}): ${formatIDR(remainingPool)} ÷ ${cycle.remainingDays} hr.`
      : `Sisa arus kas siklus ini ${formatIDR(remainingPool)} ÷ ${cycle.remainingDays} hari.`;
  }

  const dailySafe = Math.floor(remainingPool / cycle.remainingDays);
  document.getElementById('dash-days-left').textContent = `${cycle.remainingDays} hari tersisa`;
  document.getElementById('dash-daily-safe').innerHTML = `${formatIDR(dailySafe)}<span class="unit">/hari</span>`;
  document.getElementById('dash-safe-caption').textContent = hintText;

  // Proyeksi Akhir Siklus berdasarkan burn rate aktual harian
  const avgDailyBurn = cycleExpense / cycle.elapsedDays;
  const projectedRemainingSpend = avgDailyBurn * Math.max(0, cycle.remainingDays - 1);
  const projectedEndBalance = netBalance - projectedRemainingSpend - unpaidBillsTotal;
  const runwayEl = document.getElementById('dash-runway-forecast');
  if (runwayEl) {
    runwayEl.textContent = `Proyeksi akhir siklus: ${formatIDR(projectedEndBalance)} (rata-rata keluar ${formatIDR(avgDailyBurn)}/hr)`;
  }

  // Due Recurring Bills Alert Banner
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
    goalsStripEl.innerHTML = `<div class="glass-card empty-state" style="width:100%">Belum ada target tabungan. Klik <strong>+ Target</strong> untuk mulai menabung terarah.</div>`;
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
              <div class="progress-fill ${pct >= 100 ? '' : 'brand'}" style="width: ${pct}%"></div>
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
      <div class="glass-card tool-row">
        <div>
          <div class="tx-cat">
            <span>${escapeHTML(bill.name)}</span>
            <span class="due-badge ${status.badgeClass}">${status.label}</span>
          </div>
          <div class="tx-meta money-val">${formatIDR(bill.amount)} • ${escapeHTML(bill.wallet)}</div>
        </div>
        <div class="action-row-sm">
          <button type="button" class="glass-btn btn-pill-sm morph-btn" data-dash-pay-bill="${bill.id}">
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
          <button type="button" class="mini-action-btn dup" data-dup-id="${tx.id}" title="Salin ke hari ini">Salin</button>
          <button type="button" class="mini-action-btn edit" data-edit-id="${tx.id}">Edit</button>
          <button type="button" class="mini-action-btn del" data-del-id="${tx.id}">Hapus</button>
        </div>
      </div>
    </div>
  `;
}

function bindTxRowActions(container) {
  container.querySelectorAll('[data-dup-id]').forEach((btn) => {
    btn.addEventListener('click', () => duplicateTransaction(btn.dataset.dupId));
  });
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

  const reachedTarget = goal.saved >= goal.target;
  triggerButtonMorph(
    document.getElementById('btn-confirm-deposit'),
    reachedTarget ? 'Target Tercapai!' : 'Tersimpan',
    () => {
      closeModal('modal-goal-deposit');
      showToast(
        reachedTarget
          ? `Selamat! Target "${goal.name}" 100% tercapai!`
          : `+${formatIDR(amount)} masuk ke ${goal.name}!`
      );
      saveState(true);
    }
  );
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
    listEl.innerHTML = `<div class="glass-card empty-state">Belum ada pos anggaran. Tekan <strong>+ Atur Pos</strong> untuk membatasi pengeluaran.</div>`;
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
          <div class="glass-card reveal-card" style="--i: ${idx + 2}">
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
    goalsListEl.innerHTML = `<div class="glass-card empty-state">Belum ada celengan target. Tekan <strong>+ Target</strong> untuk membuat target tabungan.</div>`;
  } else {
    goalsListEl.innerHTML = appState.goals
      .map((g) => {
        const saved = Number(g.saved) || 0;
        const target = Math.max(1, Number(g.target) || 1);
        const pct = Math.min(100, Math.round((saved / target) * 100));
        const deadlineText = g.deadline ? ` • Target ${g.deadline}` : '';

        return `
          <div class="glass-card">
            <div class="budget-item-top">
              <span class="budget-cat-name">
                <span>${escapeHTML(g.name)}</span>
                ${pct >= 100 ? `<span class="badge-paid">✓ Tercapai</span>` : ''}
              </span>
              <span class="budget-numbers money-val">${formatIDR(saved)} / ${formatIDR(target)}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${pct >= 100 ? '' : 'brand'}" style="width: ${pct}%"></div>
            </div>
            <div class="budget-footer">
              <span>Terkumpul ${pct}%${deadlineText}</span>
              <div class="action-row-sm">
                <button type="button" class="glass-btn btn-pill-sm morph-btn" data-deposit-goal="${g.id}">
                  <span class="btn-label">+ Nabung</span>
                </button>
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
   MONTHLY RESUME, DUAL-CYCLE, SEARCH/FILTER, AUDIT & CHART
   ========================================================= */
function getSelectedPeriodTxs() {
  const m = Number(document.getElementById('report-month-select').value);
  const y = Number(document.getElementById('report-year-select').value);
  const range = getCycleRangeForMonth(m, y);
  const txs = appState.transactions.filter(
    (t) => t.date && t.date >= range.startISO && t.date <= range.endISO
  );
  return { m, y, range, txs };
}

function renderReportView() {
  const { m, y, range, txs } = getSelectedPeriodTxs();
  const subEl = document.getElementById('rep-period-subtitle');
  if (subEl) {
    subEl.textContent = reportPeriodMode === 'cycle'
      ? `Rentang siklus: ${range.startISO} s.d. ${range.endISO}`
      : 'Audit arus kas & efisiensi pengeluaran.';
  }

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

  const prevRange = getCycleRangeForMonth(m - 1, y);
  const prevExp = appState.transactions
    .filter((t) => t.date && t.date >= prevRange.startISO && t.date <= prevRange.endISO)
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
    momNote.textContent = 'Data periode lalu kosong';
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
  renderReportChart(range, txs, catTotals);
}

function renderReportTxListOnly() {
  const { m, y, range, txs } = getSelectedPeriodTxs();
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
    const periodDesc = reportPeriodMode === 'cycle'
      ? `siklus ${range.startISO} s.d. ${range.endISO}`
      : `${MONTH_NAMES[m]} ${y}`;
    fullListEl.innerHTML = `<div class="empty-state">Tidak ada transaksi yang cocok di ${periodDesc}.</div>`;
  } else {
    fullListEl.innerHTML = sorted.map((t) => buildTxRowHTML(t)).join('');
    bindTxRowActions(fullListEl);
  }
}

function renderReportChart(range, txs, catTotals) {
  const canvas = document.getElementById('cashflow-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (cashflowChartInstance) {
    cashflowChartInstance.destroy();
  }

  const isDark = appState.settings.theme === 'dark';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.08)';
  const tickColor = isDark ? '#94A3C4' : '#475569';

  if (reportChartMode === 'doughnut') {
    const entries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const labels = entries.length ? entries.map((e) => e[0]) : ['Belum ada data'];
    const dataVals = entries.length ? entries.map((e) => e[1]) : [1];
    const palette = entries.length
      ? ['#FF2A85', '#00F5D4', '#8B5CF6', '#00BBF9', '#00F59B', '#FBBF24', '#F97316', '#EC4899']
      : [isDark ? '#1E293B' : '#CBD5E1'];

    cashflowChartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: dataVals,
            backgroundColor: palette,
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
          legend: {
            display: entries.length > 0,
            position: 'right',
            labels: {
              color: tickColor,
              boxWidth: 10,
              font: { size: 10.5 }
            }
          }
        }
      }
    });
    return;
  }

  // O(N) Map-based Bar Chart: Tren Arus Kas Harian sepanjang rentang periode
  const startDate = new Date(range.startISO + 'T00:00:00');
  const endDate = new Date(range.endISO + 'T00:00:00');
  const dateIndexMap = new Map();
  const labels = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const iso = toISODate(d);
    dateIndexMap.set(iso, labels.length);
    labels.push(String(d.getDate()));
  }

  const dailyInc = new Array(labels.length).fill(0);
  const dailyExp = new Array(labels.length).fill(0);

  txs.forEach((t) => {
    const cleanDate = (t.date || '').slice(0, 10);
    const idx = dateIndexMap.get(cleanDate);
    if (idx !== undefined) {
      if (t.type === 'income') dailyInc[idx] += Number(t.amount) || 0;
      else if (t.type === 'transfer') dailyExp[idx] += Number(t.fee) || 0;
      else dailyExp[idx] += Number(t.amount) || 0;
    }
  });

  cashflowChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: dailyInc,
          backgroundColor: isDark ? '#00F59B' : '#059669',
          borderRadius: 5
        },
        {
          label: 'Pengeluaran',
          data: dailyExp,
          backgroundColor: isDark ? '#FF2A85' : '#E11D48',
          borderRadius: 5
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
  const { m, y, range, txs } = getSelectedPeriodTxs();
  const inc = txs.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const exp = txs.reduce((s, t) => {
    if (t.type === 'expense') return s + Number(t.amount);
    if (t.type === 'transfer') return s + (Number(t.fee) || 0);
    return s;
  }, 0);

  document.getElementById('print-period-text').textContent =
    `Periode: ${MONTH_NAMES[m]} ${y} (${range.startISO} s.d. ${range.endISO})`;
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
  if (btnEl && btnEl.dataset.paying === '1') return;
  if (btnEl) btnEl.dataset.paying = '1';

  const targetWallet = appState.wallets.includes(bill.wallet)
    ? bill.wallet
    : appState.wallets[0] || 'Tunai';

  const commitPayment = () => {
    if (bill.paidPeriod === currentYM) return;
    const nowISO = new Date().toISOString();
    bill.paidPeriod = currentYM;
    bill.updatedAt = nowISO;

    const newId = uid('tx');
    appState.transactions.push({
      id: newId,
      type: 'expense',
      amount: bill.amount,
      category: bill.category,
      wallet: targetWallet,
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
    billListEl.innerHTML = `<div class="glass-card empty-state">Belum ada jadwal tagihan rutin.</div>`;
  } else {
    billListEl.innerHTML = appState.bills
      .map((b) => {
        const status = getBillDueStatus(b);
        return `
          <div class="glass-card tool-row">
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
                  : `<button type="button" class="glass-btn btn-pill-sm morph-btn" data-pay-bill="${b.id}"><span class="btn-label">Bayar</span></button>`
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
    wishListEl.innerHTML = `<div class="glass-card empty-state">Wishlist kosong. Catat barang incaran agar tidak lapar mata.</div>`;
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
          <div class="glass-card tool-row">
            <div>
              <div class="tx-cat">${escapeHTML(w.name)}</div>
              <div class="tx-meta money-val">${formatIDR(w.price)}${w.note ? ` • ${escapeHTML(w.note)}` : ''}</div>
              <span class="cooldown-tag">${statusLabel}</span>
            </div>
            <div class="action-row-sm">
              <button type="button" class="glass-btn btn-pill-sm morph-btn" ${isUnlocked ? '' : 'disabled'} data-buy-wish="${w.id}">
                <span class="btn-label">Beli</span>
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
            <button type="button" class="glass-btn btn-pill-sm morph-btn" data-rename-wallet="${escapeHTML(w)}"><span class="btn-label">Rename</span></button>
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
          templates: appState.templates,
          categories: appState.categories,
          wallets: appState.wallets,
          cycleStartDay: appState.settings.cycleStartDay
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

function applyCloudPayload(cloudData) {
  appState.transactions = cloudData.transactions || [];
  appState.budgets = cloudData.budgets || [];
  appState.bills = cloudData.bills || [];
  appState.wishlist = cloudData.wishlist || [];
  appState.goals = cloudData.goals || [];
  if (Array.isArray(cloudData.templates)) appState.templates = cloudData.templates;
  if (cloudData.categories) appState.categories = cloudData.categories;
  if (cloudData.wallets) appState.wallets = cloudData.wallets;
  if (cloudData.cycleStartDay) {
    appState.settings.cycleStartDay = Math.min(28, Math.max(1, Number(cloudData.cycleStartDay) || 1));
    document.getElementById('input-cycle-day').value = String(appState.settings.cycleStartDay);
  }
}

async function pullFromCloudForce() {
  const url = document.getElementById('input-gas-url').value.trim() || appState.settings.gasUrl;
  if (!url) {
    showToast('Masukkan URL Google Apps Script terlebih dahulu.');
    return;
  }
  appState.settings.gasUrl = url;

  if (!confirm('Tarik data dari Google Sheets dan timpa data lokal saat ini?')) return;

  const syncBtn = document.getElementById('btn-sync-quick');
  syncBtn.classList.add('spinning');

  try {
    const getRes = await fetch(url);
    const getJson = await getRes.json();
    if (getJson.status === 'success' && getJson.data) {
      applyCloudPayload(getJson.data);
      appState.settings.lastSync = new Date().toISOString();
      saveState(false);
      triggerButtonMorph(document.getElementById('btn-pull-cloud'), 'Dipulihkan');
      showToast('Data berhasil dipulihkan dari Google Sheets.');
    } else {
      showToast('Data cloud kosong atau format tidak sesuai.');
    }
  } catch (err) {
    showToast('Gagal menarik data dari Google Sheets.');
  } finally {
    syncBtn.classList.remove('spinning');
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
        applyCloudPayload(getJson.data);
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
      if (Array.isArray(imported.templates)) appState.templates = imported.templates;
      if (imported.categories) appState.categories = imported.categories;
      if (imported.wallets) appState.wallets = imported.wallets;
      if (imported.settings?.cycleStartDay) {
        appState.settings.cycleStartDay = imported.settings.cycleStartDay;
        document.getElementById('input-cycle-day').value = String(appState.settings.cycleStartDay);
      }
      saveState(true);
      showToast('Data berhasil dipulihkan dari JSON.');
    } catch (err) {
      showToast('File JSON cadangan tidak valid.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function resetLocalDeviceData() {
  if (!confirm('Hapus seluruh catatan lokal di perangkat ini? Pastikan Anda sudah Ekspor JSON atau Kirim ke Cloud terlebih dahulu.')) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  appState = {
    transactions: [],
    budgets: [],
    bills: [],
    wishlist: [],
    goals: [],
    templates: [...DEFAULT_TEMPLATES],
    categories: {
      expense: [...DEFAULT_EXPENSE_CATEGORIES],
      income: [...DEFAULT_INCOME_CATEGORIES]
    },
    wallets: [...DEFAULT_WALLETS],
    settings: {
      gasUrl: appState.settings.gasUrl,
      theme: appState.settings.theme,
      privacyMode: false,
      lastSync: '',
      cycleStartDay: 1
    }
  };
  document.getElementById('input-cycle-day').value = '1';
  saveState(false);
  showToast('Data lokal perangkat berhasil direset.');
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
