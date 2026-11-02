import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  Loader2,
  Wallet,
  TrendingUp,
  Store,
  AlertTriangle,
  ShieldCheck,
  Coins,
  Calendar,
  Search,
  Trash2,
  X,
  LogOut,
} from 'lucide-react';
import Modal from '@/components/Modal';
import {
  getAllShops,
  updateShopStatus,
  deleteShop,
  getCompanyTotalFees,
  getShopById,
  getShopAdmin,
  type Shop,
  type ShopAdmin,
  type ShopStatus,
} from '@/lib/shopApi';
import { COMPANY_FEE_PER_VISIT, COMPANY_NAME, SYSTEM_NAME } from '@/lib/supabase';
import { formatPrice, formatDate, formatDateTime } from '@/lib/api';

export default function CompanyPage({ onLogout }: { onLogout: () => void | Promise<void> }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShopStatus | 'all'>('all');
  const [selected, setSelected] = useState<Shop | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getCompanyTotalFees>> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([getAllShops(), getCompanyTotalFees()]);
      setShops(s);
      setStats(st);
    } catch {
      setShops([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const filtered = shops.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        s.shop_name.toLowerCase().includes(q) ||
        s.owner_name.toLowerCase().includes(q) ||
        s.owner_phone.includes(q) ||
        s.owner_email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pendingShops = shops.filter((s) => s.status === 'pending');

  const handleStatus = async (shopId: string, status: ShopStatus) => {
    try {
      await updateShopStatus(shopId, status);
      refresh();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (shopId: string) => {
    try {
      await deleteShop(shopId);
      setSelected(null);
      refresh();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Company header */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 text-amber-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/20">
                <Building2 className="h-7 w-7 text-amber-400" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
                  {COMPANY_NAME} — لوحة تحكم الشركة
                </h1>
                <p className="mt-1 text-sm text-stone-400">
                  {SYSTEM_NAME} — إدارة كل المحلات المسجلة والرسوم المستحقة
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2 text-amber-400 sm:flex">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-bold">حساب شركة معتمد</span>
              </div>
              <button
                type="button"
                onClick={() => void onLogout()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-amber-50 transition hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Stats overview */}
        {stats && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-5">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-stone-900 text-amber-400">
                <Store className="h-5 w-5" />
              </div>
              <p className="mt-3 font-display text-2xl font-extrabold text-stone-900">{stats.totalShops}</p>
              <p className="text-xs font-bold text-stone-500">إجمالي المحلات</p>
            </div>
            <div className="card border-emerald-200 bg-emerald-50/40 p-5">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-emerald-50">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="mt-3 font-display text-2xl font-extrabold text-emerald-700">{stats.approvedShops}</p>
              <p className="text-xs font-bold text-stone-500">محلات نشطة</p>
            </div>
            <div className="card border-amber-200 bg-amber-50/40 p-5">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500 text-stone-950">
                <Clock className="h-5 w-5" />
              </div>
              <p className="mt-3 font-display text-2xl font-extrabold text-amber-700">{stats.pendingShops}</p>
              <p className="text-xs font-bold text-stone-500">بانتظار الموافقة</p>
            </div>
            <div className="card border-stone-300 bg-stone-100/60 p-5">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-stone-900 text-amber-400">
                <Wallet className="h-5 w-5" />
              </div>
              <p className="mt-3 font-display text-2xl font-extrabold text-stone-900">
                {formatPrice(stats.totalFees)}
              </p>
              <p className="text-xs font-bold text-stone-500">رسوم مستحقة (كل الوقت)</p>
            </div>
          </div>
        )}

        {/* This month banner */}
        {stats && (
          <div className="mb-6 card overflow-hidden border-amber-200">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-amber-50 to-stone-50 p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-stone-900 text-amber-400">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-stone-900">
                    رسوم هذا الشهر — {formatPrice(stats.thisMonthFees)}
                  </p>
                  <p className="text-xs text-stone-600">
                    {stats.thisMonthVisits} زيارة هذا الشهر × {formatPrice(COMPANY_FEE_PER_VISIT)} = {formatPrice(stats.thisMonthFees)}
                  </p>
                </div>
              </div>
              <div className="text-left">
                <p className="font-display text-3xl font-extrabold text-amber-700">
                  {formatPrice(stats.thisMonthFees)}
                </p>
                <p className="text-xs font-bold text-stone-500">إجمالي رسوم الشهر</p>
              </div>
            </div>
          </div>
        )}

        {/* Pending approvals alert */}
        {pendingShops.length > 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm font-bold text-stone-700">
              {pendingShops.length} محل جديد بانتظار الموافقة — راجع طلباتهم وقم بالاعتماد أو الرفض.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم المحل أو المالك..."
              className="input pr-12"
            />
          </div>
          <div className="flex gap-1 rounded-xl border border-stone-200 bg-white p-1">
            {([
              { k: 'all', label: 'الكل' },
              { k: 'pending', label: 'بانتظار' },
              { k: 'approved', label: 'نشط' },
              { k: 'rejected', label: 'مرفوض' },
              { k: 'blocked', label: 'محظور' },
            ] as { k: ShopStatus | 'all'; label: string }[]).map((f) => (
              <button
                key={f.k}
                onClick={() => setStatusFilter(f.k)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  statusFilter === f.k ? 'bg-stone-900 text-amber-50' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Shops list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 animate-shimmer rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <Store className="mx-auto h-10 w-10 text-stone-300" />
            <p className="mt-3 font-bold text-stone-600">لا توجد محلات مطابقة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((shop) => (
              <ShopRow
                key={shop.id}
                shop={shop}
                onStatus={handleStatus}
                onSelect={() => setSelected(shop)}
              />
            ))}
          </div>
        )}
      </div>

      <ShopDetailModal
        shop={selected}
        onClose={() => setSelected(null)}
        onStatus={handleStatus}
        onDelete={handleDelete}
      />
    </div>
  );
}

/* ---------- Shop row ---------- */
function ShopRow({
  shop,
  onStatus,
  onSelect,
}: {
  shop: Shop;
  onStatus: (id: string, status: ShopStatus) => void;
  onSelect: () => void;
}) {
  const statusBadge = {
    pending: { label: 'بانتظار الموافقة', cls: 'bg-amber-100 text-amber-700', icon: Clock },
    approved: { label: 'نشط', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    rejected: { label: 'مرفوض', cls: 'bg-red-100 text-red-700', icon: XCircle },
    blocked: { label: 'محظور', cls: 'bg-stone-300 text-stone-700', icon: Ban },
  }[shop.status];

  const StatusIcon = statusBadge.icon;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-right">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-stone-700 to-stone-900 font-display text-lg font-extrabold text-amber-400">
            {shop.shop_name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-stone-900">{shop.shop_name}</p>
            <p className="text-xs text-stone-500">
              المالك: {shop.owner_name} — {shop.owner_phone}
            </p>
          </div>
        </button>

        <span className={`badge ${statusBadge.cls}`}>
          <StatusIcon className="h-3 w-3" />
          {statusBadge.label}
        </span>

        <div className="flex gap-2">
          {shop.status === 'pending' && (
            <>
              <button
                onClick={() => onStatus(shop.id, 'approved')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                اعتماد
              </button>
              <button
                onClick={() => onStatus(shop.id, 'rejected')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-200"
              >
                <XCircle className="h-4 w-4" />
                رفض
              </button>
            </>
          )}
          {shop.status === 'approved' && (
            <button
              onClick={() => onStatus(shop.id, 'blocked')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-200"
            >
              <Ban className="h-4 w-4" />
              حظر
            </button>
          )}
          {(shop.status === 'blocked' || shop.status === 'rejected') && (
            <button
              onClick={() => onStatus(shop.id, 'approved')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              تفعيل
            </button>
          )}
          <button
            onClick={onSelect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-600 transition hover:bg-stone-100"
          >
            التفاصيل
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shop detail modal ---------- */
function ShopDetailModal({
  shop,
  onClose,
  onStatus,
  onDelete,
}: {
  shop: Shop | null;
  onClose: () => void;
  onStatus: (id: string, status: ShopStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [admin, setAdmin] = useState<ShopAdmin | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    if (!shop) {
      setAdmin(null);
      return;
    }
    setLoading(true);
    getShopAdmin(shop.id)
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, [shop]);

  if (!shop) return null;

  const fields: { label: string; value: string }[] = [
    { label: 'اسم المحل', value: shop.shop_name },
    { label: 'نوع المحل', value: shop.shop_type },
    { label: 'اسم المالك', value: shop.owner_name },
    { label: 'هاتف المالك', value: shop.owner_phone },
    { label: 'بريد المالك', value: shop.owner_email },
    { label: 'الرقم القومي', value: shop.national_id },
    { label: 'عنوان المحل', value: shop.shop_address ?? '—' },
    { label: 'عنوان المالك', value: shop.personal_address ?? '—' },
    { label: 'سنة البدء', value: shop.year_started ? String(shop.year_started) : '—' },
    { label: 'له فروع؟', value: shop.has_branches ? `نعم (${shop.branch_count} فرع)` : 'لا' },
  ];

  const adminFields = admin
    ? [
        { label: 'اسم المسؤول', value: admin.full_name },
        { label: 'هاتف المسؤول', value: admin.phone },
        { label: 'بريد المسؤول', value: admin.email },
        { label: 'رقم مسؤول', value: admin.national_id ?? '—' },
      ]
    : [];

  const statusBadge = {
    pending: { label: 'بانتظار الموافقة', cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'نشط', cls: 'bg-emerald-100 text-emerald-700' },
    rejected: { label: 'مرفوض', cls: 'bg-red-100 text-red-700' },
    blocked: { label: 'محظور', cls: 'bg-stone-300 text-stone-700' },
  }[shop.status];

  return (
    <Modal open={!!shop} onClose={onClose} title={shop.shop_name} maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>
          <span className="text-xs text-stone-500">
            سُجّل في {formatDate(shop.created_at)}
            {shop.approved_at && ` • اعتمد في ${formatDate(shop.approved_at)}`}
          </span>
        </div>

        {/* Shop data documentation */}
        <div>
          <h4 className="mb-2 font-bold text-stone-900">بيانات المحل (وثيقة التسجيل)</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.label} className="rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                <p className="text-[11px] font-bold text-stone-500">{f.label}</p>
                <p className="text-sm font-bold text-stone-800" dir="auto">{f.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Admin data documentation */}
        {loading ? (
          <div className="h-16 animate-shimmer rounded-xl" />
        ) : adminFields.length > 0 ? (
          <div>
            <h4 className="mb-2 font-bold text-stone-900">بيانات المسؤول</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {adminFields.map((f) => (
                <div key={f.label} className="rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                  <p className="text-[11px] font-bold text-stone-500">{f.label}</p>
                  <p className="text-sm font-bold text-stone-800" dir="auto">{f.value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          {shop.status === 'pending' && (
            <>
              <button
                onClick={() => onStatus(shop.id, 'approved')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                اعتماد المحل
              </button>
              <button
                onClick={() => onStatus(shop.id, 'rejected')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-200"
              >
                <XCircle className="h-4 w-4" />
                رفض
              </button>
            </>
          )}
          {shop.status === 'approved' && (
            <button
              onClick={() => onStatus(shop.id, 'blocked')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-800 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-stone-900"
            >
              <Ban className="h-4 w-4" />
              حظر المحل
            </button>
          )}
          {(shop.status === 'blocked' || shop.status === 'rejected') && (
            <button
              onClick={() => onStatus(shop.id, 'approved')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              تفعيل المحل
            </button>
          )}

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              حذف نهائي
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-600">متأكد؟ كل البيانات هتتمسح</span>
              <button
                onClick={() => onDelete(shop.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" />
                نعم احذف
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg bg-stone-100 px-4 py-2.5 text-sm font-bold text-stone-600"
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