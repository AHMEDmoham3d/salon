import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Scissors,
  CalendarPlus,
  Phone,
  Clock,
  Coins,
  Loader2,
  Users,
  CalendarClock,
  ArrowUpRight,
  Sparkles,
  Layers,
  CheckCircle2,
  XCircle,
  Gift,
  Crown,
  History,
  MapPin,
  ArrowLeft,
  Home,
  UserCheck,
  Ticket,
} from 'lucide-react';
import Modal from '@/components/Modal';
import {
  getShopActiveSubscription,
  getShopVisitsByCustomer,
  getCustomerBookings,
  getPlans,
  createSubscription,
  loginShopCustomer,
  formatPrice,
  formatDate,
  formatDateTime,
  type Customer,
  type Subscription,
  type Visit,
  type Plan,
  type Booking,
} from '@/lib/api';
import { getShopById } from '@/lib/shopApi';
import { REGULAR_HAIRCUT_PRICE, SYSTEM_NAME, supabase } from '@/lib/supabase';

const BRAND_NAME = 'ulmi';

type Tab = 'home' | 'plans' | 'visits' | 'profile';

type ShopInfo = {
  id: string;
  shop_name: string;
  owner_name: string;
  logo_url?: string | null;
  regular_haircut_price?: number;
};

function normalizeShopId(shopId: string): string {
  return String(shopId || '').trim();
}

function isSameLocalDay(isoDate: string, refDate: Date): boolean {
  const d = new Date(isoDate);
  return (
    d.getFullYear() === refDate.getFullYear() &&
    d.getMonth() === refDate.getMonth() &&
    d.getDate() === refDate.getDate()
  );
}

