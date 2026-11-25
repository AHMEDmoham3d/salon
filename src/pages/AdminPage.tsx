import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type RevenueStats,
  type SubscriptionAlert,
  type PaymentMethod,
} from '@/lib/api';
import { REGULAR_HAIRCUT_PRICE, COMPANY_FEE_PER_VISIT, COMPANY_NAME, SYSTEM_NAME, supabase } from '@/lib/supabase';
import { getShopById } from '@/lib/shopApi';
import ShopSettingsTab from '@/components/ShopSettingsTab';

type Tab = 'overview' | 'customers' | 'visits' | 'subscriptions' | 'revenue' | 'settings';

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

type ShopFinancialSnapshot = {
  transactions: LedgerTx[];
  recordedTransactions: LedgerTx[];
  subscriptions: Subscription[];
  visits: Visit[];
  totalCollected: number;
  totalCompanyFees: number;
  netShopRevenue: number;
  todayCollected: number;
  todayFees: number;
  todayNet: number;
  thisMonthCollected: number;
  thisMonthFees: number;
  thisMonthNet: number;
  lastMonthCollected: number;
  lastMonthFees: number;
  lastMonthNet: number;
  packageSalesCount: number;
  packageSalesRevenue: number;
  extraServicesRevenue: number;
  regularPaidRevenue: number;
  actualVisitsCount: number;
  subscriptionVisitsUsed: number;
  regularVisitsCount: number;
};

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
  const [txData, { subscriptions, visits }] = await Promise.all([
    getShopPaymentTransactions(shopId, customerIds),
    getShopActivityData(customers, { shopId }),
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

  const packageSalesCount = recorded.filter((t) => t.payment_kind === 'subscription').length;
  const subscriptionVisitsUsed = visits.filter((v) => v.payment_type === 'subscription').length;
  const regularVisitsCount = visits.filter((v) => v.payment_type !== 'subscription').length;

  return {
    transactions,
    recordedTransactions: recorded,
    subscriptions,
    visits,
    totalCollected,
    totalCompanyFees,
    netShopRevenue: totalCollected - totalCompanyFees,
    todayCollected,
    todayFees,
    todayNet: todayCollected - todayFees,
    thisMonthCollected,
    thisMonthFees,
    thisMonthNet: thisMonthCollected - thisMonthFees,
    lastMonthCollected,
    lastMonthFees,
    lastMonthNet: lastMonthCollected - lastMonthFees,
    packageSalesCount,
    packageSalesRevenue,
    extraServicesRevenue,
    regularPaidRevenue,
    actualVisitsCount: visits.length,
    subscriptionVisitsUsed,
    regularVisitsCount,
  };
}

export function AdminDashboard({ shopId, onLogout }: { shopId: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [shopInfo, setShopInfo] = useState<{ shop_name: string; owner_name: string; logo_url?: string | null } | null>(null);
  const [regularHaircutPrice, setRegularHaircutPrice] = useState(REGULAR_HAIRCUT_PRICE);
  const [refreshTick, setRefreshTick] = useState(0);

  const bumpData = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getShopById(shopId), getShopRegularHaircutPrice(shopId)])
      .then(([shop, price]) => {
        if (!active) return;
        if (shop) {
          setShopInfo({ shop_name: shop.shop_name, owner_name: shop.owner_name, logo_url: shop.logo_url ?? null });
        }
        setRegularHaircutPrice(price);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [shopId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = search.trim() ? await searchShopCustomersByName(shopId, search.trim()) : await getShopCustomers(shopId);
      setCustomers(list);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search, shopId]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs: { k: Tab; label: string; icon: typeof Users }[] = [
    { k: 'overview', label: 'الملخص الرئيسي', icon: TrendingUp },
    { k: 'customers', label: 'العملاء', icon: Users },
    { k: 'visits', label: 'الزيارات', icon: Receipt },
    { k: 'subscriptions', label: 'الباقات والاشتراكات', icon: CalendarClock },
    { k: 'revenue', label: 'الإيرادات والتقارير', icon: Wallet },
    { k: 'settings', label: 'إعدادات المحل', icon: Settings },
  ];

  return (
    <div className="animate-fade-in mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6">
      <header className="card border-stone-200/90 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Brand + Shop Identity */}
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
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span>إدارة العملاء والباقات والزيارات والمالية</span>
                <span className="hidden text-stone-300 sm:inline">•</span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50/90 px-2.5 py-1 font-bold text-stone-800">
                  <Scissors className="h-3.5 w-3.5 text-stone-600" />
                  سعر الحلاقة العادية: {formatPrice(regularHaircutPrice)}
                </span>
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-stone-100 pt-4 lg:justify-end lg:border-t-0 lg:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setNoticeOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 text-xs font-bold text-stone-700 transition hover:border-stone-300 hover:bg-stone-100"
              >
                <Building2 className="h-4 w-4 shrink-0 text-stone-600" />
                <span>إشعار الشركة</span>
              </button>

              <button
                type="button"
                onClick={() => setAddOpen(true)}
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
              {t.label}
            </button>
          );
        })}
      </nav>

      <main className="min-w-0">
        {tab === 'overview' && (
          <Overview
            shopId={shopId}
            customers={customers}
            refreshTick={refreshTick}
            onGoSubs={() => setTab('subscriptions')}
            onGoRevenue={() => setTab('revenue')}
          />
        )}
        {tab === 'customers' && (
          <CustomersTab
            customers={customers}
            loading={loading}
            search={search}
            setSearch={setSearch}
            onSelect={setSelected}
            onAdd={() => setAddOpen(true)}
          />
        )}
        {tab === 'visits' && (
          <VisitsTab
            shopId={shopId}
            customers={customers}
            regularHaircutPrice={regularHaircutPrice}
            onSelectCustomer={setSelected}
            onMutated={bumpData}
          />
        )}
        {tab === 'subscriptions' && (
          <SubscriptionsTab
            shopId={shopId}
            customers={customers}
            refreshTick={refreshTick}
            onSelectCustomer={setSelected}
          />
        )}
        {tab === 'revenue' && (
          <RevenueTab
            shopId={shopId}
            customers={customers}
            refreshTick={refreshTick}
          />
        )}
        {tab === 'settings' && (
          <ShopSettingsTab
            shopId={shopId}
            onUpdated={(shop) => {
              setShopInfo({ shop_name: shop.shop_name, owner_name: shop.owner_name, logo_url: shop.logo_url ?? null });
              setRegularHaircutPrice(Number(shop.regular_haircut_price ?? REGULAR_HAIRCUT_PRICE));
              bumpData();
            }}
          />
        )}
      </main>

      <AddCustomerModal
        shopId={shopId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          load();
          bumpData();
        }}
      />
      <CustomerDrawer
        shopId={shopId}
        regularHaircutPrice={regularHaircutPrice}
        customer={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          load();
          bumpData();
        }}
      />
      <CompanyNoticeModal open={noticeOpen} onClose={() => setNoticeOpen(false)} shopInfo={shopInfo} />
    </div>
  );
}

