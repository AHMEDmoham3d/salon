
import { useCallback, useEffect, useState } from 'react';
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
  Camera,
  Zap,
  Bell,
  LogOut,
  FileText,
  Download,
  Lock,
  ShieldCheck,
  Settings,
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
  getSubscriptionAlerts,
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
} from '@/lib/api';
import { REGULAR_HAIRCUT_PRICE, COMPANY_FEE_PER_VISIT, COMPANY_NAME, SYSTEM_NAME } from '@/lib/supabase';
import { getShopById } from '@/lib/shopApi';
import ShopSettingsTab from '@/components/ShopSettingsTab';

type Tab = 'overview' | 'customers' | 'visits' | 'revenue' | 'subscriptions' | 'settings';

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
    { k: 'overview', label: 'نظرة عامة', icon: TrendingUp },
    { k: 'customers', label: 'العملاء', icon: Users },
    { k: 'visits', label: 'الزيارات', icon: Receipt },
    { k: 'subscriptions', label: 'الاشتراكات', icon: CalendarClock },
    { k: 'revenue', label: 'الإيرادات', icon: Wallet },
    { k: 'settings', label: 'إعدادات المحل', icon: Settings },
  ];

  return (
    <div className="animate-fade-in mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {shopInfo?.logo_url ? (
            <img src={shopInfo.logo_url} alt={`شعار ${shopInfo.shop_name}`} className="h-14 w-14 shrink-0 rounded-2xl border border-stone-200 bg-white object-contain p-1" />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-stone-900 font-display text-xl font-extrabold text-amber-400">
              {shopInfo?.shop_name?.charAt(0) ?? 'م'}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-extrabold text-stone-900">{shopInfo?.shop_name || 'لوحة الإدارة'}</h1>
            <p className="mt-1 text-sm text-stone-600">إدارة العملاء والاشتراكات والزيارات ونظام الولاء</p>
            <p className="mt-1 text-xs font-bold text-amber-700">سعر الحلاقة العادية: {formatPrice(regularHaircutPrice)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setNoticeOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-100"
          >
            <Building2 className="h-4 w-4" />
            إشعار الشركة
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-primary">
            <UserPlus className="h-4 w-4" />
            عميل جديد
          </button>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:bg-stone-100"
          >
            <LogOut className="h-4 w-4" />
            خروج
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition sm:px-4 ${
              tab === t.k ? 'bg-stone-900 text-amber-50 shadow-sm' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview shopId={shopId} customers={customers} onGoSubs={() => setTab('subscriptions')} onGoRevenue={() => setTab('revenue')} />}
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
      {tab === 'visits' && <VisitsTab shopId={shopId} customers={customers} regularHaircutPrice={regularHaircutPrice} onSelectCustomer={setSelected} />}
      {tab === 'subscriptions' && <SubscriptionsTab customers={customers} onSelectCustomer={setSelected} />}
      {tab === 'revenue' && <RevenueTab shopId={shopId} customers={customers} />}
      {tab === 'settings' && <ShopSettingsTab shopId={shopId} onUpdated={(shop) => {
        setShopInfo({ shop_name: shop.shop_name, owner_name: shop.owner_name, logo_url: shop.logo_url ?? null });
        setRegularHaircutPrice(Number(shop.regular_haircut_price ?? REGULAR_HAIRCUT_PRICE));
      }} />}

      <AddCustomerModal
        shopId={shopId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          load();
        }}
      />
      <CustomerDrawer shopId={shopId} regularHaircutPrice={regularHaircutPrice} customer={selected} onClose={() => setSelected(null)} onChanged={load} />
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
          {/* Contract header */}
          <div className="rounded-2xl border-2 border-stone-300 bg-stone-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-stone-900 text-amber-400">
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

          {/* Contract body */}
          <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-700">
            <div>
              <p className="mb-2 font-bold text-stone-900">تمهيد</p>
              <p>
                إنه في يوم <span className="font-bold">{today}</span>، تم الاتفاق بين طرف أول شركة{' '}
                <span className="font-bold text-stone-900">{COMPANY_NAME}</span> (المُنشئة والمالكة لنظام{' '}
                <span className="font-bold">{SYSTEM_NAME}</span>) وبين طرف ثانٍ محل الحلاقة المُسجّل باسم{' '}
                <span className="font-bold text-stone-900">{shopInfo?.shop_name ?? '—'}</span>، المملوك للسيد/ة{' '}
                <span className="font-bold text-stone-900">{shopInfo?.owner_name ?? '—'}</span>، على ترخيص استخدام النظام
                وفقاً للشروط والأحكام الآتية، ويعتبر هذا العقد وثيقة إلكترونية موثّقة بين الطرفين لا تقبل التعديل
                من طرف ثانٍ بعد التوقيع عليها.
              </p>
            </div>

            <div>
              <p className="mb-1.5 font-bold text-stone-900">البند الأول — ماهية النظام والملكية</p>
              <p className="mb-1">
                نظام <span className="font-bold">{SYSTEM_NAME}</span> هو منصة إدارة محلات الحلاقة الذكية المُطوّرة والملكية
                الحصرية لشركة <span className="font-bold">{COMPANY_NAME}</span>، وتشمل إدارة العملاء والاشتراكات والزيارات
                ونظام الولاء والإيرادات. هذا النظام ليس ملكاً للمحل ولا يحق للمحل ادعاء ملكيته أو بيعه أو تأجيره لأي طرف
                ثالث. استخدام المحل للنظام هو <span className="font-bold text-amber-700">ترخيص (إذن)</span> من الشركة
                للمحل لاستخدام النظام وفقاً لقوانين الشركة المُعتمدة، ولا يُعدّ هذا الترخيص تنازلاً عن أي حق من حقوق
                الملكية الفكرية.
              </p>
            </div>

            <div>
              <p className="mb-1.5 font-bold text-stone-900">البند الثاني — الانضمام المستقبلي للشركة</p>
              <p className="mb-1">
                يقرّ المحل بأن نظام <span className="font-bold">{SYSTEM_NAME}</span> سيُضاف في المستقبل القريب إلى المنصة
                الرئيسية لشركة <span className="font-bold">{COMPANY_NAME}</span> وتصميمها الرسمي المعتمد، وسيصبح الدومين
                باسم الشركة. عند انضمام النظام للمنصة الرئيسية، سيحصل المحل على مزايا إضافية تشمل:
              </p>
              <ul className="mt-1.5 space-y-1 pr-4">
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />زيادة عدد العملاء الواصلين للمحل عبر المنصة الموحّدة</li>
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />نظام حجوزات وتوصيات عملاء بين المحلات المشتركة</li>
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />خصومات وعروض ترويجية للعملاء على المحلات المشتركة في المنصة</li>
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />ظهور المحل في نتائج البحث للعملاء القريبين جغرافياً</li>
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />تقييمات ومراجعات العملاء لتعزيز سمعة المحل</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-bold text-stone-900">البند الثالث — الرسوم</p>
              <p className="mb-1">
                مقابل استخدام النظام، تُحسب رسوم خدمة قدرها{' '}
                <span className="font-bold text-amber-700">{formatPrice(COMPANY_FEE_PER_VISIT)}</span> على كل زيارة تتم في
                المحل — سواء للعملاء المشتركين أو غير المشتركين. ويُقرّ المحل بما يلي:
              </p>
              <ul className="mt-1.5 space-y-1 pr-4">
                <li className="flex gap-1.5"><span className="font-bold text-stone-900">•</span> هذه الرسوم <span className="font-bold">سارية في الفترة الحالية فقط</span>، وتُحتسب كرسوم رمزية تشمل صيانة النظام وتحديثاته والدعم الفني واستضافة البيانات بشكل آمن.</li>
                <li className="flex gap-1.5"><span className="font-bold text-stone-900">•</span> قد يتم في المستقبل تعديل الرسوم (زيادة أو تحويلها لاشتراك شهري ثابت من المحل)، وسيتم إخطار المحل قبل أي تغيير بمدة كافية.</li>
                <li className="flex gap-1.5"><span className="font-bold text-stone-900">•</span> الرسوم ليست مرتفعة — فمقابل كل زيارة يدفع المحل {formatPrice(COMPANY_FEE_PER_VISIT)} فقط، بينما يحصل على نظام إدارة كامل، تتبع عملاء، تنبيهات اشتراكات، حساب أرباح، ونظام ولاء تلقائي.</li>
                <li className="flex gap-1.5"><span className="font-bold text-stone-900">•</span> تُحسب الرسوم تلقائياً من سجلات الزيارات الفعلية، وتظهر في تقرير شهري تفصيلي.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-bold text-stone-900">البند الرابع — التزامات الشركة</p>
              <ul className="space-y-1 pr-4">
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />حفظ بيانات المحل وعملائه بشكل آمن على خوادم الشركة</li>
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />تقديم تحديثات دورية وميزات جديدة بدون رسوم إضافية</li>
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />دعم فني متواصل من فريق الشركة</li>
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />تقرير شهري تلقائي بالأرباح والرسوم المستحقة</li>
                <li className="flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />نسخ احتياطي تلقائي للبيانات</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-bold text-stone-900">البند الخامس — التزامات المحل</p>
              <ul className="space-y-1 pr-4">
                <li className="flex gap-1.5"><span className="font-bold text-stone-900">•</span> تقديم بيانات صحيحة وكاملة عند التسجيل</li>
                <li className="flex gap-1.5"><span className="font-bold text-stone-900">•</span> عدم إساءة استخدام النظام أو مشاركة بيانات العملاء مع أطراف خارجية</li>
                <li className="flex gap-1.5"><span className="font-bold text-stone-900">•</span> سداد الرسوم المستحقة في موعدها</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-bold text-stone-900">البند السادس — توثيق العقد</p>
              <p>
                هذا العقد وثيقة إلكترونية موثّقة 100% بين شركة <span className="font-bold">{COMPANY_NAME}</span> والمحل،
                يتم تسجيله على النظام بتاريخ ورقم العقد المذكور أعلاه. يحق للمحل تحميل نسخة من هذا العقد أو طباعتها بأي
                صيغة (PDF أو ورقية)، ولكن لا يحق له تعديل محتواها. يُعتبر التوقيع الإلكتروني على هذا العقد موافقة نهائية
                ومُلزمة من المحل على جميع البنود.
              </p>
            </div>

            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs font-bold text-stone-600">أطراف العقد:</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-stone-500">الطرف الأول — الشركة</p>
                  <p className="text-sm font-bold text-stone-800">{COMPANY_NAME}</p>
                  <p className="text-xs text-stone-500">المالكة والمُنشئة لنظام {SYSTEM_NAME}</p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-500">الطرف الثاني — المحل</p>
                  <p className="text-sm font-bold text-stone-800">{shopInfo?.shop_name ?? '—'}</p>
                  <p className="text-xs text-stone-500">المالك: {shopInfo?.owner_name ?? '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Agreement checkbox */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-amber-600"
            />
            <span className="text-sm font-bold text-stone-700">
              أوافق على جميع بنود هذا العقد الإلكتروني الموثّق بين محلي وشركة {COMPANY_NAME}، وأُقرّ بصحة بياناتي
              وموافقتي على الرسوم وشروط الاستخدام المذكورة أعلاه.
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
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
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
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 p-4 text-amber-50">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500/20">
            <Building2 className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="font-display text-lg font-extrabold">{COMPANY_NAME}</p>
            <p className="text-xs text-stone-400">إدارة أنظمة الحلاقة الذكية — {SYSTEM_NAME}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-stone-700">
          <p>
            هذا النظام <span className="font-bold">{SYSTEM_NAME}</span> مُشغّل ومُدار بالكامل من قبل شركة{' '}
            <span className="font-bold text-stone-900">{COMPANY_NAME}</span>، ويخضع لقوانين ولوائح الشركة المُعتمدة.
            <span className="font-bold"> استخدامك لهذا النظام لا يعني أنه ملك لك</span> — بل هو إذن (ترخيص) من الشركة
            لمحلك لاستخدام النظام وفقاً لشروطها.
          </p>
          <p>
            سيتم في المستقبل القريب إضافة هذا النظام إلى المنصة الرئيسية للشركة باسم{' '}
            <span className="font-bold">{COMPANY_NAME}</span> وتصميمها الرسمي، وسيصبح الدومين باسم الشركة. عند انضمام
            النظام للمنصة، سيحصل محلك على مزايا قوية: <span className="font-bold">زيادة عدد العملاء</span> عبر المنصة
            الموحّدة، ظهور المحل في نتائج البحث للعملاء القريبين، نظام حجوزات وتوصيات، وخصومات وعروض ترويجية للعملاء
            على محلك.
          </p>
          <p>
            مقابل استخدام النظام، تُحسب رسوم رمزية قدرها{' '}
            <span className="font-bold text-amber-700">{formatPrice(COMPANY_FEE_PER_VISIT)}</span> فقط على كل زيارة تتم في
            المحل — سواء للعملاء المشتركين أو غير المشتركين. <span className="font-bold">هذه الرسوم سارية في الفترة
            الحالية فقط</span>، وقد يتم في المستقبل تعديلها (زيادة أو تحويلها لاشتراك شهري ثابت)، وسيتم إخطارك قبل
            أي تغيير. الرسوم ليست مرتفعة — فمقابل {formatPrice(COMPANY_FEE_PER_VISIT)} فقط تحصل على نظام إدارة كامل
            لتتبع عملائك واشتراكاتهم وزياراتك ونظام ولاء وحساب أرباح وتنبيهات تلقائية.
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs font-bold text-stone-600">شروط الاستخدام:</p>
          <ul className="mt-2 space-y-1.5 text-xs text-stone-600">
            <li className="flex gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              البيانات محفوظة بأمان على خوادم الشركة مع نسخ احتياطي تلقائي
            </li>
            <li className="flex gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              تحديثات دورية وميزات جديدة بدون رسوم إضافية
            </li>
            <li className="flex gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              دعم فني متواصل من فريق الشركة
            </li>
            <li className="flex gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              تقرير شهري تلقائي بالأرباح والرسوم المستحقة
            </li>
            <li className="flex gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              انضمام مستقبلي للمنصة الرئيسية — عملاء أكثر وخصومات للعملاء
            </li>
          </ul>
        </div>

        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-700" />
            <p className="font-bold text-stone-900">عقد إلكتروني موثّق</p>
          </div>
          <p className="mt-2 text-xs text-stone-600">
            استخدامك لهذا النظام يُعتبر عقداً إلكترونياً موثّقاً 100% بين محلك وشركة {COMPANY_NAME}. العقد يحتوي على
            جميع بنود الاتفاق، ويُسجّل برقم وتاريخ. يحق لك تحميله أو طباعته بأي صيغة، ولكن لا يحق لك تعديل محتواه.
          </p>
        </div>

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

/* ---------- Overview ---------- */
function Overview({
  shopId,
  customers,
  onGoSubs,
  onGoRevenue,
}: {
  shopId: string;
  customers: Customer[];
  onGoSubs: () => void;
  onGoRevenue: () => void;
}) {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeSubs: 0,
    totalVisits: 0,
    totalPaid: 0,
    expiringSoon: 0,
    loading: true,
  });

  useEffect(() => {
    (async () => {
      setStats((s) => ({ ...s, loading: true }));
      let activeSubs = 0;
      let totalVisits = 0;
      let totalPaid = 0;
      let expiringSoon = 0;
      for (const c of customers) {
        const sub = await getActiveSubscription(c.id);
        if (sub?.status === 'active') activeSubs++;
        const visits = await getVisitsByCustomer(c.id);
        totalVisits += visits.length;
        totalPaid += visits.filter((v) => v.payment_type === 'paid').reduce((s, v) => s + Number(v.charge_amount), 0);
        if (sub?.status === 'active') {
          const daysLeft = Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000);
          if (daysLeft <= 7) expiringSoon++;
        }
      }
      setStats({ totalCustomers: customers.length, activeSubs, totalVisits, totalPaid, expiringSoon, loading: false });
    })();
  }, [customers, shopId]);

  const cards = [
    { label: 'إجمالي العملاء', value: stats.totalCustomers, icon: Users, tone: 'bg-stone-900 text-amber-400' },
    { label: 'اشتراكات نشطة', value: stats.activeSubs, icon: CheckCircle2, tone: 'bg-emerald-600 text-emerald-50' },
    { label: 'إجمالي الزيارات', value: stats.totalVisits, icon: Scissors, tone: 'bg-amber-500 text-stone-950' },
    { label: 'قربت تنتهي', value: stats.expiringSoon, icon: CalendarClock, tone: 'bg-orange-500 text-orange-50' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <div className={`grid h-11 w-11 place-items-center rounded-xl ${c.tone}`}>
              <c.icon className="h-5 w-5" />
            </div>
            {stats.loading ? (
              <div className="mt-3 h-7 w-20 animate-shimmer rounded" />
            ) : (
              <p className="mt-3 font-display text-2xl font-extrabold text-stone-900">{c.value}</p>
            )}
            <p className="text-xs font-bold text-stone-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Company fee banner */}
      <div className="card overflow-hidden border-amber-200">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-amber-50 to-stone-50 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-stone-900 text-amber-400">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-stone-900">
                رسوم {COMPANY_NAME}: {formatPrice(COMPANY_FEE_PER_VISIT)} لكل زيارة
              </p>
              <p className="text-xs text-stone-600">تُحسب تلقائياً على كل زيارة — راجع تفاصيل الإيرادات</p>
            </div>
          </div>
          <button onClick={onGoRevenue} className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-bold text-amber-50">
            <Wallet className="h-3.5 w-3.5" />
            عرض الإيرادات
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Alerts preview */}
      {stats.expiringSoon > 0 && (
        <div className="card border-orange-200 bg-orange-50/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <span className="font-bold text-stone-900">
                {stats.expiringSoon} اشتراك قرب ينتهي خلال أسبوع
              </span>
            </div>
            <button onClick={onGoSubs} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white">
              عرض التفاصيل
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
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
    <div>
      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم العميل..."
          className="input pr-12"
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
          <p className="mt-3 font-bold text-stone-600">لا يوجد عملاء بعد</p>
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
  const [visits, setVisits] = useState(0);

  useEffect(() => {
    (async () => {
      const s = await getActiveSubscription(customer.id);
      setSub(s);
      const v = await getVisitsByCustomer(customer.id);
      setVisits(v.length);
    })();
  }, [customer.id]);

  const active = sub?.status === 'active';
  const remaining = sub ? (sub.plan?.haircut_count ?? 0) - sub.haircuts_used : 0;

  return (
    <button
      onClick={onClick}
      className={`card flex items-center gap-3 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-soft ${
        customer.is_blocked ? 'opacity-60' : ''
      }`}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-stone-700 to-stone-900 font-display text-lg font-extrabold text-amber-400">
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
            {visits} زيارة
          </span>
          {active ? (
            <span className="badge bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              مشترك — باقي {remaining}
            </span>
          ) : (
            <span className="badge bg-stone-100 text-stone-500">غير مشترك</span>
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
}: {
  shopId: string;
  customers: Customer[];
  regularHaircutPrice: number;
  onSelectCustomer: (c: Customer) => void;
}) {
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const loadRows = useCallback(async () => {
    setLoading(true);
    const built: VisitRow[] = [];
    for (const c of customers) {
      const [sub, visits] = await Promise.all([getActiveSubscription(c.id), getVisitsByCustomer(c.id)]);
      const todayStr = new Date().toISOString().slice(0, 10);
      const visitToday = visits.find((v) => v.visit_date.slice(0, 10) === todayStr) ?? null;
      built.push({ customer: c, sub, visitToday, recording: false });
    }
    built.sort((a, b) => {
      if (!!a.visitToday !== !!b.visitToday) return a.visitToday ? 1 : -1;
      return a.customer.name.localeCompare(b.customer.name, 'ar');
    });
    setRows(built);
    setLoading(false);
  }, [customers]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const markVisited = async (idx: number, forcePaid: boolean) => {
    const row = rows[idx];
    if (row.visitToday || row.recording || row.customer.is_blocked) return;
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, recording: true } : r)));
    try {
      const result = await recordVisit(row.customer.id, { forcePaid, shopId });
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
    } catch {
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, recording: false } : r)));
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
  };

  const filtered = filter.trim() ? rows.filter((r) => r.customer.name.includes(filter.trim())) : rows;
  const visitedCount = rows.filter((r) => r.visitToday).length;
  const subscribedCount = rows.filter((r) => r.sub?.status === 'active').length;
  const todayCompanyFee = visitedCount * COMPANY_FEE_PER_VISIT;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3 text-center">
          <Users className="mx-auto h-5 w-5 text-stone-500" />
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{rows.length}</p>
          <p className="text-[11px] font-bold text-stone-500">إجمالي العملاء</p>
        </div>
        <div className="card p-3 text-center">
          <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500" />
          <p className="mt-1 font-display text-xl font-extrabold text-emerald-600">{visitedCount}</p>
          <p className="text-[11px] font-bold text-stone-500">زار اليوم</p>
        </div>
        <div className="card p-3 text-center">
          <CalendarPlus className="mx-auto h-5 w-5 text-amber-500" />
          <p className="mt-1 font-display text-xl font-extrabold text-amber-600">{subscribedCount}</p>
          <p className="text-[11px] font-bold text-stone-500">مشترك نشط</p>
        </div>
        <div className="card border-amber-200 bg-amber-50/50 p-3 text-center">
          <Building2 className="mx-auto h-5 w-5 text-amber-600" />
          <p className="mt-1 font-display text-xl font-extrabold text-amber-700">{formatPrice(todayCompanyFee)}</p>
          <p className="text-[11px] font-bold text-stone-500">رسوم الشركة اليوم</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="ابحث عن عميل..."
          className="input pr-12"
        />
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-600">
        <Clock className="h-4 w-4" />
        زيارات اليوم — {formatDate(new Date())}
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
        <div className="space-y-2">
          {filtered.map((row) => {
            const idx = rows.indexOf(row);
            const active = row.sub?.status === 'active';
            const remaining = row.sub && row.sub.plan ? row.sub.plan.haircut_count - row.sub.haircuts_used : 0;
            const visited = !!row.visitToday;
            const blocked = row.customer.is_blocked;
            return (
              <div
                key={row.customer.id}
                className={`card flex items-center gap-3 p-3.5 transition ${
                  visited ? 'border-emerald-200 bg-emerald-50/40' : ''
                } ${blocked ? 'opacity-50' : ''}`}
              >
                <button
                  onClick={() => onSelectCustomer(row.customer)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-stone-700 to-stone-900 font-display text-lg font-extrabold text-amber-400"
                >
                  {row.customer.name.charAt(0)}
                </button>

                <button onClick={() => onSelectCustomer(row.customer)} className="min-w-0 flex-1 text-right">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-stone-900">{row.customer.name}</p>
                    {blocked && <span className="badge bg-red-100 text-red-700"><Ban className="h-3 w-3" />محظور</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {active ? (
                      <span className="badge bg-emerald-100 text-emerald-700">مشترك — باقي {remaining}</span>
                    ) : (
                      <span className="badge bg-stone-100 text-stone-500">غير مشترك</span>
                    )}
                    {visited && (
                      <span className="badge bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        {row.visitToday?.payment_type === 'subscription'
                          ? 'بالاشتراك'
                          : formatPrice(Number(row.visitToday?.charge_amount ?? 0))}
                      </span>
                    )}
                  </div>
                </button>

                {blocked ? (
                  <span className="text-xs font-bold text-red-500">لا يمكن التسجيل</span>
                ) : visited ? (
                  <button
                    onClick={() => unmarkVisited(idx)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-600 transition hover:bg-stone-100"
                  >
                    <XCircle className="h-4 w-4" />
                    إلغاء
                  </button>
                ) : row.recording ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-2 text-xs font-bold text-stone-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </span>
                ) : active && remaining > 0 ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => markVisited(idx, false)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      اشتراك
                    </button>
                    <button
                      onClick={() => markVisited(idx, true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-600"
                    >
                      <Coins className="h-4 w-4" />
                      عادي
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => markVisited(idx, false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-600"
                  >
                    <Scissors className="h-4 w-4" />
                    زاره — {formatPrice(regularHaircutPrice)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Subscriptions tab ---------- */
function SubscriptionsTab({
  customers,
  onSelectCustomer,
}: {
  customers: Customer[];
  onSelectCustomer: (c: Customer) => void;
}) {
  const [alerts, setAlerts] = useState<SubscriptionAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const a = await getSubscriptionAlerts(customers);
      setAlerts(a);
      setLoading(false);
    })();
  }, [customers]);

  const expired = alerts.filter((a) => a.isExpired);
  const expiringSoon = alerts.filter((a) => !a.isExpired && a.daysLeft <= 3);
  const renewingSoon = alerts.filter((a) => !a.isExpired && a.daysLeft > 3 && a.daysLeft <= 7);

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card border-red-200 bg-red-50/50 p-3 text-center">
          <XCircle className="mx-auto h-5 w-5 text-red-500" />
          <p className="mt-1 font-display text-xl font-extrabold text-red-600">{expired.length}</p>
          <p className="text-[11px] font-bold text-stone-500">انتهى اشتراكهم</p>
        </div>
        <div className="card border-orange-200 bg-orange-50/50 p-3 text-center">
          <AlertTriangle className="mx-auto h-5 w-5 text-orange-500" />
          <p className="mt-1 font-display text-xl font-extrabold text-orange-600">{expiringSoon.length}</p>
          <p className="text-[11px] font-bold text-stone-500">قربت تنتهي (3 أيام)</p>
        </div>
        <div className="card border-amber-200 bg-amber-50/50 p-3 text-center">
          <CalendarClock className="mx-auto h-5 w-5 text-amber-500" />
          <p className="mt-1 font-display text-xl font-extrabold text-amber-600">{renewingSoon.length}</p>
          <p className="text-[11px] font-bold text-stone-500">مجددوا قريباً (7 أيام)</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-shimmer rounded-2xl" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="card p-8 text-center text-stone-500">
          <CalendarClock className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold">لا توجد اشتراكات تحتاج متابعة</p>
          <p className="text-sm">جميع الاشتراكات النشطة لديها وقت متبقٍ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <button
              key={a.subscription.id}
              onClick={() => onSelectCustomer(a.customer)}
              className={`card flex items-center gap-3 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-soft ${
                a.isExpired ? 'border-red-200' : a.daysLeft <= 3 ? 'border-orange-200' : 'border-amber-200'
              }`}
            >
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                  a.isExpired ? 'bg-red-100 text-red-600' : a.daysLeft <= 3 ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                {a.isExpired ? <XCircle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-stone-900">{a.customer.name}</p>
                <p className="text-xs text-stone-500">
                  باقة {a.subscription.plan?.name} — {a.haircutsRemaining} حلاقة متبقية
                </p>
              </div>
              <div className="text-left">
                {a.isExpired ? (
                  <span className="badge bg-red-100 text-red-700">انتهى منذ {a.expiredDaysAgo} يوم</span>
                ) : (
                  <span className={`badge ${a.daysLeft <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                    باقي {a.daysLeft} يوم
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Revenue tab ---------- */
function RevenueTab({ shopId, customers }: { shopId: string; customers: Customer[] }) {
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const s = await getRevenueStats(customers);
      setStats(s);
      setLoading(false);
    })();
  }, [customers, shopId]);

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
    <div className="space-y-5">
      {/* Main revenue cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-emerald-50">
            <Coins className="h-5 w-5" />
          </div>
          <p className="mt-3 font-display text-2xl font-extrabold text-stone-900">{formatPrice(stats.revenueFromPaid)}</p>
          <p className="text-xs font-bold text-stone-500">من الحلاقات العادية</p>
        </div>
        <div className="card p-5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500 text-stone-950">
            <CalendarPlus className="h-5 w-5" />
          </div>
          <p className="mt-3 font-display text-2xl font-extrabold text-stone-900">{formatPrice(stats.revenueFromSubscriptions)}</p>
          <p className="text-xs font-bold text-stone-500">من الاشتراكات</p>
        </div>
        <div className="card border-emerald-200 bg-emerald-50/40 p-5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-stone-900 text-amber-400">
            <Wallet className="h-5 w-5" />
          </div>
          <p className="mt-3 font-display text-2xl font-extrabold text-stone-900">{formatPrice(stats.totalRevenue)}</p>
          <p className="text-xs font-bold text-stone-500">إجمالي الإيرادات</p>
        </div>
      </div>

      {/* Visits breakdown */}
      <div className="card p-5">
        <h3 className="mb-4 font-display text-lg font-extrabold text-stone-900">تفصيل الزيارات</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <Scissors className="mx-auto h-6 w-6 text-stone-500" />
            <p className="mt-2 font-display text-2xl font-extrabold text-stone-900">{stats.totalVisits}</p>
            <p className="text-xs font-bold text-stone-500">إجمالي الزيارات</p>
          </div>
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500" />
            <p className="mt-2 font-display text-2xl font-extrabold text-emerald-600">{stats.subscriptionVisits}</p>
            <p className="text-xs font-bold text-stone-500">بالاشتراك</p>
          </div>
          <div className="text-center">
            <Coins className="mx-auto h-6 w-6 text-amber-600" />
            <p className="mt-2 font-display text-2xl font-extrabold text-amber-600">{stats.paidVisits}</p>
            <p className="text-xs font-bold text-stone-500">حلاقة عادية</p>
          </div>
        </div>
      </div>

      {/* Company fee breakdown */}
      <div className="card overflow-hidden border-amber-200">
        <div className="bg-gradient-to-l from-amber-50 to-stone-50 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-stone-900 text-amber-400">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900">رسوم {COMPANY_NAME}</h3>
              <p className="text-xs text-stone-600">{formatPrice(COMPANY_FEE_PER_VISIT)} لكل زيارة — سواء مشترك أو غير مشترك</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-white/70 p-3">
              <span className="text-sm text-stone-600">إجمالي الزيارات × {formatPrice(COMPANY_FEE_PER_VISIT)}</span>
              <span className="font-bold text-stone-900">{stats.totalVisits} × {formatPrice(COMPANY_FEE_PER_VISIT)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/70 p-3">
              <span className="text-sm text-stone-600">الرسوم المستحقة (كل الوقت)</span>
              <span className="font-bold text-amber-700">{formatPrice(stats.companyFee)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-100/60 p-3">
              <span className="text-sm font-bold text-stone-700">رسوم هذا الشهر ({stats.thisMonthVisits} زيارة)</span>
              <span className="font-bold text-amber-800">{formatPrice(stats.thisMonthCompanyFee)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-stone-200 bg-white p-4">
          <div>
            <p className="font-bold text-stone-900">صافي ربح المحل</p>
            <p className="text-xs text-stone-500">الإيرادات - رسوم الشركة</p>
          </div>
          <p className="font-display text-2xl font-extrabold text-emerald-600">{formatPrice(stats.netRevenue)}</p>
        </div>
      </div>

      {/* Why pay the fee - features */}
      <div className="card p-5">
        <h3 className="mb-3 font-bold text-stone-900">ماذا تستفيد من النظام؟</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { icon: Zap, title: 'تتبع فوري للزيارات', desc: 'سجل دقيق لكل عميل وزيارة — لا حاجة لورق أو دفاتر' },
            { icon: CalendarClock, title: 'تنبيهات الاشتراكات', desc: 'اعرف من اشتراكه قرب ينتهي ومجددهوش — قبل ما يفوت العميل' },
            { icon: Award, title: 'نظام ولاء تلقائي', desc: 'كافئ عملاءك المخلصين بدون مجهود إضافي' },
            { icon: Wallet, title: 'حساب الأرباح', desc: 'إيراداتك ورسوم الشركة محسوبة بدقة في كل وقت' },
            { icon: Sparkles, title: 'استشارة الحلاقة', desc: 'العميل يصور رأسه والنظام يقترح أفضل حلاقة' },
            { icon: Building2, title: 'دعم ومزامنة', desc: 'نسخة احتياطية تلقائية ودعم فني من الشركة' },
          ].map((f) => (
            <div key={f.title} className="flex gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-900 text-amber-400">
                <f.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-800">{f.title}</p>
                <p className="text-xs text-stone-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-center text-sm text-stone-700">
          <span className="font-bold">باختصار:</span> بدفع {formatPrice(COMPANY_FEE_PER_VISIT)} فقط لكل زيارة، توفر على
          نفسك إدارة الورق وتتبع العملاء وتنبيهات الاشتراكات — وتستعيد وقتك للتركيز على الحلاقة نفسها.
        </div>
      </div>
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

/* ---------- Customer drawer (full management with block/delete) ---------- */
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
  const [loading, setLoading] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    const [s, v, p] = await Promise.all([
      getActiveSubscription(customer.id),
      getVisitsByCustomer(customer.id),
      getPlans(shopId),
    ]);
    setSub(s);
    setVisits(v);
    setPlans(p);
    setLoading(false);
  }, [customer, shopId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!customer) return null;

  const active = sub?.status === 'active';
  const remaining = sub && sub.plan ? sub.plan.haircut_count - sub.haircuts_used : 0;
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

        {/* Info row */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {customer.phone && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-stone-700">
              <Phone className="h-4 w-4" />
              <span dir="ltr">{customer.phone}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-stone-700">
            <Clock className="h-4 w-4" />
            عميل منذ {formatDate(customer.created_at)}
          </span>
        </div>
        {customer.notes && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">{customer.notes}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <Scissors className="mx-auto h-5 w-5 text-stone-500" />
            <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{visits.length}</p>
            <p className="text-[11px] font-bold text-stone-500">إجمالي الزيارات</p>
          </div>
          <div className="card p-3 text-center">
            <Award className="mx-auto h-5 w-5 text-amber-500" />
            <p className="mt-1 font-display text-xl font-extrabold text-stone-900">
              {visits.length >= 20 ? 'ذهبي' : visits.length >= 10 ? 'فضي' : visits.length >= 5 ? 'برونزي' : 'جديد'}
            </p>
            <p className="text-[11px] font-bold text-stone-500">مستوى الولاء</p>
          </div>
          <div className="card p-3 text-center">
            <Coins className="mx-auto h-5 w-5 text-amber-600" />
            <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{formatPrice(totalPaid)}</p>
            <p className="text-[11px] font-bold text-stone-500">مدفوع عادي</p>
          </div>
        </div>

        {/* Subscription status */}
        <div className={`rounded-2xl border p-4 ${active ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-stone-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {active ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-stone-400" />
              )}
              <span className="font-bold text-stone-900">
                {active ? 'مشترك — اشتراك نشط' : 'غير مشترك حالياً'}
              </span>
            </div>
            <button
              onClick={() => setSubOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-amber-50"
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
                <p className="text-xs text-stone-500">باقي من الشهر</p>
                <p className={`font-bold ${daysLeft <= 3 ? 'text-red-600' : daysLeft <= 7 ? 'text-orange-600' : 'text-emerald-700'}`}>
                  {daysLeft > 0 ? `${daysLeft} يوم` : 'انتهى'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Record visit */}
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-amber-600" />
              <span className="font-bold text-stone-900">تسجيل حلاقة جديدة</span>
            </div>
            <button onClick={() => setVisitOpen(true)} disabled={customer.is_blocked} className="btn-gold px-4 py-2 text-xs disabled:opacity-50">
              تسجيل زيارة
            </button>
          </div>
          {customer.is_blocked ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
              <Ban className="h-3.5 w-3.5" />
              العميل محظور — لا يمكن تسجيل زيارات
            </p>
          ) : active && remaining > 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
              <Info className="h-3.5 w-3.5" />
              سيتم خصمها من اشتراكه المتبقي ({remaining} حلاقة) — بدون رسوم إضافية
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
              <Info className="h-3.5 w-3.5" />
              ستحسب كحلاقة عادية بقيمة {formatPrice(regularHaircutPrice)}
            </p>
          )}
        </div>

        {/* Visits history */}
        <div>
          <h4 className="mb-2 font-bold text-stone-900">سجل الزيارات</h4>
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
                      v.payment_type === 'subscription' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {v.payment_type === 'subscription' ? <CheckCircle2 className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-800">{v.haircut_type ?? 'حلاقة'}</p>
                    <p className="text-xs text-stone-500">{formatDateTime(v.visit_date)}</p>
                  </div>
                  {v.payment_type === 'subscription' ? (
                    <span className="badge bg-emerald-100 text-emerald-700">اشتراك</span>
                  ) : (
                    <span className="font-bold text-amber-700">{formatPrice(Number(v.charge_amount))}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl border border-red-200 bg-red-50/30 p-4">
          <h4 className="mb-2 flex items-center gap-1.5 font-bold text-red-700">
            <ShieldAlert className="h-4 w-4" />
            إجراءات إدارية
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleBlockToggle}
              disabled={actionLoading}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                customer.is_blocked
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              <Ban className="h-3.5 w-3.5" />
              {customer.is_blocked ? 'فك الحظر' : 'حظر العميل'}
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف العميل
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-600">متأكد؟ كل البيانات هتتمسح</span>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  نعم احذف
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-lg bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600">
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
        onSubscribe={async (planId) => {
          await createSubscription(customer.id, planId, shopId);
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
  onSubscribe: (planId: string) => Promise<void>;
}) {
  const [planId, setPlanId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && plans.length) setPlanId(plans[0].id);
  }, [open, plans]);

  const submit = async () => {
    if (!planId) return;
    setSaving(true);
    try {
      await onSubscribe(planId);
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
            className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-right transition ${
              planId === p.id ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                planId === p.id ? 'border-amber-500 bg-amber-500' : 'border-stone-300'
              }`}
            >
              {planId === p.id && <CheckCircle2 className="h-3 w-3 text-white" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-stone-900">{p.name}</p>
              <p className="text-xs text-stone-500">{p.description ?? ''}</p>
            </div>
            <div className="text-left">
              <p className="font-bold text-amber-600">{formatPrice(p.price)}</p>
              <p className="text-[11px] text-stone-500">{p.haircut_count} حلاقة / {p.duration_days} يوم</p>
            </div>
          </button>
        ))}
        <div className="flex gap-3 pt-2">
          <button onClick={submit} disabled={saving} className="btn-gold flex-1">
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
  onRecord,
}: {
  regularHaircutPrice: number;
  open: boolean;
  onClose: () => void;
  active: boolean;
  remaining: number;
  onRecord: (opts: { haircutType: string; notes: string; forcePaid: boolean }) => Promise<void>;
}) {
  const [haircutType, setHaircutType] = useState('حلاقة عامة');
  const [notes, setNotes] = useState('');
  const [forcePaid, setForcePaid] = useState(false);
  const [saving, setSaving] = useState(false);

  const canUseSub = active && remaining > 0 && !forcePaid;

  const submit = async () => {
    setSaving(true);
    try {
      await onRecord({ haircutType, notes, forcePaid });
      setNotes('');
      setForcePaid(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="تسجيل حلاقة" maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="label">نوع الحلاقة</label>
          <select value={haircutType} onChange={(e) => setHaircutType(e.target.value)} className="input">
            <option value="حلاقة عامة">حلاقة عامة</option>
            <option value="حلاقة + تحديد">حلاقة + تحديد</option>
            <option value="حلاقة + غسيل">حلاقة + غسيل</option>
            <option value="تهذيب لحية">تهذيب لحية</option>
            <option value="قص عصري">قص عصري</option>
          </select>
        </div>

        {active && remaining > 0 && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={forcePaid}
                onChange={(e) => setForcePaid(e.target.checked)}
                className="h-4 w-4 accent-amber-600"
              />
              <span className="text-sm font-bold text-stone-700">احتسابها كحلاقة عادية (لا تخصم من الاشتراك)</span>
            </label>
          </div>
        )}

        <div className={`rounded-lg p-3 text-sm ${canUseSub ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {canUseSub ? (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              ستُخصم من اشتراكه — بدون رسوم (متبقي {remaining} حلاقة)
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Coins className="h-4 w-4" />
              ستحسب كحلاقة عادية بقيمة {formatPrice(regularHaircutPrice)}
            </span>
          )}
        </div>

        <div>
          <label className="label">ملاحظات</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-16 resize-none" placeholder="اختياري" />
        </div>

        <div className="flex gap-3">
          <button onClick={submit} disabled={saving} className="btn-primary flex-1">
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