function bookingStatusMeta(status: Booking['status']): { label: string; cls: string } {
  switch (status) {
    case 'confirmed':
      return { label: 'مؤكد', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
    case 'pending':
      return { label: 'بانتظار التأكيد', cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' };
    case 'completed':
      return { label: 'مكتمل', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' };
    case 'cancelled':
      return { label: 'ملغي', cls: 'bg-stone-100 text-stone-600' };
    case 'no_show':
      return { label: 'لم يحضر', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' };
  }
}



/* ============================================================
   Main Customer Page
   ============================================================ */
export default function CustomerPage({
  shopId,
  onBack,
}: {
  shopId: string;
  onBack?: () => void;
}) {
  const cleanShopId = useMemo(() => normalizeShopId(shopId), [shopId]);

  const [tab, setTab] = useState<Tab>('home');
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [regularHaircutPrice, setRegularHaircutPrice] = useState(REGULAR_HAIRCUT_PRICE);
  const [loadingShop, setLoadingShop] = useState(true);

  const [name, setName] = useState<string>(() => {
    try {
      return localStorage.getItem(`ulmi_customer_name_${cleanShopId}`) || '';
    } catch {
      return '';
    }
  });
  const [phone, setPhone] = useState<string>(() => {
    try {
      return localStorage.getItem(`ulmi_customer_phone_${cleanShopId}`) || '';
    } catch {
      return '';
    }
  });
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [dataLoading, setDataLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const bumpData = useCallback(() => setRefreshTick((n) => n + 1), []);

  /* ---------- Load shop info ---------- */
  useEffect(() => {
    if (!cleanShopId) {
      setLoadingShop(false);
      return;
    }
    let active = true;
    setLoadingShop(true);
    (async () => {
      try {
        const shop = await getShopById(cleanShopId);
        if (!active) return;
        if (shop) {
          setShopInfo({
            id: shop.id,
            shop_name: shop.shop_name,
            owner_name: shop.owner_name,
            logo_url: shop.logo_url ?? null,
            regular_haircut_price: Number((shop as any).regular_haircut_price ?? REGULAR_HAIRCUT_PRICE),
          });
          const price = Number((shop as any).regular_haircut_price ?? REGULAR_HAIRCUT_PRICE);
          setRegularHaircutPrice(Number.isFinite(price) && price >= 0 ? price : REGULAR_HAIRCUT_PRICE);
        }
      } catch (e) {
        console.error('Failed to load shop info:', e);
      } finally {
        if (active) setLoadingShop(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [cleanShopId]);

  /* ---------- Auto re-login if name+phone cached ---------- */
  useEffect(() => {
    if (!cleanShopId || !name || !phone) return;
    let active = true;
    setAuthLoading(true);
    (async () => {
      try {
        const result = await loginShopCustomer(cleanShopId, name, phone);
        if (!active) return;
        if (result) {
          setCustomer(result.customer);
        } else {
          setCustomer(null);
        }
      } catch (e) {
        console.error('Auto login failed:', e);
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [cleanShopId, name, phone]);

  /* ---------- Load customer data ---------- */
  useEffect(() => {
    if (!customer) {
      setSubscription(null);
      setVisits([]);
      setBookings([]);
      return;
    }
    let active = true;
    setDataLoading(true);
    (async () => {
      try {
        const [sub, v, planList, bk] = await Promise.all([
          getShopActiveSubscription(cleanShopId, customer.id),
          getShopVisitsByCustomer(cleanShopId, customer.id),
          getPlans(cleanShopId),
          getCustomerBookings(cleanShopId, customer.id),
        ]);
        if (!active) return;
        setSubscription(sub);
        setVisits(v);
        setPlans(planList);
        setBookings(bk);
      } catch (e) {
        console.error('Failed to load customer data:', e);
      } finally {
        if (active) setDataLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [customer, cleanShopId, refreshTick]);

  /* ---------- Realtime bookings ---------- */
  useEffect(() => {
    if (!customer) return;
    const channel = supabase
      .channel(`customer-bookings-${customer.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `customer_id=eq.${customer.id}`,
        },
        () => {
          void (async () => {
            try {
              const bk = await getCustomerBookings(cleanShopId, customer.id);
              setBookings(bk);
            } catch {
              // ignore
            }
          })();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customer, cleanShopId]);

  /* ---------- Login ---------- */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setAuthError('يرجى إدخال الاسم');
      return;
    }
    if (!trimmedPhone) {
      setAuthError('يرجى إدخال رقم الهاتف');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const result = await loginShopCustomer(cleanShopId, trimmedName, trimmedPhone);
      if (!result) {
        setAuthError('لم يتم العثور على عميل بهذا الاسم والرقم. تأكد من البيانات أو تواصل مع المحل.');
        setCustomer(null);
        return;
      }
      if (result.blocked) {
        setAuthError('هذا الحساب محظور من قبل المحل. يرجى التواصل مع الإدارة.');
        setCustomer(null);
        return;
      }
      setCustomer(result.customer);
      try {
        localStorage.setItem(`ulmi_customer_name_${cleanShopId}`, trimmedName);
        localStorage.setItem(`ulmi_customer_phone_${cleanShopId}`, trimmedPhone);
      } catch {
        // ignore
      }
      setTab('home');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCustomer(null);
    setSubscription(null);
    setVisits([]);
    setBookings([]);
    setTab('home');
    try {
      localStorage.removeItem(`ulmi_customer_phone_${cleanShopId}`);
      localStorage.removeItem(`ulmi_customer_name_${cleanShopId}`);
    } catch {
      // ignore
    }
  };

  /* ---------- Computed ---------- */
  const activeSub = subscription?.status === 'active' ? subscription : null;
  const remainingHaircuts = activeSub
    ? Math.max(0, (activeSub.plan?.haircut_count ?? 0) - activeSub.haircuts_used)
    : 0;

  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'pending' || b.status === 'confirmed')
        .filter((b) => new Date(b.start_at).getTime() >= Date.now() - 5 * 60000)
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [bookings]
  );
  const pastBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show')
        .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()),
    [bookings]
  );
  const visitsToday = useMemo(
    () => visits.filter((v) => isSameLocalDay(v.visit_date, new Date())).length,
    [visits]
  );

  /* ---------- Login screen ---------- */
  if (!customer) {
    return (
      <div className="animate-fade-in mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="card border-stone-200 bg-white p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-stone-900 shadow-sm">
              <UlmiWordmark variant="dark" size="md" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-stone-900">
              {loadingShop ? 'جاري التحميل...' : shopInfo?.shop_name || 'بوابة العميل'}
            </h1>
            <p className="mt-1 text-xs font-bold text-stone-500">
              سجّل الدخول بالاسم ورقم الهاتف المسجلين في المحل
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="label flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-stone-500" />
                <span>الاسم</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (authError) setAuthError('');
                }}
                className="input bg-white text-center text-base font-extrabold"
                placeholder="اسمك المسجل في المحل"
                autoComplete="name"
              />
            </div>

            <div>
              <label className="label flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-stone-500" />
                <span>رقم الهاتف</span>
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (authError) setAuthError('');
                }}
                className="input bg-white text-center text-lg font-extrabold tracking-wider"
                placeholder="01xxxxxxxxx"
                dir="ltr"
                autoComplete="tel"
              />
            </div>

            {authError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || loadingShop}
              className="btn-primary w-full"
            >
              {authLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              <span>{authLoading ? 'جاري الدخول...' : 'دخول'}</span>
            </button>

            {onBack && (
              <button type="button" onClick={onBack} className="btn-ghost w-full">
                <ArrowLeft className="h-4 w-4" />
                <span>رجوع</span>
              </button>
            )}
          </form>

          <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-3 text-center text-[11px] leading-relaxed text-stone-500">
            بالدخول أنت توافق على استخدام بياناتك داخل النظام لإدارة حجوزاتك وباقاتك.
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Main dashboard ---------- */
  return (
    <div className="animate-fade-in mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="card border-stone-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {shopInfo?.logo_url ? (
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 p-1.5">
                <img
                  src={shopInfo.logo_url}
                  alt={shopInfo.shop_name}
                  className="h-full w-full rounded-xl object-contain"
                />
              </div>
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-stone-900 font-display text-xl font-extrabold text-white">
                {shopInfo?.shop_name?.charAt(0) ?? 'م'}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-extrabold text-stone-900 sm:text-xl">
                {shopInfo?.shop_name || 'المحل'}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-stone-500">
                <UserCheck className="h-3.5 w-3.5" />
                <span>مرحبًا، {customer.name}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="btn-primary h-10 px-3.5 text-xs"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>حجز موعد</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 transition hover:bg-stone-50 hover:text-stone-900"
            >
              <XCircle className="h-4 w-4" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </header>

      <nav
        aria-label="أقسام بوابة العميل"
        className="flex gap-1.5 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50/80 p-1.5"
      >
        {[
          { k: 'home' as Tab, label: 'الرئيسية', icon: Home },
          { k: 'plans' as Tab, label: 'الباقات', icon: Layers },
          { k: 'visits' as Tab, label: 'زياراتي', icon: History },
          { k: 'profile' as Tab, label: 'ملفي', icon: UserCheck },
        ].map((t) => {
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
            </button>
          );
        })}
      </nav>

      <main className="min-w-0">
        {tab === 'home' && (
          <HomeTab
            customer={customer}
            subscription={activeSub}
            remainingHaircuts={remainingHaircuts}
            visits={visits}
            visitsToday={visitsToday}
            upcomingBookings={upcomingBookings}
            regularHaircutPrice={regularHaircutPrice}
            loading={dataLoading}
            onBook={() => setBookingOpen(true)}
            onSubscribe={() => {
              setSelectedPlan(null);
              setSubscribeOpen(true);
            }}
            onGoVisits={() => setTab('visits')}
            onGoPlans={() => setTab('plans')}
          />
        )}

        {tab === 'plans' && (
          <PlansTab
            plans={plans}
            activeSubscription={activeSub}
            remainingHaircuts={remainingHaircuts}
            loading={dataLoading}
            onSubscribe={(p) => {
              setSelectedPlan(p);
              setSubscribeOpen(true);
            }}
          />
        )}

        {tab === 'visits' && (
          <VisitsTab
            visits={visits}
            upcomingBookings={upcomingBookings}
            pastBookings={pastBookings}
            loading={dataLoading}
            onBook={() => setBookingOpen(true)}
          />
        )}

        {tab === 'profile' && <ProfileTab customer={customer} onLogout={handleLogout} />}
      </main>

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        shopId={cleanShopId}
        customer={customer}
        regularHaircutPrice={regularHaircutPrice}
        onCreated={() => {
          setBookingOpen(false);
          bumpData();
        }}
      />

      <SubscribeModal
        open={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        shopId={cleanShopId}
        customer={customer}
        plans={plans}
        initialPlan={selectedPlan}
        activeSubscription={activeSub}
        onSubscribed={() => {
          setSubscribeOpen(false);
          bumpData();
        }}
      />
    </div>
  );
}

/* ============================================================
   Home Tab
   ============================================================ */
function HomeTab({
  customer,
  subscription,
  remainingHaircuts,
  visits,
  visitsToday,
  upcomingBookings,
  regularHaircutPrice,
  loading,
  onBook,
  onSubscribe,
  onGoVisits,
  onGoPlans,
}: {
  customer: Customer;
  subscription: Subscription | null;
  remainingHaircuts: number;
  visits: Visit[];
  visitsToday: number;
  upcomingBookings: Booking[];
  regularHaircutPrice: number;
  loading: boolean;
  onBook: () => void;
  onSubscribe: () => void;
  onGoVisits: () => void;
  onGoPlans: () => void;
}) {
  const totalVisits = visits.length;
  const nextBooking = upcomingBookings[0];

  return (
    <div className="space-y-5">
      <div className="card border-stone-200 bg-stone-900 p-5 text-white sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold text-stone-400">أهلًا بك مرة أخرى</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-white">{customer.name}</h2>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-300">
              <Phone className="h-3.5 w-3.5" />
              <span dir="ltr">{customer.phone}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onBook}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-xs font-extrabold text-stone-900 transition hover:bg-stone-100"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>حجز موعد جديد</span>
            </button>
            <button
              type="button"
              onClick={onSubscribe}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-800 px-4 text-xs font-extrabold text-white transition hover:bg-stone-700"
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>اشترك في باقة</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-bold text-stone-500">الباقة الحالية</p>
            {loading ? (
              <div className="mt-2 h-6 w-20 animate-shimmer rounded" />
            ) : (
              <p className="mt-1.5 font-display text-lg font-extrabold text-stone-900">
                {subscription ? subscription.plan?.name || 'نشطة' : 'بدون باقة'}
              </p>
            )}
            {subscription && (
              <p className="mt-1 text-[11px] font-bold text-emerald-700">
                باقي {remainingHaircuts} حلاقة
              </p>
            )}
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700">
            <Crown className="h-5 w-5" />
          </div>
        </div>

        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-bold text-stone-500">زياراتي الكلية</p>
            {loading ? (
              <div className="mt-2 h-6 w-12 animate-shimmer rounded" />
            ) : (
              <p className="mt-1.5 font-display text-lg font-extrabold text-stone-900">{totalVisits}</p>
            )}
            <p className="mt-1 text-[11px] text-stone-500">اليوم: {visitsToday}</p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700">
            <Scissors className="h-5 w-5" />
          </div>
        </div>

        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-bold text-stone-500">حجوزات قادمة</p>
            {loading ? (
              <div className="mt-2 h-6 w-12 animate-shimmer rounded" />
            ) : (
              <p className="mt-1.5 font-display text-lg font-extrabold text-stone-900">
                {upcomingBookings.length}
              </p>
            )}
            <p className="mt-1 text-[11px] text-stone-500">مؤكدة وبانتظار</p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700">
            <Ticket className="h-5 w-5" />
          </div>
        </div>

        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-bold text-stone-500">سعر الحلاقة</p>
            <p className="mt-1.5 font-display text-lg font-extrabold text-stone-900">
              {formatPrice(regularHaircutPrice)}
            </p>
            <p className="mt-1 text-[11px] text-stone-500">للحلاقة العادية</p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700">
            <Coins className="h-5 w-5" />
          </div>
        </div>
      </div>

      {nextBooking && (
        <div className="card border-stone-300 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-900 text-white">
                <CalendarClock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-stone-500">موعدك القادم</p>
                <p className="mt-0.5 font-display text-base font-extrabold text-stone-900">
                  {nextBooking.service_name}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-stone-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(nextBooking.start_at)}
                  </span>
                  <span className="font-mono text-stone-500">{nextBooking.booking_code}</span>
                  {nextBooking.branch_name && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {nextBooking.branch_name}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${bookingStatusMeta(nextBooking.status).cls}`}>
              {bookingStatusMeta(nextBooking.status).label}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={onGoPlans}
          className="card flex items-center justify-between p-4 text-right transition hover:border-stone-300 hover:bg-stone-50/60"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900 text-white">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="font-extrabold text-stone-900">الباقات والاشتراكات</p>
              <p className="text-[11px] text-stone-500">تصفح الباقات المتاحة واشترك</p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-stone-400" />
        </button>

        <button
          onClick={onGoVisits}
          className="card flex items-center justify-between p-4 text-right transition hover:border-stone-300 hover:bg-stone-50/60"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900 text-white">
              <History className="h-5 w-5" />
            </div>
            <div>
              <p className="font-extrabold text-stone-900">سجل الزيارات</p>
              <p className="text-[11px] text-stone-500">اعرض كل زياراتك السابقة</p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-stone-400" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Plans Tab
   ============================================================ */
function PlansTab({
  plans,
  activeSubscription,
  remainingHaircuts,
  loading,
  onSubscribe,
}: {
  plans: Plan[];
  activeSubscription: Subscription | null;
  remainingHaircuts: number;
  loading: boolean;
  onSubscribe: (plan: Plan) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-extrabold text-stone-900">الباقات المتاحة</h2>
        <p className="text-xs text-stone-500">اختر الباقة المناسبة لك واستمتع بأسعار أفضل</p>
      </div>

      {activeSubscription && (
        <div className="card border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-700 text-white">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800">باقتك النشطة</p>
                <p className="font-display text-base font-extrabold text-stone-900">
                  {activeSubscription.plan?.name || 'باقة نشطة'}
                </p>
                <p className="text-[11px] font-bold text-emerald-800">
                  باقي {remainingHaircuts} حلاقة · ينتهي {formatDate(activeSubscription.end_date)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 animate-shimmer rounded-2xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="card p-10 text-center">
          <Layers className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold text-stone-700">لا توجد باقات متاحة حاليًا</p>
          <p className="text-xs text-stone-500">يرجى التواصل مع المحل للاستفسار</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isActive = activeSubscription?.plan?.id === plan.id;
            return (
              <div
                key={plan.id}
                className={`card flex flex-col justify-between p-5 ${
                  isActive ? 'border-emerald-300 ring-2 ring-emerald-200' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-stone-900 text-white">
                      <Gift className="h-5 w-5" />
                    </div>
                    {isActive && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                        باقتك الحالية
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 font-display text-base font-extrabold text-stone-900">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-xs text-stone-500">
                    {plan.haircut_count} حلاقة · صالحة {plan.duration_days} يوم
                  </p>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-2xl font-extrabold text-stone-900">
                      {formatPrice(plan.price)}
                    </span>
                    <span className="text-[11px] font-bold text-stone-500">/ باقة</span>
                  </div>
                  <p className="mt-1 text-[11px] font-bold text-emerald-700">
                    ≈ {formatPrice(plan.haircut_count > 0 ? plan.price / plan.haircut_count : 0)} للحلاقة
                  </p>
                </div>

                <button
                  onClick={() => onSubscribe(plan)}
                  disabled={isActive}
                  className={`mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-extrabold transition ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 cursor-not-allowed'
                      : 'bg-stone-900 text-white hover:bg-stone-800'
                  }`}
                >
                  {isActive ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>مفعّلة</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>اشترك الآن</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Visits Tab
   ============================================================ */
function VisitsTab({
  visits,
  upcomingBookings,
  pastBookings,
  loading,
  onBook,
}: {
  visits: Visit[];
  upcomingBookings: Booking[];
  pastBookings: Booking[];
  loading: boolean;
  onBook: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'visits' | 'bookings'>('all');

  const sortedVisits = useMemo(
    () => [...visits].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime()),
    [visits]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-stone-900">زياراتي وحجوزاتي</h2>
          <p className="text-xs text-stone-500">تابع كل زياراتك السابقة وحجوزاتك القادمة</p>
        </div>
        <button onClick={onBook} className="btn-primary h-9 px-3 text-xs">
          <CalendarPlus className="h-3.5 w-3.5" />
          <span>حجز جديد</span>
        </button>
      </div>

      <div className="flex gap-1.5 rounded-xl border border-stone-200 bg-stone-50 p-1">
        {[
          { k: 'all' as const, label: 'الكل' },
          { k: 'bookings' as const, label: 'الحجوزات' },
          { k: 'visits' as const, label: 'الزيارات' },
        ].map((item) => (
          <button
            key={item.k}
            onClick={() => setFilter(item.k)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filter === item.k ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-shimmer rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filter !== 'visits' && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-stone-900">
                <Ticket className="h-4 w-4 text-stone-600" />
                <span>حجوزات قادمة ({upcomingBookings.length})</span>
              </h3>
              {upcomingBookings.length === 0 ? (
                <div className="card p-5 text-center text-xs text-stone-500">
                  لا توجد حجوزات قادمة حاليًا
                </div>
              ) : (
                upcomingBookings.map((b) => (
                  <div key={b.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-stone-900 px-2.5 py-0.5 font-mono text-[11px] font-extrabold text-amber-400">
                          {b.booking_code}
                        </span>
                        <span className="text-sm font-extrabold text-stone-900">{b.service_name}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${bookingStatusMeta(b.status).cls}`}>
                          {bookingStatusMeta(b.status).label}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-stone-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(b.start_at)}
                        </span>
                        {b.branch_name && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {b.branch_name}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          {filter !== 'bookings' && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-stone-900">
                <Scissors className="h-4 w-4 text-stone-600" />
                <span>سجل الزيارات ({sortedVisits.length})</span>
              </h3>
              {sortedVisits.length === 0 ? (
                <div className="card p-5 text-center text-xs text-stone-500">
                  لم تسجل أي زيارة بعد
                </div>
              ) : (
                sortedVisits.map((v) => (
                  <div key={v.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-extrabold text-stone-900">
                        {v.haircut_type || 'حلاقة'}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-stone-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(v.visit_date)}
                        </span>
                        {v.notes && <span className="text-stone-500">· {v.notes}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.payment_type === 'subscription' ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                          بالاشتراك
                        </span>
                      ) : (
                        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">
                          {formatPrice(Number(v.charge_amount ?? 0))}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          {filter !== 'visits' && pastBookings.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-stone-900">
                <History className="h-4 w-4 text-stone-600" />
                <span>حجوزات سابقة ({pastBookings.length})</span>
              </h3>
              {pastBookings.map((b) => (
                <div key={b.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 opacity-80">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-bold text-stone-700">
                        {b.booking_code}
                      </span>
                      <span className="text-sm font-extrabold text-stone-800">{b.service_name}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${bookingStatusMeta(b.status).cls}`}>
                        {bookingStatusMeta(b.status).label}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-stone-500">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(b.start_at)}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Profile Tab
   ============================================================ */
function ProfileTab({ customer, onLogout }: { customer: Customer; onLogout: () => void }) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-stone-900 font-display text-xl font-extrabold text-white">
            {customer.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-extrabold text-stone-900">
              {customer.name}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-stone-500">
              <Phone className="h-3.5 w-3.5" />
              <span dir="ltr">{customer.phone}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
            <span className="text-xs font-bold text-stone-600">تاريخ الانضمام</span>
            <span className="text-xs font-extrabold text-stone-900">
              {customer.created_at ? formatDate(customer.created_at) : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
            <span className="text-xs font-bold text-stone-600">الحالة</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                customer.is_blocked
                  ? 'bg-red-100 text-red-700'
                  : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
              }`}
            >
              {customer.is_blocked ? 'محظور' : 'نشط'}
            </span>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white text-xs font-extrabold text-stone-700 transition hover:bg-stone-50 hover:text-stone-900"
        >
          <XCircle className="h-4 w-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>

      <div className="card p-5 text-center text-[11px] leading-relaxed text-stone-500">
        نظام <span className="font-extrabold text-stone-800">{SYSTEM_NAME}</span> · مدعوم بواسطة{' '}
        <span className="font-extrabold text-stone-800">{BRAND_NAME}</span>
      </div>
    </div>
  );
}

/* ============================================================
   Booking Modal
   ============================================================ */
function BookingModal({
  open,
  onClose,
  shopId,
  customer,
  regularHaircutPrice,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  customer: Customer;
  regularHaircutPrice: number;
  onCreated: () => void;
}) {
  const [serviceName, setServiceName] = useState('حلاقة عامة');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('12:00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setServiceName('حلاقة عامة');
    setDate(new Date().toISOString().slice(0, 10));
    setTime('12:00');
    setNotes('');
    setErr('');
    setOk(false);
    setSaving(false);
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setErr('');
    try {
      const startAt = new Date(`${date}T${time}:00`);
      if (Number.isNaN(startAt.getTime())) {
        throw new Error('التاريخ أو الوقت غير صالح');
      }
      const bookingCode = `BK-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const endAt = new Date(startAt.getTime() + 60 * 60000);

      const { error } = await supabase.from('bookings').insert({
        shop_id: shopId,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        booking_code: bookingCode,
        service_name: serviceName.trim() || 'حلاقة عامة',
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        status: 'pending',
        notes: notes.trim() || null,
      });

      if (error) throw new Error(error.message);
      setOk(true);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر إرسال الحجز');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="حجز موعد جديد" maxWidth="max-w-md">
      {ok ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-8 w-8 text-emerald-700" />
          </div>
          <div>
            <p className="font-display text-base font-extrabold text-stone-900">تم إرسال الحجز بنجاح</p>
            <p className="mt-1 text-xs text-stone-500">
              سيتم تأكيد الحجز من قِبل المحل وسيظهر في قائمة حجوزاتك
            </p>
          </div>
          <button onClick={onClose} className="btn-primary w-full">
            <CheckCircle2 className="h-4 w-4" />
            <span>حسنًا</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">الخدمة</label>
            <input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="input"
              placeholder="مثال: حلاقة عامة"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">التاريخ</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
                min={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div>
              <label className="label">الوقت</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">ملاحظات (اختياري)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-16 resize-none"
              placeholder="أي تفاصيل إضافية للحجز"
            />
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] font-bold text-stone-700">
            سعر الحلاقة العادية: <span className="font-extrabold text-stone-900">{formatPrice(regularHaircutPrice)}</span>
            {customer.name && <span> · الحجز باسم: {customer.name}</span>}
          </div>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
              {err}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={submit} disabled={saving} className="btn-primary flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              <span>{saving ? 'جاري الإرسال...' : 'تأكيد الحجز'}</span>
            </button>
            <button onClick={onClose} className="btn-ghost">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ============================================================
   Subscribe Modal
   ============================================================ */
function SubscribeModal({
  open,
  onClose,
  shopId,
  customer,
  plans,
  initialPlan,
  activeSubscription,
  onSubscribed,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  customer: Customer;
  plans: Plan[];
  initialPlan: Plan | null;
  activeSubscription: Subscription | null;
  onSubscribed: () => void;
}) {
  const [planId, setPlanId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlanId(initialPlan?.id || plans[0]?.id || '');
    setErr('');
    setOk(false);
    setSaving(false);
  }, [open, initialPlan, plans]);

  const selectedPlan = plans.find((p) => p.id === planId) || null;

  const submit = async () => {
    if (!selectedPlan) {
      setErr('يرجى اختيار باقة');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await createSubscription(customer.id, selectedPlan.id, shopId, 'cash');
      setOk(true);
      onSubscribed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر تفعيل الاشتراك');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="الاشتراك في باقة" maxWidth="max-w-md">
      {ok ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-8 w-8 text-emerald-700" />
          </div>
          <div>
            <p className="font-display text-base font-extrabold text-stone-900">تم تفعيل الباقة بنجاح</p>
            <p className="mt-1 text-xs text-stone-500">يمكنك الآن الاستمتاع بحلاقاتك</p>
          </div>
          <button onClick={onClose} className="btn-primary w-full">
            <CheckCircle2 className="h-4 w-4" />
            <span>حسنًا</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeSubscription && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-900">
              لديك باقة نشطة بالفعل. سيتم اعتماد الباقة الجديدة بعد انتهاء الحالية أو يمكنك التواصل مع المحل.
            </div>
          )}

          <div>
            <label className="label">اختر الباقة</label>
            <div className="space-y-2">
              {plans.map((p) => {
                const active = planId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlanId(p.id)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-right transition ${
                      active
                        ? 'border-stone-900 bg-stone-50 ring-2 ring-stone-900/10'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-extrabold text-stone-900">{p.name}</p>
                      <p className="mt-0.5 text-[11px] font-bold text-stone-500">
                        {p.haircut_count} حلاقة · {p.duration_days} يوم
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-base font-extrabold text-stone-900">
                        {formatPrice(p.price)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedPlan && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] font-bold text-stone-700">
              متوسط سعر الحلاقة:{' '}
              <span className="font-extrabold text-stone-900">
                {formatPrice(selectedPlan.haircut_count > 0 ? selectedPlan.price / selectedPlan.haircut_count : 0)}
              </span>
            </div>
          )}

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
              {err}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={submit} disabled={saving || !selectedPlan} className="btn-primary flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>{saving ? 'جاري التفعيل...' : 'تأكيد الاشتراك'}</span>
            </button>
            <button onClick={onClose} className="btn-ghost">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}