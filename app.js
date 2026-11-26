// app.js
const DEFAULT_WALLETS = ['Tunai', 'Seabank', 'Tabungan Blu', 'BCA', 'Mandiri', 'BNI'];

let state = {
  transactions: [],
  bills: [],
  wallets: [...DEFAULT_WALLETS],
};

// Helper Format Rupiah & Tanggal
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

function setSyncStatus(text, isError = false) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--danger)' : 'var(--accent-teal)';
}

// ==========================================
// 1. INISIALISASI & AUTENTIKASI SUPABASE
// ==========================================
async function initApp() {
  try {
    setSyncStatus('Memeriksa sesi...');
    const session = await kasakuGetSession();

    if (!session) {
      document.getElementById('authModal').style.display = 'flex';
      setSyncStatus('Belum Login', true);
      return;
    }

    document.getElementById('authModal').style.display = 'none';
    document.getElementById('currentUserEmail').textContent = session.user.email;

    setSyncStatus('Menyinkronkan...');
    const data = await kasakuLoadAll();

    state.transactions = data.transactions || [];
    state.bills = data.bills || [];
    state.wallets = data.wallets && data.wallets.length > 0
      ? Array.from(new Set([...DEFAULT_WALLETS, ...data.wallets]))
      : [...DEFAULT_WALLETS];

    localStorage.setItem('kasaku_backup_cache', JSON.stringify(state));
    document.getElementById('lastSyncTime').textContent =
      'Terakhir sinkron: ' + new Date().toLocaleTimeString('id-ID');
    setSyncStatus('Cloud Terhubung');

    renderAll();
  } catch (err) {
    console.error('Init error:', err);
    setSyncStatus('Mode Offline / Error', true);
    const cached = localStorage.getItem('kasaku_backup_cache');
    if (cached) {
      state = JSON.parse(cached);
      renderAll();
    }
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  try {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    await kasakuLogin(email, pass);
    document.getElementById('loginPass').value = '';
    await initApp();
  } catch (err) {
    errorEl.textContent = 'Email atau password salah.';
  }
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  if (!confirm('Keluar dari akun KASAKU?')) return;
  await kasakuLogout();
  state = { transactions: [], bills: [], wallets: [...DEFAULT_WALLETS] };
  await initApp();
});

// ==========================================
// 2. NAVIGASI TAB & FILTER PERIODE
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

// ==========================================
// 3. RENDER UI KESELURUHAN
// ==========================================
function renderAll() {
  renderWalletOptions();
  renderDashboard();
  renderTransactions();
  renderBills();
  renderDueReminders();
}

function renderWalletOptions() {
  const selects = ['txWallet', 'billWallet'];
  selects.forEach((id) => {
    const sel = document.getElementById(id);
    const current = sel.value;
    sel.innerHTML = state.wallets
      .map((w) => `<option value="${w}">${w}</option>`)
      .join('');
    if (state.wallets.includes(current)) sel.value = current;
  });

  const filterWallet = document.getElementById('txFilterWallet');
  const currentFilter = filterWallet.value;
  filterWallet.innerHTML =
    '<option value="all">Semua Dompet</option>' +
    state.wallets.map((w) => `<option value="${w}">${w}</option>`).join('');
  if ([...state.wallets, 'all'].includes(currentFilter)) {
    filterWallet.value = currentFilter;
  }

  const walletListEl = document.getElementById('walletList');
  walletListEl.innerHTML = state.wallets
    .map((w) => {
      const isDefault = DEFAULT_WALLETS.includes(w);
      return `
        <span class="neu-inset" style="padding:6px 12px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
          ${w}
          ${!isDefault ? `<button type="button" onclick="handleDeleteWallet('${w}')" style="border:none; background:none; color:var(--danger); font-weight:700; cursor:pointer;">×</button>` : ''}
        </span>
      `;
    })
    .join('');
}

