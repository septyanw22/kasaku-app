// Konfigurasi Koneksi Supabase KASAKU
const SUPABASE_URL = 'https://cjfbpgjdtyvdlmgotqqa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QnJ5IC1C9oCZvKGyYhu47A_YzDi_4bW';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. Login & Cek Sesi (cukup login sekali di HP, sesi tersimpan otomatis)
async function kasakuLogin(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

async function kasakuGetSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

async function kasakuLogout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem('kasaku_cache_v1');
}

// 2. Ambil Semua Data (Pengganti doGet Google Apps Script)
async function kasakuLoadAll() {
  const [kat, dom, trx, ang, tag, wish] = await Promise.all([
    supabaseClient.from('kategori').select('*'),
    supabaseClient.from('dompet').select('*'),
    supabaseClient.from('transaksi').select('*').order('date', { ascending: false }),
    supabaseClient.from('anggaran').select('*'),
    supabaseClient.from('tagihan').select('*').order('due_day', { ascending: true }),
    supabaseClient.from('wishlist').select('*').order('created_at', { ascending: false })
  ]);

  if (trx.error) throw trx.error;

  const result = {
    categories: kat.data || [],
    wallets: (dom.data || []).map(w => w.name),
    transactions: (trx.data || []).map(t => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      category: t.category,
      wallet: t.wallet,
      date: t.date,
      note: t.note || '',
      updatedAt: t.updated_at
    })),
    budgets: (ang.data || []).map(b => ({
      category: b.category,
      limit: Number(b.budget_limit),
      updatedAt: b.updated_at
    })),
    bills: (tag.data || []).map(b => ({
      id: b.id,
      name: b.name,
      amount: Number(b.amount),
      category: b.category,
      wallet: b.wallet,
      dueDay: Number(b.due_day),
      paidPeriod: b.paid_period || '',
      updatedAt: b.updated_at
    })),
    wishlists: (wish.data || []).map(w => ({
      id: w.id,
      name: w.name,
      price: Number(w.price),
      note: w.note || '',
      createdAt: w.created_at,
      unlockAt: w.unlock_at,
      purchased: Boolean(w.purchased),
      updatedAt: w.updated_at
    }))
  };

  // Simpan cache lokal agar aplikasi terbuka instan
  localStorage.setItem('kasaku_cache_v1', JSON.stringify(result));
  return result;
}

// 3. Simpan atau Edit Transaksi
async function kasakuSaveTransaksi(tx) {
  const row = {
    id: tx.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: tx.type,
    amount: Number(tx.amount),
    category: tx.category,
    wallet: tx.wallet,
    date: tx.date,
    note: tx.note || '',
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabaseClient.from('transaksi').upsert(row).select().single();
  if (error) throw error;
  return data;
}

// 4. Simpan atau Edit Tagihan Berulang (mendukung edit nama, nominal, tanggal, & status lunas)
async function kasakuSaveTagihan(bill) {
  const row = {
    id: bill.id || `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: bill.name,
    amount: Number(bill.amount),
    category: bill.category,
    wallet: bill.wallet,
    due_day: Number(bill.dueDay),
    paid_period: bill.paidPeriod || '',
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabaseClient.from('tagihan').upsert(row).select().single();
  if (error) throw error;
  return data;
}

// 5. Simpan atau Edit Anggaran
async function kasakuSaveAnggaran(category, limit) {
  const row = {
    category: category,
    budget_limit: Number(limit),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabaseClient.from('anggaran').upsert(row).select().single();
  if (error) throw error;
  return data;
}

// 6. Simpan atau Edit Wishlist
async function kasakuSaveWishlist(item) {
  const row = {
    id: item.id || `wish_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: item.name,
    price: Number(item.price),
    note: item.note || '',
    created_at: item.createdAt || new Date().toISOString(),
    unlock_at: item.unlockAt || null,
    purchased: Boolean(item.purchased),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabaseClient.from('wishlist').upsert(row).select().single();
  if (error) throw error;
  return data;
}

// 7. Tambah Kategori atau Dompet Baru
async function kasakuAddKategori(type, name) {
  const { error } = await supabaseClient.from('kategori').upsert({ type, name });
  if (error) throw error;
}

async function kasakuAddDompet(name) {
  const { error } = await supabaseClient.from('dompet').upsert({ name });
  if (error) throw error;
}

// 8. Hapus Data Berdasarkan Tabel & ID
async function kasakuDelete(tableName, id) {
  const keyColumn = (tableName === 'kategori' || tableName === 'dompet') ? 'name'
                  : (tableName === 'anggaran') ? 'category'
                  : 'id';
  const { error } = await supabaseClient.from(tableName).delete().eq(keyColumn, id);
  if (error) throw error;
}