/* ---------- Company Notice Modal (professional + electronic contract) ---------- */
function CompanyNoticeModal({
  open,
  onClose,
  shopInfo,
}: {
  open: boolean;
  onClose: () => void;
  shopInfo: { shop_name: string; owner_name: string } | null;
}) {
  const [view, setView] = useState<'notice' | 'contract'>('notice');
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);
  const today = new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  const contractId = shopInfo ? `${shopInfo.shop_name.substring(0, 2).toUpperCase()}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : '';

  useEffect(() => {
    if (open) {
      setView('notice');
      setAgreed(false);
      setSigned(false);
    }
  }, [open]);

  if (view === 'contract') {
    return (
      <Modal open={open} onClose={onClose} title="عقد ترخيص استخدام النظام" maxWidth="max-w-3xl">
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-stone-900 text-white">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-display text-lg font-extrabold text-stone-900">عقد ترخيص استخدام نظام {SYSTEM_NAME}</p>
                  <p className="text-xs text-stone-500">رقم العقد: {contractId}</p>
                </div>
              </div>
              <div className="text-left text-xs text-stone-500">
                <p>تاريخ الإصدار</p>
                <p className="font-bold text-stone-700">{today}</p>
              </div>
            </div>
          </div>

          <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-700">
            <div>
              <p className="mb-2 font-bold text-stone-900">تمهيد</p>
              <p>
                إنه في يوم <span className="font-bold">{today}</span>، تم الاتفاق بين طرف أول شركة{' '}
                <span className="font-bold text-stone-900">{COMPANY_NAME}</span> (المُنشئة والمالكة لنظام{' '}
                <span className="font-bold">{SYSTEM_NAME}</span>) وبين طرف ثانٍ محل الحلاقة المُسجّل باسم{' '}
                <span className="font-bold text-stone-900">{shopInfo?.shop_name ?? '—'}</span>، المملوك للسيد/ة{' '}
                <span className="font-bold text-stone-900">{shopInfo?.owner_name ?? '—'}</span>، على ترخيص استخدام النظام
                وفقاً للشروط والأحكام الآتية.
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-stone-900"
            />
            <span className="text-sm font-bold text-stone-700">
              أوافق على جميع بنود هذا العقد الإلكتروني الموثّق بين محلي وشركة {COMPANY_NAME}.
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={() => { setSigned(true); setTimeout(onClose, 800); }}
              disabled={!agreed || signed}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {signed ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {signed ? 'تم التوقيع والتوثيق' : 'توقيع وموافقة على العقد'}
            </button>
            <button onClick={() => setView('notice')} className="btn-ghost">
              رجوع
            </button>
          </div>

          {signed && (
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-100 p-3 text-sm font-bold text-stone-800">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              تم توثيق العقد إلكترونياً برقم {contractId} — محفوظ في نظام {COMPANY_NAME}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`إشعار من ${COMPANY_NAME}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-900 p-4 text-white">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10">
            <Building2 className="h-6 w-6 text-stone-100" />
          </div>
          <div>
            <p className="font-display text-lg font-extrabold">{COMPANY_NAME}</p>
            <p className="text-xs text-stone-300">إدارة أنظمة الحلاقة الذكية — {SYSTEM_NAME}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-stone-700">
          الحلاقة العادية المدفوعة تخضع لرسوم شركة ثابتة قدرها <span className="font-bold text-stone-900">{formatPrice(COMPANY_FEE_PER_VISIT)}</span>، وبيع الباقات يحتسب رسومها مرة واحدة عند البيع وفق قواعد النظام، بينما استخدام زيارة الباقة لا يضيف رسومًا جديدة والخدمات الإضافية أثناء زيارة الباقة تذهب بالكامل للمحل.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setView('contract')} className="btn-primary flex-1">
            <FileText className="h-4 w-4" />
            عرض وتوقيع العقد
          </button>
          <button onClick={onClose} className="btn-ghost">
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
    return () => { cancelled = true; };
  }, [customers, shopId, refreshTick]);

  const totalCollectedDisplay = snapshot ? snapshot.totalCollected : financial?.totalRevenue ?? 0;
  const companyFeesDisplay = snapshot ? snapshot.totalCompanyFees : financial?.companyFee ?? 0;
  const netRevenueDisplay = snapshot ? snapshot.netShopRevenue : financial?.netRevenue ?? 0;
  const actualVisitsDisplay = snapshot ? snapshot.actualVisitsCount : stats.totalVisits;
  const soldPackagesDisplay = snapshot ? snapshot.packageSalesCount : 0;
  const subVisitsUsedDisplay = snapshot ? snapshot.subscriptionVisitsUsed : 0;
  const extraServicesDisplay = snapshot ? snapshot.extraServicesRevenue : 0;

  const operationalCards = [
    { label: 'إجمالي العملاء', value: stats.totalCustomers, icon: Users },
    { label: 'اشتراكات نشطة', value: stats.activeSubs, icon: CheckCircle2 },
    { label: 'الزيارات الفعلية', value: actualVisitsDisplay, icon: Scissors },
    { label: 'الباقات والاشتراكات المباعة', value: soldPackagesDisplay, icon: Layers },
  ];

  const primarySummaryCards = [
    {
      label: 'إجمالي المبالغ المحصلة',
      value: stats.loading ? '—' : formatPrice(totalCollectedDisplay),
      detail: 'حلاقات عادية + باقات + خدمات إضافية مسجلة',
      tone: 'text-stone-900',
    },
    {
      label: 'صافي دخل المحل',
      value: stats.loading ? '—' : formatPrice(netRevenueDisplay),
      detail: 'إجمالي المحصل بعد خصم رسوم الشركة',
      tone: 'text-emerald-700',
    },
    {
      label: 'إجمالي رسوم الشركة المستحقة',
      value: stats.loading ? '—' : formatPrice(companyFeesDisplay),
      detail: 'بدون تكرار على زيارات الباقة',
      tone: 'text-stone-800',
    },
    {
      label: 'زيارات الباقات المستخدمة',
      value: stats.loading ? '—' : `${subVisitsUsedDisplay} زيارة`,
      detail: `من ${actualVisitsDisplay} زيارة فعلية · إضافية ${formatPrice(extraServicesDisplay)}`,
      tone: 'text-stone-800',
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
            <p className="mt-0.5 text-xs text-stone-500">
              مؤشرات التحصيل والصافي والرسوم والزيارات الحالية
            </p>
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
              الإيرادات والتقارير
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
          حلاقة عادية: رسوم الشركة {formatPrice(COMPANY_FEE_PER_VISIT)} والصافي (السعر − 10) · بيع باقة: تُحسب رسومها مرة واحدة عند البيع · استخدام زيارة من الباقة: صفر رسوم ولا يُعدّ تحصيلًا جديدًا · خدمة إضافية أثناء زيارة باقة: صفر رسوم وتُضاف كاملًا للمحل.
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
    return () => { active = false; };
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
  onSelectCustomer,
  onMutated,
}: {
  shopId: string;
  customers: Customer[];
  regularHaircutPrice: number;
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
                        onClick={() => { setVisitModalRow(row); setVisitModalForcePaid(false); }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        اشتراك
                      </button>
                      <button
                        onClick={() => { setVisitModalRow(row); setVisitModalForcePaid(true); }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-800 transition hover:bg-stone-50"
                      >
                        <Coins className="h-4 w-4 text-stone-600" />
                        عادي
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setVisitModalRow(row); setVisitModalForcePaid(false); }}
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
    return () => { cancelled = true; };
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
              {[...Array(4)].map((_, index) => <div key={index} className="h-20 animate-shimmer rounded-2xl" />)}
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
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      alert.isExpired ? 'bg-red-50 text-red-600 ring-1 ring-red-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    }`}>
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

/* ---------- Revenue, Analytics & Ledger tab ---------- */
function RevenueTab({
  shopId,
  customers,
  refreshTick,
}: {
  shopId: string;
  customers: Customer[];
  refreshTick: number;
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
    return () => { cancelled = true; };
  }, [customers, shopId, refreshTick]);

  const transactions = snapshot?.transactions ?? [];
  const allSubscriptions = snapshot?.subscriptions ?? [];
  const allVisits = snapshot?.visits ?? [];

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
  const now = new Date();

  const monthlyReport = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const key = `${year}-${month}`;
      const rows = reportTransactions.filter((transaction) => {
        const date = new Date(transaction.payment_date);
        return date.getFullYear() === year && date.getMonth() === month;
      });
      const collected = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const fees = rows.reduce((sum, row) => sum + Number(row.company_fee_amount || 0), 0);
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
        net: collected - fees,
        packages,
        regular,
        extras,
        details,
      };
    });
  }, [reportTransactions, now, customerNames, buildCustomerSubMeta]);

  const monthlyMax = Math.max(1, ...monthlyReport.map((row) => row.collected));

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

      const collected = dayTx.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const fees = dayTx.reduce((sum, row) => sum + Number(row.company_fee_amount || 0), 0);

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
        net: collected - fees,
        count: details.length,
        details,
      };
    });
  }, [reportTransactions, allVisits, customerNames, buildCustomerSubMeta]);

  const dailyMax = Math.max(1, ...dailyReport.map((row) => row.collected));

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
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold">
            <span className="text-stone-600">رسوم الشركة اليوم: {formatPrice(snapshot?.todayFees ?? 0)}</span>
            <span className="text-emerald-700">صافي المحل اليوم: {formatPrice(snapshot?.todayNet ?? 0)}</span>
          </div>
        </div>

        <div className="card p-5">
          <p className="text-xs font-bold text-stone-500">ملخص الشهر الحالي ومقارنته بالشهر السابق</p>
          <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
            محصل الشهر: {formatPrice(snapshot?.thisMonthCollected ?? 0)}
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold">
            <span className="text-stone-600">رسوم الشركة: {formatPrice(snapshot?.thisMonthFees ?? 0)}</span>
            <span className="text-emerald-700">صافي المحل: {formatPrice(snapshot?.thisMonthNet ?? 0)}</span>
            <span className="text-stone-500">الشهر السابق: {formatPrice(snapshot?.lastMonthCollected ?? 0)}</span>
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
            <p className="text-xs font-bold text-stone-500">إجمالي التحصيلات</p>
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
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-stone-900 text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-extrabold text-stone-900">رسوم {COMPANY_NAME}</h3>
              <p className="text-xs text-stone-500">
                حلاقة عادية: {formatPrice(COMPANY_FEE_PER_VISIT)} · باقة: تُحسب رسومها عند البيع حسب عدد زياراتها · خدمة إضافية أثناء الباقة: 0 رسوم
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="text-xs font-bold text-stone-600">الرسوم المستحقة (كل الوقت)</span>
              <span className="font-bold text-stone-900">{formatPrice(snapshot?.totalCompanyFees ?? stats.companyFee)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="text-xs font-bold text-stone-600">رسوم هذا الشهر</span>
              <span className="font-bold text-stone-900">{formatPrice(snapshot?.thisMonthFees ?? stats.thisMonthCompanyFee)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50/70 px-5 py-4">
          <div>
            <p className="font-bold text-stone-900">صافي دخل المحل</p>
            <p className="text-xs text-stone-500">إجمالي التحصيلات − رسوم الشركة</p>
          </div>
          <p className="font-display text-2xl font-extrabold text-emerald-700">
            {formatPrice(snapshot?.netShopRevenue ?? stats.netRevenue)}
          </p>
        </div>
      </section>

      <section className="card space-y-6 p-5">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-5 w-5 text-stone-700" />
          <div>
            <h3 className="font-display text-base font-extrabold text-stone-900">التقارير والرسوم البيانية ومقارنة الفترات</h3>
            <p className="mt-0.5 text-xs text-stone-500">اضغط على أي يوم أو شهر لعرض تفاصيل العملاء والباقات والزيارات.</p>
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
            <p className="text-xs font-bold text-stone-500">مقارنة الشهر الحالي بالشهر السابق</p>
            <p className="mt-1 text-sm font-extrabold text-stone-900">
              {formatPrice(snapshot?.thisMonthCollected ?? 0)} مقابل {formatPrice(snapshot?.lastMonthCollected ?? 0)}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">التحصيلات وصافي المحل — آخر 6 أشهر</h4>
            <div className="flex h-44 items-end gap-3 border-b border-stone-200 pb-2">
              {monthlyReport.map((month, idx) => (
                <div key={`${month.label}-${idx}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      title={`التحصيلات: ${formatPrice(month.collected)}`}
                      className="w-1/2 max-w-5 rounded-t bg-stone-800"
                      style={{ height: `${Math.max(2, (month.collected / monthlyMax) * 100)}%` }}
                    />
                    <div
                      title={`صافي المحل: ${formatPrice(month.net)}`}
                      className="w-1/2 max-w-5 rounded-t bg-emerald-600"
                      style={{ height: `${Math.max(2, (month.net / monthlyMax) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-stone-500">{month.shortLabel}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-stone-600">
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-stone-800" /> إجمالي التحصيل</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> صافي المحل</span>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
            <h4 className="mb-4 text-xs font-extrabold text-stone-800">الإيرادات اليومية — آخر 7 أيام</h4>
            <div className="flex h-44 items-end gap-2 border-b border-stone-200 pb-2">
              {dailyReport.map((day, idx) => (
                <div key={`${day.label}-${idx}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div
                    title={`${day.label}: ${formatPrice(day.collected)}`}
                    className="w-full max-w-7 rounded-t bg-stone-700"
                    style={{ height: `${Math.max(3, (day.collected / dailyMax) * 100)}%` }}
                  />
                  <span className="truncate text-[9px] font-bold text-stone-500">{day.shortLabel.split(' ')[0]}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-stone-500">
              إجمالي آخر 7 أيام: {formatPrice(dailyReport.reduce((s, d) => s + d.collected, 0))}
            </p>
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

        {/* Compact Expandable Monthly Summary (No large table) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-stone-800">ملخص آخر 6 أشهر (اضغط على الشهر للتفاصيل)</h4>
            <span className="text-[11px] text-stone-500">عرض مدمج</span>
          </div>
          <div className="space-y-2">
            {monthlyReport.map((month) => {
              const isOpen = expandedMonthKey === month.key;
              return (
                <div key={month.key} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedMonthKey(isOpen ? null : month.key)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-right transition hover:bg-stone-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-extrabold text-stone-900">{month.label}</span>
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">
                        {month.details.length} عملية
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                      <span className="font-bold text-stone-800">تحصيل: {formatPrice(month.collected)}</span>
                      <span className="font-bold text-emerald-700">صافي: {formatPrice(month.net)}</span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-stone-500" /> : <ChevronDown className="h-4 w-4 text-stone-500" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-stone-100 bg-stone-50/60 p-3.5 space-y-2.5">
                      <div className="flex flex-wrap gap-3 text-[11px] font-bold text-stone-600">
                        <span>رسوم الشركة: {formatPrice(month.fees)}</span>
                        <span>·</span>
                        <span>باقات: {formatPrice(month.packages)}</span>
                        <span>·</span>
                        <span>حلاقات عادية: {formatPrice(month.regular)}</span>
                        <span>·</span>
                        <span>خدمات إضافية: {formatPrice(month.extras)}</span>
                      </div>
                      {month.details.length === 0 ? (
                        <p className="text-xs text-stone-500">لا توجد عمليات مسجلة في هذا الشهر.</p>
                      ) : (
                        <div className="space-y-2">
                          {month.details.map((item) => (
                            <div key={item.id} className="rounded-lg border border-stone-200 bg-white p-3 text-xs space-y-1">
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
                                <span className="text-emerald-700">صافي: <strong>{formatPrice(item.net)}</strong></span>
                              </div>
                              <div className="pt-0.5 text-[11px]">
                                {item.isSubscribed ? (
                                  <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 ring-1 ring-emerald-200">
                                    <span>مشترك في باقة: {item.packageName}</span>
                                    <span>· سعرها: {formatPrice(item.packagePrice ?? 0)}</span>
                                    <span>· خلص منها: {item.packageUsed ?? 0} من {item.packageTotal ?? 0} زيارة</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 font-bold text-stone-600">
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
              );
            })}
          </div>
        </div>

        {/* Compact Expandable Daily Summary (No large table) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-stone-800">ملخص آخر 7 أيام (اضغط على اليوم لعرض مين جالك وعمل إيه)</h4>
            <span className="text-[11px] text-stone-500">عرض مدمج</span>
          </div>
          <div className="space-y-2">
            {dailyReport.map((day) => {
              const isOpen = expandedDayKey === day.key;
              return (
                <div key={day.key} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedDayKey(isOpen ? null : day.key)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-right transition hover:bg-stone-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-extrabold text-stone-900">{day.label}</span>
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">
                        {day.count} حركة
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                      <span className="font-bold text-stone-800">تحصيل: {formatPrice(day.collected)}</span>
                      <span className="font-bold text-emerald-700">صافي: {formatPrice(day.net)}</span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-stone-500" /> : <ChevronDown className="h-4 w-4 text-stone-500" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-stone-100 bg-stone-50/60 p-3.5 space-y-2.5">
                      <div className="flex flex-wrap gap-3 text-[11px] font-bold text-stone-600">
                        <span>رسوم الشركة: {formatPrice(day.fees)}</span>
                        <span>·</span>
                        <span>صافي المحل: {formatPrice(day.net)}</span>
                      </div>
                      {day.details.length === 0 ? (
                        <p className="text-xs text-stone-500">لا توجد زيارات أو عمليات في هذا اليوم.</p>
                      ) : (
                        <div className="space-y-2">
                          {day.details.map((item) => (
                            <div key={item.id} className="rounded-lg border border-stone-200 bg-white p-3 text-xs space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-extrabold text-stone-900">
                                  {item.customerName} — {item.actionSummary}
                                </span>
                                <span className="text-[11px] font-bold text-stone-500">الساعة {item.timeLabel}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                                <span>المبلغ: <strong>{formatPrice(item.amount)}</strong></span>
                                <span>·</span>
                                <span>رسوم الشركة: <strong>{formatPrice(item.fee)}</strong></span>
                                <span>·</span>
                                <span className="text-emerald-700">صافي المحل: <strong>{formatPrice(item.net)}</strong></span>
                              </div>
                              <div className="pt-0.5 text-[11px]">
                                {item.isSubscribed ? (
                                  <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 ring-1 ring-emerald-200">
                                    <span>مشترك في باقة: {item.packageName}</span>
                                    <span>· سعرها: {formatPrice(item.packagePrice ?? 0)}</span>
                                    <span>· خلص منها: {item.packageUsed ?? 0} من {item.packageTotal ?? 0} زيارة</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 font-bold text-stone-600">
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
            <p className="text-xs font-bold text-emerald-800">صافي المحل بعد الرسوم</p>
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
            { icon: Wallet, title: 'حساب الأرباح والرسوم', desc: 'وضوح كامل للمحصل، صافي المحل، ورسوم الشركة' },
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
                onChange={(e) => { setForcePaid(e.target.checked); setCustomCharge(e.target.checked ? regularHaircutPrice : 0); }}
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