function renderDashboard() {
  const selectedMonth = monthFilterEl.value;
  let totalBalance = 0;
  const walletBalances = {};
  state.wallets.forEach((w) => (walletBalances[w] = 0));

  let monthlyIncome = 0;
  let monthlyExpense = 0;

  state.transactions.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    const delta = tx.type === 'income' ? amt : -amt;
    totalBalance += delta;
    walletBalances[tx.wallet] = (walletBalances[tx.wallet] || 0) + delta;

    if (tx.date && tx.date.startsWith(selectedMonth)) {
      if (tx.type === 'income') monthlyIncome += amt;
      else monthlyExpense += amt;
    }
  });

  document.getElementById('totalBalance').textContent = formatRupiah(totalBalance);
  document.getElementById('monthlyIncome').textContent = formatRupiah(monthlyIncome);
  document.getElementById('monthlyExpense').textContent = formatRupiah(monthlyExpense);

  const walletSummaryEl = document.getElementById('walletSummaryList');
  walletSummaryEl.innerHTML = Object.entries(walletBalances)
    .map(
      ([wallet, bal]) => `
      <div class="item-row" style="margin-bottom:8px; padding:10px 14px;">
        <span style="font-weight:600; font-size:14px;">${wallet}</span>
        <strong style="color:${bal < 0 ? 'var(--danger)' : 'var(--text-primary)'}; font-size:14px;">${formatRupiah(bal)}</strong>
      </div>
    `
    )
    .join('');

  const recentTx = state.transactions
    .filter((tx) => tx.date && tx.date.startsWith(selectedMonth))
    .slice(0, 5);

  const recentEl = document.getElementById('recentTransactionsList');
  if (recentTx.length === 0) {
    recentEl.innerHTML = '<p class="label-muted">Belum ada transaksi pada periode ini.</p>';
    return;
  }

  recentEl.innerHTML = recentTx
    .map(
      (tx) => `
      <div class="item-row">
        <div>
          <strong style="font-size:14px; display:block;">${tx.title}</strong>
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

// ==========================================
// 4. CRUD TRANSAKSI
// ==========================================
const btnExpense = document.getElementById('btnTypeExpense');
const btnIncome = document.getElementById('btnTypeIncome');
const txTypeInput = document.getElementById('txType');

function setTxType(type) {
  txTypeInput.value = type;
  btnExpense.classList.toggle('active', type === 'expense');
  btnIncome.classList.toggle('active', type === 'income');
}

btnExpense.addEventListener('click', () => setTxType('expense'));
btnIncome.addEventListener('click', () => setTxType('income'));

document.getElementById('transactionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('txId').value || 'tx_' + Date.now();
  const txObj = {
    id,
    type: txTypeInput.value,
    title: document.getElementById('txTitle').value.trim(),
    amount: Number(document.getElementById('txAmount').value),
    category: document.getElementById('txCategory').value,
    wallet: document.getElementById('txWallet').value,
    date: document.getElementById('txDate').value,
    note: document.getElementById('txNote').value.trim(),
  };

  try {
    setSyncStatus('Menyimpan...');
    await kasakuSaveTransaction(txObj);
    resetTxForm();
    await initApp();
  } catch (err) {
    alert('Gagal menyimpan transaksi: ' + err.message);
    setSyncStatus('Gagal Simpan', true);
  }
});

function editTransaction(id) {
  const tx = state.transactions.find((item) => item.id === id);
  if (!tx) return;

  document.getElementById('txFormTitle').textContent = 'Edit Transaksi';
  document.getElementById('txId').value = tx.id;
  setTxType(tx.type);
  document.getElementById('txTitle').value = tx.title;
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
  try {
    setSyncStatus('Menghapus...');
    await kasakuDeleteTransaction(id);
    await initApp();
  } catch (err) {
    alert('Gagal menghapus: ' + err.message);
  }
}

document.getElementById('txSearch').addEventListener('input', renderTransactions);
document.getElementById('txFilterType').addEventListener('change', renderTransactions);
document.getElementById('txFilterWallet').addEventListener('change', renderTransactions);

function renderTransactions() {
  const selectedMonth = monthFilterEl.value;
  const keyword = document.getElementById('txSearch').value.toLowerCase();
  const filterType = document.getElementById('txFilterType').value;
  const filterWallet = document.getElementById('txFilterWallet').value;

  const filtered = state.transactions.filter((tx) => {
    const matchMonth = !selectedMonth || (tx.date && tx.date.startsWith(selectedMonth));
    const matchKey =
      !keyword ||
      tx.title.toLowerCase().includes(keyword) ||
      tx.category.toLowerCase().includes(keyword) ||
      (tx.note && tx.note.toLowerCase().includes(keyword));
    const matchType = filterType === 'all' || tx.type === filterType;
    const matchWallet = filterWallet === 'all' || tx.wallet === filterWallet;
    return matchMonth && matchKey && matchType && matchWallet;
  });

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
            <strong style="font-size:14px;">${tx.title}</strong>
            <span class="label-muted" style="margin:2px 0 0;">${tx.date} • ${tx.wallet} • ${tx.category}</span>
            ${tx.note ? `<span class="label-muted" style="font-style:italic;">"${tx.note}"</span>` : ''}
          </div>
          <strong style="color:${tx.type === 'income' ? 'var(--success)' : 'var(--danger)'}; font-size:14px;">
            ${tx.type === 'income' ? '+' : '-'}${formatRupiah(tx.amount)}
          </strong>
        </div>
        <div class="item-actions">
          <button type="button" class="neu-btn btn-sm" onclick="editTransaction('${tx.id}')">Edit</button>
          <button type="button" class="neu-btn btn-sm" style="color:var(--danger);" onclick="deleteTransaction('${tx.id}')">Hapus</button>
        </div>
      </div>
    `
    )
    .join('');
}

