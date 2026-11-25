import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  Wallet,
  Store,
  AlertTriangle,
  ShieldCheck,
  Search,
  Trash2,
  LogOut,
  Users,
  BarChart3,
  Wrench,
  Download,
  Calculator,
  FileCheck2,
  RefreshCw,
} from 'lucide-react';
import Modal from '@/components/Modal';
import {
  getAllShops,
  updateShopStatus,
  deleteShop,
  getCompanyTotalFees,
  getShopAdmin,
  type Shop,
  type ShopAdmin,
  type ShopStatus,
} from '@/lib/shopApi';
import { COMPANY_FEE_PER_VISIT, COMPANY_NAME, SYSTEM_NAME, supabase } from '@/lib/supabase';
import { formatPrice, formatDate, formatDateTime, type Customer } from '@/lib/api';

type CompanyTab = 'shops' | 'customers' | 'reports' | 'tools';

type VisitRecord = {
  id: string;
  customer_id: string;
  shop_id?: string | null;
  payment_type?: string | null;
  amount_paid?: number | null;
  created_at?: string | null;
};

type SubscriptionRecord = {
  id: string;
  customer_id: string;
  shop_id?: string | null;
  status?: string | null;
  haircuts_used?: number | null;
  created_at?: string | null;
  plan?: { name?: string | null; haircut_count?: number | null } | null;
};

type CustomerWithDetails = Customer & {
  shop_id?: string | null;
  shop_name: string;
  total_visits: number;
  paid_visits: number;
  sub_visits: number;
  active_plan_name: string | null;
  remaining_haircuts: number;
  last_visit_at: string | null;
};

type ShopDetailedMetrics = {
  customersCount: number;
  activeSubsCount: number;
  totalVisits: number;
  paidVisits: number;
  subVisits: number;
  calculatedFees: number;
  contractSigned: boolean;
  contractNumber: string | null;
  contractSignedAt: string | null;
};

const STATUS_META: Record<
  ShopStatus,
  { label: string; badgeClass: string; icon: typeof Clock }
