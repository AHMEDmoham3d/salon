import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Lock,
  Loader2,
  Phone,
  Mail,
  Store,
  User,
  XCircle,
  ShieldCheck,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { AdminDashboard } from '@/pages/AdminPage';
import {
  adminLogin,
  registerShop,
  type ShopRegistration,
} from '@/lib/shopApi';
import { getShopById } from '@/lib/shopApi';
import { COMPANY_NAME, SYSTEM_NAME, COMPANY_FEE_PER_VISIT, type Shop, type ShopAdmin } from '@/lib/supabase';
import { formatPrice } from '@/lib/api';

type Session = { shopId: string };

const SESSION_KEY = 'barber_admin_session';

function loadSession(): Session | null {
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const refreshShop = useCallback(async () => {
    if (!session) {
      setShop(null);
      setShopLoading(false);
      return;
    }
    setShopLoading(true);
    try {
      const s = await getShopById(session.shopId);
      setShop(s);
    } catch {
      setShop(null);
    } finally {
      setShopLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refreshShop();
  }, [refreshShop]);

  const handleLogin = (shop: Shop, admin: ShopAdmin) => {
    saveSession({ shopId: shop.id });
    setSession({ shopId: shop.id });
    setShop(shop);
    setShopLoading(false);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setShop(null);
  };

  if (!session) {
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

  if (!shop) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-500" />
          <p className="mt-3 font-bold text-stone-900">المحل غير موجود</p>
          <p className="text-sm text-stone-500">لم يتم العثور على بيانات المحل.</p>
          <button onClick={handleLogout} className="btn-primary mt-4">
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
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100">
            <ShieldCheck className="h-7 w-7 text-amber-600" />
          </div>
          <h2 className="mt-4 font-display text-xl font-extrabold text-stone-900">طلبك قيد المراجعة</h2>
          <p className="mt-2 text-sm text-stone-600">
            المحل «{shop.shop_name}» بانتظار اعتماد {COMPANY_NAME}. سيتمكن صاحب المحل من استخدام النظام
            فور اعتماد الطلب من إدارة الشركة.
          </p>
          <button onClick={handleLogout} className="btn-ghost mt-5 w-full">
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
          <h2 className="mt-4 font-display text-xl font-extrabold text-stone-900">تم رفض المحل</h2>
          <p className="mt-2 text-sm text-stone-600">
            رفضت {COMPANY_NAME} طلب تسجيل المحل «{shop.shop_name}». تواصل مع إدارة الشركة لمعرفة السبب.
          </p>
          <button onClick={handleLogout} className="btn-ghost mt-5 w-full">
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
          <h2 className="mt-4 font-display text-xl font-extrabold text-stone-900">المحل محظور</h2>
          <p className="mt-2 text-sm text-stone-600">
            تم حظر المحل «{shop.shop_name}» من قبل {COMPANY_NAME}. لا يمكن استخدام النظام حتى يتم رفع الحظر.
          </p>
          <button onClick={handleLogout} className="btn-ghost mt-5 w-full">
            خروج
          </button>
        </div>
      </div>
    );
  }

  // approved — render dashboard
  return <AdminDashboard shopId={shop.id} onLogout={handleLogout} />;
}

/* ---------- Admin auth (login + registration) ---------- */
function AdminAuth({
  mode,
  setMode,
  onLogin,
}: {
  mode: 'login' | 'register';
  setMode: (m: 'login' | 'register') => void;
  onLogin: (shop: Shop, admin: ShopAdmin) => void;
}) {
  if (mode === 'login') {
    return <AdminLogin onLogin={onLogin} onGoRegister={() => setMode('register')} />;
  }
  return <AdminRegister onRegistered={onLogin} onGoLogin={() => setMode('login')} />;
}

