// supabase-db.js
const SUPABASE_URL = 'https://cjfbpgjdtyvdlmgotqqa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_QnJ5IC1C9oCZvKGyYhu47A_YzDi_4bW';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. Cek sesi login aktif
async function kasakuGetSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error('Error getSession:', error.message);
    return null;
  }
  return data.session;
}

// 2. Login dengan email & password Supabase
async function kasakuLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim(),
    password: password,
  });
  if (error) throw error;
  return data.session;
}

// 3. Logout
async function kasakuLogout() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

// 4. Muat seluruh data aplikasi (menggantikan fetch GET ke Apps Script)
async function kasakuLoadAll() {
  const [txRes, billRes, walletRes] = await Promise.all([
    sb.from('transactions').select('*').order('date', { ascending: false }),
    sb.from('bills').select('*').order('due_day', { ascending: true }),
    sb.from('wallets').select('*').order('created_at', { ascending: true }),
  ]);

  if (txRes.error) throw txRes.error;
  if (billRes.error) throw billRes.error;
  if (walletRes.error) throw walletRes.error;

  return {
    transactions: (txRes.data || []).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      amount: Number(item.amount) || 0,
      category: item.category,
      wallet: item.wallet,
      date: item.date,
      note: item.note || '',
      updatedAt: item.updated_at,
    })),
    bills: (billRes.data || []).map((item) => ({
      id: item.id,
      name: item.name,
      amount: Number(item.amount) || 0,
      category: item.category,
      wallet: item.wallet,
      dueDay: Number(item.due_day) || 1,
      paidPeriod: item.paid_period || '',
      updatedAt: item.updated_at,
    })),
    wallets: (walletRes.data || []).map((w) => w.name),
  };
}

// 5. Simpan / Edit Transaksi
async function kasakuSaveTransaction(tx) {
  const { data: userData } = await sb.auth.getUser();
  const payload = {
    id: tx.id,
    user_id: userData.user.id,
    type: tx.type,
    title: tx.title,
    amount: Number(tx.amount),
    category: tx.category,
    wallet: tx.wallet,
    date: tx.date,
    note: tx.note || '',
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from('transactions').upsert(payload);
  if (error) throw error;
}

// 6. Hapus Transaksi
async function kasakuDeleteTransaction(id) {
  const { error } = await sb.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// 7. Simpan / Edit Tagihan Rutin
async function kasakuSaveBill(bill) {
  const { data: userData } = await sb.auth.getUser();
  const payload = {
    id: bill.id,
    user_id: userData.user.id,
    name: bill.name,
    amount: Number(bill.amount),
    category: bill.category,
    wallet: bill.wallet,
    due_day: Number(bill.dueDay),
    paid_period: bill.paidPeriod || '',
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from('bills').upsert(payload);
  if (error) throw error;
}

// 8. Hapus Tagihan Rutin
async function kasakuDeleteBill(id) {
  const { error } = await sb.from('bills').delete().eq('id', id);
  if (error) throw error;
}

// 9. Tambah Dompet Custom
async function kasakuAddWallet(name) {
  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb.from('wallets').insert({
    user_id: userData.user.id,
    name: name.trim(),
  });
  if (error) throw error;
}

// 10. Hapus Dompet Custom
async function kasakuDeleteWallet(name) {
  const { error } = await sb.from('wallets').delete().eq('name', name);
  if (error) throw error;
}