> = {
  pending: {
    label: 'بانتظار الموافقة',
    badgeClass: 'bg-amber-100 text-amber-800',
    icon: Clock,
  },
  approved: {
    label: 'نشط',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'مرفوض',
    badgeClass: 'bg-red-100 text-red-800',
    icon: XCircle,
  },
  blocked: {
    label: 'محظور',
    badgeClass: 'bg-stone-200 text-stone-700',
    icon: Ban,
  },
};

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv =
    '\uFEFF' +
    [headers.map(escapeCell).join(','), ...rows.map((row) => row.map(escapeCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function CompanyPage({ onLogout }: { onLogout: () => void | Promise<void> }) {
  const [activeTab, setActiveTab] = useState<CompanyTab>('shops');
  const [shops, setShops] = useState<Shop[]>([]);
  const [customers, setCustomers] = useState<CustomerWithDetails[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [shopMetrics, setShopMetrics] = useState<Record<string, ShopDetailedMetrics>>({});
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getCompanyTotalFees>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Shops filters
  const [shopSearch, setShopSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShopStatus | 'all'>('all');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  // Customers filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerShopFilter, setCustomerShopFilter] = useState<string>('all');

  // Tools state
  const [calcVisits, setCalcVisits] = useState<number>(100);
  const [calcFeePerVisit, setCalcFeePerVisit] = useState<number>(COMPANY_FEE_PER_VISIT);
  const [inspectedShopId, setInspectedShopId] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [shopsList, feesStats, customersRes, visitsRes, subsRes, contractsRes] = await Promise.all([
        getAllShops(),
        getCompanyTotalFees(),
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase.from('visits').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*, plan:plans(name, haircut_count)'),
        supabase
          .from('shop_contracts')
          .select('shop_id, contract_number, signed_at')
          .then((r) => r, () => ({ data: [] as unknown[] })),
      ]);

      setShops(shopsList);
      setStats(feesStats);

      const shopNameById = new Map<string, string>();
      const metricsByShop: Record<string, ShopDetailedMetrics> = {};

      for (const s of shopsList) {
        shopNameById.set(s.id, s.shop_name);
        metricsByShop[s.id] = {
          customersCount: 0,
          activeSubsCount: 0,
          totalVisits: 0,
          paidVisits: 0,
          subVisits: 0,
          calculatedFees: 0,
          contractSigned: false,
          contractNumber: null,
          contractSignedAt: null,
        };
      }

      const rawContracts = ((contractsRes as { data?: unknown[] }).data ?? []) as {
        shop_id?: string | null;
        contract_number?: string | null;
        signed_at?: string | null;
      }[];

      for (const c of rawContracts) {
        if (c.shop_id && metricsByShop[c.shop_id]) {
          metricsByShop[c.shop_id].contractSigned = true;
          metricsByShop[c.shop_id].contractNumber = c.contract_number ?? null;
          metricsByShop[c.shop_id].contractSignedAt = c.signed_at ?? null;
        }
      }

      const rawCustomers = (customersRes.data ?? []) as (Customer & { shop_id?: string | null })[];
      const rawVisits = (visitsRes.data ?? []) as VisitRecord[];
      const rawSubs = (subsRes.data ?? []) as SubscriptionRecord[];

      setVisits(rawVisits);

      const customerShopIdById = new Map<string, string>();
      for (const cust of rawCustomers) {
        if (cust.shop_id) {
          customerShopIdById.set(cust.id, cust.shop_id);
          if (metricsByShop[cust.shop_id]) {
            metricsByShop[cust.shop_id].customersCount += 1;
          }
        }
      }

      const visitStatsByCustomer = new Map<
        string,
        { total: number; paid: number; sub: number; lastAt: string | null }
      >();

      for (const v of rawVisits) {
        const sid = v.shop_id || customerShopIdById.get(v.customer_id) || null;
        const prevCust = visitStatsByCustomer.get(v.customer_id) ?? {
          total: 0,
          paid: 0,
          sub: 0,
          lastAt: null,
        };
        prevCust.total += 1;
        if (v.payment_type === 'paid') {
          prevCust.paid += 1;
        } else if (v.payment_type === 'subscription') {
          prevCust.sub += 1;
        }
        if (v.created_at && (!prevCust.lastAt || v.created_at > prevCust.lastAt)) {
          prevCust.lastAt = v.created_at;
        }
        visitStatsByCustomer.set(v.customer_id, prevCust);

        if (sid && metricsByShop[sid]) {
          metricsByShop[sid].totalVisits += 1;
          if (v.payment_type === 'paid') {
            metricsByShop[sid].paidVisits += 1;
            metricsByShop[sid].calculatedFees += COMPANY_FEE_PER_VISIT;
          } else if (v.payment_type === 'subscription') {
            metricsByShop[sid].subVisits += 1;
          }
        }
      }

      const activeSubByCustomer = new Map<
        string,
        { planName: string | null; remaining: number }
      >();

      for (const sub of rawSubs) {
        const sid = sub.shop_id || customerShopIdById.get(sub.customer_id) || null;
        if (sub.status === 'active') {
          if (sid && metricsByShop[sid]) {
            metricsByShop[sid].activeSubsCount += 1;
          }
          if (!activeSubByCustomer.has(sub.customer_id)) {
            const totalHaircuts = Number(sub.plan?.haircut_count ?? 0);
            const usedHaircuts = Number(sub.haircuts_used ?? 0);
            activeSubByCustomer.set(sub.customer_id, {
              planName: sub.plan?.name ?? 'باقة نشطة',
              remaining: Math.max(0, totalHaircuts - usedHaircuts),
            });
          }
        }
      }

      const detailedCustomers: CustomerWithDetails[] = rawCustomers.map((cust) => {
        const sid = cust.shop_id ?? null;
        const vInfo = visitStatsByCustomer.get(cust.id);
        const sInfo = activeSubByCustomer.get(cust.id);
        return {
          ...cust,
          shop_id: sid,
          shop_name: (sid && shopNameById.get(sid)) || 'غير مرتبط بمحل',
          total_visits: vInfo?.total ?? 0,
          paid_visits: vInfo?.paid ?? 0,
          sub_visits: vInfo?.sub ?? 0,
          active_plan_name: sInfo?.planName ?? null,
          remaining_haircuts: sInfo?.remaining ?? 0,
          last_visit_at: vInfo?.lastAt ?? null,
        };
      });

      setShopMetrics(metricsByShop);
      setCustomers(detailedCustomers);
      setInspectedShopId((prev) => prev || (shopsList[0]?.id ?? ''));
    } catch {
      setShops([]);
      setCustomers([]);
      setVisits([]);
      setShopMetrics({});
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const pendingShops = useMemo(
    () => shops.filter((s) => s.status === 'pending'),
    [shops]
  );

  const filteredShops = useMemo(() => {
    return shops.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (shopSearch.trim()) {
        const q = shopSearch.trim().toLowerCase();
        return (
          s.shop_name.toLowerCase().includes(q) ||
          s.owner_name.toLowerCase().includes(q) ||
          s.owner_phone.includes(q) ||
          s.owner_email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [shops, statusFilter, shopSearch]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (customerShopFilter !== 'all' && c.shop_id !== customerShopFilter) return false;
      if (customerSearch.trim()) {
        const q = customerSearch.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          c.shop_name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [customers, customerShopFilter, customerSearch]);

  const rankedShops = useMemo(() => {
    return [...shops].sort((a, b) => {
      const ma = shopMetrics[a.id];
      const mb = shopMetrics[b.id];
      return (mb?.calculatedFees ?? 0) - (ma?.calculatedFees ?? 0);
    });
  }, [shops, shopMetrics]);

  const handleStatusChange = async (shopId: string, status: ShopStatus) => {
    try {
      await updateShopStatus(shopId, status);
      setActionMessage(`تم تحديث حالة المحل إلى: ${STATUS_META[status].label}`);
      refresh();
    } catch {
      setActionMessage('تعذر تحديث حالة المحل، حاول مرة أخرى.');
    }
  };

  const handleApproveAllPending = async () => {
    if (pendingShops.length === 0) return;
    try {
      await Promise.all(pendingShops.map((s) => updateShopStatus(s.id, 'approved')));
      setActionMessage(`تم اعتماد ${pendingShops.length} محل بنجاح.`);
      refresh();
    } catch {
      setActionMessage('حدث خطأ أثناء اعتماد بعض المحلات.');
    }
  };

  const handleDeleteShop = async (shopId: string) => {
    try {
      await deleteShop(shopId);
      setSelectedShop(null);
      setActionMessage('تم حذف المحل نهائيًا.');
      refresh();
    } catch {
      setActionMessage('تعذر حذف المحل.');
    }
  };

  const exportShopsCsv = () => {
    downloadCsv(
      'company-shops-report.csv',
      [
        'اسم المحل',
        'نوع المحل',
        'المالك',
        'الهاتف',
        'الحالة',
        'عدد العملاء',
        'الاشتراكات النشطة',
        'إجمالي الزيارات',
        'زيارات مدفوعة',
        'الرسوم المحسوبة',
        'حالة العقد',
      ],
      shops.map((s) => {
        const m = shopMetrics[s.id];
        return [
          s.shop_name,
          s.shop_type,
          s.owner_name,
          s.owner_phone,
          STATUS_META[s.status].label,
          m?.customersCount ?? 0,
          m?.activeSubsCount ?? 0,
          m?.totalVisits ?? 0,
          m?.paidVisits ?? 0,
          m?.calculatedFees ?? 0,
          m?.contractSigned ? `موقّع (${m.contractNumber ?? ''})` : 'غير موقّع',
        ];
      })
    );
  };

  const exportCustomersCsv = () => {
    downloadCsv(
      'company-customers-report.csv',
      [
        'اسم العميل',
        'الهاتف',
        'المحل',
        'إجمالي الزيارات',
        'زيارات مدفوعة',
        'زيارات باقة',
        'الباقة النشطة',
        'المتبقي',
        'آخر زيارة',
      ],
      customers.map((c) => [
        c.name,
        c.phone ?? '',
        c.shop_name,
        c.total_visits,
        c.paid_visits,
        c.sub_visits,
        c.active_plan_name ?? 'لا يوجد',
        c.remaining_haircuts,
        c.last_visit_at ? formatDateTime(c.last_visit_at) : 'لم يزر بعد',
      ])
    );
  };

  const tabs: { id: CompanyTab; label: string; icon: typeof Store; count?: number }[] = [
    { id: 'shops', label: 'المحلات', icon: Store, count: shops.length },
    { id: 'customers', label: 'العملاء', icon: Users, count: customers.length },
    { id: 'reports', label: 'التقارير', icon: BarChart3 },
    { id: 'tools', label: 'الأدوات', icon: Wrench },
  ];

  const inspectedShop = shops.find((s) => s.id === inspectedShopId) ?? null;
  const inspectedMetrics = inspectedShop ? shopMetrics[inspectedShop.id] : undefined;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Header */}
      <header className="border-b border-stone-200 bg-stone-900 text-stone-50">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-stone-800 text-amber-400">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-xl font-extrabold sm:text-2xl">
                  {COMPANY_NAME} — إدارة الشركة
                </h1>
                <p className="text-xs text-stone-400 sm:text-sm">
                  {SYSTEM_NAME} — متابعة المحلات والعملاء والرسوم والتقارير
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="hidden items-center gap-1.5 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-amber-400 sm:inline-flex">
                <ShieldCheck className="h-4 w-4" />
                حساب الشركة
              </span>
              <button
                type="button"
                onClick={() => void onLogout()}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-800 px-3.5 py-2 text-xs font-bold text-stone-100 transition hover:bg-stone-700"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </button>
            </div>
          </div>

          {/* Primary Tabs */}
          <nav className="mt-6 flex flex-wrap gap-2 border-t border-stone-800 pt-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition sm:text-sm ${
                    isActive
                      ? 'bg-amber-400 text-stone-950'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
                        isActive ? 'bg-stone-900 text-amber-300' : 'bg-stone-900 text-stone-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6">
        {actionMessage && (
          <div className="flex items-center justify-between rounded-xl border border-stone-300 bg-white px-4 py-3 text-xs font-bold text-stone-800">
            <span>{actionMessage}</span>
            <button
              type="button"
              onClick={() => setActionMessage('')}
              className="text-stone-500 hover:text-stone-900"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500">إجمالي المحلات</span>
              <Store className="h-4 w-4 text-stone-700" />
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {stats?.totalShops ?? shops.length}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              نشط: {stats?.approvedShops ?? shops.filter((s) => s.status === 'approved').length} · معلق:{' '}
              {stats?.pendingShops ?? pendingShops.length}
            </p>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500">إجمالي العملاء</span>
              <Users className="h-4 w-4 text-stone-700" />
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {customers.length}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              مشتركين نشطين: {customers.filter((c) => c.active_plan_name !== null).length}
            </p>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500">رسوم الشهر الحالي</span>
              <Clock className="h-4 w-4 text-amber-700" />
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {formatPrice(stats?.thisMonthFees ?? 0)}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {stats?.thisMonthVisits ?? 0} زيارة × {formatPrice(COMPANY_FEE_PER_VISIT)}
            </p>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500">إجمالي الرسوم (كل الوقت)</span>
              <Wallet className="h-4 w-4 text-stone-900" />
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">
              {formatPrice(stats?.totalFees ?? 0)}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              إجمالي الزيارات المسجلة: {visits.length}
            </p>
          </div>
        </section>

        {/* Pending Banner */}
        {pendingShops.length > 0 && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm font-bold text-stone-800">
                يوجد {pendingShops.length} محل بانتظار قرار الاعتماد أو الرفض.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleApproveAllPending()}
              className="rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-amber-50 transition hover:bg-stone-800"
            >
              اعتماد جميع المعلقين
            </button>
          </section>
        )}

        {/* TAB 1: SHOPS */}
        {activeTab === 'shops' && (
          <section className="space-y-4">
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="relative min-w-[240px] flex-1">
                <Search className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  value={shopSearch}
                  onChange={(e) => setShopSearch(e.target.value)}
                  placeholder="بحث باسم المحل، المالك، الهاتف، أو البريد..."
                  className="input pr-10"
                />
              </div>

              <div className="flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
                {(
                  [
                    { key: 'all', label: 'الكل' },
                    { key: 'pending', label: 'بانتظار' },
                    { key: 'approved', label: 'نشط' },
                    { key: 'rejected', label: 'مرفوض' },
                    { key: 'blocked', label: 'محظور' },
                  ] as { key: ShopStatus | 'all'; label: string }[]
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatusFilter(item.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      statusFilter === item.key
                        ? 'bg-stone-900 text-amber-50'
                        : 'text-stone-600 hover:bg-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 animate-shimmer rounded-2xl" />
                ))}
              </div>
            ) : filteredShops.length === 0 ? (
              <div className="card p-10 text-center">
                <Store className="mx-auto h-9 w-9 text-stone-300" />
                <p className="mt-2 text-sm font-bold text-stone-600">لا توجد محلات مطابقة للبحث</p>
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 text-xs font-bold text-stone-600">
                    <tr>
                      <th className="px-4 py-3">المحل</th>
                      <th className="px-4 py-3">المالك والتواصل</th>
                      <th className="px-4 py-3">العملاء</th>
                      <th className="px-4 py-3">الزيارات</th>
                      <th className="px-4 py-3">الرسوم المحسوبة</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredShops.map((shop) => {
                      const meta = STATUS_META[shop.status];
                      const StatusIcon = meta.icon;
                      const m = shopMetrics[shop.id];
                      return (
                        <tr key={shop.id} className="hover:bg-stone-50/80">
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => setSelectedShop(shop)}
                              className="text-right font-bold text-stone-900 hover:underline"
                            >
                              {shop.shop_name}
                            </button>
                            <p className="text-xs text-stone-500">
                              {shop.shop_type} · {m?.contractSigned ? 'عقد موثّق' : 'بدون عقد'}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            <p className="font-bold text-stone-800">{shop.owner_name}</p>
                            <p className="text-stone-500" dir="ltr">
                              {shop.owner_phone}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold text-stone-800">
                            {m?.customersCount ?? 0}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-stone-700">
                            <span className="font-bold">{m?.totalVisits ?? 0}</span>
                            <span className="text-stone-400"> ({m?.paidVisits ?? 0} مدفوعة)</span>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-extrabold text-stone-900">
                            {formatPrice(m?.calculatedFees ?? 0)}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`badge ${meta.badgeClass}`}>
                              <StatusIcon className="h-3 w-3" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {shop.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleStatusChange(shop.id, 'approved')}
                                    className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                                  >
                                    اعتماد
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleStatusChange(shop.id, 'rejected')}
                                    className="rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-200"
                                  >
                                    رفض
                                  </button>
                                </>
                              )}
                              {shop.status === 'approved' && (
                                <button
                                  type="button"
                                  onClick={() => void handleStatusChange(shop.id, 'blocked')}
                                  className="rounded-lg bg-stone-200 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-300"
                                >
                                  حظر
                                </button>
                              )}
                              {(shop.status === 'blocked' || shop.status === 'rejected') && (
                                <button
                                  type="button"
                                  onClick={() => void handleStatusChange(shop.id, 'approved')}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                                >
                                  تفعيل
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedShop(shop)}
                                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100"
                              >
                                التفاصيل
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 2: CUSTOMERS */}
        {activeTab === 'customers' && (
          <section className="space-y-4">
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex flex-1 flex-wrap gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="بحث باسم العميل، رقم الهاتف، أو المحل..."
                    className="input pr-10"
                  />
                </div>
                <select
                  value={customerShopFilter}
                  onChange={(e) => setCustomerShopFilter(e.target.value)}
                  className="input w-auto min-w-[190px]"
                >
                  <option value="all">كل المحلات ({customers.length})</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shop_name} ({shopMetrics[s.id]?.customersCount ?? 0})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={exportCustomersCsv}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-3.5 py-2.5 text-xs font-bold text-amber-50 hover:bg-stone-800"
              >
                <Download className="h-4 w-4 text-amber-400" />
                تصدير CSV
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 animate-shimmer rounded-xl" />
                ))}
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="card p-10 text-center">
                <Users className="mx-auto h-9 w-9 text-stone-300" />
                <p className="mt-2 text-sm font-bold text-stone-600">لا يوجد عملاء مطابقون</p>
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 text-xs font-bold text-stone-600">
                    <tr>
                      <th className="px-4 py-3">العميل</th>
                      <th className="px-4 py-3">الهاتف</th>
                      <th className="px-4 py-3">المحل</th>
                      <th className="px-4 py-3">الزيارات (مدفوعة / باقة)</th>
                      <th className="px-4 py-3">الباقة النشطة</th>
                      <th className="px-4 py-3">آخر زيارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredCustomers.map((cust) => (
                      <tr key={cust.id} className="hover:bg-stone-50/80">
                        <td className="px-4 py-3 font-bold text-stone-900">
                          {cust.name}
                          {cust.is_blocked && (
                            <span className="mr-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                              محظور
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-600" dir="ltr">
                          {cust.phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-stone-800">{cust.shop_name}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className="font-bold text-stone-900">{cust.total_visits}</span>{' '}
                          <span className="text-stone-500">
                            ({cust.paid_visits} / {cust.sub_visits})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {cust.active_plan_name ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800">
                              {cust.active_plan_name} · متبقي {cust.remaining_haircuts}
                            </span>
                          ) : (
                            <span className="text-stone-400">لا يوجد</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-500">
                          {cust.last_visit_at ? formatDate(cust.last_visit_at) : 'لم يزر بعد'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: REPORTS */}
        {activeTab === 'reports' && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-extrabold text-stone-900">
                  تقرير الأداء والرسوم حسب المحل
                </h2>
                <p className="text-xs text-stone-500">
                  مرتب تنازليًا حسب الرسوم المحسوبة من الزيارات المدفوعة
                </p>
              </div>
              <button
                type="button"
                onClick={exportShopsCsv}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-amber-50 hover:bg-stone-800"
              >
                <Download className="h-4 w-4 text-amber-400" />
                تصدير تقرير المحلات CSV
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card p-4">
                <p className="text-xs font-bold text-stone-500">متوسط العملاء لكل محل</p>
                <p className="mt-1 font-display text-2xl font-extrabold text-stone-900">
                  {shops.length > 0 ? (customers.length / shops.length).toFixed(1) : '0.0'}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-xs font-bold text-stone-500">العقود الموثّقة</p>
                <p className="mt-1 font-display text-2xl font-extrabold text-stone-900">
                  {Object.values(shopMetrics).filter((m) => m.contractSigned).length} / {shops.length}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-xs font-bold text-stone-500">نسبة الزيارات المدفوعة</p>
                <p className="mt-1 font-display text-2xl font-extrabold text-stone-900">
                  {visits.length > 0
                    ? `${Math.round(
                        (visits.filter((v) => v.payment_type === 'paid').length / visits.length) * 100
                      )}%`
                    : '0%'}
                </p>
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs font-bold text-stone-600">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">المحل</th>
                    <th className="px-4 py-3">العملاء</th>
                    <th className="px-4 py-3">الاشتراكات النشطة</th>
                    <th className="px-4 py-3">زيارات مدفوعة</th>
                    <th className="px-4 py-3">زيارات باقة</th>
                    <th className="px-4 py-3">الرسوم المحسوبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rankedShops.map((s, idx) => {
                    const m = shopMetrics[s.id];
                    return (
                      <tr key={s.id} className="hover:bg-stone-50/80">
                        <td className="px-4 py-3 text-xs font-bold text-stone-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-stone-900">{s.shop_name}</td>
                        <td className="px-4 py-3 text-xs font-bold">{m?.customersCount ?? 0}</td>
                        <td className="px-4 py-3 text-xs font-bold">{m?.activeSubsCount ?? 0}</td>
                        <td className="px-4 py-3 text-xs font-bold">{m?.paidVisits ?? 0}</td>
                        <td className="px-4 py-3 text-xs font-bold">{m?.subVisits ?? 0}</td>
                        <td className="px-4 py-3 text-xs font-extrabold text-stone-900">
                          {formatPrice(m?.calculatedFees ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 4: TOOLS */}
        {activeTab === 'tools' && (
          <section className="grid gap-6 md:grid-cols-2">
            {/* Fee Calculator */}
            <div className="card space-y-4 p-5">
              <div className="flex items-center gap-2.5">
                <Calculator className="h-5 w-5 text-stone-800" />
                <div>
                  <h3 className="font-display text-base font-extrabold text-stone-900">حاسبة الرسوم</h3>
                  <p className="text-xs text-stone-500">تقدير الرسوم بناءً على عدد الزيارات المدفوعة</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">عدد الزيارات</label>
                  <input
                    type="number"
                    min={0}
                    value={calcVisits}
                    onChange={(e) => setCalcVisits(Math.max(0, Number(e.target.value)))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">رسوم الزيارة الواحدة</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={calcFeePerVisit}
                    onChange={(e) => setCalcFeePerVisit(Math.max(0, Number(e.target.value)))}
                    className="input"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-bold text-stone-500">الإجمالي المتوقع</p>
                <p className="mt-1 font-display text-2xl font-extrabold text-stone-900">
                  {formatPrice(calcVisits * calcFeePerVisit)}
                </p>
              </div>
            </div>

            {/* Shop Audit & Contract Check */}
            <div className="card space-y-4 p-5">
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="h-5 w-5 text-stone-800" />
                <div>
                  <h3 className="font-display text-base font-extrabold text-stone-900">فحص محل وعقده</h3>
                  <p className="text-xs text-stone-500">مراجعة بيانات العقد والعملاء والرسوم لمحل محدد</p>
                </div>
              </div>

              <div>
                <label className="label">اختر المحل</label>
                <select
                  value={inspectedShopId}
                  onChange={(e) => setInspectedShopId(e.target.value)}
                  className="input"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shop_name} ({s.owner_name})
                    </option>
                  ))}
                </select>
              </div>

              {inspectedShop && (
                <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold text-stone-600">حالة المحل:</span>
                    <span className="font-extrabold text-stone-900">
                      {STATUS_META[inspectedShop.status].label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-stone-600">العقد الإلكتروني:</span>
                    <span className="font-extrabold text-stone-900">
                      {inspectedMetrics?.contractSigned
                        ? `موقّع (${inspectedMetrics.contractNumber || 'موثّق'})`
                        : 'غير موقّع'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-stone-600">عدد العملاء:</span>
                    <span className="font-extrabold text-stone-900">
                      {inspectedMetrics?.customersCount ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-stone-600">الرسوم المحسوبة:</span>
                    <span className="font-extrabold text-stone-900">
                      {formatPrice(inspectedMetrics?.calculatedFees ?? 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Export & Sync */}
            <div className="card flex flex-wrap items-center justify-between gap-3 p-5 md:col-span-2">
              <div>
                <h3 className="font-display text-base font-extrabold text-stone-900">
                  تصدير السجلات والمزامنة
                </h3>
                <p className="text-xs text-stone-500">
                  تحميل ملفات CSV منظمة أو تحديث البيانات مباشرة من قاعدة البيانات
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={exportShopsCsv}
                  className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-amber-50 hover:bg-stone-800"
                >
                  <Download className="h-4 w-4 text-amber-400" />
                  تصدير المحلات CSV
                </button>
                <button
                  type="button"
                  onClick={exportCustomersCsv}
                  className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold text-stone-800 hover:bg-stone-50"
                >
                  <Download className="h-4 w-4" />
                  تصدير العملاء CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    refresh();
                    setActionMessage('تمت مزامنة البيانات.');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-stone-100 px-4 py-2.5 text-xs font-bold text-stone-800 hover:bg-stone-200"
                >
                  <RefreshCw className="h-4 w-4" />
                  تحديث الآن
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      <ShopDetailsModal
        shop={selectedShop}
        metrics={selectedShop ? shopMetrics[selectedShop.id] : undefined}
        shopCustomers={
          selectedShop ? customers.filter((c) => c.shop_id === selectedShop.id) : []
        }
        shopVisits={
          selectedShop
            ? visits.filter((v) => {
                if (v.shop_id) return v.shop_id === selectedShop.id;
                const cust = customers.find((c) => c.id === v.customer_id);
                return cust?.shop_id === selectedShop.id;
              })
            : []
        }
        onClose={() => setSelectedShop(null)}
        onStatusChange={handleStatusChange}
        onDeleteShop={handleDeleteShop}
      />
    </div>
  );
}

function ShopDetailsModal({
  shop,
  metrics,
  shopCustomers,
  shopVisits,
  onClose,
  onStatusChange,
  onDeleteShop,
}: {
  shop: Shop | null;
  metrics?: ShopDetailedMetrics;
  shopCustomers: CustomerWithDetails[];
  shopVisits: VisitRecord[];
  onClose: () => void;
  onStatusChange: (shopId: string, status: ShopStatus) => Promise<void>;
  onDeleteShop: (shopId: string) => Promise<void>;
}) {
  const [admin, setAdmin] = useState<ShopAdmin | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [modalTab, setModalTab] = useState<'overview' | 'customers' | 'visits'>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    setModalTab('overview');
    if (!shop) {
      setAdmin(null);
      return;
    }
    setLoadingAdmin(true);
    getShopAdmin(shop.id)
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setLoadingAdmin(false));
  }, [shop]);

  if (!shop) return null;

  const meta = STATUS_META[shop.status];

  const shopFields = [
    { label: 'اسم المحل', value: shop.shop_name },
    { label: 'نوع المحل', value: shop.shop_type },
    { label: 'اسم المالك', value: shop.owner_name },
    { label: 'هاتف المالك', value: shop.owner_phone },
    { label: 'بريد المالك', value: shop.owner_email },
    { label: 'الرقم القومي', value: shop.national_id },
    { label: 'عنوان المحل', value: shop.shop_address ?? '—' },
    { label: 'عنوان المالك', value: shop.personal_address ?? '—' },
    { label: 'سنة البدء', value: shop.year_started ? String(shop.year_started) : '—' },
    { label: 'الفروع', value: shop.has_branches ? `نعم (${shop.branch_count})` : 'لا' },
  ];

  const adminFields = admin
    ? [
        { label: 'اسم المسؤول', value: admin.full_name },
        { label: 'هاتف المسؤول', value: admin.phone },
        { label: 'بريد المسؤول', value: admin.email },
        { label: 'الرقم القومي للمسؤول', value: admin.national_id ?? '—' },
      ]
    : [];

  return (
    <Modal open={!!shop} onClose={onClose} title={shop.shop_name} maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
            <span className="badge bg-stone-100 text-stone-700">
              {metrics?.contractSigned
                ? `عقد موثّق (${metrics.contractNumber || '—'})`
                : 'عقد غير موثّق'}
            </span>
          </div>
          <span className="text-xs text-stone-500">
            تسجيل: {formatDate(shop.created_at)}
            {shop.approved_at ? ` · اعتماد: ${formatDate(shop.approved_at)}` : ''}
          </span>
        </div>

        <div className="flex gap-2 border-b border-stone-200 pb-3">
          <button
            type="button"
            onClick={() => setModalTab('overview')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
              modalTab === 'overview'
                ? 'bg-stone-900 text-amber-50'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            بيانات المحل والمسؤول
          </button>
          <button
            type="button"
            onClick={() => setModalTab('customers')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
              modalTab === 'customers'
                ? 'bg-stone-900 text-amber-50'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            العملاء ({shopCustomers.length})
          </button>
          <button
            type="button"
            onClick={() => setModalTab('visits')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
              modalTab === 'visits'
                ? 'bg-stone-900 text-amber-50'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            الزيارات ({shopVisits.length})
          </button>
        </div>

        {modalTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <p className="text-[11px] font-bold text-stone-500">العملاء</p>
                <p className="mt-0.5 font-display text-lg font-extrabold text-stone-900">
                  {metrics?.customersCount ?? shopCustomers.length}
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <p className="text-[11px] font-bold text-stone-500">زيارات مدفوعة</p>
                <p className="mt-0.5 font-display text-lg font-extrabold text-stone-900">
                  {metrics?.paidVisits ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <p className="text-[11px] font-bold text-stone-500">الرسوم المحسوبة</p>
                <p className="mt-0.5 font-display text-lg font-extrabold text-stone-900">
                  {formatPrice(metrics?.calculatedFees ?? 0)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-stone-900">بيانات المحل</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {shopFields.map((f) => (
                  <div key={f.label} className="rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                    <p className="text-[11px] font-bold text-stone-500">{f.label}</p>
                    <p className="text-xs font-bold text-stone-900" dir="auto">
                      {f.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {loadingAdmin ? (
              <div className="h-14 animate-shimmer rounded-xl" />
            ) : (
              adminFields.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-bold text-stone-900">بيانات المسؤول</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {adminFields.map((f) => (
                      <div key={f.label} className="rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                        <p className="text-[11px] font-bold text-stone-500">{f.label}</p>
                        <p className="text-xs font-bold text-stone-900" dir="auto">
                          {f.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {modalTab === 'customers' && (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {shopCustomers.length === 0 ? (
              <p className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-xs font-bold text-stone-500">
                لا يوجد عملاء مسجلون لهذا المحل.
              </p>
            ) : (
              shopCustomers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-stone-900">{c.name}</p>
                    <p className="text-stone-500" dir="ltr">
                      {c.phone || 'بدون هاتف'} · انضم {formatDate(c.created_at)}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-stone-900">{c.total_visits} زيارة</p>
                    <p className="text-stone-500">
                      {c.active_plan_name
                        ? `${c.active_plan_name} (${c.remaining_haircuts} متبقي)`
                        : 'بدون باقة'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {modalTab === 'visits' && (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {shopVisits.length === 0 ? (
              <p className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-xs font-bold text-stone-500">
                لا توجد زيارات مسجلة لهذا المحل.
              </p>
            ) : (
              shopVisits.map((v) => {
                const cust = shopCustomers.find((c) => c.id === v.customer_id);
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-stone-900">{cust?.name ?? 'عميل'}</p>
                      <p className="text-stone-500">
                        {v.created_at ? formatDateTime(v.created_at) : '—'}
                      </p>
                    </div>
                    <span className="rounded-lg bg-white px-2.5 py-1 font-bold text-stone-800 ring-1 ring-stone-200">
                      {v.payment_type === 'subscription' ? 'باقة' : 'مدفوعة'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          {shop.status === 'pending' && (
            <>
              <button
                type="button"
                onClick={() => void onStatusChange(shop.id, 'approved')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                اعتماد المحل
              </button>
              <button
                type="button"
                onClick={() => void onStatusChange(shop.id, 'rejected')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-200"
              >
                <XCircle className="h-4 w-4" />
                رفض
              </button>
            </>
          )}

          {shop.status === 'approved' && (
            <button
              type="button"
              onClick={() => void onStatusChange(shop.id, 'blocked')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-800 px-4 py-2 text-xs font-bold text-white hover:bg-stone-900"
            >
              <Ban className="h-4 w-4" />
              حظر المحل
            </button>
          )}

          {(shop.status === 'blocked' || shop.status === 'rejected') && (
            <button
              type="button"
              onClick={() => void onStatusChange(shop.id, 'approved')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              تفعيل المحل
            </button>
          )}

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              حذف نهائي
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-red-700">تأكيد الحذف النهائي؟</span>
              <button
                type="button"
                onClick={() => void onDeleteShop(shop.id)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              >
                نعم احذف
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg bg-stone-200 px-3 py-1.5 text-xs font-bold text-stone-700"
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}