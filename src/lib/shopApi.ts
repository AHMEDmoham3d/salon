import { supabase, type Shop, type ShopAdmin, type ShopStatus, COMPANY_FEE_PER_VISIT } from './supabase';
import { getVisitsByCustomer } from './api';

export type { Shop, ShopAdmin, ShopStatus };

/* ---------- Shop registration ---------- */
export type ShopRegistration = {
  shop_name: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  national_id: string;
  shop_type: string;
  has_branches: boolean;
  branch_count: number;
  shop_address: string;
  personal_address: string;
  year_started: number;
  admin_full_name: string;
  admin_phone: string;
  admin_email: string;
  admin_national_id: string;
};

export async function registerShop(data: ShopRegistration): Promise<{ shop: Shop; admin: ShopAdmin }> {
  const { data: shop, error: sErr } = await supabase
    .from('shops')
    .insert({
      shop_name: data.shop_name,
      owner_name: data.owner_name,
      owner_phone: data.owner_phone,
      owner_email: data.owner_email,
      national_id: data.national_id,
      shop_type: data.shop_type,
      has_branches: data.has_branches,
      branch_count: data.branch_count,
      shop_address: data.shop_address,
      personal_address: data.personal_address,
      year_started: data.year_started,
      status: 'pending',
    })
    .select()
    .single();
  if (sErr) throw sErr;

  const { data: admin, error: aErr } = await supabase
    .from('shop_admins')
    .insert({
      shop_id: shop.id,
      full_name: data.admin_full_name,
      phone: data.admin_phone,
      email: data.admin_email,
      national_id: data.admin_national_id,
    })
    .select()
    .single();
  if (aErr) throw aErr;

  return { shop, admin };
}

/* ---------- Admin login (shop-scoped) ---------- */
export async function adminLogin(phone: string, email: string): Promise<{ shop: Shop; admin: ShopAdmin } | null> {
  // Match admin by phone AND email, then get the associated shop
  const { data: admin, error } = await supabase
    .from('shop_admins')
    .select('*, shop:shops(*)')
    .eq('phone', phone.trim())
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!admin) return null;
  return { shop: admin.shop, admin };
}

export async function getShopById(shopId: string): Promise<Shop | null> {
  const { data, error } = await supabase.from('shops').select('*').eq('id', shopId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getShopAdmin(shopId: string): Promise<ShopAdmin | null> {
  const { data, error } = await supabase
    .from('shop_admins')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ---------- Company dashboard: all shops ---------- */
export async function getAllShops(): Promise<Shop[]> {
  const { data, error } = await supabase.from('shops').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateShopStatus(shopId: string, status: ShopStatus): Promise<void> {
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'approved') updates.approved_at = new Date().toISOString();
  const { error } = await supabase.from('shops').update(updates).eq('id', shopId);
  if (error) throw error;
}

export async function deleteShop(shopId: string): Promise<void> {
  const { error } = await supabase.from('shops').delete().eq('id', shopId);
  if (error) throw error;
}

/* ---------- Shop-scoped data ---------- */
export async function getShopCustomers(shopId: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getShopVisits(shopId: string) {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('shop_id', shopId)
    .order('visit_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAllVisits(): Promise<{ id: string; customer_id: string; shop_id: string | null; payment_type: string; charge_amount: number; visit_date: string; haircut_type: string | null }[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, customer_id, shop_id, payment_type, charge_amount, visit_date, haircut_type')
    .order('visit_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ---------- Shop revenue + company fee (real-time) ---------- */
export type ShopInvoice = {
  shop: Shop;
  thisMonthVisits: number;
  thisMonthFee: number;
  totalVisits: number;
  totalFee: number;
  thisMonthRevenue: number;
  thisMonthNetRevenue: number;
  isPaid: boolean;
};

export type MonthFeeDetail = {
  month: string;
  monthLabel: string;
  visits: number;
  fee: number;
  paid: boolean;
};

export async function getShopInvoice(shopId: string): Promise<ShopInvoice | null> {
  const shop = await getShopById(shopId);
  if (!shop) return null;

  const visits = await getShopVisits(shopId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const thisMonthVisits = visits.filter((v) => new Date(v.visit_date).toISOString() >= monthStart);
  const thisMonthFee = thisMonthVisits.length * COMPANY_FEE_PER_VISIT;
  const totalFee = visits.length * COMPANY_FEE_PER_VISIT;
  const thisMonthRevenue = visits
    .filter((v) => new Date(v.visit_date).toISOString() >= monthStart)
    .reduce((s, v) => s + Number(v.charge_amount), 0);
  const thisMonthNetRevenue = thisMonthRevenue - thisMonthFee;

  return {
    shop,
    thisMonthVisits: thisMonthVisits.length,
    thisMonthFee,
    totalVisits: visits.length,
    totalFee,
    thisMonthRevenue,
    thisMonthNetRevenue,
    isPaid: false,
  };
}

export async function getCompanyTotalFees(): Promise<{
  totalShops: number;
  approvedShops: number;
  pendingShops: number;
  totalVisits: number;
  totalFees: number;
  thisMonthFees: number;
  thisMonthVisits: number;
  shopBreakdown: { shop: Shop; visits: number; fee: number; thisMonthVisits: number; thisMonthFee: number; paid: boolean }[];
}> {
  const shops = await getAllShops();
  const approvedShops = shops.filter((s) => s.status === 'approved');
  const pendingShops = shops.filter((s) => s.status === 'pending');

  const allVisits = await getAllVisits();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let totalVisits = 0;
  let thisMonthVisits = 0;
  const shopBreakdown: { shop: Shop; visits: number; fee: number; thisMonthVisits: number; thisMonthFee: number; paid: boolean }[] = [];

  for (const shop of approvedShops) {
    const shopVisits = allVisits.filter((v) => v.shop_id === shop.id);
    const shopThisMonth = shopVisits.filter((v) => new Date(v.visit_date).toISOString() >= monthStart);
    const fee = shopVisits.length * COMPANY_FEE_PER_VISIT;
    const thisMonthFee = shopThisMonth.length * COMPANY_FEE_PER_VISIT;
    totalVisits += shopVisits.length;
    thisMonthVisits += shopThisMonth.length;
    shopBreakdown.push({ shop, visits: shopVisits.length, fee, thisMonthVisits: shopThisMonth.length, thisMonthFee, paid: false });
  }

  return {
    totalShops: shops.length,
    approvedShops: approvedShops.length,
    pendingShops: pendingShops.length,
    totalVisits,
    totalFees: totalVisits * COMPANY_FEE_PER_VISIT,
    thisMonthFees: thisMonthVisits * COMPANY_FEE_PER_VISIT,
    thisMonthVisits,
    shopBreakdown,
  };
}

/* ---------- Monthly fee history per shop ---------- */
export async function getShopMonthlyFees(shopId: string): Promise<MonthFeeDetail[]> {
  const visits = await getShopVisits(shopId);
  const byMonth = new Map<string, number>();

  for (const v of visits) {
    const d = new Date(v.visit_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }

  const result: MonthFeeDetail[] = [];
  for (const [month, count] of byMonth) {
    const [y, m] = month.split('-');
    const label = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(Number(y), Number(m) - 1));
    result.push({ month, monthLabel: label, visits: count, fee: count * COMPANY_FEE_PER_VISIT, paid: false });
  }
  result.sort((a, b) => b.month.localeCompare(a.month));
  return result;
}
