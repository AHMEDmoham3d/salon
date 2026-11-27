
import { useEffect, useState } from 'react';
import {
  Building2,
  Lock,
  Loader2,
  Phone,
  Mail,
  User,
  XCircle,
  ShieldCheck,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import { AdminDashboard } from '@/pages/AdminPage';
import {
  adminLogin,
  registerShop,
  verifyAdminSession,
  type ShopRegistration,
} from '@/lib/shopApi';
import {
  SYSTEM_NAME,
  COMPANY_FEE_PER_VISIT,
  type Shop,
  type ShopAdmin,
} from '@/lib/supabase';
import { formatPrice } from '@/lib/api';

type Session = {
  shopId: string;
  sessionToken: string;
  expiresAt: string;
};

const SESSION_KEY = 'barber_admin_session';
const BRAND_NAME = 'ULMI';

/** Monochrome ULMI wordmark used across the shop portal. */
function UlmiWordmark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 86"
      role="img"
      aria-label="ULMI"
      className={`h-auto w-32 shrink-0 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M14 38V56C14 68.7025 24.2975 79 37 79C49.7025 79 60 68.7025 60 56V38" stroke="currentColor" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 38V68" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
      <path d="M84 15V68" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
      <path d="M108 68V52C108 43.1634 115.163 36 124 36C132.837 36 140 43.1634 140 52V68" stroke="currentColor" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M140 68V52C140 43.1634 147.163 36 156 36C164.837 36 172 43.1634 172 52V68" stroke="currentColor" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M214 38V68" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
      <circle cx="214" cy="15" r="11" fill="currentColor" />
    </svg>
  );
}

function loadSession(): Session | null {
  try {
    const savedSession = sessionStorage.getItem(SESSION_KEY);

    if (!savedSession) return null;

    const session = JSON.parse(savedSession) as Session;

    if (
      !session.shopId ||
      !session.sessionToken ||
      !session.expiresAt ||
      !Number.isFinite(new Date(session.expiresAt).getTime()) ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(session: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [verifyAttempt, setVerifyAttempt] = useState(0);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Keeps the newly registered shop visible while awaiting company approval.
  // Registration itself does not create an authenticated admin session.
  const [registrationShop, setRegistrationShop] = useState<Shop | null>(null);

  // Use primitive session values as dependencies to avoid repeated verification.
  const sessionToken = session?.sessionToken;
  const sessionShopId = session?.shopId;

  // Verify the stored session with the server before showing the dashboard.
  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      if (!sessionToken || !sessionShopId) {
        if (!registrationShop) {
          setShop(null);
          setSessionError('');
          setShopLoading(false);
        }

        return;
      }

      setShopLoading(true);
      setSessionError('');

      try {
        const result = await verifyAdminSession(sessionToken);

        if (cancelled) return;

        if (!result || result.shop.id !== sessionShopId) {
          clearSession();
          setSession(null);
          setShop(null);
          setSessionError('');
          setShopLoading(false);
          return;
        }

        const verifiedSession: Session = {
          shopId: result.shop.id,
          sessionToken,
          expiresAt: result.expiresAt,
        };

        saveSession(verifiedSession);
        setSession(verifiedSession);
        setShop(result.shop);
        setShopLoading(false);
      } catch (error) {
        if (cancelled) return;

        console.error('Admin session verification failed:', error);

        setSessionError(
          'تعذر الاتصال للتحقق من جلسة الدخول. تأكد من اتصال الإنترنت وحاول مرة أخرى.'
        );

        setShopLoading(false);
      }
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, sessionShopId, registrationShop, verifyAttempt]);

  const handleLogin = (
    shop: Shop,
    admin: ShopAdmin,
    sessionToken?: string,
    expiresAt?: string
  ) => {
    if (sessionToken && expiresAt) {
      const newSession: Session = {
        shopId: shop.id,
        sessionToken,
        expiresAt,
      };

      saveSession(newSession);
      setSession(newSession);
      setRegistrationShop(null);
      setShop(shop);
      setSessionError('');
      setShopLoading(true);
      return;
    }

    // Registration flow: show the pending shop without creating a login session.
    clearSession();
    setSession(null);
    setRegistrationShop(shop);
    setShop(shop);
    setSessionError('');
    setShopLoading(false);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setRegistrationShop(null);
    setShop(null);
    setSessionError('');
    setShopLoading(false);
    setMode('login');
  };

  const retrySessionVerification = () => {
    if (session) {
      setSessionError('');
      setShopLoading(true);
      setVerifyAttempt((current) => current + 1);
    }
  };

  if (!session && !registrationShop) {
    return (
      <AdminAuth
        mode={mode}
        setMode={setMode}
        onLogin={handleLogin}
      />
    );
  }

  if (shopLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="card max-w-md p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-500" />

          <p className="mt-3 font-bold text-stone-900">
            تعذر التحقق من جلسة الدخول
          </p>

          <p className="mt-2 text-sm text-stone-600">
            {sessionError}
          </p>

          <button
            onClick={retrySessionVerification}
            className="btn-primary mt-5 w-full"
          >
            إعادة المحاولة
          </button>

          <button
            onClick={handleLogout}
            className="btn-ghost mt-2 w-full"
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-500" />

          <p className="mt-3 font-bold text-stone-900">
            المحل غير موجود
          </p>

          <p className="text-sm text-stone-500">
            لم يتم العثور على بيانات المحل.
          </p>

          <button
            onClick={handleLogout}
            className="btn-primary mt-4"
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  if (shop.status === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100">
            <ShieldCheck className="h-7 w-7 text-slate-700" />
          </div>

          <h2 className="mt-4 font-display text-xl font-extrabold text-stone-900">
            طلبك قيد المراجعة
          </h2>

          <p className="mt-2 text-sm text-stone-600">
            المحل «{shop.shop_name}» بانتظار اعتماد {BRAND_NAME}.
            سيتمكن صاحب المحل من استخدام النظام فور اعتماد الطلب من إدارة الشركة.
          </p>

          <button
            onClick={handleLogout}
            className="btn-ghost mt-5 w-full"
          >
            خروج
          </button>
        </div>
      </div>
    );
  }

  if (shop.status === 'rejected') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-100">
            <XCircle className="h-7 w-7 text-red-600" />
          </div>

          <h2 className="mt-4 font-display text-xl font-extrabold text-stone-900">
            تم رفض المحل
          </h2>

          <p className="mt-2 text-sm text-stone-600">
            رفضت {BRAND_NAME} طلب تسجيل المحل «{shop.shop_name}».
            تواصل مع إدارة الشركة لمعرفة السبب.
          </p>

          <button
            onClick={handleLogout}
            className="btn-ghost mt-5 w-full"
          >
            خروج
          </button>
        </div>
      </div>
    );
  }

  if (shop.status === 'blocked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-stone-200">
            <Lock className="h-7 w-7 text-stone-700" />
          </div>

          <h2 className="mt-4 font-display text-xl font-extrabold text-stone-900">
            المحل محظور
          </h2>

          <p className="mt-2 text-sm text-stone-600">
            تم حظر المحل «{shop.shop_name}» من قبل {BRAND_NAME}.
            لا يمكن استخدام النظام حتى يتم رفع الحظر.
          </p>

          <button
            onClick={handleLogout}
            className="btn-ghost mt-5 w-full"
          >
            خروج
          </button>
        </div>
      </div>
    );
  }

  // Approved shops require a verified authenticated session.
  if (!session) {
    return (
      <AdminAuth
        mode={mode}
        setMode={setMode}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <AdminDashboard
      shopId={shop.id}
      onLogout={handleLogout}
    />
  );
}

/* ---------- Admin auth (login + registration) ---------- */

function AdminAuth({
  mode,
  setMode,
  onLogin,
}: {
  mode: 'login' | 'register';
  setMode: (mode: 'login' | 'register') => void;
  onLogin: (
    shop: Shop,
    admin: ShopAdmin,
    sessionToken?: string,
    expiresAt?: string
  ) => void;
}) {
  if (mode === 'login') {
    return (
      <AdminLogin
        onLogin={onLogin}
        onGoRegister={() => setMode('register')}
      />
    );
  }

  return (
    <AdminRegister
      onRegistered={onLogin}
      onGoLogin={() => setMode('login')}
    />
  );
}

/* ---------- Admin login ---------- */

function AdminLogin({
  onLogin,
  onGoRegister,
}: {
  onLogin: (
    shop: Shop,
    admin: ShopAdmin,
    sessionToken?: string,
    expiresAt?: string
  ) => void;
  onGoRegister: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!phone.trim() || !email.trim()) {
      setErr('أدخل الهاتف والبريد الإلكتروني');
      return;
    }

    setLoading(true);
    setErr('');

    try {
      const result = await adminLogin(phone, email);

      if (!result) {
        setErr('بيانات غير صحيحة — تأكد من الهاتف والبريد');
        return;
      }

      if (result.shop.status === 'pending') {
        setErr(
          `المحل «${result.shop.shop_name}» بانتظار اعتماد ${BRAND_NAME}`
        );
        return;
      }

      if (result.shop.status === 'rejected') {
        setErr(
          `تم رفض المحل «${result.shop.shop_name}» من قبل الشركة`
        );
        return;
      }

      if (result.shop.status === 'blocked') {
        setErr(
          `المحل «${result.shop.shop_name}» محظور من قبل الشركة`
        );
        return;
      }

      onLogin(
        result.shop,
        result.admin,
        result.sessionToken,
        result.expiresAt
      );
    } catch {
      setErr('حدث خطأ أثناء تسجيل الدخول — حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}

        <div className="mb-6 text-center">
          <div className="mx-auto flex min-h-20 w-full items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-4 text-stone-950 shadow-sm">
            <UlmiWordmark className="w-36" />
          </div>

          <h1 className="mt-3 font-display text-2xl font-extrabold text-stone-900">
            دخول الإدارة
          </h1>

          <p className="mt-1 text-sm text-stone-600">
            {SYSTEM_NAME} — نظام إدارة محلات الحلاقة من {BRAND_NAME}
          </p>
        </div>

        <div className="card space-y-4 p-6">
          <div>
            <label className="label">
              رقم الهاتف
            </label>

            <div className="relative">
              <Phone className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />

              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="01xxxxxxxxx"
                className="input pr-11"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="label">
              البريد الإلكتروني
            </label>

            <div className="relative">
              <Mail className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="email@example.com"
                className="input pr-11"
                dir="ltr"
              />
            </div>
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}

            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            <ShieldCheck className="h-4 w-4 shrink-0 text-slate-700" />
            النظام مُشغّل من شركة {BRAND_NAME} — استخدام النظام يعني موافقتك على الشروط والرسوم.
          </div>
        </div>

        <button
          onClick={onGoRegister}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
        >
          <UserPlus className="h-4 w-4" />
          محل جديد؟ سجّل الآن
        </button>
      </div>
    </div>
  );
}

/* ---------- Admin registration ---------- */

function AdminRegister({
  onRegistered,
  onGoLogin,
}: {
  onRegistered: (
    shop: Shop,
    admin: ShopAdmin,
    sessionToken?: string,
    expiresAt?: string
  ) => void;
  onGoLogin: () => void;
}) {
  const [form, setForm] = useState<ShopRegistration>({
    shop_name: '',
    owner_name: '',
    owner_phone: '',
    owner_email: '',
    national_id: '',
    shop_type: 'حلاقة رجالي',
    has_branches: false,
    branch_count: 0,
    shop_address: '',
    personal_address: '',
    year_started: new Date().getFullYear(),
    admin_full_name: '',
    admin_phone: '',
    admin_email: '',
    admin_national_id: '',
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [termsOpen, setTermsOpen] = useState(true);

  const set = (
    key: keyof ShopRegistration,
    value: string | number | boolean
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submit = async () => {
    const required: (keyof ShopRegistration)[] = [
      'shop_name',
      'owner_name',
      'owner_phone',
      'owner_email',
      'national_id',
      'shop_address',
      'admin_full_name',
      'admin_phone',
      'admin_email',
      'admin_national_id',
    ];

    for (const key of required) {
      if (!String(form[key]).trim()) {
        setErr('يرجى ملء جميع الحقول المطلوبة');
        return;
      }
    }

    setLoading(true);
    setErr('');

    try {
      const { shop, admin } = await registerShop(form);
      onRegistered(shop, admin);
    } catch {
      setErr(
        'حدث خطأ أثناء التسجيل — قد يكون البريد أو الهاتف مستخدماً بالفعل'
      );
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'input';
  const labelCls = 'label';

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Brand */}

        <div className="mb-6 text-center">
          <div className="mx-auto flex min-h-20 w-full items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-4 text-stone-950 shadow-sm">
            <UlmiWordmark className="w-36" />
          </div>

          <h1 className="mt-3 font-display text-2xl font-extrabold text-stone-900">
            تسجيل محل جديد
          </h1>

          <p className="mt-1 text-sm text-stone-600">
            سجّل بياناتك الكاملة — سيتم مراجعتها من {BRAND_NAME} قبل التفعيل
          </p>
        </div>

        {/* Terms notice */}

        {termsOpen && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
                  <Building2 className="h-5 w-5" />
                </div>

                <div>
                  <p className="font-bold text-stone-900">
                    إشعار وعقد إلكتروني من {BRAND_NAME}
                  </p>

                  <p className="mt-1 text-sm text-stone-600">
                    هذا النظام مملوك ومُدار حصراً من شركة {BRAND_NAME} — استخدامه ترخيص (إذن) وليس ملكية. يُحسب رسم
                    رمزي {formatPrice(COMPANY_FEE_PER_VISIT)} على كل زيارة (ساري في الفترة الحالية فقط، وقد يتغير مستقبلاً
                    لاشتراك شهري). التسجيل يتطلب بيانات كاملة وصحيحة كوثيقة رسمية، واعتماد المحل بعد المراجعة.
                    التوقيع على العقد إلكتروني وموثّق 100% ولا يُقبل التعديل فيه بعد التوقيع.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setTermsOpen(false)}
                className="shrink-0 text-stone-400 hover:text-stone-700"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div className="card space-y-5 p-6">
          {/* Shop section */}

          <div>
            <h3 className="mb-3 font-bold text-stone-900">
              بيانات المحل
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>
                  اسم المحل *
                </label>

                <input
                  value={form.shop_name}
                  onChange={(e) => set('shop_name', e.target.value)}
                  className={inputCls}
                  placeholder="مثال: صالون الأناقة"
                />
              </div>

              <div>
                <label className={labelCls}>
                  نوع المحل *
                </label>

                <select
                  value={form.shop_type}
                  onChange={(e) => set('shop_type', e.target.value)}
                  className={inputCls}
                >
                  <option value="حلاقة رجالي">حلاقة رجالي</option>
                  <option value="حلاقة + تجميل">حلاقة + تجميل</option>
                  <option value="صالون مختلط">صالون مختلط</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>
                  اسم المالك *
                </label>

                <input
                  value={form.owner_name}
                  onChange={(e) => set('owner_name', e.target.value)}
                  className={inputCls}
                  placeholder="الاسم بالكامل"
                />
              </div>

              <div>
                <label className={labelCls}>
                  الرقم القومي للمالك *
                </label>

                <input
                  value={form.national_id}
                  onChange={(e) => set('national_id', e.target.value)}
                  className={inputCls}
                  placeholder="14 رقم"
                  dir="ltr"
                />
              </div>

              <div>
                <label className={labelCls}>
                  هاتف المالك *
                </label>

                <input
                  value={form.owner_phone}
                  onChange={(e) => set('owner_phone', e.target.value)}
                  className={inputCls}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                />
              </div>

              <div>
                <label className={labelCls}>
                  بريد المالك *
                </label>

                <input
                  value={form.owner_email}
                  onChange={(e) => set('owner_email', e.target.value)}
                  className={inputCls}
                  placeholder="email@example.com"
                  dir="ltr"
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>
                  عنوان المحل *
                </label>

                <input
                  value={form.shop_address}
                  onChange={(e) => set('shop_address', e.target.value)}
                  className={inputCls}
                  placeholder="العنوان بالتفصيل"
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>
                  عنوان المالك
                </label>

                <input
                  value={form.personal_address}
                  onChange={(e) => set('personal_address', e.target.value)}
                  className={inputCls}
                  placeholder="اختياري"
                />
              </div>

              <div>
                <label className={labelCls}>
                  سنة بدء النشاط
                </label>

                <input
                  type="number"
                  value={form.year_started ?? ''}
                  onChange={(e) =>
                    set(
                      'year_started',
                      Number(e.target.value) || new Date().getFullYear()
                    )
                  }
                  className={inputCls}
                  dir="ltr"
                />
              </div>

              <div>
                <label className={labelCls}>
                  للمحل فروع؟
                </label>

                <select
                  value={form.has_branches ? 'yes' : 'no'}
                  onChange={(e) => {
                    set('has_branches', e.target.value === 'yes');

                    if (e.target.value !== 'yes') {
                      set('branch_count', 0);
                    }
                  }}
                  className={inputCls}
                >
                  <option value="no">لا</option>
                  <option value="yes">نعم</option>
                </select>
              </div>

              {form.has_branches && (
                <div>
                  <label className={labelCls}>
                    عدد الفروع
                  </label>

                  <input
                    type="number"
                    value={form.branch_count || ''}
                    onChange={(e) =>
                      set('branch_count', Number(e.target.value) || 0)
                    }
                    className={inputCls}
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Admin section */}

          <div>
            <h3 className="mb-3 font-bold text-stone-900">
              بيانات المسؤول عن النظام
            </h3>

            <p className="mb-3 text-xs text-stone-500">
              هذه البيانات ستُستخدم للدخول للنظام. أدخلها بدقة.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>
                  اسم المسؤول *
                </label>

                <div className="relative">
                  <User className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />

                  <input
                    value={form.admin_full_name}
                    onChange={(e) => set('admin_full_name', e.target.value)}
                    className={`${inputCls} pr-11`}
                    placeholder="الاسم بالكامل"
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>
                  الرقم القومي للمسؤول *
                </label>

                <input
                  value={form.admin_national_id}
                  onChange={(e) => set('admin_national_id', e.target.value)}
                  className={inputCls}
                  placeholder="14 رقم"
                  dir="ltr"
                />
              </div>

              <div>
                <label className={labelCls}>
                  هاتف المسؤول (للدخول) *
                </label>

                <div className="relative">
                  <Phone className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />

                  <input
                    value={form.admin_phone}
                    onChange={(e) => set('admin_phone', e.target.value)}
                    className={`${inputCls} pr-11`}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>
                  بريد المسؤول (للدخول) *
                </label>

                <div className="relative">
                  <Mail className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />

                  <input
                    value={form.admin_email}
                    onChange={(e) => set('admin_email', e.target.value)}
                    className={`${inputCls} pr-11`}
                    placeholder="email@example.com"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={submit}
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}

              {loading ? 'جاري التسجيل...' : 'تسجيل وإرسال للمراجعة'}
            </button>

            <button
              onClick={onGoLogin}
              className="btn-ghost"
            >
              لدي حساب — دخول
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}