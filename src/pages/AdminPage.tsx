import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  UserPlus,
  Scissors,
  CalendarPlus,
  Award,
  Phone,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Loader2,
  Users,
  TrendingUp,
  Receipt,
  Info,
  Ban,
  ShieldAlert,
  Building2,
  Wallet,
  CalendarClock,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  Zap,
  LogOut,
  FileText,
  Lock,
  ShieldCheck,
  Settings,
  BarChart3,
  Layers,
  ChevronDown,
  ChevronUp,
  Calendar,
  PlusCircle,
  ShoppingBag,
  BellRing,
  Volume2,
  Ticket,
} from 'lucide-react';
import Modal from '@/components/Modal';
import {
  getShopCustomers,
  searchShopCustomersByName,
  createCustomer,
  createSubscription,
  recordVisit,
  getActiveSubscription,
  getVisitsByCustomer,
  getPlans,
  getShopRegularHaircutPrice,
  getRevenueStats,
  getShopActivityData,
  getShopPaymentTransactions,
  getShopBookings,
  updateBookingStatus,
  completeBookingAsVisit,
  blockCustomer,
  unblockCustomer,
  deleteCustomer,
  deleteVisit,
  supabaseUpdateSubscriptionUsage,
  formatPrice,
  formatDate,
  formatDateTime,
  type Customer,
  type Subscription,
  type Visit,
  type Plan,
  type Booking,
  type RevenueStats,
  type SubscriptionAlert,
  type PaymentMethod,
} from '@/lib/api';
import { enableShopBookingPush, playBookingAlertSound, registerServiceWorker } from '@/lib/bookingPush';
import { REGULAR_HAIRCUT_PRICE, COMPANY_FEE_PER_VISIT, SYSTEM_NAME, supabase } from '@/lib/supabase';
import { getShopById } from '@/lib/shopApi';
import ShopSettingsTab from '@/components/ShopSettingsTab';

const BRAND_NAME = 'ulmi';
const CONTRACT_VERSION = 'v2.0-ulmi';

type Tab = 'overview' | 'bookings' | 'customers' | 'visits' | 'subscriptions' | 'revenue' | 'settings';

type LedgerTx = {
  id: string;
  shop_id: string | null;
  customer_id: string | null;
  visit_id: string | null;
  subscription_id: string | null;
  payment_kind: 'visit' | 'subscription' | 'other';
  amount: number;
  company_fee_amount: number;
  service_name: string | null;
  payment_method: string;
  payment_status: 'recorded' | 'refunded' | 'void';
  payment_date: string;
  notes: string | null;
};

type ShopExpenseItem = {
  id: string;
  shop_id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at?: string;
};

type ShopFinancialSnapshot = {
  transactions: LedgerTx[];
  recordedTransactions: LedgerTx[];
  subscriptions: Subscription[];
  visits: Visit[];
  expenses: ShopExpenseItem[];
  totalCollected: number;
  totalCompanyFees: number;
  netBeforeExpenses: number;
  totalExpenses: number;
  finalNetProfit: number;
  netShopRevenue: number;
  todayCollected: number;
  todayFees: number;
  todayNetBeforeExpenses: number;
  todayExpenses: number;
  todayFinalNet: number;
  todayNet: number;
  thisMonthCollected: number;
  thisMonthFees: number;
  thisMonthNetBeforeExpenses: number;
  thisMonthExpenses: number;
  thisMonthFinalNet: number;
  thisMonthNet: number;
  lastMonthCollected: number;
  lastMonthFees: number;
  lastMonthExpenses: number;
  lastMonthFinalNet: number;
  lastMonthNet: number;
  packageSalesCount: number;
  packageSalesRevenue: number;
  extraServicesRevenue: number;
  regularPaidRevenue: number;
  actualVisitsCount: number;
  subscriptionVisitsUsed: number;
  regularVisitsCount: number;
};

type ContractSignatureRecord = {
  shopId: string;
  contractNumber: string;
  signedAt: string;
  signerName: string;
  shopName: string;
  contractVersion: string;
};

function normalizeShopId(shopId: string): string {
  return String(shopId || '').trim();
}

function getContractStorageKey(shopId: string): string {
  return `ulmi_smart_contract_sig_${normalizeShopId(shopId)}`;
}

function getExpensesLocalKey(shopId: string): string {
  return `ulmi_shop_expenses_${normalizeShopId(shopId)}`;
}

