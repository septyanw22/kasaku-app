/**
 * KASAKU v4 — Interactive Financial Dashboard, Automatic Numpad & Dual Theme
 * Engineered for Android TWA (PWABuilder) with 100% Touch Delegation
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'kasaku_state_v4';
  const DONUT_COLORS = ['#38bdf8', '#34d399', '#fb7185', '#fbbf24', '#a78bfa', '#f97316', '#2dd4bf'];

  const DEFAULT_STATE = {
    theme: 'dark',
    privacyMode: false,
    reportPeriod: 'month',
    monthlyBudget: 3000000,
    gasUrl: '',
    lastSync: null,
    wallets: [
      { id: 'w-tunai', name: 'Dompet Tunai', type: 'Tunai', balance: 650000 },
      { id: 'w-bank', name: 'Rekening Utama', type: 'Bank', balance: 4250000 },
      { id: 'w-ewallet', name: 'QRIS / E-Wallet', type: 'E-Wallet', balance: 480000 }
    ],
    categories: [
      { id: 'c-makan', name: 'Makan & Kopi', type: 'expense' },
      { id: 'c-transport', name: 'Transport & BBM', type: 'expense' },
      { id: 'c-tagihan', name: 'Tagihan & Utilitas', type: 'expense' },
      { id: 'c-belanja', name: 'Belanja Harian', type: 'expense' },
      { id: 'c-hiburan', name: 'Hobi & Olahraga', type: 'expense' },
      { id: 'c-gaji', name: 'Gaji & Tunjangan', type: 'income' },
      { id: 'c-bonus', name: 'Pendapatan Tambahan', type: 'income' }
    ],
    transactions: [
      {
        id: 'tx-init-1',
        type: 'income',
        amount: 5500000,
        walletId: 'w-bank',
        category: 'Gaji & Tunjangan',
        date: new Date().toISOString().slice(0, 10),
        note: 'Gaji bulanan'
      },
      {
        id: 'tx-init-2',
        type: 'expense',
        amount: 35000,
        walletId: 'w-ewallet',
        category: 'Makan & Kopi',
        date: new Date().toISOString().slice(0, 10),
        note: 'Kopi V60 Arabika & camilan'
      },
      {
        id: 'tx-init-3',
        type: 'expense',
        amount: 120000,
        walletId: 'w-tunai',
        category: 'Transport & BBM',
        date: new Date().toISOString().slice(0, 10),
        note: 'Isi BBM & parkir'
      },
      {
        id: 'tx-init-4',
        type: 'expense',
        amount: 245000,
        walletId: 'w-bank',
        category: 'Belanja Harian',
        date: new Date().toISOString().slice(0, 10),
        note: 'Kebutuhan rumah tangga'
      }
    ],
    bills: [
      {
        id: 'bill-1',
        name: 'Internet & Wi-Fi Rumah',
        amount: 320000,
        dueDay: 15,
        walletId: 'w-bank',
        category: 'Tagihan & Utilitas',
        paidMonth: ''
      },
      {
        id: 'bill-2',
        name: 'Token Listrik PLN',
        amount: 250000,
        dueDay: 20,
        walletId: 'w-ewallet',
        category: 'Tagihan & Utilitas',
        paidMonth: ''
      }
    ],
    goals: [
      { id: 'goal-1', name: 'Dana Darurat Keluarga', target: 15000000, saved: 4500000 }
    ],
    wishlist: [
      {
        id: 'wish-1',
        name: 'Upgrade Peralatan Seduh Kopi',
        price: 450000,
        unlockAt: Date.now() + 2 * 24 * 60 * 60 * 1000
      }
    ]
  };

  let state = loadState();
  let selectedDonutCategory = null;
  let selectedChartDayIndex = null;
  let numpadTokens = ['0']; // e.g., ['15000', '+', '25000']

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      const parsed = JSON.parse(raw);
      return Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), parsed);
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      showToast('Gagal menyimpan ke penyimpanan lokal');
    }
  }

  // =========================================================
  // THEME MANAGEMENT (DARK MODE / LIGHT MODE)
  // =========================================================
  function applyTheme(themeName) {
    const valid = themeName === 'light' ? 'light' : 'dark';
    state.theme = valid;
    document.documentElement.setAttribute('data-theme', valid);

    const metaTheme = document.getElementById('metaThemeColor');
    if (metaTheme) {
      metaTheme.setAttribute('content', valid === 'light' ? '#f8fafc' : '#0b1120');
    }

    const sunIcon = document.getElementById('themeIconSun');
    const moonIcon = document.getElementById('themeIconMoon');
    if (sunIcon && moonIcon) {
      sunIcon.classList.toggle('hidden', valid !== 'dark');
      moonIcon.classList.toggle('hidden', valid !== 'light');
    }

    saveState();
    requestAnimationFrame(() => {
      drawCategoryDonut();
      drawCashflowChart();
    });
  }

  function formatNumberID(num) {
    const val = Math.max(0, Math.round(Number(num) || 0));
    return val.toLocaleString('id-ID');
  }

  function formatRupiah(num) {
    if (state.privacyMode) return 'Rp ••••••';
    const val = Number(num) || 0;
    const sign = val < 0 ? '-' : '';
    return sign + 'Rp ' + Math.abs(Math.round(val)).toLocaleString('id-ID');
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function getCurrentMonthKey() {
    return new Date().toISOString().slice(0, 7);
  }

  function getTodayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function getWalletName(id) {
    const w = state.wallets.find((item) => item.id === id);
    return w ? w.name : 'Dompet';
  }

  function filterTransactionsByPeriod(period) {
    const today = getTodayISO();
    const monthKey = getCurrentMonthKey();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysISO = sevenDaysAgo.toISOString().slice(0, 10);

    return state.transactions.filter((tx) => {
      const d = tx.date || '';
      if (period === 'today') return d === today;
      if (period === '7d') return d >= sevenDaysISO && d <= today;
      if (period === 'month') return d.startsWith(monthKey);
      return true;
    });
  }

  function getPeriodLabel(period) {
    if (period === 'today') return 'Hari Ini';
    if (period === '7d') return '7 Hari';
    if (period === 'month') return 'Bulan Ini';
    return 'Semua Waktu';
  }

  // =========================================================
  // AUTOMATIC NUMPAD ENGINE
  // =========================================================
  function resetNumpad(initialAmount = 0) {
    numpadTokens = [String(Math.max(0, Math.round(Number(initialAmount) || 0)))];
    updateNumpadDisplay();
  }

  function evaluateNumpadTokens() {
    let total = Number(numpadTokens[0]) || 0;
    for (let i = 1; i < numpadTokens.length; i += 2) {
      const op = numpadTokens[i];
      const nextVal = Number(numpadTokens[i + 1]);
      if (Number.isNaN(nextVal)) continue;
      if (op === '+') total += nextVal;
      else if (op === '-') total -= nextVal;
    }
    return Math.max(0, Math.round(total));
  }

  function updateNumpadDisplay() {
    const computed = evaluateNumpadTokens();
    document.getElementById('txAmountInput').value = computed;
    document.getElementById('numpadValueDisplay').textContent = formatNumberID(computed);

    const exprEl = document.getElementById('numpadExprDisplay');
    if (numpadTokens.length > 1) {
      const formattedExpr = numpadTokens
        .map((tok, idx) => (idx % 2 === 0 ? formatNumberID(tok) : ` ${tok} `))
        .join('');
      exprEl.textContent = formattedExpr;
    } else {
      exprEl.textContent = computed > 0 ? 'Otomatis terformat • Siap simpan' : 'Ketik nominal atau hitung otomatis';
    }
  }

  function handleNumpadKey(key) {
    if (key === 'C') {
      resetNumpad(0);
      return;
    }

    if (key === '=') {
      const res = evaluateNumpadTokens();
      numpadTokens = [String(res)];
      updateNumpadDisplay();
      return;
    }

    if (key === 'BACK') {
      const lastIdx = numpadTokens.length - 1;
      const last = numpadTokens[lastIdx];
      if (last === '+' || last === '-') {
        numpadTokens.pop();
      } else if (last.length > 1) {
        numpadTokens[lastIdx] = last.slice(0, -1);
      } else if (numpadTokens.length > 1) {
        numpadTokens.pop();
      } else {
        numpadTokens[0] = '0';
      }
      updateNumpadDisplay();
      return;
    }

    if (key === '+' || key === '-') {
      const lastIdx = numpadTokens.length - 1;
      const last = numpadTokens[lastIdx];
      if (last === '+' || last === '-') {
        numpadTokens[lastIdx] = key;
      } else {
        numpadTokens.push(key);
      }
      updateNumpadDisplay();
      return;
    }

    // Digit key ('0'-'9' or '000')
    const lastIdx = numpadTokens.length - 1;
    const last = numpadTokens[lastIdx];
    if (last === '+' || last === '-') {
      numpadTokens.push(key === '000' ? '0' : key);
    } else {
      if (last === '0') {
        numpadTokens[lastIdx] = key === '000' ? '0' : key;
      } else if (last.length < 11) {
        numpadTokens[lastIdx] = last + key;
      }
    }
    updateNumpadDisplay();
  }

  function handleNumpadQuickAdd(addVal) {
    const current = evaluateNumpadTokens();
    const next = current + Number(addVal || 0);
    numpadTokens = [String(next)];
    updateNumpadDisplay();
  }

  // =========================================================
  // NAVIGATION & MODALS
  // =========================================================
  function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.classList.toggle('active', sec.id === 'view-' + viewName);
    });
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === viewName);
    });
    if (viewName === 'dashboard') {
      requestAnimationFrame(() => {
        drawCategoryDonut();
        drawCashflowChart();
      });
    }
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop.active').forEach((m) => m.classList.remove('active'));
  }

  // =========================================================
  // RENDERING ALL UI SECTIONS
  // =========================================================
  function renderAll() {
    renderDashboard();
    renderTransactionsList();
    renderWalletsAndBills();
    renderGoalsAndWishlist();
    renderSettings();
  }

  function renderDashboard() {
    const totalBalance = state.wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
    document.getElementById('totalBalanceDisplay').textContent = formatRupiah(totalBalance);
    document.getElementById('privacyBtn').textContent = state.privacyMode ? 'Tampilkan' : 'Sembunyikan';

    // Period Tab Active State
    const period = state.reportPeriod || 'month';
    const periodLabel = getPeriodLabel(period);
    document.querySelectorAll('#reportPeriodTabs .period-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.period === period);
    });
    document.getElementById('incomePeriodLabel').textContent = `Pemasukan (${periodLabel})`;
    document.getElementById('expensePeriodLabel').textContent = `Pengeluaran (${periodLabel})`;
    document.getElementById('donutPeriodBadge').textContent = periodLabel;

    const periodTxs = filterTransactionsByPeriod(period);
    let periodIncome = 0;
    let periodExpense = 0;
    periodTxs.forEach((tx) => {
      if (tx.type === 'income') periodIncome += Number(tx.amount || 0);
      if (tx.type === 'expense') periodExpense += Number(tx.amount || 0);
    });

    const netFlow = periodIncome - periodExpense;
    const netBadge = document.getElementById('netCashflowBadge');
    netBadge.textContent = (netFlow >= 0 ? '+' : '') + formatRupiah(netFlow);
    netBadge.classList.toggle('negative', netFlow < 0);

    document.getElementById('periodIncomeDisplay').textContent = formatRupiah(periodIncome);
    document.getElementById('periodExpenseDisplay').textContent = formatRupiah(periodExpense);

    // Financial Health & Monthly Budget Insights
    const monthTxs = filterTransactionsByPeriod('month');
    let monthInc = 0;
    let monthExp = 0;
    monthTxs.forEach((tx) => {
      if (tx.type === 'income') monthInc += Number(tx.amount || 0);
      if (tx.type === 'expense') monthExp += Number(tx.amount || 0);
    });

    const savingsRate = monthInc > 0 ? Math.round(((monthInc - monthExp) / monthInc) * 100) : 0;
    document.getElementById('savingsRateDisplay').textContent = `${savingsRate}%`;
    document.getElementById('savingsStatusText').textContent =
      monthInc === 0
        ? 'Catat pemasukan bulan ini'
        : savingsRate >= 20
        ? 'Sehat (Target ≥ 20%)'
        : savingsRate >= 0
        ? 'Waspada (Tingkatkan tabungan)'
        : 'Defisit (Pengeluaran > Pemasukan)';

    const now = new Date();
    const dayOfMonth = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - dayOfMonth + 1);
    const dailyAvg = Math.round(monthExp / dayOfMonth);
    const budgetCap = Math.max(50000, Number(state.monthlyBudget || 3000000));
    const remainingBudget = Math.max(0, budgetCap - monthExp);
    const safeDaily = Math.round(remainingBudget / remainingDays);

    document.getElementById('dailyAvgDisplay').textContent = formatRupiah(dailyAvg);
    document.getElementById('safeDailyDisplay').textContent = `Aman: ${formatRupiah(safeDaily)}/hari`;
    document.getElementById('budgetUsageText').textContent = `${formatRupiah(monthExp)} / ${formatRupiah(budgetCap)}`;

    const budgetPct = Math.min(100, Math.round((monthExp / budgetCap) * 100));
    const fillEl = document.getElementById('budgetProgressFill');
    fillEl.style.width = `${budgetPct}%`;
    fillEl.classList.toggle('warn', budgetPct >= 85);

    // Wallets Strip
    const walletStrip = document.getElementById('dashboardWalletList');
    walletStrip.innerHTML = state.wallets
      .map(
        (w) => `
        <div class="wallet-mini-card">
          <div class="wallet-mini-type">${escapeHtml(w.type)}</div>
          <div class="wallet-mini-name">${escapeHtml(w.name)}</div>
          <div class="wallet-mini-bal">${formatRupiah(w.balance)}</div>
        </div>`
      )
      .join('');

    // Upcoming Bills
    const monthKey = getCurrentMonthKey();
    const unpaidBills = state.bills
      .filter((b) => b.paidMonth !== monthKey)
      .sort((a, b) => Number(a.dueDay) - Number(b.dueDay))
      .slice(0, 3);

    const dashBills = document.getElementById('dashboardBillsList');
    if (unpaidBills.length === 0) {
      dashBills.innerHTML = '<div class="empty-state">Semua tagihan bulan ini sudah lunas!</div>';
    } else {
      dashBills.innerHTML = unpaidBills.map((b) => renderBillCardHtml(b, true)).join('');
    }

    // Recent Transactions (filtered by selected period if not 'all', or latest 5)
    const recentTx = [...periodTxs]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 5);

    const dashTx = document.getElementById('dashboardRecentTx');
    if (recentTx.length === 0) {
      dashTx.innerHTML = `<div class="empty-state">Belum ada transaksi pada periode ${periodLabel}.</div>`;
    } else {
      dashTx.innerHTML = recentTx.map((tx) => renderTxCardHtml(tx, false)).join('');
    }

    renderCategoryBreakdown(periodTxs);
    requestAnimationFrame(() => {
      drawCategoryDonut();
      drawCashflowChart();
    });
  }

  function getCategoryExpenseSummary(txList) {
    const map = {};
    let total = 0;
    txList.forEach((tx) => {
      if (tx.type === 'expense') {
        const cat = tx.category || 'Lainnya';
        const amt = Number(tx.amount || 0);
        map[cat] = (map[cat] || 0) + amt;
        total += amt;
      }
    });
    const items = Object.entries(map)
      .map(([name, amount], idx) => ({
        name,
        amount,
        pct: total > 0 ? Math.round((amount / total) * 100) : 0,
        color: DONUT_COLORS[idx % DONUT_COLORS.length]
      }))
      .sort((a, b) => b.amount - a.amount);
    return { items, total };
  }

  function renderCategoryBreakdown(periodTxs) {
    const { items } = getCategoryExpenseSummary(periodTxs);
    const listEl = document.getElementById('categoryBreakdownList');
    if (items.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding:12px;">Belum ada pengeluaran di periode ini.</div>';
      return;
    }

    listEl.innerHTML = items
      .slice(0, 5)
      .map(
        (item) => `
        <div class="cat-bar-item ${selectedDonutCategory === item.name ? 'selected' : ''}" data-select-donut-cat="${escapeHtml(item.name)}">
          <div class="cat-bar-top">
            <span style="display:flex;align-items:center;min-width:0;">
              <span class="cat-dot" style="background:${item.color};"></span>
              <span class="cat-name-lbl">${escapeHtml(item.name)} (${item.pct}%)</span>
            </span>
            <span class="cat-amt-lbl">${formatRupiah(item.amount)}</span>
          </div>
        </div>`
      )
      .join('');
  }

  function drawCategoryDonut() {
    const canvas = document.getElementById('categoryDonutCanvas');
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const size = rect.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.40;
    const lineWidth = size * 0.14;

    ctx.clearRect(0, 0, size, size);

    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text-primary').trim() || '#f1f5f9';
    const subColor = styles.getPropertyValue('--text-secondary').trim() || '#94a3b8';

    const periodTxs = filterTransactionsByPeriod(state.reportPeriod || 'month');
    const { items, total } = getCategoryExpenseSummary(periodTxs);

    if (total <= 0 || items.length === 0) {
      ctx.strokeStyle = styles.getPropertyValue('--chart-grid').trim() || 'rgba(148,163,184,0.2)';
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = subColor;
      ctx.font = '600 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('0 Pengeluaran', cx, cy);
      return;
    }

    let startAngle = -Math.PI / 2;
    items.forEach((item) => {
      const sliceAngle = (item.amount / total) * Math.PI * 2;
      const isSelected = selectedDonutCategory === item.name;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = isSelected ? lineWidth + 4 : lineWidth;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle - 0.03);
      ctx.stroke();
      startAngle += sliceAngle;
    });

    // Center label
    const activeItem = items.find((i) => i.name === selectedDonutCategory);
    ctx.fillStyle = subColor;
    ctx.font = '600 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(activeItem ? activeItem.name.slice(0, 12) : 'Total Keluar', cx, cy - 7);

    ctx.fillStyle = textColor;
    ctx.font = '800 12px sans-serif';
    const centerVal = activeItem ? `${activeItem.pct}%` : formatCompactRupiah(total);
    ctx.fillText(centerVal, cx, cy + 9);
  }

  function formatCompactRupiah(num) {
    if (state.privacyMode) return '••••';
    if (num >= 1000000) return 'Rp ' + (num / 1000000).toFixed(1).replace('.0', '') + 'jt';
    if (num >= 1000) return 'Rp ' + Math.round(num / 1000) + 'rb';
    return 'Rp ' + num;
  }

  function renderTxCardHtml(tx, allowDelete) {
    const isInc = tx.type === 'income';
    const isTrf = tx.type === 'transfer';
    const cls = isInc ? 'amount-income' : isTrf ? 'amount-transfer' : 'amount-expense';
    const prefix = isInc ? '+' : isTrf ? '⇄ ' : '-';
    const subtitle = isTrf
      ? `${escapeHtml(getWalletName(tx.walletId))} → ${escapeHtml(getWalletName(tx.toWalletId))} • ${tx.date}`
      : `${escapeHtml(tx.category || 'Umum')} • ${escapeHtml(getWalletName(tx.walletId))} • ${tx.date}`;

    return `
      <div class="item-card">
        <div class="item-main">
          <div class="item-title">${escapeHtml(tx.note || tx.category || 'Transaksi')}</div>
          <div class="item-meta">${subtitle}</div>
        </div>
        <div class="item-right">
          <div class="${cls}">${prefix}${formatRupiah(tx.amount)}</div>
          ${
            allowDelete
              ? `<div class="item-actions">
                  <button type="button" class="mini-action-btn del" data-delete-tx="${tx.id}">Hapus</button>
                 </div>`
              : ''
          }
        </div>
      </div>`;
  }

  function renderTransactionsList() {
    const search = (document.getElementById('txSearchInput').value || '').toLowerCase();
    const typeFilter = document.getElementById('txTypeFilter').value;
    const walletFilter = document.getElementById('txWalletFilter').value;

    const wfEl = document.getElementById('txWalletFilter');
    const currentWf = wfEl.value;
    wfEl.innerHTML =
      '<option value="all">Semua Dompet</option>' +
      state.wallets.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
    wfEl.value = state.wallets.some((w) => w.id === currentWf) ? currentWf : 'all';

    const filtered = state.transactions
      .filter((tx) => {
        if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
        if (walletFilter !== 'all' && tx.walletId !== walletFilter && tx.toWalletId !== walletFilter) return false;
        if (search) {
          const hay = `${tx.note || ''} ${tx.category || ''}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const listEl = document.getElementById('fullTransactionsList');
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Tidak ada transaksi yang cocok dengan filter.</div>';
    } else {
      listEl.innerHTML = filtered.map((tx) => renderTxCardHtml(tx, true)).join('');
    }
  }

  function renderBillCardHtml(bill, compact) {
    const isPaid = bill.paidMonth === getCurrentMonthKey();
    return `
      <div class="item-card">
        <div class="item-main">
          <div class="item-title">${escapeHtml(bill.name)}</div>
          <div class="item-meta">Jatuh tempo tgl ${bill.dueDay} • ${escapeHtml(getWalletName(bill.walletId))} • ${
      isPaid ? 'Lunas Bulan Ini' : 'Belum Dibayar'
    }</div>
        </div>
        <div class="item-right">
          <div class="amount-expense">${formatRupiah(bill.amount)}</div>
          <div class="item-actions">
            ${!isPaid ? `<button type="button" class="mini-action-btn pay" data-pay-bill="${bill.id}">Bayar</button>` : ''}
            <button type="button" class="mini-action-btn edit" data-edit-bill="${bill.id}">Edit</button>
            ${!compact ? `<button type="button" class="mini-action-btn del" data-delete-bill="${bill.id}">Hapus</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  function renderWalletsAndBills() {
    const walletsEl = document.getElementById('fullWalletsList');
    walletsEl.innerHTML = state.wallets
      .map(
        (w) => `
        <div class="item-card">
          <div class="item-main">
            <div class="item-title">${escapeHtml(w.name)}</div>
            <div class="item-meta">${escapeHtml(w.type)}</div>
          </div>
          <div class="item-right">
            <div class="amount-transfer">${formatRupiah(w.balance)}</div>
            <div class="item-actions">
              <button type="button" class="mini-action-btn edit" data-edit-wallet="${w.id}">Edit</button>
              ${
                state.wallets.length > 1
                  ? `<button type="button" class="mini-action-btn del" data-delete-wallet="${w.id}">Hapus</button>`
                  : ''
              }
            </div>
          </div>
        </div>`
      )
      .join('');

    const billsEl = document.getElementById('fullBillsList');
    if (state.bills.length === 0) {
      billsEl.innerHTML = '<div class="empty-state">Belum ada tagihan rutin. Klik + Tagihan untuk menambah.</div>';
    } else {
      billsEl.innerHTML = [...state.bills]
        .sort((a, b) => Number(a.dueDay) - Number(b.dueDay))
        .map((b) => renderBillCardHtml(b, false))
        .join('');
    }
  }

  function renderGoalsAndWishlist() {
    const goalsEl = document.getElementById('goalsList');
    if (state.goals.length === 0) {
      goalsEl.innerHTML = '<div class="empty-state">Belum ada target tabungan.</div>';
    } else {
      goalsEl.innerHTML = state.goals
        .map((g) => {
          const pct = Math.min(100, Math.round((Number(g.saved) / Math.max(1, Number(g.target))) * 100));
          return `
            <div class="glass-card" style="margin-bottom:0;">
              <div class="item-title">${escapeHtml(g.name)} (${pct}%)</div>
              <div class="item-meta">${formatRupiah(g.saved)} / ${formatRupiah(g.target)}</div>
              <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
              <div class="item-actions">
                <button type="button" class="mini-action-btn pay" data-topup-goal="${g.id}">+ Tambah Saldo</button>
                <button type="button" class="mini-action-btn del" data-delete-goal="${g.id}">Hapus</button>
              </div>
            </div>`;
        })
        .join('');
    }

    const wishEl = document.getElementById('wishlistList');
    if (state.wishlist.length === 0) {
      wishEl.innerHTML = '<div class="empty-state">Wishlist kosong. Tambahkan barang yang ingin dipertimbangkan.</div>';
    } else {
      const now = Date.now();
      wishEl.innerHTML = state.wishlist
        .map((item) => {
          const remainingMs = Number(item.unlockAt) - now;
          const ready = remainingMs <= 0;
          const hoursLeft = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60)));
          return `
            <div class="item-card">
              <div class="item-main">
                <div class="item-title">${escapeHtml(item.name)}</div>
                <div class="item-meta">${
                  ready ? 'Masa tunggu selesai — Siap diputuskan' : `Cooldown tersisa ±${hoursLeft} jam`
                }</div>
              </div>
              <div class="item-right">
                <div class="amount-transfer">${formatRupiah(item.price)}</div>
                <div class="item-actions">
                  ${
                    ready
                      ? `<button type="button" class="mini-action-btn pay" data-buy-wish="${item.id}">Beli</button>`
                      : ''
                  }
                  <button type="button" class="mini-action-btn del" data-delete-wish="${item.id}">Batal</button>
                </div>
              </div>
            </div>`;
        })
        .join('');
    }
  }

  function renderSettings() {
    document.getElementById('gasUrlInput').value = state.gasUrl || '';
    const syncLabel = document.getElementById('syncStatusText');
    syncLabel.textContent = state.lastSync ? `Sync: ${state.lastSync}` : 'Offline Ready';

    const catEl = document.getElementById('categoriesList');
    catEl.innerHTML = state.categories
      .map(
        (c) => `
        <span class="cat-chip">
          <span>${c.type === 'income' ? '↑' : '↓'} ${escapeHtml(c.name)}</span>
          <button type="button" class="link-btn" style="padding:0 2px;color:#fb7185;" data-delete-cat="${c.id}">&times;</button>
        </span>`
      )
      .join('');
  }

  // =========================================================
  // INTERACTIVE 7-DAY CASHFLOW BAR CHART
  // =========================================================
  function getLast7DaysSeries() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      let inc = 0;
      let exp = 0;
      state.transactions.forEach((tx) => {
        if (tx.date === iso) {
          if (tx.type === 'income') inc += Number(tx.amount || 0);
          if (tx.type === 'expense') exp += Number(tx.amount || 0);
        }
      });
      days.push({ iso, label, inc, exp });
    }
    return days;
  }

  function drawCashflowChart() {
    const canvas = document.getElementById('cashflowCanvas');
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const styles = getComputedStyle(document.documentElement);
    const gridColor = styles.getPropertyValue('--chart-grid').trim() || 'rgba(148, 163, 184, 0.2)';
    const labelColor = styles.getPropertyValue('--chart-label').trim() || '#94a3b8';

    const days = getLast7DaysSeries();
    const maxVal = Math.max(100000, ...days.map((d) => Math.max(d.inc, d.exp)));
    const padX = 14;
    const padTop = 14;
    const padBot = 24;
    const chartH = H - padTop - padBot;
    const stepX = (W - padX * 2) / days.length;

    // Baseline
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, padTop + chartH);
    ctx.lineTo(W - padX, padTop + chartH);
    ctx.stroke();

    days.forEach((d, idx) => {
      const cx = padX + idx * stepX + stepX / 2;
      const barW = Math.min(12, stepX * 0.28);

      // Highlight column if tapped
      if (selectedChartDayIndex === idx) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.fillRect(padX + idx * stepX + 2, padTop - 4, stepX - 4, chartH + 6);
      }

      // Income bar
      const incH = (d.inc / maxVal) * chartH;
      ctx.fillStyle = '#34d399';
      ctx.fillRect(cx - barW - 2, padTop + chartH - incH, barW, incH);

      // Expense bar
      const expH = (d.exp / maxVal) * chartH;
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(cx + 2, padTop + chartH - expH, barW, expH);

      // Date label
      ctx.fillStyle = selectedChartDayIndex === idx ? '#38bdf8' : labelColor;
      ctx.font = selectedChartDayIndex === idx ? '700 10px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, cx, H - 6);
    });
  }

  // =========================================================
  // MODAL FORM INITIALIZERS
  // =========================================================
  function prepareTxModal(type = 'expense') {
    document.getElementById('txForm').reset();
    resetNumpad(0);
    setTxType(type);
    document.getElementById('txDateInput').value = getTodayISO();

    const walletOpts = state.wallets
      .map((w) => `<option value="${w.id}">${escapeHtml(w.name)} (${formatRupiah(w.balance)})</option>`)
      .join('');
    document.getElementById('txWalletSelect').innerHTML = walletOpts;
    document.getElementById('txToWalletSelect').innerHTML = walletOpts;
    if (state.wallets.length > 1) {
      document.getElementById('txToWalletSelect').selectedIndex = 1;
    }
    openModal('txModal');
  }

  function setTxType(type) {
    document.getElementById('txTypeInput').value = type;
    document.querySelectorAll('#txTypeSegment .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.txType === type);
    });

    const isTransfer = type === 'transfer';
    document.getElementById('txToWalletGroup').classList.toggle('hidden', !isTransfer);
    document.getElementById('txCategoryGroup').classList.toggle('hidden', isTransfer);
    document.getElementById('txWalletLabel').textContent = isTransfer ? 'Dari Dompet' : 'Dompet';

    if (!isTransfer) {
      const cats = state.categories.filter((c) => c.type === type);
      document.getElementById('txCategorySelect').innerHTML = cats
        .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
        .join('');
    }
  }

  function prepareWalletModal(walletId = null) {
    const form = document.getElementById('walletForm');
    form.reset();
    if (walletId) {
      const w = state.wallets.find((item) => item.id === walletId);
      if (!w) return;
      document.getElementById('walletModalTitle').textContent = 'Edit Dompet';
      document.getElementById('walletIdInput').value = w.id;
      document.getElementById('walletNameInput').value = w.name;
      document.getElementById('walletTypeSelect').value = w.type;
      document.getElementById('walletBalanceInput').value = w.balance;
    } else {
      document.getElementById('walletModalTitle').textContent = 'Tambah Dompet';
      document.getElementById('walletIdInput').value = '';
    }
    openModal('walletModal');
  }

  function prepareBillModal(billId = null) {
    const form = document.getElementById('billForm');
    form.reset();
    document.getElementById('billWalletSelect').innerHTML = state.wallets
      .map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`)
      .join('');
    document.getElementById('billCategorySelect').innerHTML = state.categories
      .filter((c) => c.type === 'expense')
      .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
      .join('');

    if (billId) {
      const b = state.bills.find((item) => item.id === billId);
      if (!b) return;
      document.getElementById('billModalTitle').textContent = 'Edit Tagihan Rutin';
      document.getElementById('billIdInput').value = b.id;
      document.getElementById('billNameInput').value = b.name;
      document.getElementById('billAmountInput').value = b.amount;
      document.getElementById('billDueDateInput').value = b.dueDay;
      document.getElementById('billWalletSelect').value = b.walletId;
      document.getElementById('billCategorySelect').value = b.category || 'Tagihan & Utilitas';
    } else {
      document.getElementById('billModalTitle').textContent = 'Tambah Tagihan Rutin';
      document.getElementById('billIdInput').value = '';
    }
    openModal('billModal');
  }

  // =========================================================
  // EXPORT CSV REPORT & CLOUD SYNC
  // =========================================================
  function exportReportCsv() {
    const headers = ['Tanggal', 'Tipe', 'Kategori', 'Dompet', 'Dompet Tujuan', 'Nominal', 'Catatan'];
    const rows = state.transactions.map((tx) => [
      tx.date || '',
      tx.type || '',
      `"${String(tx.category || '').replace(/"/g, '""')}"`,
      `"${getWalletName(tx.walletId).replace(/"/g, '""')}"`,
      tx.toWalletId ? `"${getWalletName(tx.toWalletId).replace(/"/g, '""')}"` : '',
      Number(tx.amount || 0),
      `"${String(tx.note || '').replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('
');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-kasaku-${getTodayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Laporan CSV berhasil diunduh');
  }

  async function syncCloud(mode = 'push') {
    if (!state.gasUrl) {
      showToast('Isi URL Google Apps Script di menu Pengaturan dulu');
      return;
    }
    const statusEl = document.getElementById('syncStatusText');
    statusEl.textContent = 'Menyinkronkan...';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      if (mode === 'pull') {
        const res = await fetch(`${state.gasUrl}?action=pull`, { signal: controller.signal });
        const json = await res.json();
        if (json && json.status === 'ok' && json.data) {
          state = Object.assign(state, json.data);
          state.lastSync = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          saveState();
          applyTheme(state.theme);
          renderAll();
          showToast('Data berhasil ditarik dari Cloud');
        } else {
          showToast('Data Cloud kosong atau format tidak sesuai');
        }
      } else {
        await fetch(state.gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'push', payload: state }),
          signal: controller.signal
        });
        state.lastSync = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        saveState();
        renderSettings();
        showToast('Backup terkirim ke Google Sheets');
      }
    } catch (err) {
      statusEl.textContent = 'Offline Mode';
      showToast('Gagal terhubung ke server (cek koneksi / URL GAS)');
    } finally {
      clearTimeout(timer);
    }
  }

  // =========================================================
  // GLOBAL EVENT DELEGATION (100% Reliable in Android TWA)
  // =========================================================
  document.addEventListener('click', (e) => {
    const target = e.target;

    // Close modal when clicking backdrop directly
    if (target.classList.contains('modal-backdrop')) {
      target.classList.remove('active');
      return;
    }

    const closeBtn = target.closest('[data-close-modal]');
    if (closeBtn) {
      closeModal(closeBtn.dataset.closeModal);
      return;
    }

    // Automatic Numpad keys
    const numKeyBtn = target.closest('[data-num-key]');
    if (numKeyBtn) {
      handleNumpadKey(numKeyBtn.dataset.numKey);
      return;
    }

    const numAddBtn = target.closest('[data-numpad-add]');
    if (numAddBtn) {
      handleNumpadQuickAdd(numAddBtn.dataset.numpadAdd);
      return;
    }

    // Report Period Filter Tabs
    const periodBtn = target.closest('[data-period]');
    if (periodBtn) {
      state.reportPeriod = periodBtn.dataset.period;
      selectedDonutCategory = null;
      saveState();
      renderDashboard();
      return;
    }

    // Interactive Donut Legend Category Selection
    const donutCatBtn = target.closest('[data-select-donut-cat]');
    if (donutCatBtn) {
      const catName = donutCatBtn.dataset.selectDonutCat;
      selectedDonutCategory = selectedDonutCategory === catName ? null : catName;
      renderDashboard();
      return;
    }

    // Interactive 7-Day Bar Chart Tap Inspection
    if (target.id === 'cashflowCanvas') {
      const rect = target.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const padX = 14;
      const days = getLast7DaysSeries();
      const stepX = (rect.width - padX * 2) / days.length;
      const idx = Math.floor((clickX - padX) / stepX);
      if (idx >= 0 && idx < days.length) {
        selectedChartDayIndex = idx;
        const d = days[idx];
        document.getElementById('chartSelectedDayInfo').textContent =
          `${d.label}: +${formatCompactRupiah(d.inc)} / -${formatCompactRupiah(d.exp)}`;
        drawCashflowChart();
      }
      return;
    }

    // Explicit Theme Buttons in Settings
    const setThemeBtn = target.closest('[data-set-theme]');
    if (setThemeBtn) {
      applyTheme(setThemeBtn.dataset.setTheme);
      showToast(`Mode ${setThemeBtn.dataset.setTheme === 'light' ? 'Light' : 'Dark'} diaktifkan`);
      return;
    }

    const navBtn = target.closest('[data-nav]');
    if (navBtn) {
      switchView(navBtn.dataset.nav);
      return;
    }

    const segBtn = target.closest('[data-tx-type]');
    if (segBtn) {
      setTxType(segBtn.dataset.txType);
      return;
    }

    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      const act = actionBtn.dataset.action;
      if (act === 'toggle-theme') {
        const next = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        showToast(`Beralih ke ${next === 'light' ? 'Light Mode' : 'Dark Mode'}`);
      } else if (act === 'open-tx-modal') prepareTxModal('expense');
      else if (act === 'open-budget-modal') {
        document.getElementById('monthlyBudgetInput').value = state.monthlyBudget || 3000000;
        openModal('budgetModal');
      } else if (act === 'open-wallet-modal') prepareWalletModal(null);
      else if (act === 'open-bill-modal') prepareBillModal(null);
      else if (act === 'open-goal-modal') {
        document.getElementById('goalForm').reset();
        openModal('goalModal');
      } else if (act === 'open-wishlist-modal') {
        document.getElementById('wishlistForm').reset();
        openModal('wishlistModal');
      } else if (act === 'open-category-modal') {
        document.getElementById('categoryForm').reset();
        openModal('categoryModal');
      } else if (act === 'toggle-privacy') {
        state.privacyMode = !state.privacyMode;
        saveState();
        renderAll();
      } else if (act === 'save-gas-url') {
        state.gasUrl = (document.getElementById('gasUrlInput').value || '').trim();
        saveState();
        showToast('URL Google Apps Script disimpan');
      } else if (act === 'sync-now') {
        syncCloud('push');
      } else if (act === 'pull-cloud') {
        syncCloud('pull');
      } else if (act === 'export-csv') {
        exportReportCsv();
      } else if (act === 'export-json') {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kasaku-backup-${getTodayISO()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup JSON diunduh');
      } else if (act === 'reset-demo') {
        localStorage.removeItem(STORAGE_KEY);
        state = loadState();
        saveState();
        applyTheme(state.theme);
        renderAll();
        showToast('Data dikembalikan ke pengaturan awal');
      }
      return;
    }

    // Item-level actions
    const delTx = target.closest('[data-delete-tx]');
    if (delTx) {
      const id = delTx.dataset.deleteTx;
      const idx = state.transactions.findIndex((t) => t.id === id);
      if (idx > -1) {
        const tx = state.transactions[idx];
        const w = state.wallets.find((item) => item.id === tx.walletId);
        if (w) {
          if (tx.type === 'income') w.balance -= Number(tx.amount);
          else if (tx.type === 'expense') w.balance += Number(tx.amount);
          else if (tx.type === 'transfer') {
            w.balance += Number(tx.amount);
            const wTo = state.wallets.find((item) => item.id === tx.toWalletId);
            if (wTo) wTo.balance -= Number(tx.amount);
          }
        }
        state.transactions.splice(idx, 1);
        saveState();
        renderAll();
        showToast('Transaksi dihapus');
      }
      return;
    }

    const editWallet = target.closest('[data-edit-wallet]');
    if (editWallet) {
      prepareWalletModal(editWallet.dataset.editWallet);
      return;
    }

    const delWallet = target.closest('[data-delete-wallet]');
    if (delWallet) {
      state.wallets = state.wallets.filter((w) => w.id !== delWallet.dataset.deleteWallet);
      saveState();
      renderAll();
      showToast('Dompet dihapus');
      return;
    }

    const payBill = target.closest('[data-pay-bill]');
    if (payBill) {
      const b = state.bills.find((item) => item.id === payBill.dataset.payBill);
      if (b) {
        b.paidMonth = getCurrentMonthKey();
        const w = state.wallets.find((item) => item.id === b.walletId) || state.wallets[0];
        if (w) w.balance -= Number(b.amount);
        state.transactions.unshift({
          id: 'tx-' + Date.now(),
          type: 'expense',
          amount: Number(b.amount),
          walletId: w ? w.id : '',
          category: b.category || 'Tagihan & Utilitas',
          date: getTodayISO(),
          note: `Bayar Tagihan: ${b.name}`
        });
        saveState();
        renderAll();
        showToast(`Tagihan "${b.name}" dibayar`);
      }
      return;
    }

    const editBill = target.closest('[data-edit-bill]');
    if (editBill) {
      prepareBillModal(editBill.dataset.editBill);
      return;
    }

    const delBill = target.closest('[data-delete-bill]');
    if (delBill) {
      state.bills = state.bills.filter((b) => b.id !== delBill.dataset.deleteBill);
      saveState();
      renderAll();
      showToast('Tagihan dihapus');
      return;
    }

    const topupGoal = target.closest('[data-topup-goal]');
    if (topupGoal) {
      const g = state.goals.find((item) => item.id === topupGoal.dataset.topupGoal);
      if (g) {
        g.saved = Number(g.saved) + 100000;
        saveState();
        renderAll();
        showToast(`+Rp 100.000 ke "${g.name}"`);
      }
      return;
    }

    const delGoal = target.closest('[data-delete-goal]');
    if (delGoal) {
      state.goals = state.goals.filter((g) => g.id !== delGoal.dataset.deleteGoal);
      saveState();
      renderAll();
      return;
    }

    const buyWish = target.closest('[data-buy-wish]');
    if (buyWish) {
      const idx = state.wishlist.findIndex((item) => item.id === buyWish.dataset.buyWish);
      if (idx > -1) {
        const wish = state.wishlist[idx];
        const w = state.wallets[0];
        if (w) w.balance -= Number(wish.price);
        state.transactions.unshift({
          id: 'tx-' + Date.now(),
          type: 'expense',
          amount: Number(wish.price),
          walletId: w ? w.id : '',
          category: 'Belanja Harian',
          date: getTodayISO(),
          note: `Wishlist: ${wish.name}`
        });
        state.wishlist.splice(idx, 1);
        saveState();
        renderAll();
        showToast('Pembelian wishlist dicatat');
      }
      return;
    }

    const delWish = target.closest('[data-delete-wish]');
    if (delWish) {
      state.wishlist = state.wishlist.filter((w) => w.id !== delWish.dataset.deleteWish);
      saveState();
      renderAll();
      return;
    }

    const delCat = target.closest('[data-delete-cat]');
    if (delCat) {
      state.categories = state.categories.filter((c) => c.id !== delCat.dataset.deleteCat);
      saveState();
      renderSettings();
      showToast('Kategori dihapus');
    }
  });

  // =========================================================
  // FORM SUBMISSIONS
  // =========================================================
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const formId = e.target.id;

    if (formId === 'txForm') {
      const type = document.getElementById('txTypeInput').value;
      const amount = evaluateNumpadTokens();
      const walletId = document.getElementById('txWalletSelect').value;
      const toWalletId = document.getElementById('txToWalletSelect').value;
      const category = document.getElementById('txCategorySelect').value;
      const date = document.getElementById('txDateInput').value;
      const note = document.getElementById('txNoteInput').value.trim();

      if (amount <= 0) {
        showToast('Masukkan nominal lebih dari Rp 0');
        return;
      }
      if (type === 'transfer' && walletId === toWalletId) {
        showToast('Dompet asal dan tujuan harus berbeda');
        return;
      }

      const w = state.wallets.find((item) => item.id === walletId);
      if (w) {
        if (type === 'income') w.balance += amount;
        else if (type === 'expense') w.balance -= amount;
        else if (type === 'transfer') {
          w.balance -= amount;
          const wTo = state.wallets.find((item) => item.id === toWalletId);
          if (wTo) wTo.balance += amount;
        }
      }

      state.transactions.unshift({
        id: 'tx-' + Date.now(),
        type,
        amount,
        walletId,
        toWalletId: type === 'transfer' ? toWalletId : '',
        category: type === 'transfer' ? 'Transfer' : category,
        date,
        note
      });

      saveState();
      closeModal('txModal');
      renderAll();
      showToast(`Transaksi ${formatRupiah(amount)} tersimpan`);
    } else if (formId === 'budgetForm') {
      state.monthlyBudget = Math.max(50000, Number(document.getElementById('monthlyBudgetInput').value || 3000000));
      saveState();
      closeModal('budgetModal');
      renderDashboard();
      showToast('Batas anggaran bulanan diperbarui');
    } else if (formId === 'walletForm') {
      const id = document.getElementById('walletIdInput').value;
      const name = document.getElementById('walletNameInput').value.trim();
      const type = document.getElementById('walletTypeSelect').value;
      const balance = Number(document.getElementById('walletBalanceInput').value || 0);

      if (id) {
        const w = state.wallets.find((item) => item.id === id);
        if (w) {
          w.name = name;
          w.type = type;
          w.balance = balance;
        }
      } else {
        state.wallets.push({ id: 'w-' + Date.now(), name, type, balance });
      }
      saveState();
      closeModal('walletModal');
      renderAll();
      showToast('Dompet disimpan');
    } else if (formId === 'billForm') {
      const id = document.getElementById('billIdInput').value;
      const name = document.getElementById('billNameInput').value.trim();
      const amount = Number(document.getElementById('billAmountInput').value);
      const dueDay = Number(document.getElementById('billDueDateInput').value);
      const walletId = document.getElementById('billWalletSelect').value;
      const category = document.getElementById('billCategorySelect').value;

      if (id) {
        const b = state.bills.find((item) => item.id === id);
        if (b) {
          b.name = name;
          b.amount = amount;
          b.dueDay = dueDay;
          b.walletId = walletId;
          b.category = category;
        }
      } else {
        state.bills.push({
          id: 'bill-' + Date.now(),
          name,
          amount,
          dueDay,
          walletId,
          category,
          paidMonth: ''
        });
      }
      saveState();
      closeModal('billModal');
      renderAll();
      showToast('Tagihan rutin disimpan');
    } else if (formId === 'goalForm') {
      const name = document.getElementById('goalNameInput').value.trim();
      const target = Number(document.getElementById('goalTargetInput').value);
      const saved = Number(document.getElementById('goalSavedInput').value || 0);
      state.goals.push({ id: 'goal-' + Date.now(), name, target, saved });
      saveState();
      closeModal('goalModal');
      renderAll();
      showToast('Target tabungan ditambahkan');
    } else if (formId === 'wishlistForm') {
      const name = document.getElementById('wishNameInput').value.trim();
      const price = Number(document.getElementById('wishPriceInput').value);
      const days = Number(document.getElementById('wishDaysSelect').value || 3);
      state.wishlist.push({
        id: 'wish-' + Date.now(),
        name,
        price,
        unlockAt: Date.now() + days * 24 * 60 * 60 * 1000
      });
      saveState();
      closeModal('wishlistModal');
      renderAll();
      showToast(`Wishlist masuk masa tunggu ${days} hari`);
    } else if (formId === 'categoryForm') {
      const name = document.getElementById('catNameInput').value.trim();
      const type = document.getElementById('catTypeSelect').value;
      state.categories.push({ id: 'cat-' + Date.now(), name, type });
      saveState();
      closeModal('categoryModal');
      renderSettings();
      showToast('Kategori ditambahkan');
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'txSearchInput') renderTransactionsList();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'txTypeFilter' || e.target.id === 'txWalletFilter') renderTransactionsList();
  });

  window.addEventListener('resize', () => {
    requestAnimationFrame(() => {
      drawCategoryDonut();
      drawCashflowChart();
    });
  });

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================================
  // INIT & SERVICE WORKER AUTO-UPDATE
  // =========================================================
  document.addEventListener('DOMContentLoaded', () => {
    closeAllModals();
    applyTheme(state.theme || 'dark');
    renderAll();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => {
          reg.update();
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                nw.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch(() => {});

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  });
})();