// ==========================================
// 5. TAGIHAN RUTIN (EDITABLE + HITUNG MUNDUR)
// ==========================================
function getBillCountdownInfo(bill) {
  const currentPeriod = getCurrentMonthStr();
  const isPaidThisMonth = bill.paidPeriod === currentPeriod;

  if (isPaidThisMonth) {
    return {
      isPaid: true,
      diffDays: 999,
      badgeClass: 'badge-success',
      label: 'Lunas Bulan Ini',
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(now.getFullYear(), now.getMonth(), Number(bill.dueDay));
  const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      isPaid: false,
      diffDays,
      badgeClass: 'badge-danger',
      label: `Terlambat ${Math.abs(diffDays)} hari`,
    };
  }
  if (diffDays === 0) {
    return {
      isPaid: false,
      diffDays,
      badgeClass: 'badge-danger',
      label: 'Jatuh Tempo Hari Ini!',
    };
  }
  if (diffDays <= 5) {
    return {
      isPaid: false,
      diffDays,
      badgeClass: 'badge-warn',
      label: `H-${diffDays} (Tgl ${bill.dueDay})`,
    };
  }
  return {
    isPaid: false,
    diffDays,
    badgeClass: 'badge-info',
    label: `H-${diffDays} (Tgl ${bill.dueDay})`,
  };
}

document.getElementById('billForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const existingId = document.getElementById('billId').value;
  const existingBill = state.bills.find((b) => b.id === existingId);

  const billObj = {
    id: existingId || 'bill_' + Date.now(),
    name: document.getElementById('billName').value.trim(),
    amount: Number(document.getElementById('billAmount').value),
    category: document.getElementById('billCategory').value,
    wallet: document.getElementById('billWallet').value,
    dueDay: Number(document.getElementById('billDueDay').value),
    paidPeriod: existingBill ? existingBill.paidPeriod : '',
  };

  try {
    setSyncStatus('Menyimpan tagihan...');
    await kasakuSaveBill(billObj);
    resetBillForm();
    await initApp();
  } catch (err) {
    alert('Gagal menyimpan tagihan: ' + err.message);
  }
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
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) return;

  const currentPeriod = getCurrentMonthStr();
  const isPaid = bill.paidPeriod === currentPeriod;
  const updatedBill = {
    ...bill,
    paidPeriod: isPaid ? '' : currentPeriod,
  };

  try {
    setSyncStatus('Memperbarui status...');
    await kasakuSaveBill(updatedBill);

    // Otomatis catat ke transaksi pengeluaran saat ditandai Lunas
    if (!isPaid && confirm(`Catat pembayaran "${bill.name}" (${formatRupiah(bill.amount)}) ke riwayat pengeluaran ${bill.wallet}?`)) {
      await kasakuSaveTransaction({
        id: 'tx_bill_' + Date.now(),
        type: 'expense',
        title: `Tagihan: ${bill.name}`,
        amount: bill.amount,
        category: bill.category,
        wallet: bill.wallet,
        date: getTodayStr(),
        note: `Pembayaran tagihan rutin periode ${currentPeriod}`,
      });
    }

    await initApp();
  } catch (err) {
    alert('Gagal memperbarui status tagihan: ' + err.message);
  }
}