function readLocalExpenses(shopId: string): ShopExpenseItem[] {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return [];
  try {
    const raw = localStorage.getItem(getExpensesLocalKey(cleanId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalExpenses(shopId: string, items: ShopExpenseItem[]): void {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return;
  try {
    localStorage.setItem(getExpensesLocalKey(cleanId), JSON.stringify(items));
  } catch {
    // تجاهل أخطاء التخزين المحلي
  }
}

async function fetchShopExpenses(shopId: string): Promise<ShopExpenseItem[]> {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return [];
  const localItems = readLocalExpenses(cleanId);

  try {
    const { data, error } = await supabase
      .from('shop_expenses')
      .select('id, shop_id, title, category, amount, expense_date, notes, created_at')
      .eq('shop_id', cleanId)
      .order('expense_date', { ascending: false });

    if (!error && Array.isArray(data)) {
      const normalizedDb: ShopExpenseItem[] = data.map((row) => ({
        id: String(row.id),
        shop_id: String(row.shop_id || cleanId),
        title: String(row.title || 'مصروف تشغيل'),
        category: String(row.category || 'مستلزمات تشغيل'),
        amount: Number(row.amount || 0),
        expense_date: row.expense_date || row.created_at || new Date().toISOString(),
        notes: row.notes ?? null,
        created_at: row.created_at,
      }));
      writeLocalExpenses(cleanId, normalizedDb);
      return normalizedDb;
    }
  } catch {
    // في حال عدم إمكانية الاتصال بالجدول نستخدم المحلي
  }

  return localItems;
}

async function createShopExpense(
  shopId: string,
  payload: { title: string; category: string; amount: number; expenseDate: string; notes?: string }
): Promise<ShopExpenseItem> {
  const cleanId = normalizeShopId(shopId);
  const isoDate = payload.expenseDate
    ? new Date(`${payload.expenseDate}T12:00:00`).toISOString()
    : new Date().toISOString();

  const tempId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: ShopExpenseItem = {
    id: tempId,
    shop_id: cleanId,
    title: payload.title.trim(),
    category: payload.category.trim() || 'مستلزمات تشغيل',
    amount: Number(payload.amount),
    expense_date: isoDate,
    notes: payload.notes?.trim() ? payload.notes.trim() : null,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('shop_expenses')
      .insert({
        shop_id: cleanId,
        title: item.title,
        category: item.category,
        amount: item.amount,
        expense_date: item.expense_date,
        notes: item.notes,
      })
      .select('id, shop_id, title, category, amount, expense_date, notes, created_at')
      .single();

    if (!error && data) {
      const saved: ShopExpenseItem = {
        id: String(data.id),
        shop_id: String(data.shop_id || cleanId),
        title: String(data.title || item.title),
        category: String(data.category || item.category),
        amount: Number(data.amount || item.amount),
        expense_date: data.expense_date || item.expense_date,
        notes: data.notes ?? null,
        created_at: data.created_at,
      };
      const current = readLocalExpenses(cleanId);
      writeLocalExpenses(cleanId, [saved, ...current]);
      return saved;
    }
  } catch {
    // حفظ محلي احتياطي إذا تعذر الاتصال
  }

  const current = readLocalExpenses(cleanId);
  writeLocalExpenses(cleanId, [item, ...current]);
  return item;
}

async function removeShopExpense(shopId: string, expenseId: string): Promise<void> {
  const cleanId = normalizeShopId(shopId);
  try {
    await supabase.from('shop_expenses').delete().eq('id', expenseId).eq('shop_id', cleanId);
  } catch {
    // تجاهل أخطاء الشبكة عند الحذف المحلي
  }
  const current = readLocalExpenses(cleanId);
  writeLocalExpenses(
    cleanId,
    current.filter((e) => e.id !== expenseId)
  );
}

function generateDeterministicContractId(shopId: string, shopName?: string): string {
  const cleanId = normalizeShopId(shopId);
  const prefix =
    (shopName || 'UL')
      .replace(/[^a-zA-Z\u0600-\u06FF]/g, '')
      .slice(0, 2)
      .toUpperCase() || 'UL';
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = (hash * 31 + cleanId.charCodeAt(i)) % 9000;
  }
  const code = String(1000 + Math.abs(hash));
  return `${BRAND_NAME.toUpperCase()}-${prefix}-2026-${code}`;
}

function readLocalContractSignature(shopId: string): ContractSignatureRecord | null {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return null;
  try {
    const raw = localStorage.getItem(getContractStorageKey(cleanId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContractSignatureRecord;
    if (!parsed?.signedAt) return null;
    return {
      ...parsed,
      shopId: cleanId,
      contractNumber: parsed.contractNumber || generateDeterministicContractId(cleanId, parsed.shopName),
      contractVersion: parsed.contractVersion || CONTRACT_VERSION,
    };
  } catch {
    return null;
  }
}

function writeLocalContractSignature(record: ContractSignatureRecord): void {
  const cleanId = normalizeShopId(record.shopId);
  if (!cleanId) return;
  try {
    const normalized: ContractSignatureRecord = { ...record, shopId: cleanId };
    localStorage.setItem(getContractStorageKey(cleanId), JSON.stringify(normalized));
  } catch {
    // تجاهل أخطاء التخزين المحلي
  }
}

async function fetchContractSignature(shopId: string): Promise<ContractSignatureRecord | null> {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return null;
  const localSig = readLocalContractSignature(cleanId);

  try {
    const { data, error } = await supabase
      .from('shop_contracts')
      .select('shop_id, contract_number, signed_at, signer_name, shop_name, contract_version')
      .eq('shop_id', cleanId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.signed_at) {
      const dbRecord: ContractSignatureRecord = {
        shopId: cleanId,
        contractNumber: data.contract_number || generateDeterministicContractId(cleanId, data.shop_name),
        signedAt: data.signed_at,
        signerName: data.signer_name || localSig?.signerName || '',
        shopName: data.shop_name || localSig?.shopName || '',
        contractVersion: data.contract_version || CONTRACT_VERSION,
      };
      writeLocalContractSignature(dbRecord);
      return dbRecord;
    }
  } catch {
    // في حال عدم وجود جدول shop_contracts نعتمد على المحلي
  }

  return localSig;
}

async function persistContractSignature(record: ContractSignatureRecord): Promise<void> {
  const cleanId = normalizeShopId(record.shopId);
  const normalized: ContractSignatureRecord = { ...record, shopId: cleanId };
  writeLocalContractSignature(normalized);
  try {
    await supabase.from('shop_contracts').upsert(
      {
        shop_id: cleanId,
        contract_number: normalized.contractNumber,
        signed_at: normalized.signedAt,
        signer_name: normalized.signerName,
        shop_name: normalized.shopName,
        contract_version: normalized.contractVersion,
      },
      { onConflict: 'shop_id' }
    );
  } catch {
    // سقوط آمن إذا لم يُنشأ جدول shop_contracts بعد
  }
}

function UlmiWordmark({
  variant = 'light',
  size = 'md',
}: {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims =
    size === 'sm'
      ? { width: 58, height: 22 }
      : size === 'lg'
      ? { width: 96, height: 36 }
      : { width: 74, height: 28 };
  const fill = variant === 'dark' ? '#FFFFFF' : '#09090B';

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox="0 0 240 86"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={BRAND_NAME}
      className="inline-block shrink-0 select-none"
    >
      <path
        d="M14 38V56C14 68.7025 24.2975 79 37 79C49.7025 79 60 68.7025 60 56V38"
        stroke={fill}
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M60 38V68" stroke={fill} strokeWidth="22" strokeLinecap="round" />
      <path d="M84 15V68" stroke={fill} strokeWidth="22" strokeLinecap="round" />
      <path
        d="M108 68V52C108 43.1634 115.163 36 124 36C132.837 36 140 43.1634 140 52V68"
        stroke={fill}
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M140 68V52C140 43.1634 147.163 36 156 36C164.837 36 172 43.1634 172 52V68"
        stroke={fill}
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M214 38V68" stroke={fill} strokeWidth="22" strokeLinecap="round" />
      <circle cx="214" cy="15" r="11" fill={fill} />
    </svg>
  );
}

function isSameLocalDay(isoDate: string, refDate: Date): boolean {
  const d = new Date(isoDate);
  return (
    d.getFullYear() === refDate.getFullYear() &&
    d.getMonth() === refDate.getMonth() &&
    d.getDate() === refDate.getDate()
  );
}

function isSameLocalMonth(isoDate: string, refDate: Date): boolean {
  const d = new Date(isoDate);
  return d.getFullYear() === refDate.getFullYear() && d.getMonth() === refDate.getMonth();
}

async function fetchShopFinancialSnapshot(
  shopId: string,
  customers: Customer[]
): Promise<ShopFinancialSnapshot> {
  const customerIds = customers.map((c) => c.id);
  const [txData, { subscriptions, visits }, expenses] = await Promise.all([
    getShopPaymentTransactions(shopId, customerIds),
    getShopActivityData(customers, { shopId }),
    fetchShopExpenses(shopId),
  ]);

  const dbTransactions = txData as LedgerTx[];
  const coveredVisitIds = new Set(dbTransactions.map((t) => t.visit_id).filter(Boolean));
  const coveredSubIds = new Set(dbTransactions.map((t) => t.subscription_id).filter(Boolean));

  const legacyTransactions: LedgerTx[] = [];

  for (const v of visits) {
    if (coveredVisitIds.has(v.id)) continue;
    const amt = Number(v.charge_amount || 0);
    if (v.payment_type === 'paid' && amt > 0) {
      legacyTransactions.push({
        id: `legacy-visit-${v.id}`,
        shop_id: shopId,
        customer_id: v.customer_id,
        visit_id: v.id,
        subscription_id: v.subscription_id ?? null,
        payment_kind: 'visit',
        amount: amt,
        company_fee_amount: COMPANY_FEE_PER_VISIT,
        service_name: v.haircut_type || 'حلاقة عامة',
        payment_method: 'unknown',
        payment_status: 'recorded',
        payment_date: v.visit_date,
        notes: v.notes ?? 'سجل زيارة سابق',
      });
    }
  }

  for (const s of subscriptions) {
    if (coveredSubIds.has(s.id) || s.status === 'cancelled') continue;
    const planPrice = Number(s.plan?.price || 0);
    const planCount = Number(s.plan?.haircut_count || 0);
    if (planPrice > 0) {
      legacyTransactions.push({
        id: `legacy-sub-${s.id}`,
        shop_id: shopId,
        customer_id: s.customer_id,
        visit_id: null,
        subscription_id: s.id,
        payment_kind: 'subscription',
        amount: planPrice,
        company_fee_amount: planCount * COMPANY_FEE_PER_VISIT,
        service_name: s.plan?.name ? `باقة ${s.plan.name}` : 'اشتراك باقة',
        payment_method: 'unknown',
        payment_status: 'recorded',
        payment_date: s.created_at || `${s.start_date}T12:00:00Z`,
        notes: 'سجل اشتراك سابق',
      });
    }
  }

  const transactions = [...dbTransactions, ...legacyTransactions].sort(
    (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
  );
  const recorded = transactions.filter((t) => t.payment_status === 'recorded');

  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let totalCollected = 0;
  let totalCompanyFees = 0;
  let todayCollected = 0;
  let todayFees = 0;
  let thisMonthCollected = 0;
  let thisMonthFees = 0;
  let lastMonthCollected = 0;
  let lastMonthFees = 0;
  let packageSalesRevenue = 0;
  let extraServicesRevenue = 0;
  let regularPaidRevenue = 0;

  for (const tx of recorded) {
    const amount = Number(tx.amount || 0);
    const fee = Number(tx.company_fee_amount || 0);
    totalCollected += amount;
    totalCompanyFees += fee;

    if (isSameLocalDay(tx.payment_date, now)) {
      todayCollected += amount;
      todayFees += fee;
    }
    if (isSameLocalMonth(tx.payment_date, now)) {
      thisMonthCollected += amount;
      thisMonthFees += fee;
    }
    if (isSameLocalMonth(tx.payment_date, lastMonthDate)) {
      lastMonthCollected += amount;
      lastMonthFees += fee;
    }

    if (tx.payment_kind === 'subscription') {
      packageSalesRevenue += amount;
    } else if (fee > 0) {
      regularPaidRevenue += amount;
    } else {
      extraServicesRevenue += amount;
    }
  }

  let totalExpenses = 0;
  let todayExpenses = 0;
  let thisMonthExpenses = 0;
  let lastMonthExpenses = 0;

  for (const exp of expenses) {
    const expAmt = Number(exp.amount || 0);
    totalExpenses += expAmt;
    if (isSameLocalDay(exp.expense_date, now)) {
      todayExpenses += expAmt;
    }
    if (isSameLocalMonth(exp.expense_date, now)) {
      thisMonthExpenses += expAmt;
    }
    if (isSameLocalMonth(exp.expense_date, lastMonthDate)) {
      lastMonthExpenses += expAmt;
    }
  }

  const netBeforeExpenses = totalCollected - totalCompanyFees;
  const finalNetProfit = netBeforeExpenses - totalExpenses;

  const todayNetBeforeExpenses = todayCollected - todayFees;
  const todayFinalNet = todayNetBeforeExpenses - todayExpenses;

  const thisMonthNetBeforeExpenses = thisMonthCollected - thisMonthFees;
  const thisMonthFinalNet = thisMonthNetBeforeExpenses - thisMonthExpenses;

  const lastMonthNetBeforeExpenses = lastMonthCollected - lastMonthFees;
  const lastMonthFinalNet = lastMonthNetBeforeExpenses - lastMonthExpenses;

  const packageSalesCount = recorded.filter((t) => t.payment_kind === 'subscription').length;
  const subscriptionVisitsUsed = visits.filter((v) => v.payment_type === 'subscription').length;
  const regularVisitsCount = visits.filter((v) => v.payment_type !== 'subscription').length;

  return {
    transactions,
    recordedTransactions: recorded,
    subscriptions,
    visits,
    expenses,
    totalCollected,
    totalCompanyFees,
    netBeforeExpenses,
    totalExpenses,
    finalNetProfit,
    netShopRevenue: finalNetProfit,
    todayCollected,
    todayFees,
    todayNetBeforeExpenses,
    todayExpenses,
    todayFinalNet,
    todayNet: todayFinalNet,
    thisMonthCollected,
    thisMonthFees,
    thisMonthNetBeforeExpenses,
    thisMonthExpenses,
    thisMonthFinalNet,
    thisMonthNet: thisMonthFinalNet,
    lastMonthCollected,
    lastMonthFees,
    lastMonthExpenses,
    lastMonthFinalNet,
    lastMonthNet: lastMonthFinalNet,
    packageSalesCount,
    packageSalesRevenue,
    extraServicesRevenue,
    regularPaidRevenue,
    actualVisitsCount: visits.length,
    subscriptionVisitsUsed,
    regularVisitsCount,
  };
}

function adminBookingStatusMeta(status: Booking['status']): { label: string; cls: string } {
  switch (status) {
    case 'confirmed':
      return { label: 'مؤكد', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
    case 'pending':
      return { label: 'بانتظار التأكيد', cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' };
    case 'completed':
      return { label: 'تم تحويله لزيارة', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' };
    case 'cancelled':
      return { label: 'ملغي', cls: 'bg-stone-100 text-stone-600' };
    case 'no_show':
      return { label: 'لم يحضر', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' };
  }
}

export function AdminDashboard({ shopId, onLogout }: { shopId: string; onLogout: () => void }) {
  const cleanShopId = useMemo(() => normalizeShopId(shopId), [shopId]);
  const [tab, setTab] = useState<Tab>('overview');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeInitialView, setNoticeInitialView] = useState<'notice' | 'contract'>('notice');
  const [mandatoryContract, setMandatoryContract] = useState(false);
  const [contractSignature, setContractSignature] = useState<ContractSignatureRecord | null>(() =>
    readLocalContractSignature(shopId)
  );
  const [contractChecked, setContractChecked] = useState<boolean>(() => !!readLocalContractSignature(shopId));
  const [shopInfo, setShopInfo] = useState<{ shop_name: string; owner_name: string; logo_url?: string | null } | null>(null);
  const [regularHaircutPrice, setRegularHaircutPrice] = useState(REGULAR_HAIRCUT_PRICE);
  const [refreshTick, setRefreshTick] = useState(0);

  // Realtime booking alert & push status
  const [liveAlert, setLiveAlert] = useState<{
    id: string;
    bookingCode: string;
    customerName: string;
    customerPhone?: string | null;
    serviceName: string;
    startAt: string;
    status: string;
  } | null>(null);
  const [pushBanner, setPushBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const knownBookingIdsRef = useRef<Set<string>>(new Set());
  const bookingsHydratedRef = useRef(false);

  const bumpData = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

  const loadBookings = useCallback(async () => {
    try {
      const list = await getShopBookings(cleanShopId);
      setBookings(list);
      if (!bookingsHydratedRef.current) {
        knownBookingIdsRef.current = new Set(list.map((b) => b.id));
        bookingsHydratedRef.current = true;
      } else {
        for (const b of list) {
          knownBookingIdsRef.current.add(b.id);
        }
      }
    } catch (e) {
      console.error('Failed loading shop bookings:', e);
    }
  }, [cleanShopId]);

  useEffect(() => {
    void registerServiceWorker();
    void loadBookings();
  }, [loadBookings, refreshTick]);

  // Supabase Realtime subscription for new & updated bookings on this shop
  useEffect(() => {
    bookingsHydratedRef.current = false;
    knownBookingIdsRef.current = new Set();

    const channel = supabase
      .channel(`shop-bookings-${cleanShopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `shop_id=eq.${cleanShopId}`,
        },
        (payload) => {
          void loadBookings();
          if (payload.eventType === 'INSERT' && payload.new) {
            const row = payload.new as Record<string, unknown>;
            const id = String(row.id ?? '');
            if (id && knownBookingIdsRef.current.has(id)) return;
            if (id) knownBookingIdsRef.current.add(id);

            playBookingAlertSound();
            setLiveAlert({
              id: id || String(Date.now()),
              bookingCode: String(row.booking_code ?? 'BK-NEW'),
              customerName: String(row.customer_name ?? 'عميل'),
              customerPhone: row.customer_phone ? String(row.customer_phone) : null,
              serviceName: String(row.service_name ?? 'حلاقة'),
              startAt: String(row.start_at ?? new Date().toISOString()),
              status: String(row.status ?? 'pending'),
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cleanShopId, loadBookings]);

  const handleEnablePush = async () => {
    setEnablingPush(true);
    setPushBanner(null);
    try {
      const res = await enableShopBookingPush(cleanShopId);
      setPushBanner({ type: res.ok ? 'ok' : 'err', text: res.message });
    } catch (e) {
      setPushBanner({
        type: 'err',
        text: e instanceof Error ? e.message : 'تعذر تفعيل الإشعارات.',
      });
    } finally {
      setEnablingPush(false);
    }
  };

  useEffect(() => {
    let active = true;
    const cached = readLocalContractSignature(cleanShopId);
    if (cached) {
      setContractSignature(cached);
      setContractChecked(true);
    }

    Promise.all([
      getShopById(cleanShopId),
      getShopRegularHaircutPrice(cleanShopId),
      fetchContractSignature(cleanShopId),
    ])
      .then(([shop, price, sig]) => {
        if (!active) return;
        if (shop) {
          setShopInfo({ shop_name: shop.shop_name, owner_name: shop.owner_name, logo_url: shop.logo_url ?? null });
        }
        setRegularHaircutPrice(price);
        const resolvedSig = sig || cached || null;
        setContractSignature(resolvedSig);
        setContractChecked(true);

        if (!resolvedSig) {
          setNoticeInitialView('contract');
          setMandatoryContract(true);
          setNoticeOpen(true);
        } else {
          setMandatoryContract(false);
        }
      })
      .catch(() => {
        if (!active) return;
        setContractChecked(true);
        if (!cached) {
          setNoticeInitialView('contract');
          setMandatoryContract(true);
          setNoticeOpen(true);
        }
      });

    return () => {
      active = false;
    };
  }, [cleanShopId]);

  const isContractSigned = !!contractSignature?.signedAt;

  const openContractModal = useCallback(
    (forceMandatory: boolean) => {
      setNoticeInitialView('contract');
      setMandatoryContract(forceMandatory && !isContractSigned);
      setNoticeOpen(true);
    },
    [isContractSigned]
  );

  const openNoticeModal = useCallback(() => {
    setNoticeInitialView('notice');
    setMandatoryContract(!isContractSigned);
    setNoticeOpen(true);
  }, [isContractSigned]);

  const handleOpenAddExpense = useCallback(() => {
    if (!isContractSigned) {
      openContractModal(true);
      return;
    }
    setExpenseModalOpen(true);
  }, [isContractSigned, openContractModal]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = search.trim()
        ? await searchShopCustomersByName(cleanShopId, search.trim())
        : await getShopCustomers(cleanShopId);
      setCustomers(list);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search, cleanShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeBookingsCount = bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed').length;

  const tabs: { k: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { k: 'overview', label: 'الملخص الرئيسي', icon: TrendingUp },
    { k: 'bookings', label: 'الحجوزات', icon: Ticket, badge: activeBookingsCount > 0 ? activeBookingsCount : undefined },
    { k: 'customers', label: 'العملاء', icon: Users },
    { k: 'visits', label: 'الزيارات', icon: Receipt },
    { k: 'subscriptions', label: 'الباقات والاشتراكات', icon: CalendarClock },
    { k: 'revenue', label: 'الإيرادات والمصروفات', icon: Wallet },
    { k: 'settings', label: 'إعدادات المحل', icon: Settings },
  ];

  return (
    <div className="animate-fade-in mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6">
      {/* Live Realtime Booking Toast Banner */}
      {liveAlert && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border-2 border-emerald-500 bg-stone-900 p-4 text-white shadow-lg sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400 text-stone-950">
              <BellRing className="h-5 w-5 animate-bounce" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold text-stone-950">
                  حجز جديد الآن
                </span>
                <span className="font-mono text-xs font-extrabold text-amber-300">
                  {liveAlert.bookingCode}
                </span>
                <span className="text-sm font-extrabold text-white">
                  {liveAlert.customerName}
                </span>
              </div>
              <p className="mt-1 text-xs text-stone-300">
                {liveAlert.serviceName} · الموعد: {formatDateTime(liveAlert.startAt)}
                {liveAlert.customerPhone ? ` · هاتف: ${liveAlert.customerPhone}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTab('bookings');
                setLiveAlert(null);
              }}
              className="rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-extrabold text-stone-950 transition hover:bg-amber-300"
            >
              عرض الحجز
            </button>
            <button
              type="button"
              onClick={() => setLiveAlert(null)}
              className="rounded-xl border border-stone-700 px-3 py-2 text-xs font-bold text-stone-300 hover:bg-stone-800"
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      {contractChecked && !isContractSigned && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-stone-900 shadow-2xs sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900 text-white">
              <ShieldAlert className="h-5 w-5 text-amber-300" />
            </div>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-extrabold text-stone-900">توقيع العقد الإلكتروني إلزامي</span>
                <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-extrabold text-stone-900">
                  مطلوب للتوثيق الرسمي
                </span>
              </div>
              <p className="text-xs leading-relaxed text-stone-700">
                لم يتم توثيق عقد ترخيص <span className="font-bold"><UlmiWordmark variant="light" size="sm" /></span> لهذا المحل بعد. يُرجى مراجعة البنود وتوقيع العقد إلكترونيًا لاعتماد التوثيق بالكامل.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openContractModal(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-xs font-extrabold text-white transition hover:bg-stone-800"
          >
            <FileText className="h-4 w-4" />
            <span>توقيع العقد الآن</span>
          </button>
        </div>
      )}

      <header className="card border-stone-200/90 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {shopInfo?.logo_url ? (
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 p-1.5 shadow-2xs">
                <img
                  src={shopInfo.logo_url}
                  alt={`شعار ${shopInfo.shop_name}`}
                  className="h-full w-full rounded-xl object-contain"
                />
              </div>
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-stone-900 font-display text-xl font-extrabold text-white shadow-2xs">
                {shopInfo?.shop_name?.charAt(0) ?? 'م'}
              </div>
            )}

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-xl font-extrabold text-stone-900 sm:text-2xl">
                  {shopInfo?.shop_name || 'لوحة الإدارة'}
                </h1>
                {shopInfo?.owner_name && (
                  <span className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] font-bold text-stone-600">
                    {shopInfo.owner_name}
                  </span>
                )}
                {isContractSigned && contractSignature ? (
                  <button
                    type="button"
                    onClick={() => openContractModal(false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                    <span>العقد موثّق ({contractSignature.contractNumber})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openContractModal(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 transition hover:bg-amber-100"
                  >
                    <Lock className="h-3 w-3" />
                    <span>بانتظار التوقيع الإجباري</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1.5">
                  <span>إدارة العملاء والباقات والزيارات والمصروفات والحجوزات</span>
                  <span>·</span>
                  <UlmiWordmark variant="light" size="sm" />
                </span>
                <span className="hidden text-stone-300 sm:inline">•</span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50/90 px-2.5 py-1 font-bold text-stone-800">
                  <Scissors className="h-3.5 w-3.5 text-stone-600" />
                  سعر الحلاقة العادية: {formatPrice(regularHaircutPrice)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-stone-100 pt-4 lg:justify-end lg:border-t-0 lg:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={playBookingAlertSound}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-bold text-stone-800 transition hover:border-stone-300 hover:bg-stone-100"
                title="تجربة صوت التنبيه والاهتزاز"
              >
                <Volume2 className="h-4 w-4 shrink-0 text-amber-600" />
                <span>تجربة الصوت</span>
              </button>

              <button
                type="button"
                onClick={() => void handleEnablePush()}
                disabled={enablingPush}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                {enablingPush ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <BellRing className="h-4 w-4 shrink-0 text-emerald-700" />
                )}
                <span>تفعيل إشعارات الموبايل</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddExpense}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3.5 text-xs font-bold text-stone-800 transition hover:border-stone-300 hover:bg-stone-100"
              >
                <ShoppingBag className="h-4 w-4 shrink-0 text-stone-700" />
                <span>إضافة مصروف</span>
              </button>

              <button
                type="button"
                onClick={openNoticeModal}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${
                  !isContractSigned
                    ? 'border-amber-300 bg-amber-50 text-stone-900 hover:bg-amber-100'
                    : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-stone-100'
                }`}
              >
                <Building2 className="h-4 w-4 shrink-0 text-stone-700" />
                <span>{isContractSigned ? 'الإشعار والعقد' : 'العقد الإجباري'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isContractSigned) {
                    openContractModal(true);
                    return;
                  }
                  setAddOpen(true);
                }}
                className="btn-primary h-10 px-4 text-xs"
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                <span>عميل جديد</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 text-xs font-bold text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>خروج</span>
            </button>
          </div>
        </div>

        {pushBanner && (
          <div
            className={`mt-4 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold ${
              pushBanner.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            <span>{pushBanner.text}</span>
            <button type="button" onClick={() => setPushBanner(null)} className="text-[11px] underline">
              إغلاق
            </button>
          </div>
        )}
      </header>

      <nav aria-label="أقسام لوحة الإدارة" className="flex gap-1.5 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50/80 p-1.5">
        {tabs.map((t) => {
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition sm:text-sm ${
                active
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-white hover:text-stone-900'
              }`}
            >
              <t.icon className={`h-4 w-4 ${active ? 'text-stone-200' : 'text-stone-500'}`} />
              <span>{t.label}</span>
              {t.badge !== undefined && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    active ? 'bg-amber-400 text-stone-950' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <main className="min-w-0">
        {tab === 'overview' && (
          <Overview
            shopId={cleanShopId}
            customers={customers}
            refreshTick={refreshTick}
            onGoSubs={() => setTab('subscriptions')}
            onGoRevenue={() => setTab('revenue')}
          />
        )}
        {tab === 'bookings' && (
          <BookingsTab
            shopId={cleanShopId}
            customers={customers}
            bookings={bookings}
            regularHaircutPrice={regularHaircutPrice}
            isContractSigned={isContractSigned}
            onRequireContract={() => openContractModal(true)}
            onRefreshBookings={() => void loadBookings()}
            onMutated={bumpData}
          />
        )}
        {tab === 'customers' && (
          <CustomersTab
            customers={customers}
            loading={loading}
            search={search}
            setSearch={setSearch}
            onSelect={(c) => {
              if (!isContractSigned) {
                openContractModal(true);
                return;
              }
              setSelected(c);
            }}
            onAdd={() => {
              if (!isContractSigned) {
                openContractModal(true);
                return;
              }
              setAddOpen(true);
            }}
          />
        )}
        {tab === 'visits' && (
          <VisitsTab
            shopId={cleanShopId}
            customers={customers}
            regularHaircutPrice={regularHaircutPrice}
            isContractSigned={isContractSigned}
            onRequireContract={() => openContractModal(true)}
            onSelectCustomer={(c) => {
              if (!isContractSigned) {
                openContractModal(true);
                return;
              }
              setSelected(c);
            }}
            onMutated={bumpData}
          />
        )}
        {tab === 'subscriptions' && (
          <SubscriptionsTab
            shopId={cleanShopId}
            customers={customers}
            refreshTick={refreshTick}
            onSelectCustomer={(c) => {
              if (!isContractSigned) {
                openContractModal(true);
                return;
              }
              setSelected(c);
            }}
          />
        )}
        {tab === 'revenue' && (
          <RevenueTab
            shopId={cleanShopId}
            customers={customers}
            refreshTick={refreshTick}
            onOpenAddExpense={handleOpenAddExpense}
            onMutated={bumpData}
          />
        )}
        {tab === 'settings' && (
          <ShopSettingsTab
            shopId={cleanShopId}
            onUpdated={(shop) => {
              setShopInfo({ shop_name: shop.shop_name, owner_name: shop.owner_name, logo_url: shop.logo_url ?? null });
              setRegularHaircutPrice(Number(shop.regular_haircut_price ?? REGULAR_HAIRCUT_PRICE));
              bumpData();
            }}
          />
        )}
      </main>

      <AddExpenseModal
        shopId={cleanShopId}
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onCreated={() => {
          setExpenseModalOpen(false);
          bumpData();
        }}
      />

      <AddCustomerModal
        shopId={cleanShopId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          load();
          bumpData();
        }}
      />
      <CustomerDrawer
        shopId={cleanShopId}
        regularHaircutPrice={regularHaircutPrice}
        customer={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          load();
          bumpData();
        }}
      />
      <CompanyNoticeModal
        open={noticeOpen}
        onClose={() => {
          if (mandatoryContract && !contractSignature?.signedAt) return;
          setNoticeOpen(false);
        }}
        shopId={cleanShopId}
        shopInfo={shopInfo}
        initialView={noticeInitialView}
        mandatory={mandatoryContract && !contractSignature?.signedAt}
        existingSignature={contractSignature}
        onContractSigned={(sig) => {
          setContractSignature(sig);
          setMandatoryContract(false);
          setNoticeOpen(false);
          bumpData();
        }}
      />
    </div>
  );
}

/* ---------- Bookings Tab (Full Customer Details + Actions + Visit Conversion) ---------- */
function BookingsTab({
  shopId,
  customers,
  bookings,
  regularHaircutPrice,
  isContractSigned,
  onRequireContract,
  onRefreshBookings,
  onMutated,
}: {
  shopId: string;
  customers: Customer[];
  bookings: Booking[];
  regularHaircutPrice: number;
  isContractSigned: boolean;
  onRequireContract: () => void;
  onRefreshBookings: () => void;
  onMutated: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | Booking['status']>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Booking | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [extraCharge, setExtraCharge] = useState<number>(regularHaircutPrice);
  const [forcePaid, setForcePaid] = useState(false);

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return bookings;
    return bookings.filter((b) => b.status === statusFilter);
  }, [bookings, statusFilter]);

  const handleStatusChange = async (booking: Booking, nextStatus: 'confirmed' | 'cancelled' | 'no_show') => {
    if (!isContractSigned) {
      onRequireContract();
      return;
    }
    setBusyId(booking.id);
    setMessage(null);
    try {
      await updateBookingStatus(booking.id, nextStatus);
      onRefreshBookings();
      setMessage({
        type: 'ok',
        text: `تم تحديث حالة الحجز ${booking.booking_code} بنجاح.`,
      });
    } catch (e) {
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : 'تعذر تحديث حالة الحجز.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const openCompleteModal = (booking: Booking) => {
    if (!isContractSigned) {
      onRequireContract();
      return;
    }
    setCompleteTarget(booking);
    setPaymentMethod('cash');
    setForcePaid(false);
    setExtraCharge(regularHaircutPrice);
  };

  const handleConfirmCompleteVisit = async () => {
    if (!completeTarget) return;
    setBusyId(completeTarget.id);
    setMessage(null);
    try {
      await completeBookingAsVisit(completeTarget.id, {
        shopId,
        customCharge: Number(extraCharge),
        forcePaid,
        paymentMethod,
      });
      setCompleteTarget(null);
      onRefreshBookings();
      onMutated();
      setMessage({
        type: 'ok',
        text: `تم تحويل الحجز ${completeTarget.booking_code} إلى زيارة مسجلة وتحديث الحسابات.`,
      });
    } catch (e) {
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : 'تعذر تحويل الحجز إلى زيارة.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const counts = {
    all: bookings.length,
    pending: bookings.filter((b) => b.status === 'pending').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    completed: bookings.filter((b) => b.status === 'completed').length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    no_show: bookings.filter((b) => b.status === 'no_show').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold text-stone-900">إدارة حجوزات العملاء</h2>
          <p className="text-xs text-stone-500">
            تظهر هنا الحجوزات الجديدة فورًا مع بيانات العميل الكاملة وإمكانية التأكيد أو التحويل إلى زيارة
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { k: 'all', label: `الكل (${counts.all})` },
            { k: 'pending', label: `بانتظار التأكيد (${counts.pending})` },
            { k: 'confirmed', label: `مؤكد (${counts.confirmed})` },
            { k: 'completed', label: `مكتمل (${counts.completed})` },
            { k: 'no_show', label: `لم يحضر (${counts.no_show})` },
            { k: 'cancelled', label: `ملغي (${counts.cancelled})` },
          ].map((item) => (
            <button
              key={item.k}
              type="button"
              onClick={() => setStatusFilter(item.k as 'all' | Booking['status'])}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === item.k
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-3.5 text-xs font-bold ${
            message.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <Ticket className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold text-stone-700">لا توجد حجوزات في هذا القسم</p>
          <p className="text-xs text-stone-500">عندما يحجز عميل موعدًا من صفحته سيظهر هنا تلقائيًا</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const meta = adminBookingStatusMeta(b.status);
            const cust = b.customer_id ? customerById.get(b.customer_id) : undefined;
            const customerName = b.customer_name || cust?.name || 'عميل';
            const customerPhone = b.customer_phone || cust?.phone || 'غير مسجل';
            const isBusy = busyId === b.id;

            return (
              <div
                key={b.id}
                className="card flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-stone-900 px-2.5 py-0.5 font-mono text-xs font-extrabold text-amber-400">
                      {b.booking_code}
                    </span>
                    <span className="text-base font-extrabold text-stone-900">{customerName}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>
                      {meta.label}
                    </span>
                    {b.auto_confirmed && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        تأكيد تلقائي
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
                    <span className="inline-flex items-center gap-1 font-bold text-stone-800">
                      <Phone className="h-3.5 w-3.5 text-stone-400" />
                      <span dir="ltr">{customerPhone}</span>
                    </span>
                    <span>·</span>
                    <span className="font-bold text-stone-800">{b.service_name}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-stone-400" />
                      {formatDateTime(b.start_at)}
                    </span>
                  </div>

                  {b.notes && (
                    <p className="text-xs text-stone-500">ملاحظة العميل: {b.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <>
                      {b.status === 'pending' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleStatusChange(b, 'confirmed')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          تأكيد
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openCompleteModal(b)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-stone-800 disabled:opacity-50"
                      >
                        <Scissors className="h-3.5 w-3.5" />
                        تحويل لزيارة
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatusChange(b, 'no_show')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        لم يحضر
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatusChange(b, 'cancelled')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        إلغاء
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        title={`تحويل الحجز ${completeTarget?.booking_code ?? ''} إلى زيارة`}
        maxWidth="max-w-md"
      >
        {completeTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
              <p className="font-extrabold text-stone-900">العميل: {completeTarget.customer_name || 'عميل'}</p>
              <p className="mt-0.5">الخدمة: {completeTarget.service_name}</p>
            </div>

            <div>
              <label className="label">المبلغ المحصل (0 إذا تم الخصم من باقة نشطة)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={extraCharge}
                onChange={(e) => setExtraCharge(Number(e.target.value))}
                className="input"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs font-bold text-stone-800">
              <input
                type="checkbox"
                checked={forcePaid}
                onChange={(e) => setForcePaid(e.target.checked)}
                className="h-4 w-4 accent-stone-900"
              />
              <span>احتسابها كحلاقة عادية مدفوعة (عدم الخصم من الباقة)</span>
            </label>

            <div>
              <label className="label">طريقة الدفع</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="input"
              >
                <option value="cash">كاش</option>
                <option value="instapay">InstaPay</option>
                <option value="vodafone_cash">Vodafone Cash</option>
                <option value="card">بطاقة بنكية</option>
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={busyId === completeTarget.id}
                onClick={() => void handleConfirmCompleteVisit()}
                className="btn-primary flex-1"
              >
                {busyId === completeTarget.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                تأكيد التحويل لزيارة
              </button>
              <button type="button" onClick={() => setCompleteTarget(null)} className="btn-ghost">
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Add Shop Expense Modal ---------- */
function AddExpenseModal({
  shopId,
  open,
  onClose,
  onCreated,
}: {
  shopId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('مستلزمات تشغيل');
  const [amount, setAmount] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setCategory('مستلزمات تشغيل');
    setAmount('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setErr('');
  }, [open]);

  const submit = async () => {
    const numAmount = Number(amount);
    if (!title.trim()) {
      setErr('يرجى كتابة اسم المصروف (مثال: مناديل، فوط، أمواس)');
      return;
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setErr('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await createShopExpense(shopId, {
        title,
        category,
        amount: numAmount,
        expenseDate,
        notes,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="إضافة مصروف للمحل" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-700">
          يُخصم المصروف من صافي المحل (بعد رسوم الشركة) ويظهر أثره مباشرة في الربح النهائي وفي عمود الجراف.
        </div>

        <div>
          <label className="label">بند المصروف *</label>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (err) setErr('');
            }}
            className="input"
            placeholder="مثال: مناديل، فوط، أمواس، سبراي"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">المبلغ *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (err) setErr('');
              }}
              className="input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="label">التصنيف</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              <option value="مستلزمات تشغيل">مستلزمات تشغيل</option>
              <option value="أدوات وحلاقة">أدوات وحلاقة</option>
              <option value="مناديل وفوط">مناديل وفوط</option>
              <option value="فواتير وصيانة">فواتير وصيانة</option>
              <option value="أخرى">أخرى</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">تاريخ المصروف</label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">ملاحظات</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-16 resize-none"
            placeholder="تفاصيل إضافية (اختياري)"
          />
        </div>

        {err && <p className="text-xs font-extrabold text-red-600">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={submit} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            {saving ? 'جاري الحفظ...' : 'حفظ وخصم من الربح'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CompanyNoticeModal({
  open,
  onClose,
  shopId,
  shopInfo,
  initialView = 'notice',
  mandatory = false,
  existingSignature,
  onContractSigned,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  shopInfo: { shop_name: string; owner_name: string } | null;
  initialView?: 'notice' | 'contract';
  mandatory?: boolean;
  existingSignature: ContractSignatureRecord | null;
  onContractSigned: (sig: ContractSignatureRecord) => void;
}) {
  const alreadySigned = !!existingSignature?.signedAt;
  const effectiveMandatory = mandatory && !alreadySigned;

  const [view, setView] = useState<'notice' | 'contract'>(initialView);
  const [signerName, setSignerName] = useState('');
  const [confirmShopData, setConfirmShopData] = useState(false);
  const [confirmFinancialTerms, setConfirmFinancialTerms] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const today = new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  const contractId = useMemo(
    () => existingSignature?.contractNumber || generateDeterministicContractId(shopId, shopInfo?.shop_name),
    [existingSignature?.contractNumber, shopId, shopInfo?.shop_name]
  );

  useEffect(() => {
    if (!open) return;
    setView(effectiveMandatory ? 'contract' : initialView);
    setSignerName(existingSignature?.signerName || shopInfo?.owner_name || '');
    setConfirmShopData(alreadySigned);
    setConfirmFinancialTerms(alreadySigned);
    setAgreed(alreadySigned);
    setErr('');
  }, [open, effectiveMandatory, initialView, existingSignature, shopInfo?.owner_name, alreadySigned]);

  const canSign = !!signerName.trim() && confirmShopData && confirmFinancialTerms && agreed && !saving;

  const handleSignContract = async () => {
    if (!signerName.trim()) {
      setErr('يرجى إدخال اسم الموقّع الرسمي على العقد');
      return;
    }
    if (!confirmShopData || !confirmFinancialTerms || !agreed) {
      setErr('يجب تأكيد كافة الإقرارات والموافقة على بنود العقد لإتمام التوثيق');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const record: ContractSignatureRecord = {
        shopId: normalizeShopId(shopId),
        contractNumber: contractId,
        signedAt: new Date().toISOString(),
        signerName: signerName.trim(),
        shopName: shopInfo?.shop_name || 'محل مسجّل',
        contractVersion: CONTRACT_VERSION,
      };
      await persistContractSignature(record);
      onContractSigned(record);
    } catch {
      setErr('تعذر حفظ توثيق العقد حاليًا، يرجى المحاولة مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  if (view === 'contract') {
    return (
      <Modal
        open={open}
        onClose={() => {
          if (effectiveMandatory) return;
          onClose();
        }}
        title="عقد ترخيص استخدام النظام الإلكتروني"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-stone-900 p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="grid h-12 w-16 place-items-center rounded-xl bg-white px-2">
                  <UlmiWordmark variant="light" size="sm" />
                </div>
                <div>
                  <p className="font-display text-base font-extrabold text-white sm:text-lg">
                    عقد ترخيص استخدام نظام {SYSTEM_NAME}
                  </p>
                  <p className="text-xs text-stone-300">
                    رقم العقد الذكي: <span className="font-bold text-white">{contractId}</span> · النسخة {CONTRACT_VERSION}
                  </p>
                </div>
              </div>
              <div className="text-left text-xs">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-extrabold ${
                    alreadySigned
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40'
                      : 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/40'
                  }`}
                >
                  {alreadySigned ? <ShieldCheck className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {alreadySigned ? 'موقّع وموثّق' : 'توقيع إلزامي'}
                </span>
                <p className="mt-1 text-[11px] text-stone-400">{today}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs sm:grid-cols-3">
            <div>
              <p className="font-bold text-stone-500">الطرف الأول (الشركة المالكة)</p>
              <div className="mt-1 flex items-center gap-1.5 font-extrabold text-stone-900">
                <UlmiWordmark variant="light" size="sm" />
                <span>— {SYSTEM_NAME}</span>
              </div>
            </div>
            <div>
              <p className="font-bold text-stone-500">الطرف الثاني (المنشأة / المحل)</p>
              <p className="mt-1 font-extrabold text-stone-900">{shopInfo?.shop_name || 'محل مسجّل'}</p>
            </div>
            <div>
              <p className="font-bold text-stone-500">المسؤول / المالك المسجّل</p>
              <p className="mt-1 font-extrabold text-stone-900">{shopInfo?.owner_name || '—'}</p>
            </div>
          </div>

          <div className="max-h-[42vh] space-y-3.5 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-700">
            <div>
              <p className="mb-1 font-extrabold text-stone-900">1. التمهيد وحجية العقد الذكي</p>
              <p>
                أُبرم هذا العقد إلكترونيًا بين شركة <span className="font-bold text-stone-900">{BRAND_NAME}</span> (مالكة ومشغّلة نظام{' '}
                <span className="font-bold text-stone-900">{SYSTEM_NAME}</span>) وبين منشأة{' '}
                <span className="font-bold text-stone-900">{shopInfo?.shop_name ?? '—'}</span> المملوكة للسيد/ة{' '}
                <span className="font-bold text-stone-900">{shopInfo?.owner_name ?? '—'}</span>، ويُعد التوقيع الإلكتروني الموثّق ملزمًا للطرفين سواء للمنشآت الجديدة أو المنشآت القائمة التي تستمر في استخدام النظام.
              </p>
            </div>

            <div>
              <p className="mb-1 font-extrabold text-stone-900">2. القواعد المالية ورسوم التشغيل</p>
              <ul className="list-disc space-y-1 pr-5 text-xs sm:text-sm">
                <li>
                  الحلاقة العادية المدفوعة تخضع لرسوم ثابتة لصالح شركة <span className="font-bold">{BRAND_NAME}</span> قدرها{' '}
                  <span className="font-bold text-stone-900">{formatPrice(COMPANY_FEE_PER_VISIT)}</span>، ويُحسب صافي المحل بخصم هذه الرسوم من قيمة العملية.
                </li>
                <li>
                  بيع الباقات والاشتراكات تُحتسب رسومه مرة واحدة عند تفعيل البيع وفق عدد زيارات الباقة، بينما استخدام زيارة من الباقة لا يضيف رسومًا جديدة ولا يُعدّ تحصيلًا إضافيًا.
                </li>
                <li>
                  أي خدمة إضافية تُسجّل أثناء زيارة الباقة لا تخضع لرسوم إضافية لصالح شركة <span className="font-bold">{BRAND_NAME}</span> وتؤول بالكامل للمحل.
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-1 font-extrabold text-stone-900">3. دقة البيانات والالتزام التشغيلي</p>
              <p className="text-xs sm:text-sm">
                يلتزم الطرف الثاني بتسجيل الزيارات والتحصيلات والمصروفات بدقة ومصداقية عبر لوحة الإدارة، ويقر بصحة بيانات المحل والمالك الظاهرة في هذا العقد، كما تلتزم شركة <span className="font-bold">{BRAND_NAME}</span> بتوفير المنصة واستمرارية تشغيل السجلات والتقارير.
              </p>
            </div>
          </div>

          {!alreadySigned ? (
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
              <div>
                <label className="label">الاسم الكامل للموقّع (إلزامي للتوثيق) *</label>
                <input
                  value={signerName}
                  onChange={(e) => {
                    setSignerName(e.target.value);
                    if (err) setErr('');
                  }}
                  className="input bg-white"
                  placeholder="اكتب اسم المالك أو المفوض بالتوقيع"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 bg-white p-3">
                <input
                  type="checkbox"
                  checked={confirmShopData}
                  onChange={(e) => {
                    setConfirmShopData(e.target.checked);
                    if (err) setErr('');
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
                />
                <span className="text-xs font-bold text-stone-700 sm:text-sm">
                  أقر بصحة بيانات المحل ({shopInfo?.shop_name ?? '—'}) واسم المسؤول ({shopInfo?.owner_name ?? '—'}).
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 bg-white p-3">
                <input
                  type="checkbox"
                  checked={confirmFinancialTerms}
                  onChange={(e) => {
                    setConfirmFinancialTerms(e.target.checked);
                    if (err) setErr('');
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
                />
                <span className="text-xs font-bold text-stone-700 sm:text-sm">
                  أوافق على آلية احتساب رسوم شركة {BRAND_NAME} ({formatPrice(COMPANY_FEE_PER_VISIT)} للحلاقة العادية، ورسوم الباقات مرة واحدة عند البيع، و0 رسوم على الخدمات الإضافية).
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-300 bg-white p-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => {
                    setAgreed(e.target.checked);
                    if (err) setErr('');
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
                />
                <span className="text-xs font-extrabold text-stone-900 sm:text-sm">
                  أوافق موافقة نهائية وملزمة على جميع بنود هذا العقد الإلكتروني الموثّق مع شركة {BRAND_NAME}.
                </span>
              </label>

              {err && <p className="text-xs font-extrabold text-red-600">{err}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs font-bold text-emerald-900">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700" />
                <span>
                  تم توثيق العقد برقم <span className="font-extrabold">{existingSignature.contractNumber}</span> بواسطة{' '}
                  <span className="font-extrabold">{existingSignature.signerName || shopInfo?.owner_name || 'المسؤول'}</span>
                </span>
              </div>
              <span className="text-[11px] text-emerald-800">
                بتاريخ: {formatDateTime(existingSignature.signedAt)}
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!alreadySigned ? (
              <button
                type="button"
                onClick={handleSignContract}
                disabled={!canSign}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {saving ? 'جاري التوثيق والحفظ...' : 'توقيع وموافقة إلزامية على العقد'}
              </button>
            ) : (
              <button type="button" onClick={onClose} className="btn-primary flex-1">
                <CheckCircle2 className="h-4 w-4" />
                <span>العقد موثّق — إغلاق</span>
              </button>
            )}

            {!effectiveMandatory && (
              <button type="button" onClick={() => setView('notice')} className="btn-ghost">
                عرض الإشعار
              </button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`إشعار من ${BRAND_NAME}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-900 p-4 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-16 place-items-center rounded-xl bg-white px-2">
              <UlmiWordmark variant="light" size="sm" />
            </div>
            <div>
              <p className="text-xs text-stone-300">إدارة أنظمة الحلاقة الذكية — {SYSTEM_NAME}</p>
              <p className="mt-0.5 text-[11px] text-stone-400">
                حالة العقد: {alreadySigned ? `موثّق (${existingSignature.contractNumber})` : 'مطلوب التوقيع'}
              </p>
            </div>
          </div>
          <Building2 className="h-5 w-5 shrink-0 text-stone-300" />
        </div>

        <p className="text-sm leading-relaxed text-stone-700">
          الحلاقة العادية المدفوعة تخضع لرسوم شركة ثابتة قدرها{' '}
          <span className="font-bold text-stone-900">{formatPrice(COMPANY_FEE_PER_VISIT)}</span>، وبيع الباقات يحتسب رسومها مرة واحدة عند البيع وفق قواعد النظام، وتُخصم مصروفات المحل بعد رسوم الشركة للوصول لصافي الربح النهائي.
        </p>

        <div className="flex gap-3">
          <button type="button" onClick={() => setView('contract')} className="btn-primary flex-1">
            <FileText className="h-4 w-4" />
            {alreadySigned ? 'عرض العقد الموثّق' : 'عرض وتوقيع العقد'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Overview (Main Executive Summary) ---------- */
function Overview({
  shopId,
  customers,
  refreshTick,
  onGoSubs,
  onGoRevenue,
}: {
  shopId: string;
  customers: Customer[];
  refreshTick: number;
  onGoSubs: () => void;
  onGoRevenue: () => void;
}) {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeSubs: 0,
    totalVisits: 0,
    expiringSoon: 0,
    loading: true,
  });
  const [financial, setFinancial] = useState<RevenueStats | null>(null);
  const [snapshot, setSnapshot] = useState<ShopFinancialSnapshot | null>(null);
  const [financialError, setFinancialError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      setStats((current) => ({ ...current, loading: true }));
      setFinancialError(false);
      try {
        const [{ subscriptions, visits }, revenue, snap] = await Promise.all([
          getShopActivityData(customers, { shopId }),
          getRevenueStats(customers, shopId),
          fetchShopFinancialSnapshot(shopId, customers),
        ]);
        const latestByCustomer = new Map<string, Subscription>();
        for (const subscription of subscriptions) {
          if (!latestByCustomer.has(subscription.customer_id)) {
            latestByCustomer.set(subscription.customer_id, subscription);
          }
        }

        const today = new Date().toISOString().slice(0, 10);
        let activeSubs = 0;
        let expiringSoon = 0;
        for (const subscription of latestByCustomer.values()) {
          if (subscription.status !== 'active' || subscription.end_date < today) continue;
          activeSubs++;
          const daysLeft = Math.ceil(
            (new Date(`${subscription.end_date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000
          );
          if (daysLeft <= 7) expiringSoon++;
        }

        if (!cancelled) {
          setStats({
            totalCustomers: customers.length,
            activeSubs,
            totalVisits: visits.length,
            expiringSoon,
            loading: false,
          });
          setFinancial(revenue);
          setSnapshot(snap);
        }
      } catch (error) {
        console.error('Failed to load shop overview:', error);
        if (!cancelled) {
          setStats((current) => ({ ...current, totalCustomers: customers.length, loading: false }));
          setFinancialError(true);
        }
      }
    };

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [customers, shopId, refreshTick]);

  const totalCollectedDisplay = snapshot ? snapshot.totalCollected : financial?.totalRevenue ?? 0;
  const companyFeesDisplay = snapshot ? snapshot.totalCompanyFees : financial?.companyFee ?? 0;
  const netBeforeExpensesDisplay = snapshot ? snapshot.netBeforeExpenses : financial?.netRevenue ?? 0;
  const expensesDisplay = snapshot ? snapshot.totalExpenses : 0;
  const finalProfitDisplay = snapshot ? snapshot.finalNetProfit : netBeforeExpensesDisplay - expensesDisplay;
  const actualVisitsDisplay = snapshot ? snapshot.actualVisitsCount : stats.totalVisits;
  const soldPackagesDisplay = snapshot ? snapshot.packageSalesCount : 0;

  const operationalCards = [
    { label: 'إجمالي العملاء', value: stats.totalCustomers, icon: Users },
    { label: 'اشتراكات نشطة', value: stats.activeSubs, icon: CheckCircle2 },
    { label: 'الزيارات الفعلية', value: actualVisitsDisplay, icon: Scissors },
    { label: 'الباقات والاشتراكات المباعة', value: soldPackagesDisplay, icon: Layers },
  ];

  const primarySummaryCards = [
    {
      label: 'إجمالي التحصيل',
      value: stats.loading ? '—' : formatPrice(totalCollectedDisplay),
      detail: 'حلاقات عادية + باقات + خدمات إضافية',
      tone: 'text-stone-900',
    },
    {
      label: 'رسوم الشركة وصافي المحل (قبل المصروفات)',
      value: stats.loading ? '—' : formatPrice(netBeforeExpensesDisplay),
      detail: `بعد خصم ${formatPrice(companyFeesDisplay)} رسوم شركة`,
      tone: 'text-stone-800',
    },
    {
      label: 'مصروفات المحل',
      value: stats.loading ? '—' : formatPrice(expensesDisplay),
      detail: 'مناديل، فوط، أمواس ومستلزمات التشغيل',
      tone: 'text-red-700',
    },
    {
      label: 'ربح المحل النهائي (بعد المصروفات)',
      value: stats.loading ? '—' : formatPrice(finalProfitDisplay),
      detail: 'صافي المحل − مصروفات المحل',
      tone: finalProfitDisplay >= 0 ? 'text-emerald-700' : 'text-red-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {operationalCards.map((c) => (
          <div key={c.label} className="card flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-bold text-stone-500">{c.label}</p>
              {stats.loading ? (
                <div className="mt-2 h-7 w-16 animate-shimmer rounded" />
              ) : (
                <p className="mt-1.5 font-display text-2xl font-extrabold text-stone-900">{c.value}</p>
              )}
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700">
              <c.icon className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50/50 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-extrabold text-stone-900">الملخص المالي والتشغيلي</h2>
            <p className="mt-0.5 text-xs text-stone-500">التحصيل، رسوم الشركة، مصروفات المحل، وربح المحل النهائي</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onGoSubs}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50"
            >
              <CalendarClock className="h-3.5 w-3.5 text-stone-500" />
              الباقات
            </button>
            <button
              onClick={onGoRevenue}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-stone-800"
            >
              <Wallet className="h-3.5 w-3.5" />
              الإيرادات والمصروفات
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {financialError ? (
          <div className="p-5 text-sm text-red-700">
            تعذر تحميل الملخص المالي. راجع اتصال قاعدة البيانات وسجلات التحصيل.
          </div>
        ) : (
          <div className="grid divide-y divide-stone-200 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 xl:grid-cols-4">
            {primarySummaryCards.map((item) => (
              <div key={item.label} className="bg-white p-5">
                <p className="text-xs font-bold text-stone-500">{item.label}</p>
                {stats.loading ? (
                  <div className="mt-2.5 h-7 w-24 animate-shimmer rounded" />
                ) : (
                  <p className={`mt-2 font-display text-2xl font-extrabold ${item.tone}`}>{item.value}</p>
                )}
                <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">{item.detail}</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-stone-200 bg-stone-50 px-5 py-3 text-[11px] leading-relaxed text-stone-600">
          المعادلة المالية: إجمالي التحصيل − رسوم الشركة ({formatPrice(COMPANY_FEE_PER_VISIT)}/حلاقة) = صافي المحل (قبل المصروفات) − مصروفات المحل = ربح المحل النهائي.
        </div>
      </section>

      {stats.expiringSoon > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-stone-300 bg-stone-50 p-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <span className="text-sm font-bold text-stone-900">
              {stats.expiringSoon} اشتراك يقترب من الانتهاء خلال 7 أيام
            </span>
          </div>
          <button
            onClick={onGoSubs}
            className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-stone-800"
          >
            عرض التفاصيل
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Customers tab ---------- */
function CustomersTab({
  customers,
  loading,
  search,
  setSearch,
  onSelect,
  onAdd,
}: {
  customers: Customer[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  onSelect: (c: Customer) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم العميل..."
          className="input bg-white pr-12"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-shimmer rounded-2xl" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="card p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold text-stone-700">لا يوجد عملاء بعد</p>
          <p className="text-sm text-stone-500">ابدأ بإضافة أول عميل</p>
          <button onClick={onAdd} className="btn-primary mt-4">
            <UserPlus className="h-4 w-4" />
            إضافة عميل
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {customers.map((c) => (
            <CustomerRow key={c.id} customer={c} onClick={() => onSelect(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerRow({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [visitsCount, setVisitsCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const [s, v] = await Promise.all([getActiveSubscription(customer.id), getVisitsByCustomer(customer.id)]);
      if (!active) return;
      setSub(s);
      setVisitsCount(v.length);
    })();
    return () => {
      active = false;
    };
  }, [customer.id]);

  const active = sub?.status === 'active';
  const remaining = sub ? Math.max(0, (sub.plan?.haircut_count ?? 0) - sub.haircuts_used) : 0;

  return (
    <button
      onClick={onClick}
      className={`card flex items-center gap-3.5 p-4 text-right transition hover:border-stone-300 hover:bg-stone-50/50 ${
        customer.is_blocked ? 'opacity-60' : ''
      }`}
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-900 font-display text-base font-extrabold text-white">
        {customer.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-bold text-stone-900">{customer.name}</p>
          {customer.is_blocked && (
            <span className="badge bg-red-100 text-red-700">
              <Ban className="h-3 w-3" />
              محظور
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-stone-500">
            <Scissors className="h-3.5 w-3.5" />
            {visitsCount} زيارة فعلية
          </span>
          {active ? (
            <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              مشترك — باقي {remaining}
            </span>
          ) : (
            <span className="badge bg-stone-100 text-stone-600">غير مشترك</span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ---------- Visits tab (smart daily checklist) ---------- */
type VisitRow = { customer: Customer; sub: Subscription | null; visitToday: Visit | null; recording: boolean };

function VisitsTab({
  shopId,
  customers,
  regularHaircutPrice,
  isContractSigned,
  onRequireContract,
  onSelectCustomer,
  onMutated,
}: {
  shopId: string;
  customers: Customer[];
  regularHaircutPrice: number;
  isContractSigned: boolean;
  onRequireContract: () => void;
  onSelectCustomer: (c: Customer) => void;
  onMutated: () => void;
}) {
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [visitModalRow, setVisitModalRow] = useState<VisitRow | null>(null);
  const [visitModalForcePaid, setVisitModalForcePaid] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { subscriptions, visits } = await getShopActivityData(customers, { visitsSince: todayStr, shopId });
      const latestByCustomer = new Map<string, Subscription>();
      for (const subscription of subscriptions) {
        if (!latestByCustomer.has(subscription.customer_id)) {
          latestByCustomer.set(subscription.customer_id, subscription);
        }
      }

      const visitByCustomer = new Map<string, Visit>();
      for (const visit of visits) {
        if (!visitByCustomer.has(visit.customer_id) && visit.visit_date.slice(0, 10) === todayStr) {
          visitByCustomer.set(visit.customer_id, visit);
        }
      }

      const built: VisitRow[] = customers.map((customer) => ({
        customer,
        sub: latestByCustomer.get(customer.id) ?? null,
        visitToday: visitByCustomer.get(customer.id) ?? null,
        recording: false,
      }));
      built.sort((a, b) => {
        if (!!a.visitToday !== !!b.visitToday) return a.visitToday ? 1 : -1;
        return a.customer.name.localeCompare(b.customer.name, 'ar');
      });
      setRows(built);
    } catch (error) {
      console.error('Failed to load shop daily visits:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [customers, shopId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const markVisited = async (
    idx: number,
    opts: { haircutType: string; serviceName: string; customCharge: number; notes: string; forcePaid: boolean; paymentMethod: PaymentMethod }
  ) => {
    const row = rows[idx];
    if (row.visitToday || row.recording || row.customer.is_blocked) return false;
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, recording: true } : r)));
    try {
      const result = await recordVisit(row.customer.id, { ...opts, shopId });
      const newVisit = result.visit;
      setRows((prev) =>
        prev
          .map((r, i) =>
            i === idx ? { ...r, visitToday: newVisit, recording: false, sub: result.subscription ?? r.sub } : r
          )
          .sort((a, b) => {
            if (!!a.visitToday !== !!b.visitToday) return a.visitToday ? 1 : -1;
            return a.customer.name.localeCompare(b.customer.name, 'ar');
          })
      );
      onMutated();
      return true;
    } catch (error) {
      console.error('Failed to record visit:', error);
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, recording: false } : r)));
      return false;
    }
  };

  const unmarkVisited = async (idx: number) => {
    const row = rows[idx];
    if (!row.visitToday) return;
    const visitId = row.visitToday.id;
    if (row.visitToday.payment_type === 'subscription' && row.visitToday.subscription_id && row.sub) {
      const newUsed = Math.max(0, row.sub.haircuts_used - 1);
      await supabaseUpdateSubscriptionUsage(row.visitToday.subscription_id, newUsed);
    }
    await deleteVisit(visitId);
    setRows((prev) =>
      prev
        .map((r, i) => (i === idx ? { ...r, visitToday: null } : r))
        .sort((a, b) => {
          if (!!a.visitToday !== !!b.visitToday) return a.visitToday ? 1 : -1;
          return a.customer.name.localeCompare(b.customer.name, 'ar');
        })
    );
    onMutated();
  };

  const filtered = filter.trim() ? rows.filter((r) => r.customer.name.includes(filter.trim())) : rows;
  const visitedCount = rows.filter((r) => r.visitToday).length;
  const subscribedCount = rows.filter((r) => r.sub?.status === 'active').length;
  const paidVisitCount = rows.filter((r) => r.visitToday?.payment_type === 'paid').length;
  const todayCompanyFee = paidVisitCount * COMPANY_FEE_PER_VISIT;

  const openVisitAction = (row: VisitRow, forcePaid: boolean) => {
    if (!isContractSigned) {
      onRequireContract();
      return;
    }
    setVisitModalRow(row);
    setVisitModalForcePaid(forcePaid);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3.5 text-center">
          <p className="text-[11px] font-bold text-stone-500">إجمالي العملاء</p>
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{rows.length}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-[11px] font-bold text-stone-500">زار اليوم</p>
          <p className="mt-1 font-display text-xl font-extrabold text-emerald-700">{visitedCount}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-[11px] font-bold text-stone-500">مشترك نشط</p>
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{subscribedCount}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-[11px] font-bold text-stone-500">رسوم الحلاقات العادية اليوم</p>
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{formatPrice(todayCompanyFee)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ابحث عن عميل..."
            className="input bg-white pr-11"
          />
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500">
          <Clock className="h-4 w-4" />
          <span>زيارات اليوم — {formatDate(new Date())}</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 animate-shimmer rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-stone-500">
          <Users className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold">لا يوجد عملاء مطابقون</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((row) => {
            const idx = rows.indexOf(row);
            const active = row.sub?.status === 'active';
            const remaining = row.sub && row.sub.plan ? row.sub.plan.haircut_count - row.sub.haircuts_used : 0;
            const visited = !!row.visitToday;
            const blocked = row.customer.is_blocked;
            return (
              <div
                key={row.customer.id}
                className={`card flex flex-wrap items-center justify-between gap-3 p-3.5 transition ${
                  visited ? 'border-emerald-200 bg-emerald-50/30' : ''
                } ${blocked ? 'opacity-55' : ''}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    onClick={() => onSelectCustomer(row.customer)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900 font-display text-sm font-extrabold text-white"
                  >
                    {row.customer.name.charAt(0)}
                  </button>

                  <button onClick={() => onSelectCustomer(row.customer)} className="min-w-0 text-right">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold text-stone-900">{row.customer.name}</p>
                      {blocked && <span className="badge bg-red-100 text-red-700"><Ban className="h-3 w-3" />محظور</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {active ? (
                        <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">مشترك — باقي {remaining}</span>
                      ) : (
                        <span className="badge bg-stone-100 text-stone-600">غير مشترك</span>
                      )}
                      {visited && (
                        <span className="badge bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          {row.visitToday?.payment_type === 'subscription'
                            ? 'بالاشتراك'
                            : formatPrice(Number(row.visitToday?.charge_amount ?? 0))}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {blocked ? (
                    <span className="text-xs font-bold text-red-600">لا يمكن التسجيل</span>
                  ) : visited ? (
                    <button
                      onClick={() => unmarkVisited(idx)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-100"
                    >
                      <XCircle className="h-4 w-4 text-stone-500" />
                      إلغاء
                    </button>
                  ) : row.recording ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                  ) : active && remaining > 0 ? (
                    <>
                      <button
                        onClick={() => openVisitAction(row, false)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        اشتراك
                      </button>
                      <button
                        onClick={() => openVisitAction(row, true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-800 transition hover:bg-stone-50"
                      >
                        <Coins className="h-4 w-4 text-stone-600" />
                        عادي
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => openVisitAction(row, false)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-stone-800"
                    >
                      <Scissors className="h-4 w-4" />
                      زاره — {formatPrice(regularHaircutPrice)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecordVisitModal
        regularHaircutPrice={regularHaircutPrice}
        open={!!visitModalRow}
        onClose={() => setVisitModalRow(null)}
        active={visitModalRow?.sub?.status === 'active'}
        remaining={visitModalRow?.sub?.plan ? Math.max(0, visitModalRow.sub.plan.haircut_count - visitModalRow.sub.haircuts_used) : 0}
        initialForcePaid={visitModalForcePaid}
        onRecord={async (opts) => {
          if (!visitModalRow) return;
          const rowIndex = rows.findIndex((r) => r.customer.id === visitModalRow.customer.id);
          if (rowIndex < 0) return;
          const saved = await markVisited(rowIndex, opts);
          if (saved) setVisitModalRow(null);
        }}
      />
    </div>
  );
}

/* ---------- Subscriptions & Packages tab ---------- */
function SubscriptionsTab({
  shopId,
  customers,
  refreshTick,
  onSelectCustomer,
}: {
  shopId: string;
  customers: Customer[];
  refreshTick: number;
  onSelectCustomer: (c: Customer) => void;
}) {
  type SubscriberRow = {
    customer: Customer;
    subscription: Subscription;
    daysLeft: number;
    haircutsRemaining: number;
  };

  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [alerts, setAlerts] = useState<SubscriptionAlert[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
  const [packageRevenue, setPackageRevenue] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'expiring'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadSubscriptions = async () => {
      setLoading(true);
      try {
        const [{ subscriptions }, snap] = await Promise.all([
          getShopActivityData(customers, { includeVisits: false, shopId }),
          fetchShopFinancialSnapshot(shopId, customers).catch(() => null),
        ]);
        const customerById = new Map(customers.map((customer) => [customer.id, customer]));
        const latestByCustomer = new Map<string, Subscription>();

        for (const subscription of subscriptions) {
          if (!latestByCustomer.has(subscription.customer_id)) {
            latestByCustomer.set(subscription.customer_id, subscription);
          }
        }

        const todayString = new Date().toISOString().slice(0, 10);
        const today = new Date(`${todayString}T00:00:00Z`);
        const activeRows: SubscriberRow[] = [];
        const alertRows: SubscriptionAlert[] = [];

        for (const subscription of latestByCustomer.values()) {
          const customer = customerById.get(subscription.customer_id);
          if (!customer || subscription.status === 'cancelled') continue;

          const endDate = new Date(`${subscription.end_date}T00:00:00Z`);
          const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
          const haircutsRemaining = Math.max(0, (subscription.plan?.haircut_count ?? 0) - subscription.haircuts_used);

          if (subscription.status === 'active' && subscription.end_date >= todayString) {
            activeRows.push({ customer, subscription, daysLeft: Math.max(0, daysLeft), haircutsRemaining });
          }

          if (daysLeft <= 7 || subscription.end_date < todayString) {
            const isExpired = daysLeft < 0 || subscription.status !== 'active';
            alertRows.push({
              customer,
              subscription,
              daysLeft,
              haircutsRemaining,
              isExpired,
              expiredDaysAgo: isExpired ? Math.max(1, Math.abs(daysLeft)) : 0,
            });
          }
        }

        activeRows.sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'ar'));
        alertRows.sort((a, b) => a.daysLeft - b.daysLeft);

        if (!cancelled) {
          setAllSubscriptions(subscriptions);
          setSubscribers(activeRows);
          setAlerts(alertRows);
          setPackageRevenue(snap?.packageSalesRevenue ?? 0);
        }
      } catch (error) {
        console.error('Failed to load shop subscriptions:', error);
        if (!cancelled) {
          setAllSubscriptions([]);
          setSubscribers([]);
          setAlerts([]);
          setPackageRevenue(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSubscriptions();
    return () => {
      cancelled = true;
    };
  }, [customers, shopId, refreshTick]);

  const totalSoldPackages = allSubscriptions.filter((s) => s.status !== 'cancelled').length;
  const totalConsumedHaircuts = allSubscriptions.reduce((sum, s) => sum + Number(s.haircuts_used || 0), 0);
  const totalRemainingHaircuts = subscribers.reduce((sum, row) => sum + row.haircutsRemaining, 0);

  const expired = alerts.filter((alert) => alert.isExpired);
  const expiringSoon = alerts.filter((alert) => !alert.isExpired && alert.daysLeft <= 7);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-bold text-stone-500">عدد الباقات / الاشتراكات</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-stone-900">{totalSoldPackages}</p>
          <p className="mt-1 text-[11px] text-stone-500">نشط حاليًا: {subscribers.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold text-stone-500">قيمة مبيعات الباقات</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-emerald-700">{formatPrice(packageRevenue)}</p>
          <p className="mt-1 text-[11px] text-stone-500">من المعاملات والسجلات المتاحة</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold text-stone-500">الزيارات المستهلكة من الباقات</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-stone-900">{totalConsumedHaircuts}</p>
          <p className="mt-1 text-[11px] text-stone-500">إجمالي ما تم خصمه من الباقات</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold text-stone-500">الزيارات المتبقية (النشطة)</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-stone-900">{totalRemainingHaircuts}</p>
          <p className="mt-1 text-[11px] text-stone-500">منتهية: {expired.length} · قريبة الانتهاء: {expiringSoon.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'الكل' },
          { id: 'active', label: `النشطة (${subscribers.length})` },
          { id: 'expiring', label: `قريبة من الانتهاء (${expiringSoon.length})` },
          { id: 'expired', label: `المنتهية (${expired.length})` },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setStatusFilter(item.id as typeof statusFilter)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              statusFilter === item.id ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(statusFilter === 'all' || statusFilter === 'active') && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-extrabold text-stone-900">المشتركون حاليًا</h3>
              <p className="text-xs text-stone-500">العملاء ذوو الاشتراك النشط وغير المنتهي</p>
            </div>
            <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
              {subscribers.length} مشترك
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-20 animate-shimmer rounded-2xl" />
              ))}
            </div>
          ) : subscribers.length === 0 ? (
            <div className="card p-6 text-center text-stone-500">
              <Users className="mx-auto h-9 w-9 text-stone-300" />
              <p className="mt-2 font-bold">لا يوجد مشتركون حاليًا</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {subscribers.map((row) => (
                <button
                  key={row.subscription.id}
                  onClick={() => onSelectCustomer(row.customer)}
                  className="card flex w-full items-center justify-between gap-3 p-4 text-right transition hover:border-stone-300 hover:bg-stone-50/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-stone-900">{row.customer.name}</p>
                      <p className="text-xs text-stone-500">
                        باقة {row.subscription.plan?.name ?? '—'} · مستهلك {row.subscription.haircuts_used} · متبقي {row.haircutsRemaining}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">باقي {row.daysLeft} يوم</span>
                    {row.customer.phone && <p className="mt-1 text-xs text-stone-500">{row.customer.phone}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {(statusFilter === 'all' || statusFilter === 'expiring' || statusFilter === 'expired') && (
        <section className="space-y-3">
          <div>
            <h3 className="font-display text-base font-extrabold text-stone-900">الاشتراكات القريبة من الانتهاء والمنتهية</h3>
            <p className="text-xs text-stone-500">متابعة التجديد والباقات المنتهية</p>
          </div>
          {loading ? (
            <div className="h-20 animate-shimmer rounded-2xl" />
          ) : (statusFilter === 'expired' ? expired : statusFilter === 'expiring' ? expiringSoon : alerts).length === 0 ? (
            <div className="card p-6 text-center text-stone-500">
              <CalendarClock className="mx-auto h-9 w-9 text-stone-300" />
              <p className="mt-2 font-bold">لا توجد اشتراكات في هذا التصنيف</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {(statusFilter === 'expired' ? expired : statusFilter === 'expiring' ? expiringSoon : alerts).map((alert) => (
                <button
                  key={alert.subscription.id}
                  onClick={() => onSelectCustomer(alert.customer)}
                  className="card flex w-full items-center justify-between gap-3 p-4 text-right transition hover:border-stone-300 hover:bg-stone-50/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        alert.isExpired ? 'bg-red-50 text-red-600 ring-1 ring-red-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                      }`}
                    >
                      {alert.isExpired ? <XCircle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-stone-900">{alert.customer.name}</p>
                      <p className="text-xs text-stone-500">
                        باقة {alert.subscription.plan?.name} — مستهلك {alert.subscription.haircuts_used} · متبقي {alert.haircutsRemaining}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    {alert.isExpired ? (
                      <span className="badge bg-red-50 text-red-700 ring-1 ring-red-200">انتهى منذ {alert.expiredDaysAgo} يوم</span>
                    ) : (
                      <span className="badge bg-amber-50 text-amber-800 ring-1 ring-amber-200">باقي {alert.daysLeft} يوم</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ---------- Helper for formatting time & customer package context ---------- */
function formatTimeOnly(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

type ActivityDetailItem = {
  id: string;
  timeLabel: string;
  customerName: string;
  actionSummary: string;
  amount: number;
  fee: number;
  net: number;
  isSubscribed: boolean;
  packageName?: string;
  packagePrice?: number;
  packageUsed?: number;
  packageTotal?: number;
};

/* ---------- Revenue, Analytics, Expenses & Ledger tab ---------- */
function RevenueTab({
  shopId,
  customers,
  refreshTick,
  onOpenAddExpense,
  onMutated,
}: {
  shopId: string;
  customers: Customer[];
  refreshTick: number;
  onOpenAddExpense: () => void;
  onMutated: () => void;
}) {
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [snapshot, setSnapshot] = useState<ShopFinancialSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [operationFilter, setOperationFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLedgerLoading(true);
      setLedgerError('');
      try {
        const [s, snap] = await Promise.all([
          getRevenueStats(customers, shopId),
          fetchShopFinancialSnapshot(shopId, customers),
        ]);
        if (!cancelled) {
          setStats(s);
          setSnapshot(snap);
        }
      } catch (error) {
        console.error('Failed to load revenue & ledger:', error);
        if (!cancelled) {
          setStats(null);
          setSnapshot(null);
          setLedgerError(error instanceof Error ? error.message : 'تعذر تحميل بيانات الإيرادات');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLedgerLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customers, shopId, refreshTick]);

  const transactions = snapshot?.transactions ?? [];
  const allSubscriptions = snapshot?.subscriptions ?? [];
  const allVisits = snapshot?.visits ?? [];
  const expenses = snapshot?.expenses ?? [];

  const handleDeleteExpense = async (expenseId: string) => {
    setDeletingExpenseId(expenseId);
    try {
      await removeShopExpense(shopId, expenseId);
      onMutated();
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const customerNames = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers]
  );

  const latestSubByCustomer = useMemo(() => {
    const map = new Map<string, Subscription>();
    for (const s of allSubscriptions) {
      if (!map.has(s.customer_id)) {
        map.set(s.customer_id, s);
      }
    }
    return map;
  }, [allSubscriptions]);

  const subById = useMemo(() => {
    const map = new Map<string, Subscription>();
    for (const s of allSubscriptions) {
      map.set(s.id, s);
    }
    return map;
  }, [allSubscriptions]);

  const buildCustomerSubMeta = useCallback(
    (customerId: string | null, subscriptionId?: string | null) => {
      const sub = (subscriptionId ? subById.get(subscriptionId) : null) ?? (customerId ? latestSubByCustomer.get(customerId) : null);
      if (!sub || sub.status === 'cancelled') {
        return { isSubscribed: false as const };
      }
      return {
        isSubscribed: true as const,
        packageName: sub.plan?.name ?? 'باقة اشتراك',
        packagePrice: Number(sub.plan?.price ?? 0),
        packageUsed: Number(sub.haircuts_used ?? 0),
        packageTotal: Number(sub.plan?.haircut_count ?? 0),
      };
    },
    [subById, latestSubByCustomer]
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const customerName = transaction.customer_id ? customerNames.get(transaction.customer_id) ?? '' : '';
      const searchMatch = !customerFilter.trim() || customerName.toLowerCase().includes(customerFilter.trim().toLowerCase());
      const date = transaction.payment_date.slice(0, 10);
      const fromMatch = !dateFrom || date >= dateFrom;
      const toMatch = !dateTo || date <= dateTo;
      const methodMatch = methodFilter === 'all' || transaction.payment_method === methodFilter;
      const statusMatch = statusFilter === 'all' || transaction.payment_status === statusFilter;
      const operation =
        transaction.payment_kind === 'subscription'
          ? 'subscription'
          : Number(transaction.company_fee_amount) > 0
          ? 'regular'
          : 'extra';
      const operationMatch = operationFilter === 'all' || operation === operationFilter;
      return searchMatch && fromMatch && toMatch && methodMatch && statusMatch && operationMatch;
    });
  }, [transactions, customerNames, customerFilter, dateFrom, dateTo, methodFilter, statusFilter, operationFilter]);

  const recordedFiltered = filteredTransactions.filter((transaction) => transaction.payment_status === 'recorded');
  const filteredCollected = recordedFiltered.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const filteredFees = recordedFiltered.reduce((sum, transaction) => sum + Number(transaction.company_fee_amount || 0), 0);
  const filteredNet = filteredCollected - filteredFees;

  const reportTransactions = recordedFiltered;

  const monthlyReport = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const key = `${year}-${month}`;
      const rows = reportTransactions.filter((transaction) => {
        const date = new Date(transaction.payment_date);
        return date.getFullYear() === year && date.getMonth() === month;
      });
      const monthExpensesList = expenses.filter((exp) => {
        const date = new Date(exp.expense_date);
        return date.getFullYear() === year && date.getMonth() === month;
      });

      const collected = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const fees = rows.reduce((sum, row) => sum + Number(row.company_fee_amount || 0), 0);
      const monthExpenses = monthExpensesList.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
      const netBeforeExpenses = collected - fees;
      const netAfterExpenses = netBeforeExpenses - monthExpenses;

      const packages = rows.filter((row) => row.payment_kind === 'subscription').reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const regular = rows.filter((row) => row.payment_kind === 'visit' && Number(row.company_fee_amount || 0) > 0).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const extras = rows.filter((row) => row.payment_kind === 'visit' && Number(row.company_fee_amount || 0) === 0).reduce((sum, row) => sum + Number(row.amount || 0), 0);

      const details: ActivityDetailItem[] = rows.map((tx) => {
        const cName = tx.customer_id ? customerNames.get(tx.customer_id) ?? 'عميل' : 'عميل';
        const subMeta = buildCustomerSubMeta(tx.customer_id, tx.subscription_id);
        const amt = Number(tx.amount || 0);
        const fee = Number(tx.company_fee_amount || 0);
        const opLabel =
          tx.payment_kind === 'subscription'
            ? `اشترى باقة (${tx.service_name || subMeta.packageName || 'باقة'})`
            : fee > 0
            ? `عمل ${tx.service_name || 'حلاقة عادية'}`
            : `عمل خدمة إضافية (${tx.service_name || 'إضافية'})`;
        return {
          id: tx.id,
          timeLabel: `${formatDate(tx.payment_date)} · ${formatTimeOnly(tx.payment_date)}`,
          customerName: cName,
          actionSummary: opLabel,
          amount: amt,
          fee,
          net: amt - fee,
          ...subMeta,
        };
      });

      return {
        key,
        label: monthDate.toLocaleDateString('ar-EG', { month: 'long' }),
        shortLabel: monthDate.toLocaleDateString('ar-EG', { month: 'short' }),
        collected,
        fees,
        netBeforeExpenses,
        monthExpenses,
        netAfterExpenses,
        packages,
        regular,
        extras,
        details,
        monthExpensesList,
      };
    });
  }, [reportTransactions, expenses, customerNames, buildCustomerSubMeta]);

  const monthlyMax = Math.max(
    1,
    ...monthlyReport.map((row) => Math.max(row.collected, row.netBeforeExpenses, Math.max(0, row.netAfterExpenses)))
  );

  const dailyReport = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));
      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;

      const dayTx = reportTransactions.filter((transaction) => {
        const date = new Date(transaction.payment_date);
        return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
      });

      const dayVisits = allVisits.filter((v) => {
        const date = new Date(v.visit_date);
        return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
      });

      const dayExpensesList = expenses.filter((exp) => {
        const date = new Date(exp.expense_date);
        return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
      });

      const collected = dayTx.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const fees = dayTx.reduce((sum, row) => sum + Number(row.company_fee_amount || 0), 0);
      const dayExpenses = dayExpensesList.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
      const netBeforeExp = collected - fees;
      const finalDayNet = netBeforeExp - dayExpenses;

      const details: ActivityDetailItem[] = [];

      for (const v of dayVisits) {
        const cName = v.customer_id ? customerNames.get(v.customer_id) ?? 'عميل' : 'عميل';
        const subMeta = buildCustomerSubMeta(v.customer_id, v.subscription_id);
        const amt = Number(v.charge_amount || 0);
        const fee = v.payment_type === 'paid' ? COMPANY_FEE_PER_VISIT : 0;
        details.push({
          id: `visit-${v.id}`,
          timeLabel: formatTimeOnly(v.visit_date),
          customerName: cName,
          actionSummary:
            v.payment_type === 'subscription'
              ? `جالك وعمل ${v.haircut_type || 'حلاقة'} (خصم من الباقة)`
              : `جالك وعمل ${v.haircut_type || 'حلاقة عادية'}`,
          amount: amt,
          fee,
          net: amt - fee,
          ...subMeta,
        });
      }

      for (const tx of dayTx) {
        if (tx.payment_kind === 'subscription') {
          const cName = tx.customer_id ? customerNames.get(tx.customer_id) ?? 'عميل' : 'عميل';
          const subMeta = buildCustomerSubMeta(tx.customer_id, tx.subscription_id);
          const amt = Number(tx.amount || 0);
          const fee = Number(tx.company_fee_amount || 0);
          details.push({
            id: `tx-${tx.id}`,
            timeLabel: formatTimeOnly(tx.payment_date),
            customerName: cName,
            actionSummary: `اشترى ${tx.service_name || subMeta.packageName || 'باقة'}`,
            amount: amt,
            fee,
            net: amt - fee,
            ...subMeta,
          });
        }
      }

      return {
        key,
        label: day.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }),
        shortLabel: day.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }),
        collected,
        fees,
        netBeforeExp,
        dayExpenses,
        finalDayNet,
        count: details.length,
        details,
        dayExpensesList,
      };
    });
  }, [reportTransactions, allVisits, expenses, customerNames, buildCustomerSubMeta]);

  const dailyMax = Math.max(1, ...dailyReport.map((row) => Math.max(row.collected, Math.max(0, row.finalDayNet))));

  const paymentMethodReport = [
    { key: 'cash', label: 'كاش' },
    { key: 'instapay', label: 'InstaPay' },
    { key: 'vodafone_cash', label: 'Vodafone Cash' },
    { key: 'card', label: 'بطاقة بنكية' },
    { key: 'unknown', label: 'غير محدد' },
  ].map((method) => ({
    ...method,
    amount: reportTransactions.filter((row) => row.payment_method === method.key).reduce((sum, row) => sum + Number(row.amount || 0), 0),
  }));
  const paymentMethodMax = Math.max(1, ...paymentMethodReport.map((row) => row.amount));

  const packageSalesRevenue = reportTransactions.filter((row) => row.payment_kind === 'subscription').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const additionalServicesRevenue = reportTransactions.filter((row) => row.payment_kind === 'visit' && Number(row.company_fee_amount || 0) === 0).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const regularVisitsCount = stats?.paidVisits ?? snapshot?.regularVisitsCount ?? 0;
  const subVisitsCount = stats?.subscriptionVisits ?? snapshot?.subscriptionVisitsUsed ?? 0;
  const totalVisitsCompare = Math.max(1, regularVisitsCount + subVisitsCount);

  const activeMonthObj = monthlyReport.find((m) => m.key === expandedMonthKey) ?? null;
  const activeDayObj = dailyReport.find((d) => d.key === expandedDayKey) ?? null;

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 animate-shimmer rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs font-bold text-stone-500">ملخص اليوم</p>
          <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
            محصل: {formatPrice(snapshot?.todayCollected ?? 0)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
            <span className="text-stone-600">رسوم الشركة: {formatPrice(snapshot?.todayFees ?? 0)}</span>
            <span className="text-stone-800">صافي المحل: {formatPrice(snapshot?.todayNetBeforeExpenses ?? 0)}</span>
            <span className="text-red-700">مصروفات اليوم: {formatPrice(snapshot?.todayExpenses ?? 0)}</span>
            <span className="text-emerald-700">ربح المحل النهائي: {formatPrice(snapshot?.todayFinalNet ?? 0)}</span>
          </div>
        </div>

        <div className="card p-5">
          <p className="text-xs font-bold text-stone-500">ملخص الشهر الحالي ومقارنته بالشهر السابق</p>
          <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
            محصل الشهر: {formatPrice(snapshot?.thisMonthCollected ?? 0)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
            <span className="text-stone-600">رسوم الشركة: {formatPrice(snapshot?.thisMonthFees ?? 0)}</span>
            <span className="text-red-700">مصروفات الشهر: {formatPrice(snapshot?.thisMonthExpenses ?? 0)}</span>
            <span className="text-emerald-700">ربح المحل النهائي: {formatPrice(snapshot?.thisMonthFinalNet ?? 0)}</span>
            <span className="text-stone-500">الشهر السابق: {formatPrice(snapshot?.lastMonthFinalNet ?? 0)}</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="text-xs font-bold text-stone-500">من الحلاقات العادية</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {formatPrice(snapshot?.regularPaidRevenue ?? stats.revenueFromPaid)}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-bold text-stone-500">من الاشتراكات والباقات</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {formatPrice(snapshot?.packageSalesRevenue ?? stats.revenueFromSubscriptions)}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-bold text-stone-500">إجمالي التحصيل</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {formatPrice(snapshot?.totalCollected ?? stats.totalRevenue)}
            </p>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 font-display text-base font-extrabold text-stone-900">تفصيل الزيارات والرسوم</h3>
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-stone-200 text-center">
            <div className="px-2">
              <p className="font-display text-2xl font-extrabold text-stone-900">{stats.totalVisits}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">إجمالي الزيارات</p>
            </div>
            <div className="px-2">
              <p className="font-display text-2xl font-extrabold text-emerald-700">{stats.subscriptionVisits}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">بالاشتراك (0 رسوم إضافية)</p>
            </div>
            <div className="px-2">
              <p className="font-display text-2xl font-extrabold text-stone-900">{stats.paidVisits}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">حلاقة عادية</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="grid h-10 w-14 place-items-center rounded-xl bg-stone-900 px-1.5">
              <UlmiWordmark variant="dark" size="sm" />
            </div>
            <div>
              <h3 className="flex items-center gap-1.5 font-display text-base font-extrabold text-stone-900">
                <span>رسوم</span>
                <UlmiWordmark variant="light" size="sm" />
                <span>ومصروفات المحل</span>
              </h3>
              <p className="text-xs text-stone-500">
                حلاقة عادية: {formatPrice(COMPANY_FEE_PER_VISIT)} · تُخصم رسوم الشركة ثم مصروفات المحل من إجمالي التحصيل
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="text-xs font-bold text-stone-600">رسوم الشركة المستحقة</span>
              <span className="font-bold text-stone-900">{formatPrice(snapshot?.totalCompanyFees ?? stats.companyFee)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="text-xs font-bold text-stone-600">صافي المحل (قبل المصروفات)</span>
              <span className="font-bold text-stone-900">{formatPrice(snapshot?.netBeforeExpenses ?? stats.netRevenue)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/50 px-4 py-3">
              <span className="text-xs font-bold text-red-800">إجمالي مصروفات المحل</span>
              <span className="font-bold text-red-700">− {formatPrice(snapshot?.totalExpenses ?? 0)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50/80 px-5 py-4">
          <div>
            <p className="font-bold text-stone-900">ربح المحل النهائي (بعد رسوم الشركة ومصروفات المحل)</p>
            <p className="text-xs text-stone-500">إجمالي التحصيل − رسوم الشركة − مصروفات المحل</p>
          </div>
          <p
            className={`font-display text-2xl font-extrabold ${
              (snapshot?.finalNetProfit ?? stats.netRevenue) >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatPrice(snapshot?.finalNetProfit ?? stats.netRevenue)}
          </p>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-stone-900 text-white">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-extrabold text-stone-900">مصروفات المحل (مناديل، فوط، أمواس...)</h3>
              <p className="text-xs text-stone-500">تُخصم من صافي المحل وتظهر في عمود الربح النهائي بالجراف</p>
            </div>
          </div>

          <button type="button" onClick={onOpenAddExpense} className="btn-primary h-10 px-4 text-xs">
            <PlusCircle className="h-4 w-4" />
            <span>إضافة مصروف جديد</span>
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">مصروفات اليوم</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(snapshot?.todayExpenses ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">مصروفات هذا الشهر</p>
            <p className="mt-1 text-lg font-extrabold text-red-700">{formatPrice(snapshot?.thisMonthExpenses ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">إجمالي المصروفات</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(snapshot?.totalExpenses ?? 0)}</p>
          </div>
        </div>

        {expenses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">
            لا توجد مصروفات مسجلة بعد. اضغط على «إضافة مصروف جديد» لتسجيل شراء مناديل أو فوط أو أمواس.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[620px] text-right text-sm">
              <thead className="bg-stone-50 text-xs text-stone-600">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">البند</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">المبلغ</th>
                  <th className="p-3">ملاحظات</th>
                  <th className="p-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} className="border-t border-stone-100">
                    <td className="whitespace-nowrap p-3 text-xs text-stone-600">{formatDate(exp.expense_date)}</td>
                    <td className="p-3 font-bold text-stone-900">{exp.title}</td>
                    <td className="p-3">
                      <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">{exp.category}</span>
                    </td>
                    <td className="whitespace-nowrap p-3 font-extrabold text-red-700">− {formatPrice(exp.amount)}</td>
                    <td className="p-3 text-xs text-stone-500">{exp.notes || '—'}</td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        disabled={deletingExpenseId === exp.id}
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        title="حذف المصروف"
                      >
                        {deletingExpenseId === exp.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-6 p-5">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-5 w-5 text-stone-700" />
          <div>
            <h3 className="font-display text-base font-extrabold text-stone-900">التقارير والرسوم البيانية ومقارنة الفترات</h3>
            <p className="mt-0.5 text-xs text-stone-500">يوضح الجراف إجمالي التحصيل، صافي المحل قبل المصروفات، وربح المحل النهائي بعد المصروفات.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
            <p className="text-xs font-bold text-stone-500">مبيعات الباقات</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(packageSalesRevenue)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
            <p className="text-xs font-bold text-stone-500">الخدمات الإضافية (0 رسوم شركة)</p>
            <p className="mt-1 text-lg font-extrabold text-emerald-700">{formatPrice(additionalServicesRevenue)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
            <p className="text-xs font-bold text-stone-500">ربح المحل النهائي (هذا الشهر مقابل السابق)</p>
            <p className="mt-1 text-sm font-extrabold text-stone-900">
              {formatPrice(snapshot?.thisMonthFinalNet ?? 0)} مقابل {formatPrice(snapshot?.lastMonthFinalNet ?? 0)}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">التحصيل وصافي المحل وربح المحل النهائي (بعد المصروفات) — آخر 6 أشهر</h4>
            <div className="flex h-48 items-end gap-3 border-b border-stone-200 pb-2">
              {monthlyReport.map((month, idx) => (
                <div key={`${month.label}-${idx}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      title={`إجمالي التحصيل: ${formatPrice(month.collected)}`}
                      className="w-1/3 max-w-4 rounded-t bg-stone-900 transition-all"
                      style={{ height: `${Math.max(2, (month.collected / monthlyMax) * 100)}%` }}
                    />
                    <div
                      title={`صافي المحل (قبل المصروفات): ${formatPrice(month.netBeforeExpenses)}`}
                      className="w-1/3 max-w-4 rounded-t bg-stone-400 transition-all"
                      style={{ height: `${Math.max(2, (Math.max(0, month.netBeforeExpenses) / monthlyMax) * 100)}%` }}
                    />
                    <div
                      title={`ربح المحل النهائي (بعد المصروفات): ${formatPrice(month.netAfterExpenses)} · مصروفات: ${formatPrice(month.monthExpenses)}`}
                      className={`w-1/3 max-w-4 rounded-t transition-all ${
                        month.netAfterExpenses >= 0 ? 'bg-emerald-600' : 'bg-red-500'
                      }`}
                      style={{ height: `${Math.max(2, (Math.max(0, month.netAfterExpenses) / monthlyMax) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-stone-500">{month.shortLabel}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-stone-600">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-stone-900" /> إجمالي التحصيل
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-stone-400" /> صافي المحل (قبل المصروفات)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> ربح المحل النهائي (بعد المصروفات)
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">التحصيل وربح المحل النهائي (بعد المصروفات) — آخر 7 أيام</h4>
            <div className="flex h-48 items-end gap-2 border-b border-stone-200 pb-2">
              {dailyReport.map((day, idx) => (
                <div key={`${day.label}-${idx}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      title={`${day.label} — تحصيل: ${formatPrice(day.collected)}`}
                      className="w-1/2 max-w-4 rounded-t bg-stone-800"
                      style={{ height: `${Math.max(3, (day.collected / dailyMax) * 100)}%` }}
                    />
                    <div
                      title={`${day.label} — ربح نهائي بعد المصروفات: ${formatPrice(day.finalDayNet)}`}
                      className={`w-1/2 max-w-4 rounded-t ${day.finalDayNet >= 0 ? 'bg-emerald-600' : 'bg-red-500'}`}
                      style={{ height: `${Math.max(3, (Math.max(0, day.finalDayNet) / dailyMax) * 100)}%` }}
                    />
                  </div>
                  <span className="truncate text-[9px] font-bold text-stone-500">{day.shortLabel.split(' ')[0]}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-stone-800" /> التحصيل
                <i className="mr-2 h-2.5 w-2.5 rounded-sm bg-emerald-600" /> ربح المحل النهائي
              </span>
              <span>صافي ربح 7 أيام: {formatPrice(dailyReport.reduce((s, d) => s + d.finalDayNet, 0))}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">توزيع التحصيل حسب طريقة الدفع</h4>
            <div className="space-y-3">
              {paymentMethodReport.map((method) => (
                <div key={method.key}>
                  <div className="mb-1 flex justify-between gap-2 text-xs">
                    <span className="font-bold text-stone-700">{method.label}</span>
                    <span className="text-stone-600">{formatPrice(method.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-stone-800" style={{ width: `${(method.amount / paymentMethodMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">مقارنة الزيارات العادية مقابل زيارات الباقات</h4>
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-xs font-bold">
                  <span className="text-stone-800">زيارات عادية مدفوعة</span>
                  <span>{regularVisitsCount} زيارة</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-stone-800" style={{ width: `${(regularVisitsCount / totalVisitsCompare) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs font-bold">
                  <span className="text-emerald-800">زيارات من الباقات</span>
                  <span>{subVisitsCount} زيارة</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(subVisitsCount / totalVisitsCompare) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-stone-700" />
              <h4 className="text-xs font-extrabold text-stone-900">ملخص آخر 6 أشهر (اضغط على الشهر للتفاصيل)</h4>
            </div>
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-stone-600">
              شبكة الشهور
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {monthlyReport.map((month) => {
              const isSelected = expandedMonthKey === month.key;
              const hasActivity = month.details.length > 0 || month.collected > 0 || month.monthExpenses > 0;
              return (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => setExpandedMonthKey(isSelected ? null : month.key)}
                  className={`flex flex-col justify-between rounded-xl border p-3 text-right transition ${
                    isSelected
                      ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                      : hasActivity
                      ? 'border-emerald-200/90 bg-white text-stone-900 hover:border-emerald-300'
                      : 'border-stone-200/80 bg-white/75 text-stone-600 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-extrabold">{month.label}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        isSelected
                          ? 'bg-white/15 text-stone-100'
                          : hasActivity
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {month.details.length} عملية
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1 border-t border-current/10 pt-2 text-[11px] tabular-nums">
                    <div className="flex justify-between">
                      <span>تحصيل: <strong>{formatPrice(month.collected)}</strong></span>
                      <span className={isSelected ? 'text-red-300' : 'text-red-700'}>
                        مصروفات: <strong>{formatPrice(month.monthExpenses)}</strong>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>قبل المصروف: <strong>{formatPrice(month.netBeforeExpenses)}</strong></span>
                      <span className={isSelected ? 'text-emerald-300' : 'text-emerald-700'}>
                        الربح النهائي: <strong>{formatPrice(month.netAfterExpenses)}</strong>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {activeMonthObj && (
            <div className="space-y-2.5 rounded-xl border border-stone-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                <p className="text-xs font-extrabold text-stone-900">تفاصيل شهر {activeMonthObj.label}</p>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold text-stone-600">
                  <span>رسوم الشركة: {formatPrice(activeMonthObj.fees)}</span>
                  <span>·</span>
                  <span className="text-red-700">مصروفات المحل: {formatPrice(activeMonthObj.monthExpenses)}</span>
                  <span>·</span>
                  <span className="text-emerald-700">الربح النهائي: {formatPrice(activeMonthObj.netAfterExpenses)}</span>
                </div>
              </div>

              {activeMonthObj.monthExpensesList.length > 0 && (
                <div className="rounded-lg border border-red-200/80 bg-red-50/40 p-2.5 text-xs">
                  <p className="mb-1.5 font-extrabold text-red-900">مصروفات هذا الشهر:</p>
                  <div className="flex flex-wrap gap-2">
                    {activeMonthObj.monthExpensesList.map((e) => (
                      <span key={e.id} className="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-800">
                        {e.title}: −{formatPrice(e.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeMonthObj.details.length === 0 ? (
                <p className="text-xs text-stone-500">لا توجد عمليات تحصيل مسجلة في هذا الشهر.</p>
              ) : (
                <div className="space-y-2">
                  {activeMonthObj.details.map((item) => (
                    <div key={item.id} className="space-y-1 rounded-lg border border-stone-200/90 bg-stone-50/70 p-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-extrabold text-stone-900">
                          {item.customerName} — {item.actionSummary}
                        </span>
                        <span className="text-[11px] font-bold text-stone-500">{item.timeLabel}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                        <span>المبلغ: <strong>{formatPrice(item.amount)}</strong></span>
                        <span>·</span>
                        <span>رسوم: <strong>{formatPrice(item.fee)}</strong></span>
                        <span>·</span>
                        <span className="text-emerald-700">صافي العملية: <strong>{formatPrice(item.net)}</strong></span>
                      </div>
                      <div className="pt-0.5 text-[11px]">
                        {item.isSubscribed ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 ring-1 ring-emerald-200">
                            <span>مشترك في باقة: {item.packageName}</span>
                            <span>· سعرها: {formatPrice(item.packagePrice ?? 0)}</span>
                            <span>· خلص منها: {item.packageUsed ?? 0} من {item.packageTotal ?? 0} زيارة</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-stone-200/70 px-2 py-0.5 font-bold text-stone-700">
                            غير مشترك في باقة
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-700" />
              <h4 className="text-xs font-extrabold text-stone-900">ملخص آخر 7 أيام (اضغط على اليوم لعرض مين جالك والمصروفات)</h4>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              سجل يومي تفاعلي
            </span>
          </div>

          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/90 bg-stone-50/40">
            {dailyReport.map((day) => {
              const isOpen = expandedDayKey === day.key;
              return (
                <div key={day.key}>
                  <button
                    type="button"
                    onClick={() => setExpandedDayKey(isOpen ? null : day.key)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-right transition hover:bg-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${day.count > 0 || day.dayExpenses > 0 ? 'bg-emerald-600' : 'bg-stone-300'}`} />
                      <span className="text-xs font-extrabold text-stone-900">{day.label}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-600 ring-1 ring-stone-200">
                        {day.count} حركة
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                      <span className="text-stone-700">تحصيل: <strong>{formatPrice(day.collected)}</strong></span>
                      {day.dayExpenses > 0 && (
                        <span className="text-red-700">مصروف: <strong>−{formatPrice(day.dayExpenses)}</strong></span>
                      )}
                      <span className="text-emerald-700">الربح النهائي: <strong>{formatPrice(day.finalDayNet)}</strong></span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-stone-500" /> : <ChevronDown className="h-4 w-4 text-stone-500" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="space-y-2 border-t border-stone-200/80 bg-white p-3">
                      {day.dayExpensesList.length > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50/50 p-2.5 text-xs">
                          <p className="mb-1 font-extrabold text-red-900">مصروفات هذا اليوم:</p>
                          <div className="flex flex-wrap gap-2">
                            {day.dayExpensesList.map((e) => (
                              <span key={e.id} className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-red-800 ring-1 ring-red-200">
                                {e.title}: −{formatPrice(e.amount)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {day.details.length === 0 ? (
                        <p className="text-xs text-stone-500">لا توجد زيارات أو عمليات تحصيل في هذا اليوم.</p>
                      ) : (
                        day.details.map((item) => (
                          <div key={item.id} className="space-y-1 rounded-lg border border-stone-200 bg-stone-50/60 p-2.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-extrabold text-stone-900">
                                {item.customerName} — {item.actionSummary}
                              </span>
                              <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-stone-600 ring-1 ring-stone-200">
                                الساعة {item.timeLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                              <span>المبلغ: <strong>{formatPrice(item.amount)}</strong></span>
                              <span>·</span>
                              <span>رسوم الشركة: <strong>{formatPrice(item.fee)}</strong></span>
                              <span>·</span>
                              <span className="text-emerald-700">صافي العملية: <strong>{formatPrice(item.net)}</strong></span>
                            </div>
                            <div className="pt-0.5 text-[11px]">
                              {item.isSubscribed ? (
                                <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 ring-1 ring-emerald-200">
                                  <span>مشترك في باقة: {item.packageName}</span>
                                  <span>· سعرها: {formatPrice(item.packagePrice ?? 0)}</span>
                                  <span>· خلص منها: {item.packageUsed ?? 0} من {item.packageTotal ?? 0} زيارة</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-stone-200/70 px-2 py-0.5 font-bold text-stone-700">
                                  غير مشترك في باقة
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-extrabold text-stone-900">سجل العمليات والتحصيلات</h3>
            <p className="mt-0.5 text-xs text-stone-500">كل عملية مالية مع الفلاتر الكاملة. استخدام زيارة الباقة وحده لا يُسجّل كتحصيل جديد.</p>
          </div>
          <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-700">
            {filteredTransactions.length} عملية
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">إجمالي التحصيلات المسجلة حسب الفلاتر</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(filteredCollected)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">رسوم الشركة</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(filteredFees)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
            <p className="text-xs font-bold text-emerald-800">صافي المحل بعد الرسوم (قبل المصروفات)</p>
            <p className="mt-1 text-lg font-extrabold text-emerald-700">{formatPrice(filteredNet)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="input bg-white" placeholder="بحث باسم العميل" />
          <select value={operationFilter} onChange={(e) => setOperationFilter(e.target.value)} className="input bg-white">
            <option value="all">كل أنواع العمليات</option>
            <option value="regular">حلاقة عادية مدفوعة</option>
            <option value="subscription">بيع باقة / اشتراك</option>
            <option value="extra">خدمة إضافية (0 رسوم شركة)</option>
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="input bg-white">
            <option value="all">كل طرق الدفع</option>
            <option value="cash">كاش</option>
            <option value="instapay">InstaPay</option>
            <option value="vodafone_cash">Vodafone Cash</option>
            <option value="card">بطاقة بنكية</option>
            <option value="unknown">غير محدد</option>
          </select>
          <label className="text-xs font-bold text-stone-600">
            من تاريخ
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input mt-1 bg-white" />
          </label>
          <label className="text-xs font-bold text-stone-600">
            إلى تاريخ
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input mt-1 bg-white" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input bg-white">
            <option value="all">كل الحالات</option>
            <option value="recorded">مسجل</option>
            <option value="refunded">مسترد</option>
            <option value="void">ملغي</option>
          </select>
        </div>

        {ledgerLoading ? (
          <div className="h-28 animate-shimmer rounded-xl" />
        ) : ledgerError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">تعذر تحميل سجل التحصيلات: {ledgerError}</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">لا توجد عمليات مطابقة للفلاتر الحالية.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[850px] text-right text-sm">
              <thead className="bg-stone-50 text-xs text-stone-600">
                <tr>
                  <th className="p-3">التاريخ والوقت</th>
                  <th className="p-3">اسم العميل</th>
                  <th className="p-3">نوع العملية</th>
                  <th className="p-3">المبلغ المحصل</th>
                  <th className="p-3">رسوم الشركة</th>
                  <th className="p-3">صافي المحل</th>
                  <th className="p-3">طريقة الدفع</th>
                  <th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => {
                  const customerName = transaction.customer_id ? customerNames.get(transaction.customer_id) ?? 'عميل غير معروف' : '—';
                  const isPackage = transaction.payment_kind === 'subscription';
                  const fee = Number(transaction.company_fee_amount || 0);
                  const amount = Number(transaction.amount || 0);
                  const operationLabel = isPackage ? 'بيع باقة' : fee > 0 ? 'حلاقة عادية' : 'خدمة إضافية';
                  const methodLabel: Record<string, string> = {
                    cash: 'كاش',
                    instapay: 'InstaPay',
                    vodafone_cash: 'Vodafone Cash',
                    card: 'بطاقة بنكية',
                    unknown: 'غير محدد',
                  };
                  const statusLabel: Record<string, string> = { recorded: 'مسجل', refunded: 'مسترد', void: 'ملغي' };
                  const active = transaction.payment_status === 'recorded';
                  return (
                    <tr key={transaction.id} className="border-t border-stone-100">
                      <td className="whitespace-nowrap p-3 text-xs text-stone-600">{formatDateTime(transaction.payment_date)}</td>
                      <td className="p-3 font-bold text-stone-800">{customerName}</td>
                      <td className="p-3">
                        <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-800">{operationLabel}</span>
                        {transaction.service_name && <p className="mt-1 text-xs text-stone-500">{transaction.service_name}</p>}
                      </td>
                      <td className="whitespace-nowrap p-3 font-bold">{formatPrice(amount)}</td>
                      <td className="whitespace-nowrap p-3 text-stone-600">{formatPrice(fee)}</td>
                      <td className="whitespace-nowrap p-3 font-bold text-emerald-700">{formatPrice(active ? amount - fee : 0)}</td>
                      <td className="whitespace-nowrap p-3 text-xs">{methodLabel[transaction.payment_method] ?? transaction.payment_method}</td>
                      <td className="p-3">
                        <span className={`rounded-lg px-2 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-stone-100 text-stone-600'}`}>
                          {statusLabel[transaction.payment_status] ?? transaction.payment_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h3 className="mb-3.5 font-display text-base font-extrabold text-stone-900">ماذا تستفيد من النظام؟</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Zap, title: 'تتبع فوري للزيارات', desc: 'سجل دقيق لكل عميل وزيارة دون دفاتر ورقية' },
            { icon: CalendarClock, title: 'تنبيهات الاشتراكات', desc: 'متابعة الاشتراكات القريبة من الانتهاء والمنتهية' },
            { icon: Award, title: 'نظام ولاء تلقائي', desc: 'احتساب الزيارات الفعلية ومستويات الولاء للعملاء' },
            { icon: Wallet, title: 'حساب الأرباح والمصروفات', desc: 'وضوح كامل للتحصيل، رسوم الشركة، المصروفات، والربح النهائي' },
            { icon: Sparkles, title: 'خدمات إضافية مرنة', desc: 'تسجيل خدمة إضافية أثناء زيارة الباقة لصالح المحل بالكامل' },
            { icon: Building2, title: 'دعم ومزامنة', desc: 'حفظ آمن للبيانات ومتابعة تشغيلية مستمرة' },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-900 text-white">
                <f.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-stone-900">{f.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- Add customer modal ---------- */
function AddCustomerModal({
  shopId,
  open,
  onClose,
  onCreated,
}: {
  shopId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!name.trim()) {
      setErr('الاسم مطلوب');
      return;
    }
    if (!phone.trim()) {
      setErr('رقم الهاتف مطلوب — يستخدمه العميل للدخول لصفحته');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await createCustomer(name.trim(), phone.trim() || undefined, notes.trim() || undefined, shopId);
      setName('');
      setPhone('');
      setNotes('');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="إضافة عميل جديد">
      <div className="space-y-4">
        <div>
          <label className="label">اسم العميل *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="مثال: أحمد محمد" />
        </div>
        <div>
          <label className="label">رقم الهاتف *</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="01xxxxxxxxx" dir="ltr" />
          <p className="mt-1 text-xs text-stone-500">مطلوب — يستخدمه العميل للدخول لصفحته</p>
        </div>
        <div>
          <label className="label">ملاحظات</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-20 resize-none" placeholder="ملاحظات اختيارية" />
        </div>
        {err && <p className="text-sm font-bold text-red-600">{err}</p>}
        <div className="flex gap-3">
          <button onClick={submit} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
          <button onClick={onClose} className="btn-ghost">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Customer drawer (full management with loyalty, subscriptions, visits & actions) ---------- */
function CustomerDrawer({
  shopId,
  regularHaircutPrice,
  customer,
  onClose,
  onChanged,
}: {
  shopId: string;
  regularHaircutPrice: number;
  customer: Customer | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pointsBalance, setPointsBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    const [s, v, p, ledgerRes] = await Promise.all([
      getActiveSubscription(customer.id),
      getVisitsByCustomer(customer.id),
      getPlans(shopId),
      supabase.from('points_ledger').select('points_delta').eq('customer_id', customer.id),
    ]);
    setSub(s);
    setVisits(v);
    setPlans(p);
    const totalPts = (ledgerRes.data ?? []).reduce((acc, row) => acc + Number(row.points_delta || 0), 0);
    setPointsBalance(totalPts);
    setLoading(false);
  }, [customer, shopId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!customer) return null;

  const active = sub?.status === 'active';
  const remaining = sub && sub.plan ? Math.max(0, sub.plan.haircut_count - sub.haircuts_used) : 0;
  const totalPaid = visits.filter((v) => v.payment_type === 'paid').reduce((s, v) => s + Number(v.charge_amount), 0);
  const daysLeft = sub ? Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000) : 0;

  const handleBlockToggle = async () => {
    if (!customer) return;
    setActionLoading(true);
    try {
      if (customer.is_blocked) {
        await unblockCustomer(customer.id);
      } else {
        await blockCustomer(customer.id);
      }
      onChanged();
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    setActionLoading(true);
    try {
      await deleteCustomer(customer.id);
      onChanged();
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal open={!!customer} onClose={onClose} title={customer.name} maxWidth="max-w-2xl">
      <div className="space-y-5">
        {customer.is_blocked && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            <Ban className="h-4 w-4" />
            هذا العميل محظور — لا يمكنه الدخول لصفحته ولا تسجيل زياراته
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {customer.phone && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-bold text-stone-700">
              <Phone className="h-3.5 w-3.5" />
              <span dir="ltr">{customer.phone}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-stone-600">
            <Clock className="h-3.5 w-3.5" />
            عميل منذ {formatDate(customer.created_at)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-bold text-stone-800">
            <Award className="h-3.5 w-3.5" />
            رصيد الولاء: {pointsBalance} نقطة
          </span>
        </div>
        {customer.notes && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">{customer.notes}</div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-stone-900">{visits.length}</p>
            <p className="mt-0.5 text-[11px] font-bold text-stone-500">إجمالي الزيارات الفعلية</p>
          </div>
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-stone-900">
              {visits.length >= 20 ? 'ذهبي' : visits.length >= 10 ? 'فضي' : visits.length >= 5 ? 'برونزي' : 'جديد'}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-stone-500">مستوى الولاء</p>
          </div>
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-stone-900">{formatPrice(totalPaid)}</p>
            <p className="mt-0.5 text-[11px] font-bold text-stone-500">مدفوع زيارات عادية</p>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${active ? 'border-emerald-200 bg-emerald-50/40' : 'border-stone-200 bg-stone-50/60'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {active ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              ) : (
                <XCircle className="h-5 w-5 text-stone-400" />
              )}
              <span className="text-sm font-bold text-stone-900">
                {active ? 'مشترك — اشتراك نشط' : 'غير مشترك حالياً'}
              </span>
            </div>
            <button
              onClick={() => setSubOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-bold text-white"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              {active ? 'تجديد / باقة جديدة' : 'إضافة اشتراك'}
            </button>
          </div>
          {active && sub && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-stone-500">الباقة</p>
                <p className="font-bold text-stone-800">{sub.plan?.name}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500">المتبقي</p>
                <p className="font-bold text-emerald-700">{remaining} حلاقة</p>
              </div>
              <div>
                <p className="text-xs text-stone-500">تنتهي في</p>
                <p className="font-bold text-stone-800">{formatDate(sub.end_date)}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500">المدة المتبقية</p>
                <p className={`font-bold ${daysLeft <= 3 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {daysLeft > 0 ? `${daysLeft} يوم` : 'انتهى'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-stone-700" />
              <span className="text-sm font-bold text-stone-900">تسجيل زيارة / حلاقة عادية / خدمة إضافية</span>
            </div>
            <button onClick={() => setVisitOpen(true)} disabled={customer.is_blocked} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
              تسجيل زيارة
            </button>
          </div>
          {customer.is_blocked ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
              <Ban className="h-3.5 w-3.5" />
              العميل محظور — لا يمكن تسجيل زيارات
            </p>
          ) : active && remaining > 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-600">
              <Info className="h-3.5 w-3.5 shrink-0" />
              يمكن خصم زيارة من الباقة ({remaining} متبقية) بدون رسوم إضافية أو إضافة خدمة إضافية بالكامل للمحل، أو تسجيل حلاقة عادية برسوم {formatPrice(COMPANY_FEE_PER_VISIT)}
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-600">
              <Info className="h-3.5 w-3.5 shrink-0" />
              حلاقة عادية للعميل غير المشترك بقيمة {formatPrice(regularHaircutPrice)} — رسوم الشركة {formatPrice(COMPANY_FEE_PER_VISIT)} وتُحسب في الولاء
            </p>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-bold text-stone-900">سجل الزيارات</h4>
          {loading ? (
            <div className="h-32 animate-shimmer rounded-xl" />
          ) : visits.length === 0 ? (
            <div className="card p-6 text-center text-sm text-stone-500">لا توجد زيارات مسجلة</div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pl-1">
              {visits.map((v) => (
                <div key={v.id} className="card flex items-center gap-3 p-3">
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                      v.payment_type === 'subscription' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-800'
                    }`}
                  >
                    {v.payment_type === 'subscription' ? <CheckCircle2 className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-800">{v.haircut_type ?? 'حلاقة'}</p>
                    <p className="text-xs text-stone-500">{formatDateTime(v.visit_date)}</p>
                  </div>
                  {v.payment_type === 'subscription' ? (
                    <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">اشتراك</span>
                  ) : (
                    <span className="font-bold text-stone-900">{formatPrice(Number(v.charge_amount))}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-red-200/80 bg-red-50/30 p-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-red-700">
            <ShieldAlert className="h-4 w-4" />
            إجراءات إدارية
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleBlockToggle}
              disabled={actionLoading}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                customer.is_blocked
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              <Ban className="h-3.5 w-3.5" />
              {customer.is_blocked ? 'فك الحظر' : 'حظر العميل'}
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف العميل
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-red-600">متأكد؟ كل البيانات هتتمسح</span>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  نعم احذف
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600">
                  إلغاء
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SubscribeModal
        open={subOpen}
        onClose={() => setSubOpen(false)}
        plans={plans}
        onSubscribe={async (planId, paymentMethod) => {
          await createSubscription(customer.id, planId, shopId, paymentMethod);
          setSubOpen(false);
          await load();
          onChanged();
        }}
      />
      <RecordVisitModal
        regularHaircutPrice={regularHaircutPrice}
        open={visitOpen}
        onClose={() => setVisitOpen(false)}
        active={active}
        remaining={remaining}
        onRecord={async (opts) => {
          await recordVisit(customer.id, { ...opts, shopId });
          setVisitOpen(false);
          await load();
          onChanged();
        }}
      />
    </Modal>
  );
}

function SubscribeModal({
  open,
  onClose,
  plans,
  onSubscribe,
}: {
  open: boolean;
  onClose: () => void;
  plans: Plan[];
  onSubscribe: (planId: string, paymentMethod: PaymentMethod) => Promise<void>;
}) {
  const [planId, setPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && plans.length) setPlanId(plans[0].id);
  }, [open, plans]);

  const submit = async () => {
    if (!planId) return;
    setSaving(true);
    try {
      await onSubscribe(planId, paymentMethod);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="اختر باقة الاشتراك">
      <div className="space-y-3">
        {plans.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlanId(p.id)}
            className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-right transition ${
              planId === p.id ? 'border-stone-900 bg-stone-50' : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                planId === p.id ? 'border-stone-900 bg-stone-900' : 'border-stone-300'
              }`}
            >
              {planId === p.id && <CheckCircle2 className="h-3 w-3 text-white" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-stone-900">{p.name}</p>
              <p className="text-xs text-stone-500">{p.description ?? ''}</p>
            </div>
            <div className="text-left">
              <p className="font-bold text-stone-900">{formatPrice(p.price)}</p>
              <p className="text-[11px] text-stone-500">{p.haircut_count} حلاقة / {p.duration_days} يوم</p>
            </div>
          </button>
        ))}
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
          <label className="label">طريقة دفع الاشتراك بالكامل *</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="input bg-white">
            <option value="cash">كاش</option>
            <option value="instapay">InstaPay</option>
            <option value="vodafone_cash">Vodafone Cash</option>
            <option value="card">بطاقة بنكية</option>
          </select>
          <p className="mt-1.5 text-xs text-stone-500">يتم تسجيل قيمة الباقة كاملة عند التفعيل، ورسوم الشركة للباقة تُحسب مرة واحدة عند البيع.</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={submit} disabled={saving || !planId} className="btn-primary flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {saving ? 'جاري...' : 'تفعيل الاشتراك'}
          </button>
          <button onClick={onClose} className="btn-ghost">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RecordVisitModal({
  regularHaircutPrice,
  open,
  onClose,
  active,
  remaining,
  initialForcePaid,
  onRecord,
}: {
  regularHaircutPrice: number;
  open: boolean;
  onClose: () => void;
  active: boolean;
  remaining: number;
  initialForcePaid?: boolean;
  onRecord: (opts: { haircutType: string; serviceName: string; customCharge: number; notes: string; forcePaid: boolean; paymentMethod: PaymentMethod }) => Promise<void>;
}) {
  const [serviceName, setServiceName] = useState('حلاقة عامة');
  const [notes, setNotes] = useState('');
  const [forcePaid, setForcePaid] = useState(false);
  const [customCharge, setCustomCharge] = useState(regularHaircutPrice);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setServiceName('حلاقة عامة');
    setNotes('');
    setForcePaid(!!initialForcePaid);
    setCustomCharge(active && remaining > 0 && !initialForcePaid ? 0 : regularHaircutPrice);
    setPaymentMethod('cash');
  }, [open, initialForcePaid, active, remaining, regularHaircutPrice]);

  const canUseSub = active && remaining > 0 && !forcePaid;

  const submit = async () => {
    setSaving(true);
    try {
      await onRecord({ haircutType: serviceName, serviceName, customCharge: Number(customCharge), notes, forcePaid, paymentMethod });
      setNotes('');
      setForcePaid(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="تسجيل زيارة" maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="label">اسم الخدمة *</label>
          <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="input" placeholder="مثال: حلاقة، تنظيف بشرة، تهذيب لحية" />
        </div>

        {active && remaining > 0 && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={forcePaid}
                onChange={(e) => {
                  setForcePaid(e.target.checked);
                  setCustomCharge(e.target.checked ? regularHaircutPrice : 0);
                }}
                className="h-4 w-4 accent-stone-900"
              />
              <span className="text-sm font-bold text-stone-700">احتسابها كحلاقة عادية (لا تخصم من الاشتراك)</span>
            </label>
          </div>
        )}

        <div className={`rounded-xl border p-3 text-xs font-bold leading-relaxed ${canUseSub ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800' : 'border-stone-200 bg-stone-50 text-stone-800'}`}>
          {canUseSub ? (
            <span className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              زيارة من الباقة ({remaining} متبقية): صفر رسوم إضافية، وأي خدمة إضافية تذهب بالكامل للمحل
            </span>
          ) : (
            <span className="flex items-start gap-1.5">
              <Coins className="mt-0.5 h-4 w-4 shrink-0 text-stone-700" />
              حلاقة عادية مدفوعة — رسوم الشركة {formatPrice(COMPANY_FEE_PER_VISIT)} والصافي ({formatPrice(Math.max(0, Number(customCharge) - COMPANY_FEE_PER_VISIT))})
            </span>
          )}
        </div>

        <div>
          <label className="label">{canUseSub ? 'قيمة خدمة إضافية أثناء الباقة (اختياري — 0 إذا لا يوجد)' : 'سعر الحلاقة العادية *'}</label>
          <input type="number" min={canUseSub ? 0 : 0.01} step="0.01" value={customCharge} onChange={(e) => setCustomCharge(Number(e.target.value))} className="input" />
        </div>

        {(!canUseSub || Number(customCharge) > 0) && (
          <div>
            <label className="label">طريقة الدفع *</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="input">
              <option value="cash">كاش</option>
              <option value="instapay">InstaPay</option>
              <option value="vodafone_cash">Vodafone Cash</option>
              <option value="card">بطاقة بنكية</option>
            </select>
          </div>
        )}

        <div>
          <label className="label">ملاحظات</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-16 resize-none" placeholder="اختياري" />
        </div>

        <div className="flex gap-3">
          <button
            onClick={submit}
            disabled={
              saving ||
              !serviceName.trim() ||
              (!canUseSub && (!Number.isFinite(Number(customCharge)) || Number(customCharge) <= 0)) ||
              (canUseSub && (!Number.isFinite(Number(customCharge)) || Number(customCharge) < 0))
            }
            className="btn-primary flex-1"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            {saving ? 'جاري التسجيل...' : 'تأكيد التسجيل'}
          </button>
          <button onClick={onClose} className="btn-ghost">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  UserPlus,
  Scissors,
  CalendarPlus,
  Award,
  Phone,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Loader2,
  Users,
  TrendingUp,
  Receipt,
  Info,
  Ban,
  ShieldAlert,
  Building2,
  Wallet,
  CalendarClock,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  Zap,
  LogOut,
  FileText,
  Lock,
  ShieldCheck,
  Settings,
  BarChart3,
  Layers,
  ChevronDown,
  ChevronUp,
  Calendar,
  PlusCircle,
  ShoppingBag,
  BellRing,
  Volume2,
  Ticket,
} from 'lucide-react';
import Modal from '@/components/Modal';
import {
  getShopCustomers,
  searchShopCustomersByName,
  createCustomer,
  createSubscription,
  recordVisit,
  getActiveSubscription,
  getVisitsByCustomer,
  getPlans,
  getShopRegularHaircutPrice,
  getRevenueStats,
  getShopActivityData,
  getShopPaymentTransactions,
  getShopBookings,
  updateBookingStatus,
  completeBookingAsVisit,
  blockCustomer,
  unblockCustomer,
  deleteCustomer,
  deleteVisit,
  supabaseUpdateSubscriptionUsage,
  formatPrice,
  formatDate,
  formatDateTime,
  type Customer,
  type Subscription,
  type Visit,
  type Plan,
  type Booking,
  type RevenueStats,
  type SubscriptionAlert,
  type PaymentMethod,
} from '@/lib/api';
import { enableShopBookingPush, playBookingAlertSound, registerServiceWorker } from '@/lib/bookingPush';
import { REGULAR_HAIRCUT_PRICE, COMPANY_FEE_PER_VISIT, SYSTEM_NAME, supabase } from '@/lib/supabase';
import { getShopById } from '@/lib/shopApi';
import ShopSettingsTab from '@/components/ShopSettingsTab';

const BRAND_NAME = 'ulmi';
const CONTRACT_VERSION = 'v2.0-ulmi';

type Tab = 'overview' | 'bookings' | 'customers' | 'visits' | 'subscriptions' | 'revenue' | 'settings';

type LedgerTx = {
  id: string;
  shop_id: string | null;
  customer_id: string | null;
  visit_id: string | null;
  subscription_id: string | null;
  payment_kind: 'visit' | 'subscription' | 'other';
  amount: number;
  company_fee_amount: number;
  service_name: string | null;
  payment_method: string;
  payment_status: 'recorded' | 'refunded' | 'void';
  payment_date: string;
  notes: string | null;
};

type ShopExpenseItem = {
  id: string;
  shop_id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at?: string;
};

type ShopFinancialSnapshot = {
  transactions: LedgerTx[];
  recordedTransactions: LedgerTx[];
  subscriptions: Subscription[];
  visits: Visit[];
  expenses: ShopExpenseItem[];
  totalCollected: number;
  totalCompanyFees: number;
  netBeforeExpenses: number;
  totalExpenses: number;
  finalNetProfit: number;
  netShopRevenue: number;
  todayCollected: number;
  todayFees: number;
  todayNetBeforeExpenses: number;
  todayExpenses: number;
  todayFinalNet: number;
  todayNet: number;
  thisMonthCollected: number;
  thisMonthFees: number;
  thisMonthNetBeforeExpenses: number;
  thisMonthExpenses: number;
  thisMonthFinalNet: number;
  thisMonthNet: number;
  lastMonthCollected: number;
  lastMonthFees: number;
  lastMonthExpenses: number;
  lastMonthFinalNet: number;
  lastMonthNet: number;
  packageSalesCount: number;
  packageSalesRevenue: number;
  extraServicesRevenue: number;
  regularPaidRevenue: number;
  actualVisitsCount: number;
  subscriptionVisitsUsed: number;
  regularVisitsCount: number;
};

type ContractSignatureRecord = {
  shopId: string;
  contractNumber: string;
  signedAt: string;
  signerName: string;
  shopName: string;
  contractVersion: string;
};

function normalizeShopId(shopId: string): string {
  return String(shopId || '').trim();
}

function getContractStorageKey(shopId: string): string {
  return `ulmi_smart_contract_sig_${normalizeShopId(shopId)}`;
}

function getExpensesLocalKey(shopId: string): string {
  return `ulmi_shop_expenses_${normalizeShopId(shopId)}`;
}

function readLocalExpenses(shopId: string): ShopExpenseItem[] {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return [];
  try {
    const raw = localStorage.getItem(getExpensesLocalKey(cleanId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalExpenses(shopId: string, items: ShopExpenseItem[]): void {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return;
  try {
    localStorage.setItem(getExpensesLocalKey(cleanId), JSON.stringify(items));
  } catch {
    // تجاهل أخطاء التخزين المحلي
  }
}

async function fetchShopExpenses(shopId: string): Promise<ShopExpenseItem[]> {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return [];
  const localItems = readLocalExpenses(cleanId);

  try {
    const { data, error } = await supabase
      .from('shop_expenses')
      .select('id, shop_id, title, category, amount, expense_date, notes, created_at')
      .eq('shop_id', cleanId)
      .order('expense_date', { ascending: false });

    if (!error && Array.isArray(data)) {
      const normalizedDb: ShopExpenseItem[] = data.map((row) => ({
        id: String(row.id),
        shop_id: String(row.shop_id || cleanId),
        title: String(row.title || 'مصروف تشغيل'),
        category: String(row.category || 'مستلزمات تشغيل'),
        amount: Number(row.amount || 0),
        expense_date: row.expense_date || row.created_at || new Date().toISOString(),
        notes: row.notes ?? null,
        created_at: row.created_at,
      }));
      writeLocalExpenses(cleanId, normalizedDb);
      return normalizedDb;
    }
  } catch {
    // في حال عدم إمكانية الاتصال بالجدول نستخدم المحلي
  }

  return localItems;
}

async function createShopExpense(
  shopId: string,
  payload: { title: string; category: string; amount: number; expenseDate: string; notes?: string }
): Promise<ShopExpenseItem> {
  const cleanId = normalizeShopId(shopId);
  const isoDate = payload.expenseDate
    ? new Date(`${payload.expenseDate}T12:00:00`).toISOString()
    : new Date().toISOString();

  const tempId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: ShopExpenseItem = {
    id: tempId,
    shop_id: cleanId,
    title: payload.title.trim(),
    category: payload.category.trim() || 'مستلزمات تشغيل',
    amount: Number(payload.amount),
    expense_date: isoDate,
    notes: payload.notes?.trim() ? payload.notes.trim() : null,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('shop_expenses')
      .insert({
        shop_id: cleanId,
        title: item.title,
        category: item.category,
        amount: item.amount,
        expense_date: item.expense_date,
        notes: item.notes,
      })
      .select('id, shop_id, title, category, amount, expense_date, notes, created_at')
      .single();

    if (!error && data) {
      const saved: ShopExpenseItem = {
        id: String(data.id),
        shop_id: String(data.shop_id || cleanId),
        title: String(data.title || item.title),
        category: String(data.category || item.category),
        amount: Number(data.amount || item.amount),
        expense_date: data.expense_date || item.expense_date,
        notes: data.notes ?? null,
        created_at: data.created_at,
      };
      const current = readLocalExpenses(cleanId);
      writeLocalExpenses(cleanId, [saved, ...current]);
      return saved;
    }
  } catch {
    // حفظ محلي احتياطي إذا تعذر الاتصال
  }

  const current = readLocalExpenses(cleanId);
  writeLocalExpenses(cleanId, [item, ...current]);
  return item;
}

async function removeShopExpense(shopId: string, expenseId: string): Promise<void> {
  const cleanId = normalizeShopId(shopId);
  try {
    await supabase.from('shop_expenses').delete().eq('id', expenseId).eq('shop_id', cleanId);
  } catch {
    // تجاهل أخطاء الشبكة عند الحذف المحلي
  }
  const current = readLocalExpenses(cleanId);
  writeLocalExpenses(
    cleanId,
    current.filter((e) => e.id !== expenseId)
  );
}

function generateDeterministicContractId(shopId: string, shopName?: string): string {
  const cleanId = normalizeShopId(shopId);
  const prefix =
    (shopName || 'UL')
      .replace(/[^a-zA-Z\u0600-\u06FF]/g, '')
      .slice(0, 2)
      .toUpperCase() || 'UL';
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = (hash * 31 + cleanId.charCodeAt(i)) % 9000;
  }
  const code = String(1000 + Math.abs(hash));
  return `${BRAND_NAME.toUpperCase()}-${prefix}-2026-${code}`;
}

function readLocalContractSignature(shopId: string): ContractSignatureRecord | null {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return null;
  try {
    const raw = localStorage.getItem(getContractStorageKey(cleanId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContractSignatureRecord;
    if (!parsed?.signedAt) return null;
    return {
      ...parsed,
      shopId: cleanId,
      contractNumber: parsed.contractNumber || generateDeterministicContractId(cleanId, parsed.shopName),
      contractVersion: parsed.contractVersion || CONTRACT_VERSION,
    };
  } catch {
    return null;
  }
}

function writeLocalContractSignature(record: ContractSignatureRecord): void {
  const cleanId = normalizeShopId(record.shopId);
  if (!cleanId) return;
  try {
    const normalized: ContractSignatureRecord = { ...record, shopId: cleanId };
    localStorage.setItem(getContractStorageKey(cleanId), JSON.stringify(normalized));
  } catch {
    // تجاهل أخطاء التخزين المحلي
  }
}

async function fetchContractSignature(shopId: string): Promise<ContractSignatureRecord | null> {
  const cleanId = normalizeShopId(shopId);
  if (!cleanId) return null;
  const localSig = readLocalContractSignature(cleanId);

  try {
    const { data, error } = await supabase
      .from('shop_contracts')
      .select('shop_id, contract_number, signed_at, signer_name, shop_name, contract_version')
      .eq('shop_id', cleanId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.signed_at) {
      const dbRecord: ContractSignatureRecord = {
        shopId: cleanId,
        contractNumber: data.contract_number || generateDeterministicContractId(cleanId, data.shop_name),
        signedAt: data.signed_at,
        signerName: data.signer_name || localSig?.signerName || '',
        shopName: data.shop_name || localSig?.shopName || '',
        contractVersion: data.contract_version || CONTRACT_VERSION,
      };
      writeLocalContractSignature(dbRecord);
      return dbRecord;
    }
  } catch {
    // في حال عدم وجود جدول shop_contracts نعتمد على المحلي
  }

  return localSig;
}

async function persistContractSignature(record: ContractSignatureRecord): Promise<void> {
  const cleanId = normalizeShopId(record.shopId);
  const normalized: ContractSignatureRecord = { ...record, shopId: cleanId };
  writeLocalContractSignature(normalized);
  try {
    await supabase.from('shop_contracts').upsert(
      {
        shop_id: cleanId,
        contract_number: normalized.contractNumber,
        signed_at: normalized.signedAt,
        signer_name: normalized.signerName,
        shop_name: normalized.shopName,
        contract_version: normalized.contractVersion,
      },
      { onConflict: 'shop_id' }
    );
  } catch {
    // سقوط آمن إذا لم يُنشأ جدول shop_contracts بعد
  }
}

function UlmiWordmark({
  variant = 'light',
  size = 'md',
}: {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims =
    size === 'sm'
      ? { width: 58, height: 22 }
      : size === 'lg'
      ? { width: 96, height: 36 }
      : { width: 74, height: 28 };
  const fill = variant === 'dark' ? '#FFFFFF' : '#09090B';

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox="0 0 240 86"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={BRAND_NAME}
      className="inline-block shrink-0 select-none"
    >
      <path
        d="M14 38V56C14 68.7025 24.2975 79 37 79C49.7025 79 60 68.7025 60 56V38"
        stroke={fill}
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M60 38V68" stroke={fill} strokeWidth="22" strokeLinecap="round" />
      <path d="M84 15V68" stroke={fill} strokeWidth="22" strokeLinecap="round" />
      <path
        d="M108 68V52C108 43.1634 115.163 36 124 36C132.837 36 140 43.1634 140 52V68"
        stroke={fill}
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M140 68V52C140 43.1634 147.163 36 156 36C164.837 36 172 43.1634 172 52V68"
        stroke={fill}
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M214 38V68" stroke={fill} strokeWidth="22" strokeLinecap="round" />
      <circle cx="214" cy="15" r="11" fill={fill} />
    </svg>
  );
}

function isSameLocalDay(isoDate: string, refDate: Date): boolean {
  const d = new Date(isoDate);
  return (
    d.getFullYear() === refDate.getFullYear() &&
    d.getMonth() === refDate.getMonth() &&
    d.getDate() === refDate.getDate()
  );
}

function isSameLocalMonth(isoDate: string, refDate: Date): boolean {
  const d = new Date(isoDate);
  return d.getFullYear() === refDate.getFullYear() && d.getMonth() === refDate.getMonth();
}

async function fetchShopFinancialSnapshot(
  shopId: string,
  customers: Customer[]
): Promise<ShopFinancialSnapshot> {
  const customerIds = customers.map((c) => c.id);
  const [txData, { subscriptions, visits }, expenses] = await Promise.all([
    getShopPaymentTransactions(shopId, customerIds),
    getShopActivityData(customers, { shopId }),
    fetchShopExpenses(shopId),
  ]);

  const dbTransactions = txData as LedgerTx[];
  const coveredVisitIds = new Set(dbTransactions.map((t) => t.visit_id).filter(Boolean));
  const coveredSubIds = new Set(dbTransactions.map((t) => t.subscription_id).filter(Boolean));

  const legacyTransactions: LedgerTx[] = [];

  for (const v of visits) {
    if (coveredVisitIds.has(v.id)) continue;
    const amt = Number(v.charge_amount || 0);
    if (v.payment_type === 'paid' && amt > 0) {
      legacyTransactions.push({
        id: `legacy-visit-${v.id}`,
        shop_id: shopId,
        customer_id: v.customer_id,
        visit_id: v.id,
        subscription_id: v.subscription_id ?? null,
        payment_kind: 'visit',
        amount: amt,
        company_fee_amount: COMPANY_FEE_PER_VISIT,
        service_name: v.haircut_type || 'حلاقة عامة',
        payment_method: 'unknown',
        payment_status: 'recorded',
        payment_date: v.visit_date,
        notes: v.notes ?? 'سجل زيارة سابق',
      });
    }
  }

  for (const s of subscriptions) {
    if (coveredSubIds.has(s.id) || s.status === 'cancelled') continue;
    const planPrice = Number(s.plan?.price || 0);
    const planCount = Number(s.plan?.haircut_count || 0);
    if (planPrice > 0) {
      legacyTransactions.push({
        id: `legacy-sub-${s.id}`,
        shop_id: shopId,
        customer_id: s.customer_id,
        visit_id: null,
        subscription_id: s.id,
        payment_kind: 'subscription',
        amount: planPrice,
        company_fee_amount: planCount * COMPANY_FEE_PER_VISIT,
        service_name: s.plan?.name ? `باقة ${s.plan.name}` : 'اشتراك باقة',
        payment_method: 'unknown',
        payment_status: 'recorded',
        payment_date: s.created_at || `${s.start_date}T12:00:00Z`,
        notes: 'سجل اشتراك سابق',
      });
    }
  }

  const transactions = [...dbTransactions, ...legacyTransactions].sort(
    (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
  );
  const recorded = transactions.filter((t) => t.payment_status === 'recorded');

  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let totalCollected = 0;
  let totalCompanyFees = 0;
  let todayCollected = 0;
  let todayFees = 0;
  let thisMonthCollected = 0;
  let thisMonthFees = 0;
  let lastMonthCollected = 0;
  let lastMonthFees = 0;
  let packageSalesRevenue = 0;
  let extraServicesRevenue = 0;
  let regularPaidRevenue = 0;

  for (const tx of recorded) {
    const amount = Number(tx.amount || 0);
    const fee = Number(tx.company_fee_amount || 0);
    totalCollected += amount;
    totalCompanyFees += fee;

    if (isSameLocalDay(tx.payment_date, now)) {
      todayCollected += amount;
      todayFees += fee;
    }
    if (isSameLocalMonth(tx.payment_date, now)) {
      thisMonthCollected += amount;
      thisMonthFees += fee;
    }
    if (isSameLocalMonth(tx.payment_date, lastMonthDate)) {
      lastMonthCollected += amount;
      lastMonthFees += fee;
    }

    if (tx.payment_kind === 'subscription') {
      packageSalesRevenue += amount;
    } else if (fee > 0) {
      regularPaidRevenue += amount;
    } else {
      extraServicesRevenue += amount;
    }
  }

  let totalExpenses = 0;
  let todayExpenses = 0;
  let thisMonthExpenses = 0;
  let lastMonthExpenses = 0;

  for (const exp of expenses) {
    const expAmt = Number(exp.amount || 0);
    totalExpenses += expAmt;
    if (isSameLocalDay(exp.expense_date, now)) {
      todayExpenses += expAmt;
    }
    if (isSameLocalMonth(exp.expense_date, now)) {
      thisMonthExpenses += expAmt;
    }
    if (isSameLocalMonth(exp.expense_date, lastMonthDate)) {
      lastMonthExpenses += expAmt;
    }
  }

  const netBeforeExpenses = totalCollected - totalCompanyFees;
  const finalNetProfit = netBeforeExpenses - totalExpenses;

  const todayNetBeforeExpenses = todayCollected - todayFees;
  const todayFinalNet = todayNetBeforeExpenses - todayExpenses;

  const thisMonthNetBeforeExpenses = thisMonthCollected - thisMonthFees;
  const thisMonthFinalNet = thisMonthNetBeforeExpenses - thisMonthExpenses;

  const lastMonthNetBeforeExpenses = lastMonthCollected - lastMonthFees;
  const lastMonthFinalNet = lastMonthNetBeforeExpenses - lastMonthExpenses;

  const packageSalesCount = recorded.filter((t) => t.payment_kind === 'subscription').length;
  const subscriptionVisitsUsed = visits.filter((v) => v.payment_type === 'subscription').length;
  const regularVisitsCount = visits.filter((v) => v.payment_type !== 'subscription').length;

  return {
    transactions,
    recordedTransactions: recorded,
    subscriptions,
    visits,
    expenses,
    totalCollected,
    totalCompanyFees,
    netBeforeExpenses,
    totalExpenses,
    finalNetProfit,
    netShopRevenue: finalNetProfit,
    todayCollected,
    todayFees,
    todayNetBeforeExpenses,
    todayExpenses,
    todayFinalNet,
    todayNet: todayFinalNet,
    thisMonthCollected,
    thisMonthFees,
    thisMonthNetBeforeExpenses,
    thisMonthExpenses,
    thisMonthFinalNet,
    thisMonthNet: thisMonthFinalNet,
    lastMonthCollected,
    lastMonthFees,
    lastMonthExpenses,
    lastMonthFinalNet,
    lastMonthNet: lastMonthFinalNet,
    packageSalesCount,
    packageSalesRevenue,
    extraServicesRevenue,
    regularPaidRevenue,
    actualVisitsCount: visits.length,
    subscriptionVisitsUsed,
    regularVisitsCount,
  };
}

function adminBookingStatusMeta(status: Booking['status']): { label: string; cls: string } {
  switch (status) {
    case 'confirmed':
      return { label: 'مؤكد', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
    case 'pending':
      return { label: 'بانتظار التأكيد', cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' };
    case 'completed':
      return { label: 'تم تحويله لزيارة', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' };
    case 'cancelled':
      return { label: 'ملغي', cls: 'bg-stone-100 text-stone-600' };
    case 'no_show':
      return { label: 'لم يحضر', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' };
  }
}

export function AdminDashboard({ shopId, onLogout }: { shopId: string; onLogout: () => void }) {
  const cleanShopId = useMemo(() => normalizeShopId(shopId), [shopId]);
  const [tab, setTab] = useState<Tab>('overview');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeInitialView, setNoticeInitialView] = useState<'notice' | 'contract'>('notice');
  const [mandatoryContract, setMandatoryContract] = useState(false);
  const [contractSignature, setContractSignature] = useState<ContractSignatureRecord | null>(() =>
    readLocalContractSignature(shopId)
  );
  const [contractChecked, setContractChecked] = useState<boolean>(() => !!readLocalContractSignature(shopId));
  const [shopInfo, setShopInfo] = useState<{ shop_name: string; owner_name: string; logo_url?: string | null } | null>(null);
  const [regularHaircutPrice, setRegularHaircutPrice] = useState(REGULAR_HAIRCUT_PRICE);
  const [refreshTick, setRefreshTick] = useState(0);

  // Realtime booking alert & push status
  const [liveAlert, setLiveAlert] = useState<{
    id: string;
    bookingCode: string;
    customerName: string;
    customerPhone?: string | null;
    serviceName: string;
    startAt: string;
    status: string;
  } | null>(null);
  const [pushBanner, setPushBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const knownBookingIdsRef = useRef<Set<string>>(new Set());
  const bookingsHydratedRef = useRef(false);

  const bumpData = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

  const loadBookings = useCallback(async () => {
    try {
      const list = await getShopBookings(cleanShopId);
      setBookings(list);
      if (!bookingsHydratedRef.current) {
        knownBookingIdsRef.current = new Set(list.map((b) => b.id));
        bookingsHydratedRef.current = true;
      } else {
        for (const b of list) {
          knownBookingIdsRef.current.add(b.id);
        }
      }
    } catch (e) {
      console.error('Failed loading shop bookings:', e);
    }
  }, [cleanShopId]);

  useEffect(() => {
    void registerServiceWorker();
    void loadBookings();
  }, [loadBookings, refreshTick]);

  // Supabase Realtime subscription for new & updated bookings on this shop
  useEffect(() => {
    bookingsHydratedRef.current = false;
    knownBookingIdsRef.current = new Set();

    const channel = supabase
      .channel(`shop-bookings-${cleanShopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `shop_id=eq.${cleanShopId}`,
        },
        (payload) => {
          void loadBookings();
          if (payload.eventType === 'INSERT' && payload.new) {
            const row = payload.new as Record<string, unknown>;
            const id = String(row.id ?? '');
            if (id && knownBookingIdsRef.current.has(id)) return;
            if (id) knownBookingIdsRef.current.add(id);

            playBookingAlertSound();
            setLiveAlert({
              id: id || String(Date.now()),
              bookingCode: String(row.booking_code ?? 'BK-NEW'),
              customerName: String(row.customer_name ?? 'عميل'),
              customerPhone: row.customer_phone ? String(row.customer_phone) : null,
              serviceName: String(row.service_name ?? 'حلاقة'),
              startAt: String(row.start_at ?? new Date().toISOString()),
              status: String(row.status ?? 'pending'),
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cleanShopId, loadBookings]);

  const handleEnablePush = async () => {
    setEnablingPush(true);
    setPushBanner(null);
    try {
      const res = await enableShopBookingPush(cleanShopId);
      setPushBanner({ type: res.ok ? 'ok' : 'err', text: res.message });
    } catch (e) {
      setPushBanner({
        type: 'err',
        text: e instanceof Error ? e.message : 'تعذر تفعيل الإشعارات.',
      });
    } finally {
      setEnablingPush(false);
    }
  };

  useEffect(() => {
    let active = true;
    const cached = readLocalContractSignature(cleanShopId);
    if (cached) {
      setContractSignature(cached);
      setContractChecked(true);
    }

    Promise.all([
      getShopById(cleanShopId),
      getShopRegularHaircutPrice(cleanShopId),
      fetchContractSignature(cleanShopId),
    ])
      .then(([shop, price, sig]) => {
        if (!active) return;
        if (shop) {
          setShopInfo({ shop_name: shop.shop_name, owner_name: shop.owner_name, logo_url: shop.logo_url ?? null });
        }
        setRegularHaircutPrice(price);
        const resolvedSig = sig || cached || null;
        setContractSignature(resolvedSig);
        setContractChecked(true);

        if (!resolvedSig) {
          setNoticeInitialView('contract');
          setMandatoryContract(true);
          setNoticeOpen(true);
        } else {
          setMandatoryContract(false);
        }
      })
      .catch(() => {
        if (!active) return;
        setContractChecked(true);
        if (!cached) {
          setNoticeInitialView('contract');
          setMandatoryContract(true);
          setNoticeOpen(true);
        }
      });

    return () => {
      active = false;
    };
  }, [cleanShopId]);

  const isContractSigned = !!contractSignature?.signedAt;

  const openContractModal = useCallback(
    (forceMandatory: boolean) => {
      setNoticeInitialView('contract');
      setMandatoryContract(forceMandatory && !isContractSigned);
      setNoticeOpen(true);
    },
    [isContractSigned]
  );

  const openNoticeModal = useCallback(() => {
    setNoticeInitialView('notice');
    setMandatoryContract(!isContractSigned);
    setNoticeOpen(true);
  }, [isContractSigned]);

  const handleOpenAddExpense = useCallback(() => {
    if (!isContractSigned) {
      openContractModal(true);
      return;
    }
    setExpenseModalOpen(true);
  }, [isContractSigned, openContractModal]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = search.trim()
        ? await searchShopCustomersByName(cleanShopId, search.trim())
        : await getShopCustomers(cleanShopId);
      setCustomers(list);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search, cleanShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeBookingsCount = bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed').length;

  const tabs: { k: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { k: 'overview', label: 'الملخص الرئيسي', icon: TrendingUp },
    { k: 'bookings', label: 'الحجوزات', icon: Ticket, badge: activeBookingsCount > 0 ? activeBookingsCount : undefined },
    { k: 'customers', label: 'العملاء', icon: Users },
    { k: 'visits', label: 'الزيارات', icon: Receipt },
    { k: 'subscriptions', label: 'الباقات والاشتراكات', icon: CalendarClock },
    { k: 'revenue', label: 'الإيرادات والمصروفات', icon: Wallet },
    { k: 'settings', label: 'إعدادات المحل', icon: Settings },
  ];

  return (
    <div className="animate-fade-in mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6">
      {/* Live Realtime Booking Toast Banner */}
      {liveAlert && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border-2 border-emerald-500 bg-stone-900 p-4 text-white shadow-lg sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400 text-stone-950">
              <BellRing className="h-5 w-5 animate-bounce" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold text-stone-950">
                  حجز جديد الآن
                </span>
                <span className="font-mono text-xs font-extrabold text-amber-300">
                  {liveAlert.bookingCode}
                </span>
                <span className="text-sm font-extrabold text-white">
                  {liveAlert.customerName}
                </span>
              </div>
              <p className="mt-1 text-xs text-stone-300">
                {liveAlert.serviceName} · الموعد: {formatDateTime(liveAlert.startAt)}
                {liveAlert.customerPhone ? ` · هاتف: ${liveAlert.customerPhone}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTab('bookings');
                setLiveAlert(null);
              }}
              className="rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-extrabold text-stone-950 transition hover:bg-amber-300"
            >
              عرض الحجز
            </button>
            <button
              type="button"
              onClick={() => setLiveAlert(null)}
              className="rounded-xl border border-stone-700 px-3 py-2 text-xs font-bold text-stone-300 hover:bg-stone-800"
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      {contractChecked && !isContractSigned && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-stone-900 shadow-2xs sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900 text-white">
              <ShieldAlert className="h-5 w-5 text-amber-300" />
            </div>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-extrabold text-stone-900">توقيع العقد الإلكتروني إلزامي</span>
                <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-extrabold text-stone-900">
                  مطلوب للتوثيق الرسمي
                </span>
              </div>
              <p className="text-xs leading-relaxed text-stone-700">
                لم يتم توثيق عقد ترخيص <span className="font-bold"><UlmiWordmark variant="light" size="sm" /></span> لهذا المحل بعد. يُرجى مراجعة البنود وتوقيع العقد إلكترونيًا لاعتماد التوثيق بالكامل.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openContractModal(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-xs font-extrabold text-white transition hover:bg-stone-800"
          >
            <FileText className="h-4 w-4" />
            <span>توقيع العقد الآن</span>
          </button>
        </div>
      )}

      <header className="card border-stone-200/90 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {shopInfo?.logo_url ? (
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 p-1.5 shadow-2xs">
                <img
                  src={shopInfo.logo_url}
                  alt={`شعار ${shopInfo.shop_name}`}
                  className="h-full w-full rounded-xl object-contain"
                />
              </div>
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-stone-900 font-display text-xl font-extrabold text-white shadow-2xs">
                {shopInfo?.shop_name?.charAt(0) ?? 'م'}
              </div>
            )}

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-xl font-extrabold text-stone-900 sm:text-2xl">
                  {shopInfo?.shop_name || 'لوحة الإدارة'}
                </h1>
                {shopInfo?.owner_name && (
                  <span className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] font-bold text-stone-600">
                    {shopInfo.owner_name}
                  </span>
                )}
                {isContractSigned && contractSignature ? (
                  <button
                    type="button"
                    onClick={() => openContractModal(false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                    <span>العقد موثّق ({contractSignature.contractNumber})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openContractModal(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 transition hover:bg-amber-100"
                  >
                    <Lock className="h-3 w-3" />
                    <span>بانتظار التوقيع الإجباري</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1.5">
                  <span>إدارة العملاء والباقات والزيارات والمصروفات والحجوزات</span>
                  <span>·</span>
                  <UlmiWordmark variant="light" size="sm" />
                </span>
                <span className="hidden text-stone-300 sm:inline">•</span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50/90 px-2.5 py-1 font-bold text-stone-800">
                  <Scissors className="h-3.5 w-3.5 text-stone-600" />
                  سعر الحلاقة العادية: {formatPrice(regularHaircutPrice)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-stone-100 pt-4 lg:justify-end lg:border-t-0 lg:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={playBookingAlertSound}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-bold text-stone-800 transition hover:border-stone-300 hover:bg-stone-100"
                title="تجربة صوت التنبيه والاهتزاز"
              >
                <Volume2 className="h-4 w-4 shrink-0 text-amber-600" />
                <span>تجربة الصوت</span>
              </button>

              <button
                type="button"
                onClick={() => void handleEnablePush()}
                disabled={enablingPush}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                {enablingPush ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <BellRing className="h-4 w-4 shrink-0 text-emerald-700" />
                )}
                <span>تفعيل إشعارات الموبايل</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddExpense}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3.5 text-xs font-bold text-stone-800 transition hover:border-stone-300 hover:bg-stone-100"
              >
                <ShoppingBag className="h-4 w-4 shrink-0 text-stone-700" />
                <span>إضافة مصروف</span>
              </button>

              <button
                type="button"
                onClick={openNoticeModal}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${
                  !isContractSigned
                    ? 'border-amber-300 bg-amber-50 text-stone-900 hover:bg-amber-100'
                    : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-stone-100'
                }`}
              >
                <Building2 className="h-4 w-4 shrink-0 text-stone-700" />
                <span>{isContractSigned ? 'الإشعار والعقد' : 'العقد الإجباري'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isContractSigned) {
                    openContractModal(true);
                    return;
                  }
                  setAddOpen(true);
                }}
                className="btn-primary h-10 px-4 text-xs"
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                <span>عميل جديد</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 text-xs font-bold text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>خروج</span>
            </button>
          </div>
        </div>

        {pushBanner && (
          <div
            className={`mt-4 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold ${
              pushBanner.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            <span>{pushBanner.text}</span>
            <button type="button" onClick={() => setPushBanner(null)} className="text-[11px] underline">
              إغلاق
            </button>
          </div>
        )}
      </header>

      <nav aria-label="أقسام لوحة الإدارة" className="flex gap-1.5 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50/80 p-1.5">
        {tabs.map((t) => {
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition sm:text-sm ${
                active
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-white hover:text-stone-900'
              }`}
            >
              <t.icon className={`h-4 w-4 ${active ? 'text-stone-200' : 'text-stone-500'}`} />
              <span>{t.label}</span>
              {t.badge !== undefined && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    active ? 'bg-amber-400 text-stone-950' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <main className="min-w-0">
        {tab === 'overview' && (
          <Overview
            shopId={cleanShopId}
            customers={customers}
            refreshTick={refreshTick}
            onGoSubs={() => setTab('subscriptions')}
            onGoRevenue={() => setTab('revenue')}
          />
        )}
        {tab === 'bookings' && (
          <BookingsTab
            shopId={cleanShopId}
            customers={customers}
            bookings={bookings}
            regularHaircutPrice={regularHaircutPrice}
            isContractSigned={isContractSigned}
            onRequireContract={() => openContractModal(true)}
            onRefreshBookings={() => void loadBookings()}
            onMutated={bumpData}
          />
        )}
        {tab === 'customers' && (
          <CustomersTab
            customers={customers}
            loading={loading}
            search={search}
            setSearch={setSearch}
            onSelect={(c) => {
              if (!isContractSigned) {
                openContractModal(true);
                return;
              }
              setSelected(c);
            }}
            onAdd={() => {
              if (!isContractSigned) {
                openContractModal(true);
                return;
              }
              setAddOpen(true);
            }}
          />
        )}
        {tab === 'visits' && (
          <VisitsTab
            shopId={cleanShopId}
            customers={customers}
            regularHaircutPrice={regularHaircutPrice}
            isContractSigned={isContractSigned}
            onRequireContract={() => openContractModal(true)}
            onSelectCustomer={(c) => {
              if (!isContractSigned) {
                openContractModal(true);
                return;
              }
              setSelected(c);
            }}
            onMutated={bumpData}
          />
        )}
        {tab === 'subscriptions' && (
          <SubscriptionsTab
            shopId={cleanShopId}
            customers={customers}
            refreshTick={refreshTick}
            onSelectCustomer={(c) => {
              if (!isContractSigned) {
                openContractModal(true);
                return;
              }
              setSelected(c);
            }}
          />
        )}
        {tab === 'revenue' && (
          <RevenueTab
            shopId={cleanShopId}
            customers={customers}
            refreshTick={refreshTick}
            onOpenAddExpense={handleOpenAddExpense}
            onMutated={bumpData}
          />
        )}
        {tab === 'settings' && (
          <ShopSettingsTab
            shopId={cleanShopId}
            onUpdated={(shop) => {
              setShopInfo({ shop_name: shop.shop_name, owner_name: shop.owner_name, logo_url: shop.logo_url ?? null });
              setRegularHaircutPrice(Number(shop.regular_haircut_price ?? REGULAR_HAIRCUT_PRICE));
              bumpData();
            }}
          />
        )}
      </main>

      <AddExpenseModal
        shopId={cleanShopId}
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onCreated={() => {
          setExpenseModalOpen(false);
          bumpData();
        }}
      />

      <AddCustomerModal
        shopId={cleanShopId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          load();
          bumpData();
        }}
      />
      <CustomerDrawer
        shopId={cleanShopId}
        regularHaircutPrice={regularHaircutPrice}
        customer={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          load();
          bumpData();
        }}
      />
      <CompanyNoticeModal
        open={noticeOpen}
        onClose={() => {
          if (mandatoryContract && !contractSignature?.signedAt) return;
          setNoticeOpen(false);
        }}
        shopId={cleanShopId}
        shopInfo={shopInfo}
        initialView={noticeInitialView}
        mandatory={mandatoryContract && !contractSignature?.signedAt}
        existingSignature={contractSignature}
        onContractSigned={(sig) => {
          setContractSignature(sig);
          setMandatoryContract(false);
          setNoticeOpen(false);
          bumpData();
        }}
      />
    </div>
  );
}

/* ---------- Bookings Tab (Full Customer Details + Actions + Visit Conversion) ---------- */
function BookingsTab({
  shopId,
  customers,
  bookings,
  regularHaircutPrice,
  isContractSigned,
  onRequireContract,
  onRefreshBookings,
  onMutated,
}: {
  shopId: string;
  customers: Customer[];
  bookings: Booking[];
  regularHaircutPrice: number;
  isContractSigned: boolean;
  onRequireContract: () => void;
  onRefreshBookings: () => void;
  onMutated: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | Booking['status']>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Booking | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [extraCharge, setExtraCharge] = useState<number>(regularHaircutPrice);
  const [forcePaid, setForcePaid] = useState(false);

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return bookings;
    return bookings.filter((b) => b.status === statusFilter);
  }, [bookings, statusFilter]);

  const handleStatusChange = async (booking: Booking, nextStatus: 'confirmed' | 'cancelled' | 'no_show') => {
    if (!isContractSigned) {
      onRequireContract();
      return;
    }
    setBusyId(booking.id);
    setMessage(null);
    try {
      await updateBookingStatus(booking.id, nextStatus);
      onRefreshBookings();
      setMessage({
        type: 'ok',
        text: `تم تحديث حالة الحجز ${booking.booking_code} بنجاح.`,
      });
    } catch (e) {
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : 'تعذر تحديث حالة الحجز.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const openCompleteModal = (booking: Booking) => {
    if (!isContractSigned) {
      onRequireContract();
      return;
    }
    setCompleteTarget(booking);
    setPaymentMethod('cash');
    setForcePaid(false);
    setExtraCharge(regularHaircutPrice);
  };

  const handleConfirmCompleteVisit = async () => {
    if (!completeTarget) return;
    setBusyId(completeTarget.id);
    setMessage(null);
    try {
      await completeBookingAsVisit(completeTarget.id, {
        shopId,
        customCharge: Number(extraCharge),
        forcePaid,
        paymentMethod,
      });
      setCompleteTarget(null);
      onRefreshBookings();
      onMutated();
      setMessage({
        type: 'ok',
        text: `تم تحويل الحجز ${completeTarget.booking_code} إلى زيارة مسجلة وتحديث الحسابات.`,
      });
    } catch (e) {
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : 'تعذر تحويل الحجز إلى زيارة.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const counts = {
    all: bookings.length,
    pending: bookings.filter((b) => b.status === 'pending').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    completed: bookings.filter((b) => b.status === 'completed').length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    no_show: bookings.filter((b) => b.status === 'no_show').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold text-stone-900">إدارة حجوزات العملاء</h2>
          <p className="text-xs text-stone-500">
            تظهر هنا الحجوزات الجديدة فورًا مع بيانات العميل الكاملة وإمكانية التأكيد أو التحويل إلى زيارة
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { k: 'all', label: `الكل (${counts.all})` },
            { k: 'pending', label: `بانتظار التأكيد (${counts.pending})` },
            { k: 'confirmed', label: `مؤكد (${counts.confirmed})` },
            { k: 'completed', label: `مكتمل (${counts.completed})` },
            { k: 'no_show', label: `لم يحضر (${counts.no_show})` },
            { k: 'cancelled', label: `ملغي (${counts.cancelled})` },
          ].map((item) => (
            <button
              key={item.k}
              type="button"
              onClick={() => setStatusFilter(item.k as 'all' | Booking['status'])}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === item.k
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-3.5 text-xs font-bold ${
            message.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <Ticket className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold text-stone-700">لا توجد حجوزات في هذا القسم</p>
          <p className="text-xs text-stone-500">عندما يحجز عميل موعدًا من صفحته سيظهر هنا تلقائيًا</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const meta = adminBookingStatusMeta(b.status);
            const cust = b.customer_id ? customerById.get(b.customer_id) : undefined;
            const customerName = b.customer_name || cust?.name || 'عميل';
            const customerPhone = b.customer_phone || cust?.phone || 'غير مسجل';
            const isBusy = busyId === b.id;

            return (
              <div
                key={b.id}
                className="card flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-stone-900 px-2.5 py-0.5 font-mono text-xs font-extrabold text-amber-400">
                      {b.booking_code}
                    </span>
                    <span className="text-base font-extrabold text-stone-900">{customerName}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>
                      {meta.label}
                    </span>
                    {b.auto_confirmed && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        تأكيد تلقائي
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
                    <span className="inline-flex items-center gap-1 font-bold text-stone-800">
                      <Phone className="h-3.5 w-3.5 text-stone-400" />
                      <span dir="ltr">{customerPhone}</span>
                    </span>
                    <span>·</span>
                    <span className="font-bold text-stone-800">{b.service_name}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-stone-400" />
                      {formatDateTime(b.start_at)}
                    </span>
                  </div>

                  {b.notes && (
                    <p className="text-xs text-stone-500">ملاحظة العميل: {b.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <>
                      {b.status === 'pending' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleStatusChange(b, 'confirmed')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          تأكيد
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openCompleteModal(b)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-stone-800 disabled:opacity-50"
                      >
                        <Scissors className="h-3.5 w-3.5" />
                        تحويل لزيارة
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatusChange(b, 'no_show')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        لم يحضر
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatusChange(b, 'cancelled')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        إلغاء
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        title={`تحويل الحجز ${completeTarget?.booking_code ?? ''} إلى زيارة`}
        maxWidth="max-w-md"
      >
        {completeTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
              <p className="font-extrabold text-stone-900">العميل: {completeTarget.customer_name || 'عميل'}</p>
              <p className="mt-0.5">الخدمة: {completeTarget.service_name}</p>
            </div>

            <div>
              <label className="label">المبلغ المحصل (0 إذا تم الخصم من باقة نشطة)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={extraCharge}
                onChange={(e) => setExtraCharge(Number(e.target.value))}
                className="input"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs font-bold text-stone-800">
              <input
                type="checkbox"
                checked={forcePaid}
                onChange={(e) => setForcePaid(e.target.checked)}
                className="h-4 w-4 accent-stone-900"
              />
              <span>احتسابها كحلاقة عادية مدفوعة (عدم الخصم من الباقة)</span>
            </label>

            <div>
              <label className="label">طريقة الدفع</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="input"
              >
                <option value="cash">كاش</option>
                <option value="instapay">InstaPay</option>
                <option value="vodafone_cash">Vodafone Cash</option>
                <option value="card">بطاقة بنكية</option>
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={busyId === completeTarget.id}
                onClick={() => void handleConfirmCompleteVisit()}
                className="btn-primary flex-1"
              >
                {busyId === completeTarget.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                تأكيد التحويل لزيارة
              </button>
              <button type="button" onClick={() => setCompleteTarget(null)} className="btn-ghost">
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Add Shop Expense Modal ---------- */
function AddExpenseModal({
  shopId,
  open,
  onClose,
  onCreated,
}: {
  shopId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('مستلزمات تشغيل');
  const [amount, setAmount] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setCategory('مستلزمات تشغيل');
    setAmount('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setErr('');
  }, [open]);

  const submit = async () => {
    const numAmount = Number(amount);
    if (!title.trim()) {
      setErr('يرجى كتابة اسم المصروف (مثال: مناديل، فوط، أمواس)');
      return;
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setErr('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await createShopExpense(shopId, {
        title,
        category,
        amount: numAmount,
        expenseDate,
        notes,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="إضافة مصروف للمحل" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-700">
          يُخصم المصروف من صافي المحل (بعد رسوم الشركة) ويظهر أثره مباشرة في الربح النهائي وفي عمود الجراف.
        </div>

        <div>
          <label className="label">بند المصروف *</label>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (err) setErr('');
            }}
            className="input"
            placeholder="مثال: مناديل، فوط، أمواس، سبراي"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">المبلغ *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (err) setErr('');
              }}
              className="input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="label">التصنيف</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              <option value="مستلزمات تشغيل">مستلزمات تشغيل</option>
              <option value="أدوات وحلاقة">أدوات وحلاقة</option>
              <option value="مناديل وفوط">مناديل وفوط</option>
              <option value="فواتير وصيانة">فواتير وصيانة</option>
              <option value="أخرى">أخرى</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">تاريخ المصروف</label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">ملاحظات</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-16 resize-none"
            placeholder="تفاصيل إضافية (اختياري)"
          />
        </div>

        {err && <p className="text-xs font-extrabold text-red-600">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={submit} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            {saving ? 'جاري الحفظ...' : 'حفظ وخصم من الربح'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CompanyNoticeModal({
  open,
  onClose,
  shopId,
  shopInfo,
  initialView = 'notice',
  mandatory = false,
  existingSignature,
  onContractSigned,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  shopInfo: { shop_name: string; owner_name: string } | null;
  initialView?: 'notice' | 'contract';
  mandatory?: boolean;
  existingSignature: ContractSignatureRecord | null;
  onContractSigned: (sig: ContractSignatureRecord) => void;
}) {
  const alreadySigned = !!existingSignature?.signedAt;
  const effectiveMandatory = mandatory && !alreadySigned;

  const [view, setView] = useState<'notice' | 'contract'>(initialView);
  const [signerName, setSignerName] = useState('');
  const [confirmShopData, setConfirmShopData] = useState(false);
  const [confirmFinancialTerms, setConfirmFinancialTerms] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const today = new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  const contractId = useMemo(
    () => existingSignature?.contractNumber || generateDeterministicContractId(shopId, shopInfo?.shop_name),
    [existingSignature?.contractNumber, shopId, shopInfo?.shop_name]
  );

  useEffect(() => {
    if (!open) return;
    setView(effectiveMandatory ? 'contract' : initialView);
    setSignerName(existingSignature?.signerName || shopInfo?.owner_name || '');
    setConfirmShopData(alreadySigned);
    setConfirmFinancialTerms(alreadySigned);
    setAgreed(alreadySigned);
    setErr('');
  }, [open, effectiveMandatory, initialView, existingSignature, shopInfo?.owner_name, alreadySigned]);

  const canSign = !!signerName.trim() && confirmShopData && confirmFinancialTerms && agreed && !saving;

  const handleSignContract = async () => {
    if (!signerName.trim()) {
      setErr('يرجى إدخال اسم الموقّع الرسمي على العقد');
      return;
    }
    if (!confirmShopData || !confirmFinancialTerms || !agreed) {
      setErr('يجب تأكيد كافة الإقرارات والموافقة على بنود العقد لإتمام التوثيق');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const record: ContractSignatureRecord = {
        shopId: normalizeShopId(shopId),
        contractNumber: contractId,
        signedAt: new Date().toISOString(),
        signerName: signerName.trim(),
        shopName: shopInfo?.shop_name || 'محل مسجّل',
        contractVersion: CONTRACT_VERSION,
      };
      await persistContractSignature(record);
      onContractSigned(record);
    } catch {
      setErr('تعذر حفظ توثيق العقد حاليًا، يرجى المحاولة مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  if (view === 'contract') {
    return (
      <Modal
        open={open}
        onClose={() => {
          if (effectiveMandatory) return;
          onClose();
        }}
        title="عقد ترخيص استخدام النظام الإلكتروني"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-stone-900 p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="grid h-12 w-16 place-items-center rounded-xl bg-white px-2">
                  <UlmiWordmark variant="light" size="sm" />
                </div>
                <div>
                  <p className="font-display text-base font-extrabold text-white sm:text-lg">
                    عقد ترخيص استخدام نظام {SYSTEM_NAME}
                  </p>
                  <p className="text-xs text-stone-300">
                    رقم العقد الذكي: <span className="font-bold text-white">{contractId}</span> · النسخة {CONTRACT_VERSION}
                  </p>
                </div>
              </div>
              <div className="text-left text-xs">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-extrabold ${
                    alreadySigned
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40'
                      : 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/40'
                  }`}
                >
                  {alreadySigned ? <ShieldCheck className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {alreadySigned ? 'موقّع وموثّق' : 'توقيع إلزامي'}
                </span>
                <p className="mt-1 text-[11px] text-stone-400">{today}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs sm:grid-cols-3">
            <div>
              <p className="font-bold text-stone-500">الطرف الأول (الشركة المالكة)</p>
              <div className="mt-1 flex items-center gap-1.5 font-extrabold text-stone-900">
                <UlmiWordmark variant="light" size="sm" />
                <span>— {SYSTEM_NAME}</span>
              </div>
            </div>
            <div>
              <p className="font-bold text-stone-500">الطرف الثاني (المنشأة / المحل)</p>
              <p className="mt-1 font-extrabold text-stone-900">{shopInfo?.shop_name || 'محل مسجّل'}</p>
            </div>
            <div>
              <p className="font-bold text-stone-500">المسؤول / المالك المسجّل</p>
              <p className="mt-1 font-extrabold text-stone-900">{shopInfo?.owner_name || '—'}</p>
            </div>
          </div>

          <div className="max-h-[42vh] space-y-3.5 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-700">
            <div>
              <p className="mb-1 font-extrabold text-stone-900">1. التمهيد وحجية العقد الذكي</p>
              <p>
                أُبرم هذا العقد إلكترونيًا بين شركة <span className="font-bold text-stone-900">{BRAND_NAME}</span> (مالكة ومشغّلة نظام{' '}
                <span className="font-bold text-stone-900">{SYSTEM_NAME}</span>) وبين منشأة{' '}
                <span className="font-bold text-stone-900">{shopInfo?.shop_name ?? '—'}</span> المملوكة للسيد/ة{' '}
                <span className="font-bold text-stone-900">{shopInfo?.owner_name ?? '—'}</span>، ويُعد التوقيع الإلكتروني الموثّق ملزمًا للطرفين سواء للمنشآت الجديدة أو المنشآت القائمة التي تستمر في استخدام النظام.
              </p>
            </div>

            <div>
              <p className="mb-1 font-extrabold text-stone-900">2. القواعد المالية ورسوم التشغيل</p>
              <ul className="list-disc space-y-1 pr-5 text-xs sm:text-sm">
                <li>
                  الحلاقة العادية المدفوعة تخضع لرسوم ثابتة لصالح شركة <span className="font-bold">{BRAND_NAME}</span> قدرها{' '}
                  <span className="font-bold text-stone-900">{formatPrice(COMPANY_FEE_PER_VISIT)}</span>، ويُحسب صافي المحل بخصم هذه الرسوم من قيمة العملية.
                </li>
                <li>
                  بيع الباقات والاشتراكات تُحتسب رسومه مرة واحدة عند تفعيل البيع وفق عدد زيارات الباقة، بينما استخدام زيارة من الباقة لا يضيف رسومًا جديدة ولا يُعدّ تحصيلًا إضافيًا.
                </li>
                <li>
                  أي خدمة إضافية تُسجّل أثناء زيارة الباقة لا تخضع لرسوم إضافية لصالح شركة <span className="font-bold">{BRAND_NAME}</span> وتؤول بالكامل للمحل.
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-1 font-extrabold text-stone-900">3. دقة البيانات والالتزام التشغيلي</p>
              <p className="text-xs sm:text-sm">
                يلتزم الطرف الثاني بتسجيل الزيارات والتحصيلات والمصروفات بدقة ومصداقية عبر لوحة الإدارة، ويقر بصحة بيانات المحل والمالك الظاهرة في هذا العقد، كما تلتزم شركة <span className="font-bold">{BRAND_NAME}</span> بتوفير المنصة واستمرارية تشغيل السجلات والتقارير.
              </p>
            </div>
          </div>

          {!alreadySigned ? (
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
              <div>
                <label className="label">الاسم الكامل للموقّع (إلزامي للتوثيق) *</label>
                <input
                  value={signerName}
                  onChange={(e) => {
                    setSignerName(e.target.value);
                    if (err) setErr('');
                  }}
                  className="input bg-white"
                  placeholder="اكتب اسم المالك أو المفوض بالتوقيع"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 bg-white p-3">
                <input
                  type="checkbox"
                  checked={confirmShopData}
                  onChange={(e) => {
                    setConfirmShopData(e.target.checked);
                    if (err) setErr('');
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
                />
                <span className="text-xs font-bold text-stone-700 sm:text-sm">
                  أقر بصحة بيانات المحل ({shopInfo?.shop_name ?? '—'}) واسم المسؤول ({shopInfo?.owner_name ?? '—'}).
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 bg-white p-3">
                <input
                  type="checkbox"
                  checked={confirmFinancialTerms}
                  onChange={(e) => {
                    setConfirmFinancialTerms(e.target.checked);
                    if (err) setErr('');
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
                />
                <span className="text-xs font-bold text-stone-700 sm:text-sm">
                  أوافق على آلية احتساب رسوم شركة {BRAND_NAME} ({formatPrice(COMPANY_FEE_PER_VISIT)} للحلاقة العادية، ورسوم الباقات مرة واحدة عند البيع، و0 رسوم على الخدمات الإضافية).
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-300 bg-white p-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => {
                    setAgreed(e.target.checked);
                    if (err) setErr('');
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
                />
                <span className="text-xs font-extrabold text-stone-900 sm:text-sm">
                  أوافق موافقة نهائية وملزمة على جميع بنود هذا العقد الإلكتروني الموثّق مع شركة {BRAND_NAME}.
                </span>
              </label>

              {err && <p className="text-xs font-extrabold text-red-600">{err}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs font-bold text-emerald-900">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700" />
                <span>
                  تم توثيق العقد برقم <span className="font-extrabold">{existingSignature.contractNumber}</span> بواسطة{' '}
                  <span className="font-extrabold">{existingSignature.signerName || shopInfo?.owner_name || 'المسؤول'}</span>
                </span>
              </div>
              <span className="text-[11px] text-emerald-800">
                بتاريخ: {formatDateTime(existingSignature.signedAt)}
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!alreadySigned ? (
              <button
                type="button"
                onClick={handleSignContract}
                disabled={!canSign}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {saving ? 'جاري التوثيق والحفظ...' : 'توقيع وموافقة إلزامية على العقد'}
              </button>
            ) : (
              <button type="button" onClick={onClose} className="btn-primary flex-1">
                <CheckCircle2 className="h-4 w-4" />
                <span>العقد موثّق — إغلاق</span>
              </button>
            )}

            {!effectiveMandatory && (
              <button type="button" onClick={() => setView('notice')} className="btn-ghost">
                عرض الإشعار
              </button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`إشعار من ${BRAND_NAME}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-900 p-4 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-16 place-items-center rounded-xl bg-white px-2">
              <UlmiWordmark variant="light" size="sm" />
            </div>
            <div>
              <p className="text-xs text-stone-300">إدارة أنظمة الحلاقة الذكية — {SYSTEM_NAME}</p>
              <p className="mt-0.5 text-[11px] text-stone-400">
                حالة العقد: {alreadySigned ? `موثّق (${existingSignature.contractNumber})` : 'مطلوب التوقيع'}
              </p>
            </div>
          </div>
          <Building2 className="h-5 w-5 shrink-0 text-stone-300" />
        </div>

        <p className="text-sm leading-relaxed text-stone-700">
          الحلاقة العادية المدفوعة تخضع لرسوم شركة ثابتة قدرها{' '}
          <span className="font-bold text-stone-900">{formatPrice(COMPANY_FEE_PER_VISIT)}</span>، وبيع الباقات يحتسب رسومها مرة واحدة عند البيع وفق قواعد النظام، وتُخصم مصروفات المحل بعد رسوم الشركة للوصول لصافي الربح النهائي.
        </p>

        <div className="flex gap-3">
          <button type="button" onClick={() => setView('contract')} className="btn-primary flex-1">
            <FileText className="h-4 w-4" />
            {alreadySigned ? 'عرض العقد الموثّق' : 'عرض وتوقيع العقد'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Overview (Main Executive Summary) ---------- */
function Overview({
  shopId,
  customers,
  refreshTick,
  onGoSubs,
  onGoRevenue,
}: {
  shopId: string;
  customers: Customer[];
  refreshTick: number;
  onGoSubs: () => void;
  onGoRevenue: () => void;
}) {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeSubs: 0,
    totalVisits: 0,
    expiringSoon: 0,
    loading: true,
  });
  const [financial, setFinancial] = useState<RevenueStats | null>(null);
  const [snapshot, setSnapshot] = useState<ShopFinancialSnapshot | null>(null);
  const [financialError, setFinancialError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      setStats((current) => ({ ...current, loading: true }));
      setFinancialError(false);
      try {
        const [{ subscriptions, visits }, revenue, snap] = await Promise.all([
          getShopActivityData(customers, { shopId }),
          getRevenueStats(customers, shopId),
          fetchShopFinancialSnapshot(shopId, customers),
        ]);
        const latestByCustomer = new Map<string, Subscription>();
        for (const subscription of subscriptions) {
          if (!latestByCustomer.has(subscription.customer_id)) {
            latestByCustomer.set(subscription.customer_id, subscription);
          }
        }

        const today = new Date().toISOString().slice(0, 10);
        let activeSubs = 0;
        let expiringSoon = 0;
        for (const subscription of latestByCustomer.values()) {
          if (subscription.status !== 'active' || subscription.end_date < today) continue;
          activeSubs++;
          const daysLeft = Math.ceil(
            (new Date(`${subscription.end_date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000
          );
          if (daysLeft <= 7) expiringSoon++;
        }

        if (!cancelled) {
          setStats({
            totalCustomers: customers.length,
            activeSubs,
            totalVisits: visits.length,
            expiringSoon,
            loading: false,
          });
          setFinancial(revenue);
          setSnapshot(snap);
        }
      } catch (error) {
        console.error('Failed to load shop overview:', error);
        if (!cancelled) {
          setStats((current) => ({ ...current, totalCustomers: customers.length, loading: false }));
          setFinancialError(true);
        }
      }
    };

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [customers, shopId, refreshTick]);

  const totalCollectedDisplay = snapshot ? snapshot.totalCollected : financial?.totalRevenue ?? 0;
  const companyFeesDisplay = snapshot ? snapshot.totalCompanyFees : financial?.companyFee ?? 0;
  const netBeforeExpensesDisplay = snapshot ? snapshot.netBeforeExpenses : financial?.netRevenue ?? 0;
  const expensesDisplay = snapshot ? snapshot.totalExpenses : 0;
  const finalProfitDisplay = snapshot ? snapshot.finalNetProfit : netBeforeExpensesDisplay - expensesDisplay;
  const actualVisitsDisplay = snapshot ? snapshot.actualVisitsCount : stats.totalVisits;
  const soldPackagesDisplay = snapshot ? snapshot.packageSalesCount : 0;

  const operationalCards = [
    { label: 'إجمالي العملاء', value: stats.totalCustomers, icon: Users },
    { label: 'اشتراكات نشطة', value: stats.activeSubs, icon: CheckCircle2 },
    { label: 'الزيارات الفعلية', value: actualVisitsDisplay, icon: Scissors },
    { label: 'الباقات والاشتراكات المباعة', value: soldPackagesDisplay, icon: Layers },
  ];

  const primarySummaryCards = [
    {
      label: 'إجمالي التحصيل',
      value: stats.loading ? '—' : formatPrice(totalCollectedDisplay),
      detail: 'حلاقات عادية + باقات + خدمات إضافية',
      tone: 'text-stone-900',
    },
    {
      label: 'رسوم الشركة وصافي المحل (قبل المصروفات)',
      value: stats.loading ? '—' : formatPrice(netBeforeExpensesDisplay),
      detail: `بعد خصم ${formatPrice(companyFeesDisplay)} رسوم شركة`,
      tone: 'text-stone-800',
    },
    {
      label: 'مصروفات المحل',
      value: stats.loading ? '—' : formatPrice(expensesDisplay),
      detail: 'مناديل، فوط، أمواس ومستلزمات التشغيل',
      tone: 'text-red-700',
    },
    {
      label: 'ربح المحل النهائي (بعد المصروفات)',
      value: stats.loading ? '—' : formatPrice(finalProfitDisplay),
      detail: 'صافي المحل − مصروفات المحل',
      tone: finalProfitDisplay >= 0 ? 'text-emerald-700' : 'text-red-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {operationalCards.map((c) => (
          <div key={c.label} className="card flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-bold text-stone-500">{c.label}</p>
              {stats.loading ? (
                <div className="mt-2 h-7 w-16 animate-shimmer rounded" />
              ) : (
                <p className="mt-1.5 font-display text-2xl font-extrabold text-stone-900">{c.value}</p>
              )}
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700">
              <c.icon className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50/50 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-extrabold text-stone-900">الملخص المالي والتشغيلي</h2>
            <p className="mt-0.5 text-xs text-stone-500">التحصيل، رسوم الشركة، مصروفات المحل، وربح المحل النهائي</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onGoSubs}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50"
            >
              <CalendarClock className="h-3.5 w-3.5 text-stone-500" />
              الباقات
            </button>
            <button
              onClick={onGoRevenue}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-stone-800"
            >
              <Wallet className="h-3.5 w-3.5" />
              الإيرادات والمصروفات
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {financialError ? (
          <div className="p-5 text-sm text-red-700">
            تعذر تحميل الملخص المالي. راجع اتصال قاعدة البيانات وسجلات التحصيل.
          </div>
        ) : (
          <div className="grid divide-y divide-stone-200 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 xl:grid-cols-4">
            {primarySummaryCards.map((item) => (
              <div key={item.label} className="bg-white p-5">
                <p className="text-xs font-bold text-stone-500">{item.label}</p>
                {stats.loading ? (
                  <div className="mt-2.5 h-7 w-24 animate-shimmer rounded" />
                ) : (
                  <p className={`mt-2 font-display text-2xl font-extrabold ${item.tone}`}>{item.value}</p>
                )}
                <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">{item.detail}</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-stone-200 bg-stone-50 px-5 py-3 text-[11px] leading-relaxed text-stone-600">
          المعادلة المالية: إجمالي التحصيل − رسوم الشركة ({formatPrice(COMPANY_FEE_PER_VISIT)}/حلاقة) = صافي المحل (قبل المصروفات) − مصروفات المحل = ربح المحل النهائي.
        </div>
      </section>

      {stats.expiringSoon > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-stone-300 bg-stone-50 p-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <span className="text-sm font-bold text-stone-900">
              {stats.expiringSoon} اشتراك يقترب من الانتهاء خلال 7 أيام
            </span>
          </div>
          <button
            onClick={onGoSubs}
            className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-stone-800"
          >
            عرض التفاصيل
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Customers tab ---------- */
function CustomersTab({
  customers,
  loading,
  search,
  setSearch,
  onSelect,
  onAdd,
}: {
  customers: Customer[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  onSelect: (c: Customer) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم العميل..."
          className="input bg-white pr-12"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-shimmer rounded-2xl" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="card p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold text-stone-700">لا يوجد عملاء بعد</p>
          <p className="text-sm text-stone-500">ابدأ بإضافة أول عميل</p>
          <button onClick={onAdd} className="btn-primary mt-4">
            <UserPlus className="h-4 w-4" />
            إضافة عميل
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {customers.map((c) => (
            <CustomerRow key={c.id} customer={c} onClick={() => onSelect(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerRow({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [visitsCount, setVisitsCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const [s, v] = await Promise.all([getActiveSubscription(customer.id), getVisitsByCustomer(customer.id)]);
      if (!active) return;
      setSub(s);
      setVisitsCount(v.length);
    })();
    return () => {
      active = false;
    };
  }, [customer.id]);

  const active = sub?.status === 'active';
  const remaining = sub ? Math.max(0, (sub.plan?.haircut_count ?? 0) - sub.haircuts_used) : 0;

  return (
    <button
      onClick={onClick}
      className={`card flex items-center gap-3.5 p-4 text-right transition hover:border-stone-300 hover:bg-stone-50/50 ${
        customer.is_blocked ? 'opacity-60' : ''
      }`}
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-900 font-display text-base font-extrabold text-white">
        {customer.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-bold text-stone-900">{customer.name}</p>
          {customer.is_blocked && (
            <span className="badge bg-red-100 text-red-700">
              <Ban className="h-3 w-3" />
              محظور
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-stone-500">
            <Scissors className="h-3.5 w-3.5" />
            {visitsCount} زيارة فعلية
          </span>
          {active ? (
            <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              مشترك — باقي {remaining}
            </span>
          ) : (
            <span className="badge bg-stone-100 text-stone-600">غير مشترك</span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ---------- Visits tab (smart daily checklist) ---------- */
type VisitRow = { customer: Customer; sub: Subscription | null; visitToday: Visit | null; recording: boolean };

function VisitsTab({
  shopId,
  customers,
  regularHaircutPrice,
  isContractSigned,
  onRequireContract,
  onSelectCustomer,
  onMutated,
}: {
  shopId: string;
  customers: Customer[];
  regularHaircutPrice: number;
  isContractSigned: boolean;
  onRequireContract: () => void;
  onSelectCustomer: (c: Customer) => void;
  onMutated: () => void;
}) {
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [visitModalRow, setVisitModalRow] = useState<VisitRow | null>(null);
  const [visitModalForcePaid, setVisitModalForcePaid] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { subscriptions, visits } = await getShopActivityData(customers, { visitsSince: todayStr, shopId });
      const latestByCustomer = new Map<string, Subscription>();
      for (const subscription of subscriptions) {
        if (!latestByCustomer.has(subscription.customer_id)) {
          latestByCustomer.set(subscription.customer_id, subscription);
        }
      }

      const visitByCustomer = new Map<string, Visit>();
      for (const visit of visits) {
        if (!visitByCustomer.has(visit.customer_id) && visit.visit_date.slice(0, 10) === todayStr) {
          visitByCustomer.set(visit.customer_id, visit);
        }
      }

      const built: VisitRow[] = customers.map((customer) => ({
        customer,
        sub: latestByCustomer.get(customer.id) ?? null,
        visitToday: visitByCustomer.get(customer.id) ?? null,
        recording: false,
      }));
      built.sort((a, b) => {
        if (!!a.visitToday !== !!b.visitToday) return a.visitToday ? 1 : -1;
        return a.customer.name.localeCompare(b.customer.name, 'ar');
      });
      setRows(built);
    } catch (error) {
      console.error('Failed to load shop daily visits:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [customers, shopId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const markVisited = async (
    idx: number,
    opts: { haircutType: string; serviceName: string; customCharge: number; notes: string; forcePaid: boolean; paymentMethod: PaymentMethod }
  ) => {
    const row = rows[idx];
    if (row.visitToday || row.recording || row.customer.is_blocked) return false;
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, recording: true } : r)));
    try {
      const result = await recordVisit(row.customer.id, { ...opts, shopId });
      const newVisit = result.visit;
      setRows((prev) =>
        prev
          .map((r, i) =>
            i === idx ? { ...r, visitToday: newVisit, recording: false, sub: result.subscription ?? r.sub } : r
          )
          .sort((a, b) => {
            if (!!a.visitToday !== !!b.visitToday) return a.visitToday ? 1 : -1;
            return a.customer.name.localeCompare(b.customer.name, 'ar');
          })
      );
      onMutated();
      return true;
    } catch (error) {
      console.error('Failed to record visit:', error);
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, recording: false } : r)));
      return false;
    }
  };

  const unmarkVisited = async (idx: number) => {
    const row = rows[idx];
    if (!row.visitToday) return;
    const visitId = row.visitToday.id;
    if (row.visitToday.payment_type === 'subscription' && row.visitToday.subscription_id && row.sub) {
      const newUsed = Math.max(0, row.sub.haircuts_used - 1);
      await supabaseUpdateSubscriptionUsage(row.visitToday.subscription_id, newUsed);
    }
    await deleteVisit(visitId);
    setRows((prev) =>
      prev
        .map((r, i) => (i === idx ? { ...r, visitToday: null } : r))
        .sort((a, b) => {
          if (!!a.visitToday !== !!b.visitToday) return a.visitToday ? 1 : -1;
          return a.customer.name.localeCompare(b.customer.name, 'ar');
        })
    );
    onMutated();
  };

  const filtered = filter.trim() ? rows.filter((r) => r.customer.name.includes(filter.trim())) : rows;
  const visitedCount = rows.filter((r) => r.visitToday).length;
  const subscribedCount = rows.filter((r) => r.sub?.status === 'active').length;
  const paidVisitCount = rows.filter((r) => r.visitToday?.payment_type === 'paid').length;
  const todayCompanyFee = paidVisitCount * COMPANY_FEE_PER_VISIT;

  const openVisitAction = (row: VisitRow, forcePaid: boolean) => {
    if (!isContractSigned) {
      onRequireContract();
      return;
    }
    setVisitModalRow(row);
    setVisitModalForcePaid(forcePaid);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3.5 text-center">
          <p className="text-[11px] font-bold text-stone-500">إجمالي العملاء</p>
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{rows.length}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-[11px] font-bold text-stone-500">زار اليوم</p>
          <p className="mt-1 font-display text-xl font-extrabold text-emerald-700">{visitedCount}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-[11px] font-bold text-stone-500">مشترك نشط</p>
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{subscribedCount}</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-[11px] font-bold text-stone-500">رسوم الحلاقات العادية اليوم</p>
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{formatPrice(todayCompanyFee)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ابحث عن عميل..."
            className="input bg-white pr-11"
          />
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500">
          <Clock className="h-4 w-4" />
          <span>زيارات اليوم — {formatDate(new Date())}</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 animate-shimmer rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-stone-500">
          <Users className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold">لا يوجد عملاء مطابقون</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((row) => {
            const idx = rows.indexOf(row);
            const active = row.sub?.status === 'active';
            const remaining = row.sub && row.sub.plan ? row.sub.plan.haircut_count - row.sub.haircuts_used : 0;
            const visited = !!row.visitToday;
            const blocked = row.customer.is_blocked;
            return (
              <div
                key={row.customer.id}
                className={`card flex flex-wrap items-center justify-between gap-3 p-3.5 transition ${
                  visited ? 'border-emerald-200 bg-emerald-50/30' : ''
                } ${blocked ? 'opacity-55' : ''}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    onClick={() => onSelectCustomer(row.customer)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900 font-display text-sm font-extrabold text-white"
                  >
                    {row.customer.name.charAt(0)}
                  </button>

                  <button onClick={() => onSelectCustomer(row.customer)} className="min-w-0 text-right">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold text-stone-900">{row.customer.name}</p>
                      {blocked && <span className="badge bg-red-100 text-red-700"><Ban className="h-3 w-3" />محظور</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {active ? (
                        <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">مشترك — باقي {remaining}</span>
                      ) : (
                        <span className="badge bg-stone-100 text-stone-600">غير مشترك</span>
                      )}
                      {visited && (
                        <span className="badge bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          {row.visitToday?.payment_type === 'subscription'
                            ? 'بالاشتراك'
                            : formatPrice(Number(row.visitToday?.charge_amount ?? 0))}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {blocked ? (
                    <span className="text-xs font-bold text-red-600">لا يمكن التسجيل</span>
                  ) : visited ? (
                    <button
                      onClick={() => unmarkVisited(idx)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-100"
                    >
                      <XCircle className="h-4 w-4 text-stone-500" />
                      إلغاء
                    </button>
                  ) : row.recording ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                  ) : active && remaining > 0 ? (
                    <>
                      <button
                        onClick={() => openVisitAction(row, false)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        اشتراك
                      </button>
                      <button
                        onClick={() => openVisitAction(row, true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-800 transition hover:bg-stone-50"
                      >
                        <Coins className="h-4 w-4 text-stone-600" />
                        عادي
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => openVisitAction(row, false)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-stone-800"
                    >
                      <Scissors className="h-4 w-4" />
                      زاره — {formatPrice(regularHaircutPrice)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecordVisitModal
        regularHaircutPrice={regularHaircutPrice}
        open={!!visitModalRow}
        onClose={() => setVisitModalRow(null)}
        active={visitModalRow?.sub?.status === 'active'}
        remaining={visitModalRow?.sub?.plan ? Math.max(0, visitModalRow.sub.plan.haircut_count - visitModalRow.sub.haircuts_used) : 0}
        initialForcePaid={visitModalForcePaid}
        onRecord={async (opts) => {
          if (!visitModalRow) return;
          const rowIndex = rows.findIndex((r) => r.customer.id === visitModalRow.customer.id);
          if (rowIndex < 0) return;
          const saved = await markVisited(rowIndex, opts);
          if (saved) setVisitModalRow(null);
        }}
      />
    </div>
  );
}

/* ---------- Subscriptions & Packages tab ---------- */
function SubscriptionsTab({
  shopId,
  customers,
  refreshTick,
  onSelectCustomer,
}: {
  shopId: string;
  customers: Customer[];
  refreshTick: number;
  onSelectCustomer: (c: Customer) => void;
}) {
  type SubscriberRow = {
    customer: Customer;
    subscription: Subscription;
    daysLeft: number;
    haircutsRemaining: number;
  };

  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [alerts, setAlerts] = useState<SubscriptionAlert[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);
  const [packageRevenue, setPackageRevenue] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'expiring'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadSubscriptions = async () => {
      setLoading(true);
      try {
        const [{ subscriptions }, snap] = await Promise.all([
          getShopActivityData(customers, { includeVisits: false, shopId }),
          fetchShopFinancialSnapshot(shopId, customers).catch(() => null),
        ]);
        const customerById = new Map(customers.map((customer) => [customer.id, customer]));
        const latestByCustomer = new Map<string, Subscription>();

        for (const subscription of subscriptions) {
          if (!latestByCustomer.has(subscription.customer_id)) {
            latestByCustomer.set(subscription.customer_id, subscription);
          }
        }

        const todayString = new Date().toISOString().slice(0, 10);
        const today = new Date(`${todayString}T00:00:00Z`);
        const activeRows: SubscriberRow[] = [];
        const alertRows: SubscriptionAlert[] = [];

        for (const subscription of latestByCustomer.values()) {
          const customer = customerById.get(subscription.customer_id);
          if (!customer || subscription.status === 'cancelled') continue;

          const endDate = new Date(`${subscription.end_date}T00:00:00Z`);
          const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
          const haircutsRemaining = Math.max(0, (subscription.plan?.haircut_count ?? 0) - subscription.haircuts_used);

          if (subscription.status === 'active' && subscription.end_date >= todayString) {
            activeRows.push({ customer, subscription, daysLeft: Math.max(0, daysLeft), haircutsRemaining });
          }

          if (daysLeft <= 7 || subscription.end_date < todayString) {
            const isExpired = daysLeft < 0 || subscription.status !== 'active';
            alertRows.push({
              customer,
              subscription,
              daysLeft,
              haircutsRemaining,
              isExpired,
              expiredDaysAgo: isExpired ? Math.max(1, Math.abs(daysLeft)) : 0,
            });
          }
        }

        activeRows.sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'ar'));
        alertRows.sort((a, b) => a.daysLeft - b.daysLeft);

        if (!cancelled) {
          setAllSubscriptions(subscriptions);
          setSubscribers(activeRows);
          setAlerts(alertRows);
          setPackageRevenue(snap?.packageSalesRevenue ?? 0);
        }
      } catch (error) {
        console.error('Failed to load shop subscriptions:', error);
        if (!cancelled) {
          setAllSubscriptions([]);
          setSubscribers([]);
          setAlerts([]);
          setPackageRevenue(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSubscriptions();
    return () => {
      cancelled = true;
    };
  }, [customers, shopId, refreshTick]);

  const totalSoldPackages = allSubscriptions.filter((s) => s.status !== 'cancelled').length;
  const totalConsumedHaircuts = allSubscriptions.reduce((sum, s) => sum + Number(s.haircuts_used || 0), 0);
  const totalRemainingHaircuts = subscribers.reduce((sum, row) => sum + row.haircutsRemaining, 0);

  const expired = alerts.filter((alert) => alert.isExpired);
  const expiringSoon = alerts.filter((alert) => !alert.isExpired && alert.daysLeft <= 7);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-bold text-stone-500">عدد الباقات / الاشتراكات</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-stone-900">{totalSoldPackages}</p>
          <p className="mt-1 text-[11px] text-stone-500">نشط حاليًا: {subscribers.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold text-stone-500">قيمة مبيعات الباقات</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-emerald-700">{formatPrice(packageRevenue)}</p>
          <p className="mt-1 text-[11px] text-stone-500">من المعاملات والسجلات المتاحة</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold text-stone-500">الزيارات المستهلكة من الباقات</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-stone-900">{totalConsumedHaircuts}</p>
          <p className="mt-1 text-[11px] text-stone-500">إجمالي ما تم خصمه من الباقات</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold text-stone-500">الزيارات المتبقية (النشطة)</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-stone-900">{totalRemainingHaircuts}</p>
          <p className="mt-1 text-[11px] text-stone-500">منتهية: {expired.length} · قريبة الانتهاء: {expiringSoon.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'الكل' },
          { id: 'active', label: `النشطة (${subscribers.length})` },
          { id: 'expiring', label: `قريبة من الانتهاء (${expiringSoon.length})` },
          { id: 'expired', label: `المنتهية (${expired.length})` },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setStatusFilter(item.id as typeof statusFilter)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              statusFilter === item.id ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(statusFilter === 'all' || statusFilter === 'active') && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-extrabold text-stone-900">المشتركون حاليًا</h3>
              <p className="text-xs text-stone-500">العملاء ذوو الاشتراك النشط وغير المنتهي</p>
            </div>
            <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
              {subscribers.length} مشترك
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-20 animate-shimmer rounded-2xl" />
              ))}
            </div>
          ) : subscribers.length === 0 ? (
            <div className="card p-6 text-center text-stone-500">
              <Users className="mx-auto h-9 w-9 text-stone-300" />
              <p className="mt-2 font-bold">لا يوجد مشتركون حاليًا</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {subscribers.map((row) => (
                <button
                  key={row.subscription.id}
                  onClick={() => onSelectCustomer(row.customer)}
                  className="card flex w-full items-center justify-between gap-3 p-4 text-right transition hover:border-stone-300 hover:bg-stone-50/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-stone-900">{row.customer.name}</p>
                      <p className="text-xs text-stone-500">
                        باقة {row.subscription.plan?.name ?? '—'} · مستهلك {row.subscription.haircuts_used} · متبقي {row.haircutsRemaining}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">باقي {row.daysLeft} يوم</span>
                    {row.customer.phone && <p className="mt-1 text-xs text-stone-500">{row.customer.phone}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {(statusFilter === 'all' || statusFilter === 'expiring' || statusFilter === 'expired') && (
        <section className="space-y-3">
          <div>
            <h3 className="font-display text-base font-extrabold text-stone-900">الاشتراكات القريبة من الانتهاء والمنتهية</h3>
            <p className="text-xs text-stone-500">متابعة التجديد والباقات المنتهية</p>
          </div>
          {loading ? (
            <div className="h-20 animate-shimmer rounded-2xl" />
          ) : (statusFilter === 'expired' ? expired : statusFilter === 'expiring' ? expiringSoon : alerts).length === 0 ? (
            <div className="card p-6 text-center text-stone-500">
              <CalendarClock className="mx-auto h-9 w-9 text-stone-300" />
              <p className="mt-2 font-bold">لا توجد اشتراكات في هذا التصنيف</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {(statusFilter === 'expired' ? expired : statusFilter === 'expiring' ? expiringSoon : alerts).map((alert) => (
                <button
                  key={alert.subscription.id}
                  onClick={() => onSelectCustomer(alert.customer)}
                  className="card flex w-full items-center justify-between gap-3 p-4 text-right transition hover:border-stone-300 hover:bg-stone-50/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        alert.isExpired ? 'bg-red-50 text-red-600 ring-1 ring-red-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                      }`}
                    >
                      {alert.isExpired ? <XCircle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-stone-900">{alert.customer.name}</p>
                      <p className="text-xs text-stone-500">
                        باقة {alert.subscription.plan?.name} — مستهلك {alert.subscription.haircuts_used} · متبقي {alert.haircutsRemaining}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    {alert.isExpired ? (
                      <span className="badge bg-red-50 text-red-700 ring-1 ring-red-200">انتهى منذ {alert.expiredDaysAgo} يوم</span>
                    ) : (
                      <span className="badge bg-amber-50 text-amber-800 ring-1 ring-amber-200">باقي {alert.daysLeft} يوم</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ---------- Helper for formatting time & customer package context ---------- */
function formatTimeOnly(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

type ActivityDetailItem = {
  id: string;
  timeLabel: string;
  customerName: string;
  actionSummary: string;
  amount: number;
  fee: number;
  net: number;
  isSubscribed: boolean;
  packageName?: string;
  packagePrice?: number;
  packageUsed?: number;
  packageTotal?: number;
};

/* ---------- Revenue, Analytics, Expenses & Ledger tab ---------- */
function RevenueTab({
  shopId,
  customers,
  refreshTick,
  onOpenAddExpense,
  onMutated,
}: {
  shopId: string;
  customers: Customer[];
  refreshTick: number;
  onOpenAddExpense: () => void;
  onMutated: () => void;
}) {
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [snapshot, setSnapshot] = useState<ShopFinancialSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [operationFilter, setOperationFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLedgerLoading(true);
      setLedgerError('');
      try {
        const [s, snap] = await Promise.all([
          getRevenueStats(customers, shopId),
          fetchShopFinancialSnapshot(shopId, customers),
        ]);
        if (!cancelled) {
          setStats(s);
          setSnapshot(snap);
        }
      } catch (error) {
        console.error('Failed to load revenue & ledger:', error);
        if (!cancelled) {
          setStats(null);
          setSnapshot(null);
          setLedgerError(error instanceof Error ? error.message : 'تعذر تحميل بيانات الإيرادات');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLedgerLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customers, shopId, refreshTick]);

  const transactions = snapshot?.transactions ?? [];
  const allSubscriptions = snapshot?.subscriptions ?? [];
  const allVisits = snapshot?.visits ?? [];
  const expenses = snapshot?.expenses ?? [];

  const handleDeleteExpense = async (expenseId: string) => {
    setDeletingExpenseId(expenseId);
    try {
      await removeShopExpense(shopId, expenseId);
      onMutated();
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const customerNames = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers]
  );

  const latestSubByCustomer = useMemo(() => {
    const map = new Map<string, Subscription>();
    for (const s of allSubscriptions) {
      if (!map.has(s.customer_id)) {
        map.set(s.customer_id, s);
      }
    }
    return map;
  }, [allSubscriptions]);

  const subById = useMemo(() => {
    const map = new Map<string, Subscription>();
    for (const s of allSubscriptions) {
      map.set(s.id, s);
    }
    return map;
  }, [allSubscriptions]);

  const buildCustomerSubMeta = useCallback(
    (customerId: string | null, subscriptionId?: string | null) => {
      const sub = (subscriptionId ? subById.get(subscriptionId) : null) ?? (customerId ? latestSubByCustomer.get(customerId) : null);
      if (!sub || sub.status === 'cancelled') {
        return { isSubscribed: false as const };
      }
      return {
        isSubscribed: true as const,
        packageName: sub.plan?.name ?? 'باقة اشتراك',
        packagePrice: Number(sub.plan?.price ?? 0),
        packageUsed: Number(sub.haircuts_used ?? 0),
        packageTotal: Number(sub.plan?.haircut_count ?? 0),
      };
    },
    [subById, latestSubByCustomer]
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const customerName = transaction.customer_id ? customerNames.get(transaction.customer_id) ?? '' : '';
      const searchMatch = !customerFilter.trim() || customerName.toLowerCase().includes(customerFilter.trim().toLowerCase());
      const date = transaction.payment_date.slice(0, 10);
      const fromMatch = !dateFrom || date >= dateFrom;
      const toMatch = !dateTo || date <= dateTo;
      const methodMatch = methodFilter === 'all' || transaction.payment_method === methodFilter;
      const statusMatch = statusFilter === 'all' || transaction.payment_status === statusFilter;
      const operation =
        transaction.payment_kind === 'subscription'
          ? 'subscription'
          : Number(transaction.company_fee_amount) > 0
          ? 'regular'
          : 'extra';
      const operationMatch = operationFilter === 'all' || operation === operationFilter;
      return searchMatch && fromMatch && toMatch && methodMatch && statusMatch && operationMatch;
    });
  }, [transactions, customerNames, customerFilter, dateFrom, dateTo, methodFilter, statusFilter, operationFilter]);

  const recordedFiltered = filteredTransactions.filter((transaction) => transaction.payment_status === 'recorded');
  const filteredCollected = recordedFiltered.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const filteredFees = recordedFiltered.reduce((sum, transaction) => sum + Number(transaction.company_fee_amount || 0), 0);
  const filteredNet = filteredCollected - filteredFees;

  const reportTransactions = recordedFiltered;

  const monthlyReport = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const key = `${year}-${month}`;
      const rows = reportTransactions.filter((transaction) => {
        const date = new Date(transaction.payment_date);
        return date.getFullYear() === year && date.getMonth() === month;
      });
      const monthExpensesList = expenses.filter((exp) => {
        const date = new Date(exp.expense_date);
        return date.getFullYear() === year && date.getMonth() === month;
      });

      const collected = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const fees = rows.reduce((sum, row) => sum + Number(row.company_fee_amount || 0), 0);
      const monthExpenses = monthExpensesList.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
      const netBeforeExpenses = collected - fees;
      const netAfterExpenses = netBeforeExpenses - monthExpenses;

      const packages = rows.filter((row) => row.payment_kind === 'subscription').reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const regular = rows.filter((row) => row.payment_kind === 'visit' && Number(row.company_fee_amount || 0) > 0).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const extras = rows.filter((row) => row.payment_kind === 'visit' && Number(row.company_fee_amount || 0) === 0).reduce((sum, row) => sum + Number(row.amount || 0), 0);

      const details: ActivityDetailItem[] = rows.map((tx) => {
        const cName = tx.customer_id ? customerNames.get(tx.customer_id) ?? 'عميل' : 'عميل';
        const subMeta = buildCustomerSubMeta(tx.customer_id, tx.subscription_id);
        const amt = Number(tx.amount || 0);
        const fee = Number(tx.company_fee_amount || 0);
        const opLabel =
          tx.payment_kind === 'subscription'
            ? `اشترى باقة (${tx.service_name || subMeta.packageName || 'باقة'})`
            : fee > 0
            ? `عمل ${tx.service_name || 'حلاقة عادية'}`
            : `عمل خدمة إضافية (${tx.service_name || 'إضافية'})`;
        return {
          id: tx.id,
          timeLabel: `${formatDate(tx.payment_date)} · ${formatTimeOnly(tx.payment_date)}`,
          customerName: cName,
          actionSummary: opLabel,
          amount: amt,
          fee,
          net: amt - fee,
          ...subMeta,
        };
      });

      return {
        key,
        label: monthDate.toLocaleDateString('ar-EG', { month: 'long' }),
        shortLabel: monthDate.toLocaleDateString('ar-EG', { month: 'short' }),
        collected,
        fees,
        netBeforeExpenses,
        monthExpenses,
        netAfterExpenses,
        packages,
        regular,
        extras,
        details,
        monthExpensesList,
      };
    });
  }, [reportTransactions, expenses, customerNames, buildCustomerSubMeta]);

  const monthlyMax = Math.max(
    1,
    ...monthlyReport.map((row) => Math.max(row.collected, row.netBeforeExpenses, Math.max(0, row.netAfterExpenses)))
  );

  const dailyReport = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));
      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;

      const dayTx = reportTransactions.filter((transaction) => {
        const date = new Date(transaction.payment_date);
        return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
      });

      const dayVisits = allVisits.filter((v) => {
        const date = new Date(v.visit_date);
        return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
      });

      const dayExpensesList = expenses.filter((exp) => {
        const date = new Date(exp.expense_date);
        return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
      });

      const collected = dayTx.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const fees = dayTx.reduce((sum, row) => sum + Number(row.company_fee_amount || 0), 0);
      const dayExpenses = dayExpensesList.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
      const netBeforeExp = collected - fees;
      const finalDayNet = netBeforeExp - dayExpenses;

      const details: ActivityDetailItem[] = [];

      for (const v of dayVisits) {
        const cName = v.customer_id ? customerNames.get(v.customer_id) ?? 'عميل' : 'عميل';
        const subMeta = buildCustomerSubMeta(v.customer_id, v.subscription_id);
        const amt = Number(v.charge_amount || 0);
        const fee = v.payment_type === 'paid' ? COMPANY_FEE_PER_VISIT : 0;
        details.push({
          id: `visit-${v.id}`,
          timeLabel: formatTimeOnly(v.visit_date),
          customerName: cName,
          actionSummary:
            v.payment_type === 'subscription'
              ? `جالك وعمل ${v.haircut_type || 'حلاقة'} (خصم من الباقة)`
              : `جالك وعمل ${v.haircut_type || 'حلاقة عادية'}`,
          amount: amt,
          fee,
          net: amt - fee,
          ...subMeta,
        });
      }

      for (const tx of dayTx) {
        if (tx.payment_kind === 'subscription') {
          const cName = tx.customer_id ? customerNames.get(tx.customer_id) ?? 'عميل' : 'عميل';
          const subMeta = buildCustomerSubMeta(tx.customer_id, tx.subscription_id);
          const amt = Number(tx.amount || 0);
          const fee = Number(tx.company_fee_amount || 0);
          details.push({
            id: `tx-${tx.id}`,
            timeLabel: formatTimeOnly(tx.payment_date),
            customerName: cName,
            actionSummary: `اشترى ${tx.service_name || subMeta.packageName || 'باقة'}`,
            amount: amt,
            fee,
            net: amt - fee,
            ...subMeta,
          });
        }
      }

      return {
        key,
        label: day.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }),
        shortLabel: day.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }),
        collected,
        fees,
        netBeforeExp,
        dayExpenses,
        finalDayNet,
        count: details.length,
        details,
        dayExpensesList,
      };
    });
  }, [reportTransactions, allVisits, expenses, customerNames, buildCustomerSubMeta]);

  const dailyMax = Math.max(1, ...dailyReport.map((row) => Math.max(row.collected, Math.max(0, row.finalDayNet))));

  const paymentMethodReport = [
    { key: 'cash', label: 'كاش' },
    { key: 'instapay', label: 'InstaPay' },
    { key: 'vodafone_cash', label: 'Vodafone Cash' },
    { key: 'card', label: 'بطاقة بنكية' },
    { key: 'unknown', label: 'غير محدد' },
  ].map((method) => ({
    ...method,
    amount: reportTransactions.filter((row) => row.payment_method === method.key).reduce((sum, row) => sum + Number(row.amount || 0), 0),
  }));
  const paymentMethodMax = Math.max(1, ...paymentMethodReport.map((row) => row.amount));

  const packageSalesRevenue = reportTransactions.filter((row) => row.payment_kind === 'subscription').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const additionalServicesRevenue = reportTransactions.filter((row) => row.payment_kind === 'visit' && Number(row.company_fee_amount || 0) === 0).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const regularVisitsCount = stats?.paidVisits ?? snapshot?.regularVisitsCount ?? 0;
  const subVisitsCount = stats?.subscriptionVisits ?? snapshot?.subscriptionVisitsUsed ?? 0;
  const totalVisitsCompare = Math.max(1, regularVisitsCount + subVisitsCount);

  const activeMonthObj = monthlyReport.find((m) => m.key === expandedMonthKey) ?? null;
  const activeDayObj = dailyReport.find((d) => d.key === expandedDayKey) ?? null;

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 animate-shimmer rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs font-bold text-stone-500">ملخص اليوم</p>
          <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
            محصل: {formatPrice(snapshot?.todayCollected ?? 0)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
            <span className="text-stone-600">رسوم الشركة: {formatPrice(snapshot?.todayFees ?? 0)}</span>
            <span className="text-stone-800">صافي المحل: {formatPrice(snapshot?.todayNetBeforeExpenses ?? 0)}</span>
            <span className="text-red-700">مصروفات اليوم: {formatPrice(snapshot?.todayExpenses ?? 0)}</span>
            <span className="text-emerald-700">ربح المحل النهائي: {formatPrice(snapshot?.todayFinalNet ?? 0)}</span>
          </div>
        </div>

        <div className="card p-5">
          <p className="text-xs font-bold text-stone-500">ملخص الشهر الحالي ومقارنته بالشهر السابق</p>
          <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
            محصل الشهر: {formatPrice(snapshot?.thisMonthCollected ?? 0)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
            <span className="text-stone-600">رسوم الشركة: {formatPrice(snapshot?.thisMonthFees ?? 0)}</span>
            <span className="text-red-700">مصروفات الشهر: {formatPrice(snapshot?.thisMonthExpenses ?? 0)}</span>
            <span className="text-emerald-700">ربح المحل النهائي: {formatPrice(snapshot?.thisMonthFinalNet ?? 0)}</span>
            <span className="text-stone-500">الشهر السابق: {formatPrice(snapshot?.lastMonthFinalNet ?? 0)}</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="text-xs font-bold text-stone-500">من الحلاقات العادية</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {formatPrice(snapshot?.regularPaidRevenue ?? stats.revenueFromPaid)}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-bold text-stone-500">من الاشتراكات والباقات</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {formatPrice(snapshot?.packageSalesRevenue ?? stats.revenueFromSubscriptions)}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-bold text-stone-500">إجمالي التحصيل</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {formatPrice(snapshot?.totalCollected ?? stats.totalRevenue)}
            </p>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 font-display text-base font-extrabold text-stone-900">تفصيل الزيارات والرسوم</h3>
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-stone-200 text-center">
            <div className="px-2">
              <p className="font-display text-2xl font-extrabold text-stone-900">{stats.totalVisits}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">إجمالي الزيارات</p>
            </div>
            <div className="px-2">
              <p className="font-display text-2xl font-extrabold text-emerald-700">{stats.subscriptionVisits}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">بالاشتراك (0 رسوم إضافية)</p>
            </div>
            <div className="px-2">
              <p className="font-display text-2xl font-extrabold text-stone-900">{stats.paidVisits}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">حلاقة عادية</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="grid h-10 w-14 place-items-center rounded-xl bg-stone-900 px-1.5">
              <UlmiWordmark variant="dark" size="sm" />
            </div>
            <div>
              <h3 className="flex items-center gap-1.5 font-display text-base font-extrabold text-stone-900">
                <span>رسوم</span>
                <UlmiWordmark variant="light" size="sm" />
                <span>ومصروفات المحل</span>
              </h3>
              <p className="text-xs text-stone-500">
                حلاقة عادية: {formatPrice(COMPANY_FEE_PER_VISIT)} · تُخصم رسوم الشركة ثم مصروفات المحل من إجمالي التحصيل
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="text-xs font-bold text-stone-600">رسوم الشركة المستحقة</span>
              <span className="font-bold text-stone-900">{formatPrice(snapshot?.totalCompanyFees ?? stats.companyFee)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="text-xs font-bold text-stone-600">صافي المحل (قبل المصروفات)</span>
              <span className="font-bold text-stone-900">{formatPrice(snapshot?.netBeforeExpenses ?? stats.netRevenue)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/50 px-4 py-3">
              <span className="text-xs font-bold text-red-800">إجمالي مصروفات المحل</span>
              <span className="font-bold text-red-700">− {formatPrice(snapshot?.totalExpenses ?? 0)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50/80 px-5 py-4">
          <div>
            <p className="font-bold text-stone-900">ربح المحل النهائي (بعد رسوم الشركة ومصروفات المحل)</p>
            <p className="text-xs text-stone-500">إجمالي التحصيل − رسوم الشركة − مصروفات المحل</p>
          </div>
          <p
            className={`font-display text-2xl font-extrabold ${
              (snapshot?.finalNetProfit ?? stats.netRevenue) >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatPrice(snapshot?.finalNetProfit ?? stats.netRevenue)}
          </p>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-stone-900 text-white">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-extrabold text-stone-900">مصروفات المحل (مناديل، فوط، أمواس...)</h3>
              <p className="text-xs text-stone-500">تُخصم من صافي المحل وتظهر في عمود الربح النهائي بالجراف</p>
            </div>
          </div>

          <button type="button" onClick={onOpenAddExpense} className="btn-primary h-10 px-4 text-xs">
            <PlusCircle className="h-4 w-4" />
            <span>إضافة مصروف جديد</span>
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">مصروفات اليوم</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(snapshot?.todayExpenses ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">مصروفات هذا الشهر</p>
            <p className="mt-1 text-lg font-extrabold text-red-700">{formatPrice(snapshot?.thisMonthExpenses ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">إجمالي المصروفات</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(snapshot?.totalExpenses ?? 0)}</p>
          </div>
        </div>

        {expenses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">
            لا توجد مصروفات مسجلة بعد. اضغط على «إضافة مصروف جديد» لتسجيل شراء مناديل أو فوط أو أمواس.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[620px] text-right text-sm">
              <thead className="bg-stone-50 text-xs text-stone-600">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">البند</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">المبلغ</th>
                  <th className="p-3">ملاحظات</th>
                  <th className="p-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} className="border-t border-stone-100">
                    <td className="whitespace-nowrap p-3 text-xs text-stone-600">{formatDate(exp.expense_date)}</td>
                    <td className="p-3 font-bold text-stone-900">{exp.title}</td>
                    <td className="p-3">
                      <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">{exp.category}</span>
                    </td>
                    <td className="whitespace-nowrap p-3 font-extrabold text-red-700">− {formatPrice(exp.amount)}</td>
                    <td className="p-3 text-xs text-stone-500">{exp.notes || '—'}</td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        disabled={deletingExpenseId === exp.id}
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        title="حذف المصروف"
                      >
                        {deletingExpenseId === exp.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-6 p-5">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-5 w-5 text-stone-700" />
          <div>
            <h3 className="font-display text-base font-extrabold text-stone-900">التقارير والرسوم البيانية ومقارنة الفترات</h3>
            <p className="mt-0.5 text-xs text-stone-500">يوضح الجراف إجمالي التحصيل، صافي المحل قبل المصروفات، وربح المحل النهائي بعد المصروفات.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
            <p className="text-xs font-bold text-stone-500">مبيعات الباقات</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(packageSalesRevenue)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
            <p className="text-xs font-bold text-stone-500">الخدمات الإضافية (0 رسوم شركة)</p>
            <p className="mt-1 text-lg font-extrabold text-emerald-700">{formatPrice(additionalServicesRevenue)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
            <p className="text-xs font-bold text-stone-500">ربح المحل النهائي (هذا الشهر مقابل السابق)</p>
            <p className="mt-1 text-sm font-extrabold text-stone-900">
              {formatPrice(snapshot?.thisMonthFinalNet ?? 0)} مقابل {formatPrice(snapshot?.lastMonthFinalNet ?? 0)}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">التحصيل وصافي المحل وربح المحل النهائي (بعد المصروفات) — آخر 6 أشهر</h4>
            <div className="flex h-48 items-end gap-3 border-b border-stone-200 pb-2">
              {monthlyReport.map((month, idx) => (
                <div key={`${month.label}-${idx}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      title={`إجمالي التحصيل: ${formatPrice(month.collected)}`}
                      className="w-1/3 max-w-4 rounded-t bg-stone-900 transition-all"
                      style={{ height: `${Math.max(2, (month.collected / monthlyMax) * 100)}%` }}
                    />
                    <div
                      title={`صافي المحل (قبل المصروفات): ${formatPrice(month.netBeforeExpenses)}`}
                      className="w-1/3 max-w-4 rounded-t bg-stone-400 transition-all"
                      style={{ height: `${Math.max(2, (Math.max(0, month.netBeforeExpenses) / monthlyMax) * 100)}%` }}
                    />
                    <div
                      title={`ربح المحل النهائي (بعد المصروفات): ${formatPrice(month.netAfterExpenses)} · مصروفات: ${formatPrice(month.monthExpenses)}`}
                      className={`w-1/3 max-w-4 rounded-t transition-all ${
                        month.netAfterExpenses >= 0 ? 'bg-emerald-600' : 'bg-red-500'
                      }`}
                      style={{ height: `${Math.max(2, (Math.max(0, month.netAfterExpenses) / monthlyMax) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-stone-500">{month.shortLabel}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-stone-600">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-stone-900" /> إجمالي التحصيل
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-stone-400" /> صافي المحل (قبل المصروفات)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> ربح المحل النهائي (بعد المصروفات)
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">التحصيل وربح المحل النهائي (بعد المصروفات) — آخر 7 أيام</h4>
            <div className="flex h-48 items-end gap-2 border-b border-stone-200 pb-2">
              {dailyReport.map((day, idx) => (
                <div key={`${day.label}-${idx}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      title={`${day.label} — تحصيل: ${formatPrice(day.collected)}`}
                      className="w-1/2 max-w-4 rounded-t bg-stone-800"
                      style={{ height: `${Math.max(3, (day.collected / dailyMax) * 100)}%` }}
                    />
                    <div
                      title={`${day.label} — ربح نهائي بعد المصروفات: ${formatPrice(day.finalDayNet)}`}
                      className={`w-1/2 max-w-4 rounded-t ${day.finalDayNet >= 0 ? 'bg-emerald-600' : 'bg-red-500'}`}
                      style={{ height: `${Math.max(3, (Math.max(0, day.finalDayNet) / dailyMax) * 100)}%` }}
                    />
                  </div>
                  <span className="truncate text-[9px] font-bold text-stone-500">{day.shortLabel.split(' ')[0]}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-stone-800" /> التحصيل
                <i className="mr-2 h-2.5 w-2.5 rounded-sm bg-emerald-600" /> ربح المحل النهائي
              </span>
              <span>صافي ربح 7 أيام: {formatPrice(dailyReport.reduce((s, d) => s + d.finalDayNet, 0))}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">توزيع التحصيل حسب طريقة الدفع</h4>
            <div className="space-y-3">
              {paymentMethodReport.map((method) => (
                <div key={method.key}>
                  <div className="mb-1 flex justify-between gap-2 text-xs">
                    <span className="font-bold text-stone-700">{method.label}</span>
                    <span className="text-stone-600">{formatPrice(method.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-stone-800" style={{ width: `${(method.amount / paymentMethodMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">مقارنة الزيارات العادية مقابل زيارات الباقات</h4>
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-xs font-bold">
                  <span className="text-stone-800">زيارات عادية مدفوعة</span>
                  <span>{regularVisitsCount} زيارة</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-stone-800" style={{ width: `${(regularVisitsCount / totalVisitsCompare) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs font-bold">
                  <span className="text-emerald-800">زيارات من الباقات</span>
                  <span>{subVisitsCount} زيارة</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(subVisitsCount / totalVisitsCompare) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-stone-700" />
              <h4 className="text-xs font-extrabold text-stone-900">ملخص آخر 6 أشهر (اضغط على الشهر للتفاصيل)</h4>
            </div>
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-stone-600">
              شبكة الشهور
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {monthlyReport.map((month) => {
              const isSelected = expandedMonthKey === month.key;
              const hasActivity = month.details.length > 0 || month.collected > 0 || month.monthExpenses > 0;
              return (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => setExpandedMonthKey(isSelected ? null : month.key)}
                  className={`flex flex-col justify-between rounded-xl border p-3 text-right transition ${
                    isSelected
                      ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                      : hasActivity
                      ? 'border-emerald-200/90 bg-white text-stone-900 hover:border-emerald-300'
                      : 'border-stone-200/80 bg-white/75 text-stone-600 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-extrabold">{month.label}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        isSelected
                          ? 'bg-white/15 text-stone-100'
                          : hasActivity
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {month.details.length} عملية
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1 border-t border-current/10 pt-2 text-[11px] tabular-nums">
                    <div className="flex justify-between">
                      <span>تحصيل: <strong>{formatPrice(month.collected)}</strong></span>
                      <span className={isSelected ? 'text-red-300' : 'text-red-700'}>
                        مصروفات: <strong>{formatPrice(month.monthExpenses)}</strong>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>قبل المصروف: <strong>{formatPrice(month.netBeforeExpenses)}</strong></span>
                      <span className={isSelected ? 'text-emerald-300' : 'text-emerald-700'}>
                        الربح النهائي: <strong>{formatPrice(month.netAfterExpenses)}</strong>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {activeMonthObj && (
            <div className="space-y-2.5 rounded-xl border border-stone-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                <p className="text-xs font-extrabold text-stone-900">تفاصيل شهر {activeMonthObj.label}</p>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold text-stone-600">
                  <span>رسوم الشركة: {formatPrice(activeMonthObj.fees)}</span>
                  <span>·</span>
                  <span className="text-red-700">مصروفات المحل: {formatPrice(activeMonthObj.monthExpenses)}</span>
                  <span>·</span>
                  <span className="text-emerald-700">الربح النهائي: {formatPrice(activeMonthObj.netAfterExpenses)}</span>
                </div>
              </div>

              {activeMonthObj.monthExpensesList.length > 0 && (
                <div className="rounded-lg border border-red-200/80 bg-red-50/40 p-2.5 text-xs">
                  <p className="mb-1.5 font-extrabold text-red-900">مصروفات هذا الشهر:</p>
                  <div className="flex flex-wrap gap-2">
                    {activeMonthObj.monthExpensesList.map((e) => (
                      <span key={e.id} className="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-800">
                        {e.title}: −{formatPrice(e.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeMonthObj.details.length === 0 ? (
                <p className="text-xs text-stone-500">لا توجد عمليات تحصيل مسجلة في هذا الشهر.</p>
              ) : (
                <div className="space-y-2">
                  {activeMonthObj.details.map((item) => (
                    <div key={item.id} className="space-y-1 rounded-lg border border-stone-200/90 bg-stone-50/70 p-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-extrabold text-stone-900">
                          {item.customerName} — {item.actionSummary}
                        </span>
                        <span className="text-[11px] font-bold text-stone-500">{item.timeLabel}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                        <span>المبلغ: <strong>{formatPrice(item.amount)}</strong></span>
                        <span>·</span>
                        <span>رسوم: <strong>{formatPrice(item.fee)}</strong></span>
                        <span>·</span>
                        <span className="text-emerald-700">صافي العملية: <strong>{formatPrice(item.net)}</strong></span>
                      </div>
                      <div className="pt-0.5 text-[11px]">
                        {item.isSubscribed ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 ring-1 ring-emerald-200">
                            <span>مشترك في باقة: {item.packageName}</span>
                            <span>· سعرها: {formatPrice(item.packagePrice ?? 0)}</span>
                            <span>· خلص منها: {item.packageUsed ?? 0} من {item.packageTotal ?? 0} زيارة</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-stone-200/70 px-2 py-0.5 font-bold text-stone-700">
                            غير مشترك في باقة
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-700" />
              <h4 className="text-xs font-extrabold text-stone-900">ملخص آخر 7 أيام (اضغط على اليوم لعرض مين جالك والمصروفات)</h4>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              سجل يومي تفاعلي
            </span>
          </div>

          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/90 bg-stone-50/40">
            {dailyReport.map((day) => {
              const isOpen = expandedDayKey === day.key;
              return (
                <div key={day.key}>
                  <button
                    type="button"
                    onClick={() => setExpandedDayKey(isOpen ? null : day.key)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-right transition hover:bg-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${day.count > 0 || day.dayExpenses > 0 ? 'bg-emerald-600' : 'bg-stone-300'}`} />
                      <span className="text-xs font-extrabold text-stone-900">{day.label}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-600 ring-1 ring-stone-200">
                        {day.count} حركة
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                      <span className="text-stone-700">تحصيل: <strong>{formatPrice(day.collected)}</strong></span>
                      {day.dayExpenses > 0 && (
                        <span className="text-red-700">مصروف: <strong>−{formatPrice(day.dayExpenses)}</strong></span>
                      )}
                      <span className="text-emerald-700">الربح النهائي: <strong>{formatPrice(day.finalDayNet)}</strong></span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-stone-500" /> : <ChevronDown className="h-4 w-4 text-stone-500" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="space-y-2 border-t border-stone-200/80 bg-white p-3">
                      {day.dayExpensesList.length > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50/50 p-2.5 text-xs">
                          <p className="mb-1 font-extrabold text-red-900">مصروفات هذا اليوم:</p>
                          <div className="flex flex-wrap gap-2">
                            {day.dayExpensesList.map((e) => (
                              <span key={e.id} className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-red-800 ring-1 ring-red-200">
                                {e.title}: −{formatPrice(e.amount)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {day.details.length === 0 ? (
                        <p className="text-xs text-stone-500">لا توجد زيارات أو عمليات تحصيل في هذا اليوم.</p>
                      ) : (
                        day.details.map((item) => (
                          <div key={item.id} className="space-y-1 rounded-lg border border-stone-200 bg-stone-50/60 p-2.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-extrabold text-stone-900">
                                {item.customerName} — {item.actionSummary}
                              </span>
                              <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-stone-600 ring-1 ring-stone-200">
                                الساعة {item.timeLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                              <span>المبلغ: <strong>{formatPrice(item.amount)}</strong></span>
                              <span>·</span>
                              <span>رسوم الشركة: <strong>{formatPrice(item.fee)}</strong></span>
                              <span>·</span>
                              <span className="text-emerald-700">صافي العملية: <strong>{formatPrice(item.net)}</strong></span>
                            </div>
                            <div className="pt-0.5 text-[11px]">
                              {item.isSubscribed ? (
                                <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 ring-1 ring-emerald-200">
                                  <span>مشترك في باقة: {item.packageName}</span>
                                  <span>· سعرها: {formatPrice(item.packagePrice ?? 0)}</span>
                                  <span>· خلص منها: {item.packageUsed ?? 0} من {item.packageTotal ?? 0} زيارة</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-stone-200/70 px-2 py-0.5 font-bold text-stone-700">
                                  غير مشترك في باقة
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-extrabold text-stone-900">سجل العمليات والتحصيلات</h3>
            <p className="mt-0.5 text-xs text-stone-500">كل عملية مالية مع الفلاتر الكاملة. استخدام زيارة الباقة وحده لا يُسجّل كتحصيل جديد.</p>
          </div>
          <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-700">
            {filteredTransactions.length} عملية
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">إجمالي التحصيلات المسجلة حسب الفلاتر</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(filteredCollected)}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
            <p className="text-xs font-bold text-stone-500">رسوم الشركة</p>
            <p className="mt-1 text-lg font-extrabold text-stone-900">{formatPrice(filteredFees)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
            <p className="text-xs font-bold text-emerald-800">صافي المحل بعد الرسوم (قبل المصروفات)</p>
            <p className="mt-1 text-lg font-extrabold text-emerald-700">{formatPrice(filteredNet)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="input bg-white" placeholder="بحث باسم العميل" />
          <select value={operationFilter} onChange={(e) => setOperationFilter(e.target.value)} className="input bg-white">
            <option value="all">كل أنواع العمليات</option>
            <option value="regular">حلاقة عادية مدفوعة</option>
            <option value="subscription">بيع باقة / اشتراك</option>
            <option value="extra">خدمة إضافية (0 رسوم شركة)</option>
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="input bg-white">
            <option value="all">كل طرق الدفع</option>
            <option value="cash">كاش</option>
            <option value="instapay">InstaPay</option>
            <option value="vodafone_cash">Vodafone Cash</option>
            <option value="card">بطاقة بنكية</option>
            <option value="unknown">غير محدد</option>
          </select>
          <label className="text-xs font-bold text-stone-600">
            من تاريخ
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input mt-1 bg-white" />
          </label>
          <label className="text-xs font-bold text-stone-600">
            إلى تاريخ
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input mt-1 bg-white" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input bg-white">
            <option value="all">كل الحالات</option>
            <option value="recorded">مسجل</option>
            <option value="refunded">مسترد</option>
            <option value="void">ملغي</option>
          </select>
        </div>

        {ledgerLoading ? (
          <div className="h-28 animate-shimmer rounded-xl" />
        ) : ledgerError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">تعذر تحميل سجل التحصيلات: {ledgerError}</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">لا توجد عمليات مطابقة للفلاتر الحالية.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[850px] text-right text-sm">
              <thead className="bg-stone-50 text-xs text-stone-600">
                <tr>
                  <th className="p-3">التاريخ والوقت</th>
                  <th className="p-3">اسم العميل</th>
                  <th className="p-3">نوع العملية</th>
                  <th className="p-3">المبلغ المحصل</th>
                  <th className="p-3">رسوم الشركة</th>
                  <th className="p-3">صافي المحل</th>
                  <th className="p-3">طريقة الدفع</th>
                  <th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => {
                  const customerName = transaction.customer_id ? customerNames.get(transaction.customer_id) ?? 'عميل غير معروف' : '—';
                  const isPackage = transaction.payment_kind === 'subscription';
                  const fee = Number(transaction.company_fee_amount || 0);
                  const amount = Number(transaction.amount || 0);
                  const operationLabel = isPackage ? 'بيع باقة' : fee > 0 ? 'حلاقة عادية' : 'خدمة إضافية';
                  const methodLabel: Record<string, string> = {
                    cash: 'كاش',
                    instapay: 'InstaPay',
                    vodafone_cash: 'Vodafone Cash',
                    card: 'بطاقة بنكية',
                    unknown: 'غير محدد',
                  };
                  const statusLabel: Record<string, string> = { recorded: 'مسجل', refunded: 'مسترد', void: 'ملغي' };
                  const active = transaction.payment_status === 'recorded';
                  return (
                    <tr key={transaction.id} className="border-t border-stone-100">
                      <td className="whitespace-nowrap p-3 text-xs text-stone-600">{formatDateTime(transaction.payment_date)}</td>
                      <td className="p-3 font-bold text-stone-800">{customerName}</td>
                      <td className="p-3">
                        <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-800">{operationLabel}</span>
                        {transaction.service_name && <p className="mt-1 text-xs text-stone-500">{transaction.service_name}</p>}
                      </td>
                      <td className="whitespace-nowrap p-3 font-bold">{formatPrice(amount)}</td>
                      <td className="whitespace-nowrap p-3 text-stone-600">{formatPrice(fee)}</td>
                      <td className="whitespace-nowrap p-3 font-bold text-emerald-700">{formatPrice(active ? amount - fee : 0)}</td>
                      <td className="whitespace-nowrap p-3 text-xs">{methodLabel[transaction.payment_method] ?? transaction.payment_method}</td>
                      <td className="p-3">
                        <span className={`rounded-lg px-2 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-stone-100 text-stone-600'}`}>
                          {statusLabel[transaction.payment_status] ?? transaction.payment_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h3 className="mb-3.5 font-display text-base font-extrabold text-stone-900">ماذا تستفيد من النظام؟</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Zap, title: 'تتبع فوري للزيارات', desc: 'سجل دقيق لكل عميل وزيارة دون دفاتر ورقية' },
            { icon: CalendarClock, title: 'تنبيهات الاشتراكات', desc: 'متابعة الاشتراكات القريبة من الانتهاء والمنتهية' },
            { icon: Award, title: 'نظام ولاء تلقائي', desc: 'احتساب الزيارات الفعلية ومستويات الولاء للعملاء' },
            { icon: Wallet, title: 'حساب الأرباح والمصروفات', desc: 'وضوح كامل للتحصيل، رسوم الشركة، المصروفات، والربح النهائي' },
            { icon: Sparkles, title: 'خدمات إضافية مرنة', desc: 'تسجيل خدمة إضافية أثناء زيارة الباقة لصالح المحل بالكامل' },
            { icon: Building2, title: 'دعم ومزامنة', desc: 'حفظ آمن للبيانات ومتابعة تشغيلية مستمرة' },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-900 text-white">
                <f.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-stone-900">{f.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- Add customer modal ---------- */
function AddCustomerModal({
  shopId,
  open,
  onClose,
  onCreated,
}: {
  shopId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!name.trim()) {
      setErr('الاسم مطلوب');
      return;
    }
    if (!phone.trim()) {
      setErr('رقم الهاتف مطلوب — يستخدمه العميل للدخول لصفحته');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await createCustomer(name.trim(), phone.trim() || undefined, notes.trim() || undefined, shopId);
      setName('');
      setPhone('');
      setNotes('');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="إضافة عميل جديد">
      <div className="space-y-4">
        <div>
          <label className="label">اسم العميل *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="مثال: أحمد محمد" />
        </div>
        <div>
          <label className="label">رقم الهاتف *</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="01xxxxxxxxx" dir="ltr" />
          <p className="mt-1 text-xs text-stone-500">مطلوب — يستخدمه العميل للدخول لصفحته</p>
        </div>
        <div>
          <label className="label">ملاحظات</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-20 resize-none" placeholder="ملاحظات اختيارية" />
        </div>
        {err && <p className="text-sm font-bold text-red-600">{err}</p>}
        <div className="flex gap-3">
          <button onClick={submit} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
          <button onClick={onClose} className="btn-ghost">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Customer drawer (full management with loyalty, subscriptions, visits & actions) ---------- */
function CustomerDrawer({
  shopId,
  regularHaircutPrice,
  customer,
  onClose,
  onChanged,
}: {
  shopId: string;
  regularHaircutPrice: number;
  customer: Customer | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pointsBalance, setPointsBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    const [s, v, p, ledgerRes] = await Promise.all([
      getActiveSubscription(customer.id),
      getVisitsByCustomer(customer.id),
      getPlans(shopId),
      supabase.from('points_ledger').select('points_delta').eq('customer_id', customer.id),
    ]);
    setSub(s);
    setVisits(v);
    setPlans(p);
    const totalPts = (ledgerRes.data ?? []).reduce((acc, row) => acc + Number(row.points_delta || 0), 0);
    setPointsBalance(totalPts);
    setLoading(false);
  }, [customer, shopId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!customer) return null;

  const active = sub?.status === 'active';
  const remaining = sub && sub.plan ? Math.max(0, sub.plan.haircut_count - sub.haircuts_used) : 0;
  const totalPaid = visits.filter((v) => v.payment_type === 'paid').reduce((s, v) => s + Number(v.charge_amount), 0);
  const daysLeft = sub ? Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000) : 0;

  const handleBlockToggle = async () => {
    if (!customer) return;
    setActionLoading(true);
    try {
      if (customer.is_blocked) {
        await unblockCustomer(customer.id);
      } else {
        await blockCustomer(customer.id);
      }
      onChanged();
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    setActionLoading(true);
    try {
      await deleteCustomer(customer.id);
      onChanged();
      onClose();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal open={!!customer} onClose={onClose} title={customer.name} maxWidth="max-w-2xl">
      <div className="space-y-5">
        {customer.is_blocked && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            <Ban className="h-4 w-4" />
            هذا العميل محظور — لا يمكنه الدخول لصفحته ولا تسجيل زياراته
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {customer.phone && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-bold text-stone-700">
              <Phone className="h-3.5 w-3.5" />
              <span dir="ltr">{customer.phone}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-stone-600">
            <Clock className="h-3.5 w-3.5" />
            عميل منذ {formatDate(customer.created_at)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-bold text-stone-800">
            <Award className="h-3.5 w-3.5" />
            رصيد الولاء: {pointsBalance} نقطة
          </span>
        </div>
        {customer.notes && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">{customer.notes}</div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-stone-900">{visits.length}</p>
            <p className="mt-0.5 text-[11px] font-bold text-stone-500">إجمالي الزيارات الفعلية</p>
          </div>
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-stone-900">
              {visits.length >= 20 ? 'ذهبي' : visits.length >= 10 ? 'فضي' : visits.length >= 5 ? 'برونزي' : 'جديد'}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-stone-500">مستوى الولاء</p>
          </div>
          <div className="card p-3 text-center">
            <p className="font-display text-xl font-extrabold text-stone-900">{formatPrice(totalPaid)}</p>
            <p className="mt-0.5 text-[11px] font-bold text-stone-500">مدفوع زيارات عادية</p>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${active ? 'border-emerald-200 bg-emerald-50/40' : 'border-stone-200 bg-stone-50/60'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {active ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              ) : (
                <XCircle className="h-5 w-5 text-stone-400" />
              )}
              <span className="text-sm font-bold text-stone-900">
                {active ? 'مشترك — اشتراك نشط' : 'غير مشترك حالياً'}
              </span>
            </div>
            <button
              onClick={() => setSubOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-bold text-white"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              {active ? 'تجديد / باقة جديدة' : 'إضافة اشتراك'}
            </button>
          </div>
          {active && sub && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-stone-500">الباقة</p>
                <p className="font-bold text-stone-800">{sub.plan?.name}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500">المتبقي</p>
                <p className="font-bold text-emerald-700">{remaining} حلاقة</p>
              </div>
              <div>
                <p className="text-xs text-stone-500">تنتهي في</p>
                <p className="font-bold text-stone-800">{formatDate(sub.end_date)}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500">المدة المتبقية</p>
                <p className={`font-bold ${daysLeft <= 3 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {daysLeft > 0 ? `${daysLeft} يوم` : 'انتهى'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-stone-700" />
              <span className="text-sm font-bold text-stone-900">تسجيل زيارة / حلاقة عادية / خدمة إضافية</span>
            </div>
            <button onClick={() => setVisitOpen(true)} disabled={customer.is_blocked} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
              تسجيل زيارة
            </button>
          </div>
          {customer.is_blocked ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
              <Ban className="h-3.5 w-3.5" />
              العميل محظور — لا يمكن تسجيل زيارات
            </p>
          ) : active && remaining > 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-600">
              <Info className="h-3.5 w-3.5 shrink-0" />
              يمكن خصم زيارة من الباقة ({remaining} متبقية) بدون رسوم إضافية أو إضافة خدمة إضافية بالكامل للمحل، أو تسجيل حلاقة عادية برسوم {formatPrice(COMPANY_FEE_PER_VISIT)}
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-600">
              <Info className="h-3.5 w-3.5 shrink-0" />
              حلاقة عادية للعميل غير المشترك بقيمة {formatPrice(regularHaircutPrice)} — رسوم الشركة {formatPrice(COMPANY_FEE_PER_VISIT)} وتُحسب في الولاء
            </p>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-bold text-stone-900">سجل الزيارات</h4>
          {loading ? (
            <div className="h-32 animate-shimmer rounded-xl" />
          ) : visits.length === 0 ? (
            <div className="card p-6 text-center text-sm text-stone-500">لا توجد زيارات مسجلة</div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pl-1">
              {visits.map((v) => (
                <div key={v.id} className="card flex items-center gap-3 p-3">
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                      v.payment_type === 'subscription' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-800'
                    }`}
                  >
                    {v.payment_type === 'subscription' ? <CheckCircle2 className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-800">{v.haircut_type ?? 'حلاقة'}</p>
                    <p className="text-xs text-stone-500">{formatDateTime(v.visit_date)}</p>
                  </div>
                  {v.payment_type === 'subscription' ? (
                    <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">اشتراك</span>
                  ) : (
                    <span className="font-bold text-stone-900">{formatPrice(Number(v.charge_amount))}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-red-200/80 bg-red-50/30 p-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-red-700">
            <ShieldAlert className="h-4 w-4" />
            إجراءات إدارية
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleBlockToggle}
              disabled={actionLoading}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                customer.is_blocked
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              <Ban className="h-3.5 w-3.5" />
              {customer.is_blocked ? 'فك الحظر' : 'حظر العميل'}
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف العميل
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-red-600">متأكد؟ كل البيانات هتتمسح</span>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  نعم احذف
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600">
                  إلغاء
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SubscribeModal
        open={subOpen}
        onClose={() => setSubOpen(false)}
        plans={plans}
        onSubscribe={async (planId, paymentMethod) => {
          await createSubscription(customer.id, planId, shopId, paymentMethod);
          setSubOpen(false);
          await load();
          onChanged();
        }}
      />
      <RecordVisitModal
        regularHaircutPrice={regularHaircutPrice}
        open={visitOpen}
        onClose={() => setVisitOpen(false)}
        active={active}
        remaining={remaining}
        onRecord={async (opts) => {
          await recordVisit(customer.id, { ...opts, shopId });
          setVisitOpen(false);
          await load();
          onChanged();
        }}
      />
    </Modal>
  );
}

function SubscribeModal({
  open,
  onClose,
  plans,
  onSubscribe,
}: {
  open: boolean;
  onClose: () => void;
  plans: Plan[];
  onSubscribe: (planId: string, paymentMethod: PaymentMethod) => Promise<void>;
}) {
  const [planId, setPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && plans.length) setPlanId(plans[0].id);
  }, [open, plans]);

  const submit = async () => {
    if (!planId) return;
    setSaving(true);
    try {
      await onSubscribe(planId, paymentMethod);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="اختر باقة الاشتراك">
      <div className="space-y-3">
        {plans.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlanId(p.id)}
            className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-right transition ${
              planId === p.id ? 'border-stone-900 bg-stone-50' : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                planId === p.id ? 'border-stone-900 bg-stone-900' : 'border-stone-300'
              }`}
            >
              {planId === p.id && <CheckCircle2 className="h-3 w-3 text-white" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-stone-900">{p.name}</p>
              <p className="text-xs text-stone-500">{p.description ?? ''}</p>
            </div>
            <div className="text-left">
              <p className="font-bold text-stone-900">{formatPrice(p.price)}</p>
              <p className="text-[11px] text-stone-500">{p.haircut_count} حلاقة / {p.duration_days} يوم</p>
            </div>
          </button>
        ))}
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
          <label className="label">طريقة دفع الاشتراك بالكامل *</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="input bg-white">
            <option value="cash">كاش</option>
            <option value="instapay">InstaPay</option>
            <option value="vodafone_cash">Vodafone Cash</option>
            <option value="card">بطاقة بنكية</option>
          </select>
          <p className="mt-1.5 text-xs text-stone-500">يتم تسجيل قيمة الباقة كاملة عند التفعيل، ورسوم الشركة للباقة تُحسب مرة واحدة عند البيع.</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={submit} disabled={saving || !planId} className="btn-primary flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {saving ? 'جاري...' : 'تفعيل الاشتراك'}
          </button>
          <button onClick={onClose} className="btn-ghost">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RecordVisitModal({
  regularHaircutPrice,
  open,
  onClose,
  active,
  remaining,
  initialForcePaid,
  onRecord,
}: {
  regularHaircutPrice: number;
  open: boolean;
  onClose: () => void;
  active: boolean;
  remaining: number;
  initialForcePaid?: boolean;
  onRecord: (opts: { haircutType: string; serviceName: string; customCharge: number; notes: string; forcePaid: boolean; paymentMethod: PaymentMethod }) => Promise<void>;
}) {
  const [serviceName, setServiceName] = useState('حلاقة عامة');
  const [notes, setNotes] = useState('');
  const [forcePaid, setForcePaid] = useState(false);
  const [customCharge, setCustomCharge] = useState(regularHaircutPrice);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setServiceName('حلاقة عامة');
    setNotes('');
    setForcePaid(!!initialForcePaid);
    setCustomCharge(active && remaining > 0 && !initialForcePaid ? 0 : regularHaircutPrice);
    setPaymentMethod('cash');
  }, [open, initialForcePaid, active, remaining, regularHaircutPrice]);

  const canUseSub = active && remaining > 0 && !forcePaid;

  const submit = async () => {
    setSaving(true);
    try {
      await onRecord({ haircutType: serviceName, serviceName, customCharge: Number(customCharge), notes, forcePaid, paymentMethod });
      setNotes('');
      setForcePaid(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="تسجيل زيارة" maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="label">اسم الخدمة *</label>
          <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="input" placeholder="مثال: حلاقة، تنظيف بشرة، تهذيب لحية" />
        </div>

        {active && remaining > 0 && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={forcePaid}
                onChange={(e) => {
                  setForcePaid(e.target.checked);
                  setCustomCharge(e.target.checked ? regularHaircutPrice : 0);
                }}
                className="h-4 w-4 accent-stone-900"
              />
              <span className="text-sm font-bold text-stone-700">احتسابها كحلاقة عادية (لا تخصم من الاشتراك)</span>
            </label>
          </div>
        )}

        <div className={`rounded-xl border p-3 text-xs font-bold leading-relaxed ${canUseSub ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800' : 'border-stone-200 bg-stone-50 text-stone-800'}`}>
          {canUseSub ? (
            <span className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              زيارة من الباقة ({remaining} متبقية): صفر رسوم إضافية، وأي خدمة إضافية تذهب بالكامل للمحل
            </span>
          ) : (
            <span className="flex items-start gap-1.5">
              <Coins className="mt-0.5 h-4 w-4 shrink-0 text-stone-700" />
              حلاقة عادية مدفوعة — رسوم الشركة {formatPrice(COMPANY_FEE_PER_VISIT)} والصافي ({formatPrice(Math.max(0, Number(customCharge) - COMPANY_FEE_PER_VISIT))})
            </span>
          )}
        </div>

        <div>
          <label className="label">{canUseSub ? 'قيمة خدمة إضافية أثناء الباقة (اختياري — 0 إذا لا يوجد)' : 'سعر الحلاقة العادية *'}</label>
          <input type="number" min={canUseSub ? 0 : 0.01} step="0.01" value={customCharge} onChange={(e) => setCustomCharge(Number(e.target.value))} className="input" />
        </div>

        {(!canUseSub || Number(customCharge) > 0) && (
          <div>
            <label className="label">طريقة الدفع *</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="input">
              <option value="cash">كاش</option>
              <option value="instapay">InstaPay</option>
              <option value="vodafone_cash">Vodafone Cash</option>
              <option value="card">بطاقة بنكية</option>
            </select>
          </div>
        )}

        <div>
          <label className="label">ملاحظات</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-16 resize-none" placeholder="اختياري" />
        </div>

        <div className="flex gap-3">
          <button
            onClick={submit}
            disabled={
              saving ||
              !serviceName.trim() ||
              (!canUseSub && (!Number.isFinite(Number(customCharge)) || Number(customCharge) <= 0)) ||
              (canUseSub && (!Number.isFinite(Number(customCharge)) || Number(customCharge) < 0))
            }
            className="btn-primary flex-1"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            {saving ? 'جاري التسجيل...' : 'تأكيد التسجيل'}
          </button>
          <button onClick={onClose} className="btn-ghost">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}