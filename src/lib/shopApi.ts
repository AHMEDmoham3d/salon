
import {
  supabase,
  type Shop,
  type ShopAdmin,
  type ShopStatus,
  COMPANY_FEE_PER_VISIT,
} from './supabase';

export type { Shop, ShopAdmin, ShopStatus };

const SHOP_LOGOS_BUCKET = 'shop-logos';
const MAX_SHOP_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_SHOP_LOGO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/* ---------- Shared helpers ---------- */

function getMonthKey(dateValue: string): string {
  const date = new Date(dateValue);

  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}`;
}

function getCurrentMonthStart(): string {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
}

function isInCurrentMonth(
  dateValue: string,
  monthStart: string
): boolean {
  const date = new Date(dateValue).getTime();
  const start = new Date(monthStart).getTime();

  return (
    Number.isFinite(date) &&
    Number.isFinite(start) &&
    date >= start
  );
}

function getRecordedFee(
  transactions: {
    company_fee_amount: number | null;
  }[]
): number {
  return transactions.reduce(
    (sum, transaction) =>
      sum + Number(transaction.company_fee_amount ?? 0),
    0
  );
}

function getFeeUnits(fee: number): number {
  return fee / COMPANY_FEE_PER_VISIT;
}

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

export async function registerShop(
  data: ShopRegistration
): Promise<{ shop: Shop; admin: ShopAdmin }> {
  const { data: shop, error: sErr } = await supabase
    .from('shops')
    .insert({
      shop_name: data.shop_name.trim(),
      owner_name: data.owner_name.trim(),
      owner_phone: data.owner_phone.trim(),
      owner_email: data.owner_email.trim().toLowerCase(),
      national_id: data.national_id.trim(),
      shop_type: data.shop_type,
      has_branches: data.has_branches,
      branch_count: data.branch_count,
      shop_address: data.shop_address.trim(),
      personal_address: data.personal_address.trim(),
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
      full_name: data.admin_full_name.trim(),
      phone: data.admin_phone.trim(),
      email: data.admin_email.trim().toLowerCase(),
      national_id: data.admin_national_id.trim(),
    })
    .select()
    .single();

  if (aErr) throw aErr;

  return { shop, admin };
}

/* ---------- Admin login (server-side lookup + session) ---------- */

export async function adminLogin(
  phone: string,
  email: string
): Promise<{
  shop: Shop;
  admin: ShopAdmin;
  sessionToken: string;
  expiresAt: string;
} | null> {
  const normalizedPhone = phone.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedPhone || !normalizedEmail) {
    return null;
  }

  const { data, error } = await supabase.functions.invoke(
    'shop-admin-login',
    {
      body: {
        phone: normalizedPhone,
        email: normalizedEmail,
      },
    }
  );

  if (error) {
    throw error;
  }

  if (
    !data?.ok ||
    !data.shop ||
    !data.admin ||
    !data.sessionToken ||
    !data.expiresAt
  ) {
    return null;
  }

  return {
    shop: data.shop as Shop,
    admin: data.admin as ShopAdmin,
    sessionToken: data.sessionToken as string,
    expiresAt: data.expiresAt as string,
  };
}

/* ---------- Admin session verification ---------- */

export async function verifyAdminSession(
  sessionToken: string
): Promise<{
  shop: Shop;
  admin: ShopAdmin;
  expiresAt: string;
} | null> {
  if (
    typeof sessionToken !== 'string' ||
    !sessionToken.trim()
  ) {
    return null;
  }

  const { data, error } = await supabase.functions.invoke(
    'shop-admin-verify',
    {
      body: {
        sessionToken,
      },
    }
  );

  if (error) {
    console.error(
      'Session verification request failed:',
      error
    );

    throw error;
  }

  if (
    !data?.ok ||
    !data.shop ||
    !data.admin ||
    !data.expiresAt
  ) {
    return null;
  }

  const expiresAt = new Date(data.expiresAt);

  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  return {
    shop: data.shop as Shop,
    admin: data.admin as ShopAdmin,
    expiresAt: data.expiresAt as string,
  };
}

export async function getShopById(
  shopId: string
): Promise<Shop | null> {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('id', shopId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function getShopAdmin(
  shopId: string
): Promise<ShopAdmin | null> {
  const { data, error } = await supabase
    .from('shop_admins')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

/* ---------- Shop branding and settings ---------- */

export type ShopSettingsUpdate = {
  shop_name?: string;
  logo_url?: string | null;
  regular_haircut_price?: number;
};

export async function updateShopSettings(
  shopId: string,
  updates: ShopSettingsUpdate
): Promise<Shop> {
  if (!shopId) {
    throw new Error('معرّف المحل غير موجود.');
  }

  if (
    updates.regular_haircut_price !== undefined &&
    (
      !Number.isFinite(updates.regular_haircut_price) ||
      updates.regular_haircut_price < 0
    )
  ) {
    throw new Error(
      'سعر الحلاقة يجب أن يكون رقمًا صحيحًا أكبر من أو يساوي صفر.'
    );
  }

  const payload: ShopSettingsUpdate & { updated_at: string } = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('shops')
    .update(payload)
    .eq('id', shopId)
    .select('*')
    .single();

  if (error) throw error;

  return data;
}

export async function uploadShopLogo(
  shopId: string,
  file: File
): Promise<Shop> {
  if (!shopId) {
    throw new Error('معرّف المحل غير موجود.');
  }

  if (!file) {
    throw new Error('من فضلك اختر صورة للشعار.');
  }

  if (!ALLOWED_SHOP_LOGO_TYPES.includes(file.type)) {
    throw new Error(
      'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.'
    );
  }

  if (file.size > MAX_SHOP_LOGO_SIZE) {
    throw new Error(
      'حجم الشعار يجب ألا يزيد عن 2 ميجابايت.'
    );
  }

  const fileExtension =
    file.type === 'image/jpeg'
      ? 'jpg'
      : file.type.split('/')[1];

  const filePath = `${shopId}/logo-${Date.now()}.${fileExtension}`;

  const { error: uploadError } = await supabase.storage
    .from(SHOP_LOGOS_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(SHOP_LOGOS_BUCKET)
    .getPublicUrl(filePath);

  return updateShopSettings(shopId, {
    logo_url: publicUrlData.publicUrl,
  });
}

/* ---------- Company dashboard: all shops ---------- */

export async function getAllShops(): Promise<Shop[]> {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function updateShopStatus(
  shopId: string,
  status: ShopStatus
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'approved') {
    updates.approved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('shops')
    .update(updates)
    .eq('id', shopId);

  if (error) throw error;
}

export async function deleteShop(shopId: string): Promise<void> {
  const { error } = await supabase
    .from('shops')
    .delete()
    .eq('id', shopId);

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

export async function getAllVisits(): Promise<{
  id: string;
  customer_id: string;
  shop_id: string | null;
  payment_type: string;
  charge_amount: number;
  visit_date: string;
  haircut_type: string | null;
}[]> {
  const { data, error } = await supabase
    .from('visits')
    .select(
      'id, customer_id, shop_id, payment_type, charge_amount, visit_date, haircut_type'
    )
    .order('visit_date', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

/* ---------- Recorded payment transactions ---------- */

async function getShopPaymentTransactions(shopId: string) {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select(
      'id, shop_id, customer_id, visit_id, subscription_id, payment_kind, amount, payment_status, payment_date, company_fee_amount, service_name'
    )
    .eq('shop_id', shopId)
    .eq('payment_status', 'recorded')
    .order('payment_date', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

async function getAllRecordedPaymentTransactions() {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select(
      'id, shop_id, customer_id, visit_id, subscription_id, payment_kind, amount, payment_status, payment_date, company_fee_amount, service_name'
    )
    .eq('payment_status', 'recorded')
    .order('payment_date', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

/* ---------- Shop revenue + company fee ---------- */

export type ShopInvoice = {
  shop: Shop;
  thisMonthVisits: number;
  thisMonthFee: number;
  totalVisits: number;
  totalFee: number;
  thisMonthRevenue: number;
  thisMonthNetRevenue: number;
  thisMonthFeeUnits: number;
  totalFeeUnits: number;
  isPaid: boolean;
};

export type MonthFeeDetail = {
  month: string;
  monthLabel: string;
  visits: number;
  fee: number;
  feeUnits: number;
  paid: boolean;
};

export async function getShopInvoice(
  shopId: string
): Promise<ShopInvoice | null> {
  const shop = await getShopById(shopId);

  if (!shop) return null;

  const [visits, transactions] = await Promise.all([
    getShopVisits(shopId),
    getShopPaymentTransactions(shopId),
  ]);

  const monthStart = getCurrentMonthStart();

  // Actual visits are counted independently from company fees.
  const thisMonthVisits = visits.filter((visit) =>
    isInCurrentMonth(visit.visit_date, monthStart)
  );

  // Company fees come only from explicitly recorded transactions.
  // Package usage does not create a new company fee.
  const thisMonthTransactions = transactions.filter(
    (transaction) =>
      isInCurrentMonth(transaction.payment_date, monthStart)
  );

  const thisMonthFee = getRecordedFee(
    thisMonthTransactions
  );

  const totalFee = getRecordedFee(transactions);

  // Revenue includes recorded visit, subscription and other payments.
  const thisMonthRevenue = thisMonthTransactions.reduce(
    (sum, transaction) =>
      sum + Number(transaction.amount ?? 0),
    0
  );

  const thisMonthNetRevenue =
    thisMonthRevenue - thisMonthFee;

  return {
    shop,
    thisMonthVisits: thisMonthVisits.length,
    thisMonthFee,
    totalVisits: visits.length,
    totalFee,
    thisMonthRevenue,
    thisMonthNetRevenue,
    thisMonthFeeUnits: getFeeUnits(thisMonthFee),
    totalFeeUnits: getFeeUnits(totalFee),
    isPaid: false,
  };
}

/* ---------- Company-wide fees ---------- */

export async function getCompanyTotalFees(): Promise<{
  totalShops: number;
  approvedShops: number;
  pendingShops: number;
  totalVisits: number;
  totalFees: number;
  thisMonthFees: number;
  thisMonthVisits: number;
  totalFeeUnits: number;
  thisMonthFeeUnits: number;
  shopBreakdown: {
    shop: Shop;
    visits: number;
    fee: number;
    feeUnits: number;
    thisMonthVisits: number;
    thisMonthFee: number;
    thisMonthFeeUnits: number;
    paid: boolean;
  }[];
}> {
  const [shops, allVisits, allTransactions] =
    await Promise.all([
      getAllShops(),
      getAllVisits(),
      getAllRecordedPaymentTransactions(),
    ]);

  const approvedShops = shops.filter(
    (shop) => shop.status === 'approved'
  );

  const pendingShops = shops.filter(
    (shop) => shop.status === 'pending'
  );

  const monthStart = getCurrentMonthStart();

  let totalVisits = 0;
  let thisMonthVisits = 0;
  let totalFees = 0;
  let thisMonthFees = 0;

  const shopBreakdown: {
    shop: Shop;
    visits: number;
    fee: number;
    feeUnits: number;
    thisMonthVisits: number;
    thisMonthFee: number;
    thisMonthFeeUnits: number;
    paid: boolean;
  }[] = [];

  for (const shop of approvedShops) {
    const shopVisits = allVisits.filter(
      (visit) => visit.shop_id === shop.id
    );

    const shopThisMonthVisits = shopVisits.filter(
      (visit) =>
        isInCurrentMonth(visit.visit_date, monthStart)
    );

    const shopTransactions = allTransactions.filter(
      (transaction) => transaction.shop_id === shop.id
    );

    const shopThisMonthTransactions =
      shopTransactions.filter((transaction) =>
        isInCurrentMonth(transaction.payment_date, monthStart)
      );

    const fee = getRecordedFee(shopTransactions);

    const thisMonthFee = getRecordedFee(
      shopThisMonthTransactions
    );

    totalVisits += shopVisits.length;
    thisMonthVisits += shopThisMonthVisits.length;
    totalFees += fee;
    thisMonthFees += thisMonthFee;

    shopBreakdown.push({
      shop,
      visits: shopVisits.length,
      fee,
      feeUnits: getFeeUnits(fee),
      thisMonthVisits: shopThisMonthVisits.length,
      thisMonthFee,
      thisMonthFeeUnits: getFeeUnits(thisMonthFee),
      paid: false,
    });
  }

  return {
    totalShops: shops.length,
    approvedShops: approvedShops.length,
    pendingShops: pendingShops.length,
    totalVisits,
    totalFees,
    thisMonthFees,
    thisMonthVisits,
    totalFeeUnits: getFeeUnits(totalFees),
    thisMonthFeeUnits: getFeeUnits(thisMonthFees),
    shopBreakdown,
  };
}

/* ---------- Monthly fee history per shop ---------- */

export async function getShopMonthlyFees(
  shopId: string
): Promise<MonthFeeDetail[]> {
  const [visits, transactions] = await Promise.all([
    getShopVisits(shopId),
    getShopPaymentTransactions(shopId),
  ]);

  const monthlyData = new Map<
    string,
    {
      visits: number;
      fee: number;
    }
  >();

  // Count actual visits independently from fee transactions.
  for (const visit of visits) {
    const key = getMonthKey(visit.visit_date);

    if (!key) continue;

    const current = monthlyData.get(key) ?? {
      visits: 0,
      fee: 0,
    };

    current.visits += 1;
    monthlyData.set(key, current);
  }

  // Add only recorded company fees.
  for (const transaction of transactions) {
    const key = getMonthKey(transaction.payment_date);

    if (!key) continue;

    const current = monthlyData.get(key) ?? {
      visits: 0,
      fee: 0,
    };

    current.fee += Number(
      transaction.company_fee_amount ?? 0
    );

    monthlyData.set(key, current);
  }

  const result: MonthFeeDetail[] = [];

  for (const [month, values] of monthlyData) {
    const [year, monthNumber] = month.split('-');

    const label = new Intl.DateTimeFormat('ar-EG', {
      month: 'long',
      year: 'numeric',
    }).format(
      new Date(
        Number(year),
        Number(monthNumber) - 1
      )
    );

    result.push({
      month,
      monthLabel: label,
      visits: values.visits,
      fee: values.fee,
      feeUnits: getFeeUnits(values.fee),
      paid: false,
    });
  }

  result.sort(
    (a, b) => b.month.localeCompare(a.month)
  );

  return result;
}