function AdminLogin({
  onLogin,
  onGoRegister,
}: {
  onLogin: (shop: Shop, admin: ShopAdmin) => void;
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
        setErr(`المحل «${result.shop.shop_name}» بانتظار اعتماد ${COMPANY_NAME}`);
        return;
      }
      if (result.shop.status === 'rejected') {
        setErr(`تم رفض المحل «${result.shop.shop_name}» من قبل الشركة`);
        return;
      }
      if (result.shop.status === 'blocked') {
        setErr(`المحل «${result.shop.shop_name}» محظور من قبل الشركة`);
        return;
      }
      onLogin(result.shop, result.admin);
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
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 text-amber-400">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="mt-3 font-display text-2xl font-extrabold text-stone-900">دخول الإدارة</h1>
          <p className="mt-1 text-sm text-stone-600">
            {SYSTEM_NAME} — نظام إدارة محلات الحلاقة من {COMPANY_NAME}
          </p>
        </div>

        <div className="card space-y-4 p-6">
          <div>
            <label className="label">رقم الهاتف</label>
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
            <label className="label">البريد الإلكتروني</label>
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

          <button onClick={submit} disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>

          <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            النظام مُشغّل من شركة {COMPANY_NAME} — استخدام النظام يعني موافقتك على الشروط والرسوم.
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

function AdminRegister({
  onRegistered,
  onGoLogin,
}: {
  onRegistered: (shop: Shop, admin: ShopAdmin) => void;
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

  const set = (k: keyof ShopRegistration, v: string | number | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

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
    for (const k of required) {
      if (!String(form[k]).trim()) {
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
      setErr('حدث خطأ أثناء التسجيل — قد يكون البريد أو الهاتف مستخدماً بالفعل');
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
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 text-amber-400">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="mt-3 font-display text-2xl font-extrabold text-stone-900">تسجيل محل جديد</h1>
          <p className="mt-1 text-sm text-stone-600">
            سجّل بياناتك الكاملة — سيتم مراجعتها من {COMPANY_NAME} قبل التفعيل
          </p>
        </div>

        {/* Terms notice */}
        {termsOpen && (
          <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900 text-amber-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-stone-900">إشعار وعقد إلكتروني من {COMPANY_NAME}</p>
                  <p className="mt-1 text-sm text-stone-600">
                    هذا النظام مملوك ومُدار حصراً من شركة {COMPANY_NAME} — استخدامه ترخيص (إذن) وليس ملكية. يُحسب رسم
                    رمزي {formatPrice(COMPANY_FEE_PER_VISIT)} على كل زيارة (ساري في الفترة الحالية فقط، وقد يتغير مستقبلاً
                    لاشتراك شهري). التسجيل يتطلب بيانات كاملة وصحيحة كوثيقة رسمية، واعتماد المحل بعد المراجعة.
                    التوقيع على العقد إلكتروني وموثّق 100% ولا يُقبل التعديل فيه بعد التوقيع.
                  </p>
                </div>
              </div>
              <button onClick={() => setTermsOpen(false)} className="shrink-0 text-stone-400 hover:text-stone-700">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div className="card space-y-5 p-6">
          {/* Shop section */}
          <div>
            <h3 className="mb-3 font-bold text-stone-900">بيانات المحل</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>اسم المحل *</label>
                <input value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} className={inputCls} placeholder="مثال: صالون الأناقة" />
              </div>
              <div>
                <label className={labelCls}>نوع المحل *</label>
                <select value={form.shop_type} onChange={(e) => set('shop_type', e.target.value)} className={inputCls}>
                  <option value="حلاقة رجالي">حلاقة رجالي</option>
                  <option value="حلاقة + تجميل">حلاقة + تجميل</option>
                  <option value="صالون مختلط">صالون مختلط</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>اسم المالك *</label>
                <input value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} className={inputCls} placeholder="الاسم بالكامل" />
              </div>
              <div>
                <label className={labelCls}>الرقم القومي للمالك *</label>
                <input value={form.national_id} onChange={(e) => set('national_id', e.target.value)} className={inputCls} placeholder="14 رقم" dir="ltr" />
              </div>
              <div>
                <label className={labelCls}>هاتف المالك *</label>
                <input value={form.owner_phone} onChange={(e) => set('owner_phone', e.target.value)} className={inputCls} placeholder="01xxxxxxxxx" dir="ltr" />
              </div>
              <div>
                <label className={labelCls}>بريد المالك *</label>
                <input value={form.owner_email} onChange={(e) => set('owner_email', e.target.value)} className={inputCls} placeholder="email@example.com" dir="ltr" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>عنوان المحل *</label>
                <input value={form.shop_address} onChange={(e) => set('shop_address', e.target.value)} className={inputCls} placeholder="العنوان بالتفصيل" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>عنوان المالك</label>
                <input value={form.personal_address} onChange={(e) => set('personal_address', e.target.value)} className={inputCls} placeholder="اختياري" />
              </div>
              <div>
                <label className={labelCls}>سنة بدء النشاط</label>
                <input
                  type="number"
                  value={form.year_started ?? ''}
                  onChange={(e) => set('year_started', Number(e.target.value) || new Date().getFullYear())}
                  className={inputCls}
                  dir="ltr"
                />
              </div>
              <div>
                <label className={labelCls}>للمحل فروع؟</label>
                <select
                  value={form.has_branches ? 'yes' : 'no'}
                  onChange={(e) => { set('has_branches', e.target.value === 'yes'); if (e.target.value !== 'yes') set('branch_count', 0); }}
                  className={inputCls}
                >
                  <option value="no">لا</option>
                  <option value="yes">نعم</option>
                </select>
              </div>
              {form.has_branches && (
                <div>
                  <label className={labelCls}>عدد الفروع</label>
                  <input
                    type="number"
                    value={form.branch_count || ''}
                    onChange={(e) => set('branch_count', Number(e.target.value) || 0)}
                    className={inputCls}
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Admin section */}
          <div>
            <h3 className="mb-3 font-bold text-stone-900">بيانات المسؤول عن النظام</h3>
            <p className="mb-3 text-xs text-stone-500">
              هذه البيانات ستُستخدم للدخول للنظام. أدخلها بدقة.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>اسم المسؤول *</label>
                <div className="relative">
                  <User className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                  <input value={form.admin_full_name} onChange={(e) => set('admin_full_name', e.target.value)} className={`${inputCls} pr-11`} placeholder="الاسم بالكامل" />
                </div>
              </div>
              <div>
                <label className={labelCls}>الرقم القومي للمسؤول *</label>
                <input value={form.admin_national_id} onChange={(e) => set('admin_national_id', e.target.value)} className={inputCls} placeholder="14 رقم" dir="ltr" />
              </div>
              <div>
                <label className={labelCls}>هاتف المسؤول (للدخول) *</label>
                <div className="relative">
                  <Phone className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                  <input value={form.admin_phone} onChange={(e) => set('admin_phone', e.target.value)} className={`${inputCls} pr-11`} placeholder="01xxxxxxxxx" dir="ltr" />
                </div>
              </div>
              <div>
                <label className={labelCls}>بريد المسؤول (للدخول) *</label>
                <div className="relative">
                  <Mail className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                  <input value={form.admin_email} onChange={(e) => set('admin_email', e.target.value)} className={`${inputCls} pr-11`} placeholder="email@example.com" dir="ltr" />
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
            <button onClick={submit} disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {loading ? 'جاري التسجيل...' : 'تسجيل وإرسال للمراجعة'}
            </button>
            <button onClick={onGoLogin} className="btn-ghost">
              لدي حساب — دخول
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