async function deleteBill(id) {
  if (!confirm('Hapus tagihan rutin ini?')) return;
  try {
    setSyncStatus('Menghapus...');
    await kasakuDeleteBill(id);
    await initApp();
  } catch (err) {
    alert('Gagal menghapus tagihan: ' + err.message);
  }
}

function renderBills() {
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
            <strong style="font-size:15px; color:var(--text-primary);">${formatRupiah(bill.amount)}</strong>
          </div>
          <div class="item-actions">
            <button type="button" class="neu-btn btn-sm" style="color:${info.isPaid ? 'var(--text-secondary)' : 'var(--success)'};" onclick="togglePayBill('${bill.id}')">
              ${info.isPaid ? 'Batal Lunas' : 'Tandai Lunas'}
            </button>
            <button type="button" class="neu-btn btn-sm" onclick="editBill('${bill.id}')">Edit</button>
            <button type="button" class="neu-btn btn-sm" style="color:var(--danger);" onclick="deleteBill('${bill.id}')">Hapus</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDueReminders() {
  const banner = document.getElementById('dueReminderBanner');
  const content = document.getElementById('dueReminderContent');

  const urgentBills = state.bills
    .map((b) => ({ bill: b, info: getBillCountdownInfo(b) }))
    .filter((item) => !item.info.isPaid && item.info.diffDays <= 5);

  if (urgentBills.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'block';
  content.innerHTML = urgentBills
    .map(
      ({ bill, info }) =>
        `<div style="margin-bottom:4px;">• <strong>${bill.name}</strong> (${formatRupiah(bill.amount)} via ${bill.wallet}) — <strong>${info.label}</strong></div>`
    )
    .join('');
}

// ==========================================
// 6. ALAT: KELOLA DOMPET, SYNC & EKSPOR/IMPOR
// ==========================================
document.getElementById('customWalletForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newWalletName');
  const name = input.value.trim();
  if (!name) return;

  try {
    await kasakuAddWallet(name);
    input.value = '';
    await initApp();
  } catch (err) {
    alert('Gagal menambah dompet: ' + err.message);
  }
});

async function handleDeleteWallet(name) {
  if (!confirm(`Hapus dompet "${name}"?`)) return;
  try {
    await kasakuDeleteWallet(name);
    await initApp();
  } catch (err) {
    alert('Gagal menghapus dompet: ' + err.message);
  }
}

document.getElementById('btnSyncNow').addEventListener('click', initApp);

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
    const text = await file.text();
    const imported = JSON.parse(text);
    setSyncStatus('Mengimpor data...');

    if (Array.isArray(imported.transactions)) {
      for (const tx of imported.transactions) {
        await kasakuSaveTransaction(tx);
      }
    }
    if (Array.isArray(imported.bills)) {
      for (const bill of imported.bills) {
        await kasakuSaveBill(bill);
      }
    }
    alert('Impor JSON ke Supabase berhasil!');
    await initApp();
  } catch (err) {
    alert('Gagal mengimpor JSON: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// Jalankan aplikasi saat halaman dibuka
initApp();
