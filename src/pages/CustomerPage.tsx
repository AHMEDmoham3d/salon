
import { useEffect, useState } from 'react';
import {
  Scissors,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Loader2,
  CalendarCheck,
  User,
  ChevronLeft,
  LogOut,
  Phone,
  Lock,
  AlertCircle,
  Crown,
  Medal,
  Camera,
  Sparkles,
  Info,
  Store,
  ArrowRight,
  CalendarPlus,
  Gift,
  Users,
  Copy,
  Tag,
  Zap,
  Bell,
  X,
} from 'lucide-react';
import {
  findCustomerInShops,
  getActiveSubscription,
  getVisitsByCustomer,
  getPlans,
  formatPrice,
  formatDate,
  formatDateTime,
  type Customer,
  type CustomerInShop,
  type Subscription,
  type Visit,
  type Plan,
} from '@/lib/api';
import { getAllShops, getShopById, type Shop } from '@/lib/shopApi';
import { useI18n } from '@/lib/i18n';

export default function CustomerPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedCustomer = sessionStorage.getItem('barber_customer');
      const savedShopId = sessionStorage.getItem('barber_shop_id');
      const savedShopName = sessionStorage.getItem('barber_shop_name');
      if (savedCustomer && savedShopId) {
        setCustomer(JSON.parse(savedCustomer));
        setShopId(savedShopId);
        if (savedShopName) setShopName(savedShopName);
      }
    } catch { /* ignore */ }
  }, []);

  const handleLogin = (c: Customer, sid: string, sname: string) => {
    setCustomer(c); setShopId(sid); setShopName(sname);
    try {
      sessionStorage.setItem('barber_customer', JSON.stringify(c));
      sessionStorage.setItem('barber_shop_id', sid);
      sessionStorage.setItem('barber_shop_name', sname);
    } catch { /* ignore */ }
  };

  const handleLogout = () => {
    setCustomer(null); setShopId(null); setShopName(null);
    try {
      sessionStorage.removeItem('barber_customer');
      sessionStorage.removeItem('barber_shop_id');
      sessionStorage.removeItem('barber_shop_name');
    } catch { /* ignore */ }
  };

  if (customer && shopId) {
    return <CustomerDetail customer={customer} shopId={shopId} shopName={shopName} onLogout={handleLogout} />;
  }
  return <ShopSelect onLogin={handleLogin} />;
}

/* ---------- Smart login ---------- */
function ShopSelect({ onLogin }: { onLogin: (c: Customer, shopId: string, shopName: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<CustomerInShop[] | null>(null);

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      setError(t('cust.errorEmpty'));
      setMatches(null);
      return;
    }
    setLoading(true); setError(''); setMatches(null);
    try {
      const shops = await getAllShops();
      const approved = shops.filter((s) => s.status === 'approved');
      if (approved.length === 0) { setError(t('cust.errorNoShops')); return; }
      const results = await findCustomerInShops(name, phone, approved.map((s) => ({ id: s.id, shop_name: s.shop_name })));
      if (results.length === 0) { setError(t('cust.errorNotFound')); return; }
      if (results.every((r) => r.blocked)) { setError(t('cust.errorBlocked')); return; }
      const unblocked = results.filter((r) => !r.blocked);
      if (unblocked.length === 1) { onLogin(unblocked[0].customer, unblocked[0].shop_id, unblocked[0].shop_name); return; }
      setMatches(unblocked);
    } catch { setError(t('cust.errorGeneric')); } finally { setLoading(false); }
  };

  if (matches && matches.length > 1) {
    return (
      <div className="animate-fade-in mx-auto flex min-h-[calc(100vh-64px)] max-w-md flex-col justify-center px-4 py-10 sm:px-6">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 text-amber-400 shadow-lg">
            <Store className="h-8 w-8" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold text-stone-900">{t('cust.welcome')} {name.trim()}</h1>
          <p className="mt-2 text-sm text-stone-600">{t('cust.multiShop')}</p>
        </div>
        <div className="card mt-8 space-y-2 p-4">
          {matches.map((m) => (
            <button key={m.shop_id} onClick={() => onLogin(m.customer, m.shop_id, m.shop_name)}
              className="card flex w-full items-center gap-3 p-4 text-right transition hover:-translate-y-0.5 hover:shadow-soft">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-stone-700 to-stone-900 font-display text-lg font-extrabold text-amber-400">
                {m.shop_name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-stone-900">{m.shop_name}</p>
                <p className="text-xs text-stone-500">{t('cust.shopHint')}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-stone-400" />
            </button>
          ))}
          <button onClick={() => setMatches(null)} className="w-full rounded-lg py-2.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100">
            {t('cust.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto flex min-h-[calc(100vh-64px)] max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 text-amber-400 shadow-lg">
          <User className="h-8 w-8" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-stone-900">{t('cust.title')}</h1>
        <p className="mt-2 text-sm text-stone-600">{t('cust.subtitle')}</p>
      </div>
      <div className="card mt-8 space-y-4 p-6">
        <div>
          <label className="label">{t('cust.fullName')}</label>
          <div className="relative">
            <User className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('cust.namePlaceholder')} className="input pr-11" />
          </div>
        </div>
        <div>
          <label className="label">{t('cust.phone')}</label>
          <div className="relative">
            <Phone className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="01xxxxxxxxx" className="input pr-11" dir="ltr" />
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        <button onClick={submit} disabled={loading} className="btn-primary w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {loading ? t('cust.searching') : t('cust.login')}
        </button>
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" /><span>{t('cust.smartHint')}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Hair consultation ---------- */
type HairType = 'straight' | 'wavy' | 'curly' | 'coily';
type FaceShape = 'oval' | 'round' | 'square' | 'long';
type StylePref = 'classic' | 'modern' | 'bold' | 'low-maintenance';

const HAIR_CONSULTATION: Record<HairType, Record<FaceShape, Record<StylePref, { name_ar: string; name_en: string; desc_ar: string; desc_en: string }>>> = {
  straight: {
    oval: {
      classic: { name_ar: 'كروب كلاسيكي', name_en: 'Classic Crop', desc_ar: 'قصة متساوية من الجوانب مع تعتيق خفيف', desc_en: 'Even sides with a subtle fade' },
      modern: { name_ar: 'قصة البومر', name_en: 'Pompadour', desc_ar: 'تدرج عصري مع خط أنيق', desc_en: 'Modern taper with a clean line' },
      bold: { name_ar: 'سكين فايد', name_en: 'Skin Fade', desc_ar: 'تدرج حاد بالماكينة مع خط حاد', desc_en: 'Sharp clipper fade with a hard line' },
      'low-maintenance': { name_ar: 'قصة عسكرية', name_en: 'Buzz Cut', desc_ar: 'قصيرة من الجوانب ووسطي', desc_en: 'Short sides and top — easy daily' },
    },
    round: {
      classic: { name_ar: 'قصة جانبية', name_en: 'Side Part', desc_ar: 'تفريط جانبي يطيل الوجه', desc_en: 'Side part that elongates the face' },
      modern: { name_ar: 'كيف بمقدمة', name_en: 'Quiff', desc_ar: 'مقدمة منسدلة لتطويل الوجه', desc_en: 'Front quiff to lengthen the face' },
      bold: { name_ar: 'فوك هوك', name_en: 'Faux Hawk', desc_ar: 'شعر منتصب للأعلى', desc_en: 'Hair styled upward for height' },
      'low-maintenance': { name_ar: 'قصة بسيطة بمقدمة', name_en: 'Short with Bangs', desc_ar: 'تدرج خفيف مع مقدمة قصيرة', desc_en: 'Light taper with short bangs' },
    },
    square: {
      classic: { name_ar: 'قصة كلاسيكية بمقدمة', name_en: 'Classic with Bangs', desc_ar: 'تخفيف زوايا الوجه المربع', desc_en: 'Soften square jaw angles' },
      modern: { name_ar: 'تدرج عصري', name_en: 'Modern Taper', desc_ar: 'تدرج يلطفف زوايا الفك', desc_en: 'Taper that softens the jaw' },
      bold: { name_ar: 'بازل كات', name_en: 'Buzz Cut', desc_ar: 'قصة حادة تعزز الملامح', desc_en: 'Sharp cut that enhances features' },
      'low-maintenance': { name_ar: 'قصة قصيرة', name_en: 'Short Cut', desc_ar: 'قصيرة ومتساوية', desc_en: 'Short and even — no maintenance' },
    },
    long: {
      classic: { name_ar: 'قصة بمقدمة جانبية', name_en: 'Side Sweep', desc_ar: 'مقدمة جانبية تقصر الوجه', desc_en: 'Side bangs to shorten the face' },
      modern: { name_ar: 'ميد فايد', name_en: 'Mid Fade', desc_ar: 'تدرج متوسط يوازن الوجه', desc_en: 'Mid fade to balance the face' },
      bold: { name_ar: 'تشارليز', name_en: 'Charles', desc_ar: 'مقدمة منسدلة جانبياً', desc_en: 'Side-swept front with sharp taper' },
      'low-maintenance': { name_ar: 'قصة كوت', name_en: 'Crop Cut', desc_ar: 'قصيرة بتدرج بسيط', desc_en: 'Short with simple taper' },
    },
  },
  wavy: {
    oval: {
      classic: { name_ar: 'قصة كلاسيكية للأمواج', name_en: 'Classic Wavy', desc_ar: 'تدرج يحافظ على تمايل الشعر', desc_en: 'Taper that keeps natural waves' },
      modern: { name_ar: 'تكسشر كات', name_en: 'Texture Cut', desc_ar: 'يبرز تموجات الشعر', desc_en: 'Enhances natural texture' },
      bold: { name_ar: 'كيف مع مواج', name_en: 'Wavy Quiff', desc_ar: 'تدرج مع الحفاظ على الموج', desc_en: 'Taper keeping the wave bold' },
      'low-maintenance': { name_ar: 'قصة قصيرة للأمواج', name_en: 'Short Wavy', desc_ar: 'تستفيد من الموج الطبيعي', desc_en: 'Uses natural wave, no styling' },
    },
    round: {
      classic: { name_ar: 'قصة بطول علوي', name_en: 'Top Volume', desc_ar: 'الطول العلوي يطيل الوجه', desc_en: 'Top length elongates the face' },
      modern: { name_ar: 'كيف موجي', name_en: 'Wavy Quiff', desc_ar: 'تدرج عصري مع موج جانبي', desc_en: 'Modern taper with side wave' },
      bold: { name_ar: 'موهوك موجي', name_en: 'Wavy Mohawk', desc_ar: 'شعر منتصف يطيل الوجه', desc_en: 'Middle spike to add height' },
      'low-maintenance': { name_ar: 'قصة قصيرة موجية', name_en: 'Short Wave', desc_ar: 'موج طبيعي بدون مجهود', desc_en: 'Natural wave, no effort' },
    },
    square: {
      classic: { name_ar: 'قصة متدرجة', name_en: 'Layered Cut', desc_ar: 'تدرج يلطفف زوايا الوجه', desc_en: 'Taper softens jaw angles' },
      modern: { name_ar: 'تدرج بأمواج', name_en: 'Wavy Taper', desc_ar: 'تدرج عصري مع موج طبيعي', desc_en: 'Modern taper with natural wave' },
      bold: { name_ar: 'بومر موجي', name_en: 'Wavy Pompadour', desc_ar: 'بومر بموج الشعر', desc_en: 'Pomp with natural wave' },
      'low-maintenance': { name_ar: 'كروب موجي', name_en: 'Wavy Crop', desc_ar: 'قصة متساوية تستفيد من الموج', desc_en: 'Even cut using the wave' },
    },
    long: {
      classic: { name_ar: 'قصة بطول جانبي', name_en: 'Side Volume', desc_ar: 'حجم جانبي يوازن الوجه', desc_en: 'Side volume balances the face' },
      modern: { name_ar: 'تكسشر بطول', name_en: 'Long Texture', desc_ar: 'تدرج يوازن الوجه الطويل', desc_en: 'Taper to balance long face' },
      bold: { name_ar: 'كيف موجي طويل', name_en: 'Long Wavy Quiff', desc_ar: 'ارتفاع مع موج يضيف عرضاً', desc_en: 'Height with wave for width' },
      'low-maintenance': { name_ar: 'قصة قصيرة موجية', name_en: 'Short Wavy', desc_ar: 'بسيطة وموجية بدون تصفيف', desc_en: 'Simple, no styling needed' },
    },
  },
  curly: {
    oval: {
      classic: { name_ar: 'قصة كلاسيكية للتجاعيد', name_en: 'Classic Curly', desc_ar: 'تحافظ على شكل التجاعيد', desc_en: 'Keeps the curl shape elegant' },
      modern: { name_ar: 'تدرج للكيرلي', name_en: 'Curly Taper', desc_ar: 'يبرز التجاعيد بشكل عصري', desc_en: 'Modern curl-enhancing taper' },
      bold: { name_ar: 'كيرلي فايد', name_en: 'Curly Fade', desc_ar: 'تدرج حاد مع تجاعيد منتصبة', desc_en: 'Sharp fade with upright curls' },
      'low-maintenance': { name_ar: 'كيرلي قصير', name_en: 'Short Curly', desc_ar: 'قصير يستفيد من التجعد', desc_en: 'Short, uses natural curl' },
    },
    round: {
      classic: { name_ar: 'كيرلي بطول علوي', name_en: 'Curly Top', desc_ar: 'الطول العلوي يطيل الوجه', desc_en: 'Top length elongates the face' },
      modern: { name_ar: 'تدرج كيرلي', name_en: 'Curly Taper', desc_ar: 'تدرج عصري يطيل الوجه', desc_en: 'Modern taper lengthens the face' },
      bold: { name_ar: 'كيرلي عالي', name_en: 'High Curly', desc_ar: 'تجعد منتصب يطيل الوجه', desc_en: 'Upright curls add height' },
      'low-maintenance': { name_ar: 'كيرلي بسيط', name_en: 'Easy Curly', desc_ar: 'قصير ومرتب بدون مجهود', desc_en: 'Short and neat, no effort' },
    },
    square: {
      classic: { name_ar: 'كيرلي متدرج', name_en: 'Curly Taper', desc_ar: 'تدرج يخفف زوايا الوجه', desc_en: 'Taper softens jaw angles' },
      modern: { name_ar: 'تكسشر كيرلي', name_en: 'Curly Texture', desc_ar: 'تدرج عصري مع تجعد', desc_en: 'Modern taper with curl' },
      bold: { name_ar: 'كيرلي بومر', name_en: 'Curly Pomp', desc_ar: 'بومر مع تجعد', desc_en: 'Pomp with curls — strong look' },
      'low-maintenance': { name_ar: 'كيرلي كوت', name_en: 'Curly Crop', desc_ar: 'قصير ومتساوٍ', desc_en: 'Short and even, easy care' },
    },
    long: {
      classic: { name_ar: 'كيرلي بطول جانبي', name_en: 'Side Curly', desc_ar: 'حجم جانبي يوازن الوجه', desc_en: 'Side volume balances the face' },
      modern: { name_ar: 'تدرج كيرلي عصري', name_en: 'Modern Curly', desc_ar: 'يضيف عرضاً للوجه الطويل', desc_en: 'Adds width to long face' },
      bold: { name_ar: 'كيرلي فرو', name_en: 'Curly Fro', desc_ar: 'تجعد منتفش يوازن الوجه', desc_en: 'Full fro balances the face' },
      'low-maintenance': { name_ar: 'كيرلي قصير', name_en: 'Short Curly', desc_ar: 'بسيط بدون تصفيف', desc_en: 'Simple, no styling' },
    },
  },
  coily: {
    oval: {
      classic: { name_ar: 'قصة كلاسيكية للكيرلي الدقيق', name_en: 'Classic Coily', desc_ar: 'تحافظ على شكل الشعر الأفريقي', desc_en: 'Keeps the afro shape' },
      modern: { name_ar: 'تدرج تويست', name_en: 'Twist Taper', desc_ar: 'تدرج عصري يحافظ على النسيج', desc_en: 'Modern taper keeping texture' },
      bold: { name_ar: 'فرو', name_en: 'Fro', desc_ar: 'شعر منتصب بمظهر جريء', desc_en: 'Bold upright afro' },
      'low-maintenance': { name_ar: 'بز كت', name_en: 'Buzz', desc_ar: 'قصير جداً — بدون عناية', desc_en: 'Very short — no care needed' },
    },
    round: {
      classic: { name_ar: 'قصة بطول علوي', name_en: 'Top Volume', desc_ar: 'الطول يطيل الوجه', desc_en: 'Length elongates the face' },
      modern: { name_ar: 'تدرج عصري', name_en: 'Modern Taper', desc_ar: 'يضيف ارتفاعاً للوجه', desc_en: 'Adds height to the face' },
      bold: { name_ar: 'فرو عالي', name_en: 'High Fro', desc_ar: 'ارتفاع مميز يطيل الوجه', desc_en: 'Tall fro elongates the face' },
      'low-maintenance': { name_ar: 'بز كت قصير', name_en: 'Short Buzz', desc_ar: 'قصير جداً — بدون مجهود', desc_en: 'Very short, no effort' },
    },
    square: {
      classic: { name_ar: 'قصة متدرجة', name_en: 'Tapered Cut', desc_ar: 'تدرج يخفف زوايا الوجه', desc_en: 'Taper softens jaw angles' },
      modern: { name_ar: 'تدرج بأفريقي', name_en: 'Afro Taper', desc_ar: 'أسلوب عصري يحافظ على النسيج', desc_en: 'Modern taper keeping texture' },
      bold: { name_ar: 'فرو متميز', name_en: 'Bold Fro', desc_ar: 'مظهر قوي يعزز الملامح', desc_en: 'Bold look, strong features' },
      'low-maintenance': { name_ar: 'بز كت', name_en: 'Buzz', desc_ar: 'قصير ومرتب', desc_en: 'Short and neat' },
    },
    long: {
      classic: { name_ar: 'قصة بطول جانبي', name_en: 'Side Volume', desc_ar: 'يوازن الوجه الطويل', desc_en: 'Balances long face' },
      modern: { name_ar: 'تدرج عصري', name_en: 'Modern Taper', desc_ar: 'يضيف عرضاً للوجه', desc_en: 'Adds width to the face' },
      bold: { name_ar: 'فرو كامل', name_en: 'Full Fro', desc_ar: 'حجم كامل يوازن الوجه', desc_en: 'Full volume balances the face' },
      'low-maintenance': { name_ar: 'بز كت قصير', name_en: 'Short Buzz', desc_ar: 'بسيط بدون عناية', desc_en: 'Simple, no care' },
    },
  },
};

function HairConsultation() {
  const { t, lang } = useI18n();
  const [step, setStep] = useState<'intro' | 'hair' | 'face' | 'style' | 'result'>('intro');
  const [hair, setHair] = useState<HairType | null>(null);
  const [face, setFace] = useState<FaceShape | null>(null);
  const [style, setStyle] = useState<StylePref | null>(null);

  const result = hair && face && style ? HAIR_CONSULTATION[hair][face][style] : null;
  const reset = () => { setHair(null); setFace(null); setStyle(null); setStep('intro'); };
  const L = lang === 'ar';

  if (step === 'intro') {
    return (
      <div className="card border-amber-200 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950">
            <Camera className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-stone-900">{t('consult.title')}</h3>
            <p className="text-xs text-stone-500">{t('consult.subtitle')}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{t('consult.intro')}</p>
        <button onClick={() => setStep('hair')} className="btn-gold mt-4 w-full">
          <Sparkles className="h-4 w-4" /> {t('consult.start')}
        </button>
      </div>
    );
  }

  if (step === 'hair') {
    return <ConsultationStep title={t('consult.hairType')} icon={<Scissors className="h-6 w-6" />}
      options={[
        { value: 'straight' as HairType, label: t('consult.hairStraight'), emoji: '▬' },
        { value: 'wavy' as HairType, label: t('consult.hairWavy'), emoji: '〰' },
        { value: 'curly' as HairType, label: t('consult.hairCurly'), emoji: '◉' },
        { value: 'coily' as HairType, label: t('consult.hairCoily'), emoji: '✦' },
      ]}
      selected={hair} onSelect={(v) => { setHair(v); setStep('face'); }} onBack={reset} t={t} />;
  }

  if (step === 'face') {
    return <ConsultationStep title={t('consult.faceShape')} icon={<User className="h-6 w-6" />}
      options={[
        { value: 'oval' as FaceShape, label: t('consult.faceOval'), emoji: '⬭' },
        { value: 'round' as FaceShape, label: t('consult.faceRound'), emoji: '◯' },
        { value: 'square' as FaceShape, label: t('consult.faceSquare'), emoji: '◻' },
        { value: 'long' as FaceShape, label: t('consult.faceLong'), emoji: '▯' },
      ]}
      selected={face} onSelect={(v) => { setFace(v); setStep('style'); }} onBack={() => setStep('hair')} t={t} />;
  }

  if (step === 'style') {
    return <ConsultationStep title={t('consult.stylePref')} icon={<Sparkles className="h-6 w-6" />}
      options={[
        { value: 'classic' as StylePref, label: t('consult.styleClassic'), emoji: '◆' },
        { value: 'modern' as StylePref, label: t('consult.styleModern'), emoji: '★' },
        { value: 'bold' as StylePref, label: t('consult.styleBold'), emoji: '⚡' },
        { value: 'low-maintenance' as StylePref, label: t('consult.styleEasy'), emoji: '○' },
      ]}
      selected={style} onSelect={(v) => { setStyle(v); setStep('result'); }} onBack={() => setStep('face')} t={t} />;
  }

  return (
    <div className="card overflow-hidden border-amber-200">
      <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-4 text-stone-950">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" /><span className="font-bold">{t('consult.result')}</span>
        </div>
      </div>
      <div className="p-5">
        {result && (
          <>
            <h3 className="font-display text-2xl font-extrabold text-stone-900">{L ? result.name_ar : result.name_en}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{L ? result.desc_ar : result.desc_en}</p>
            <div className="mt-4 rounded-xl bg-stone-50 p-3">
              <p className="text-xs font-bold text-stone-500">{t('consult.summary')}</p>
              <p className="mt-1 text-xs text-stone-600">
                {L ? `شعر ${hair === 'straight' ? 'أملس' : hair === 'wavy' ? 'مموج' : hair === 'curly' ? 'مجعد' : 'كيرلي'}` : `Hair: ${hair}`}
                {' • '}
                {L ? `وجه ${face === 'oval' ? 'بيضاوي' : face === 'round' ? 'دائري' : face === 'square' ? 'مربع' : 'طويل'}` : `Face: ${face}`}
                {' • '}
                {L ? `أسلوب ${style === 'classic' ? 'كلاسيكي' : style === 'modern' ? 'عصري' : style === 'bold' ? 'جريء' : 'سهل'}` : `Style: ${style}`}
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
              <Info className="h-3.5 w-3.5 shrink-0" /> {t('consult.disclaimer')}
            </div>
            <button onClick={reset} className="btn-ghost mt-4 w-full">
              <ChevronLeft className="h-4 w-4" /> {t('consult.newConsult')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ConsultationStep<T extends string>({
  title, icon, options, selected, onSelect, onBack, t,
}: {
  title: string; icon: React.ReactNode;
  options: { value: T; label: string; emoji: string }[];
  selected: T | null; onSelect: (v: T) => void; onBack: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-stone-900 text-amber-400">{icon}</div>
        <h3 className="font-bold text-stone-900">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <button key={o.value} onClick={() => onSelect(o.value)}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition ${
              selected === o.value ? 'border-amber-500 bg-amber-50' : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
            }`}>
            <span className="text-2xl">{o.emoji}</span>
            <span className="text-sm font-bold text-stone-800">{o.label}</span>
          </button>
        ))}
      </div>
      <button onClick={onBack} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-stone-500 hover:text-stone-800">
        <ChevronLeft className="h-4 w-4" /> {t('cust.back')}
      </button>
    </div>
  );
}

/* ---------- Booking widget ---------- */
function BookingWidget({ customerName }: { customerName: string }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [booked, setBooked] = useState<{ date: string; time: string } | null>(null);

  const dates = (() => {
    const arr: { val: string; label: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const val = d.toISOString().slice(0, 10);
      const label = i === 0 ? t('booking.today') : i === 1 ? t('booking.tomorrow') :
        new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' }).format(d);
      arr.push({ val, label });
    }
    return arr;
  })();

  const times = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

  const confirm = () => {
    if (!selectedDate || !selectedTime) return;
    setBooked({ date: selectedDate, time: selectedTime });
    setOpen(false);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 bg-gradient-to-br from-stone-900 to-stone-800 p-4 text-amber-50">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/20">
          <CalendarPlus className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <p className="font-bold">{t('booking.title')}</p>
          <p className="text-xs text-stone-400">{t('booking.subtitle')}</p>
        </div>
      </div>
      <div className="p-4">
        {booked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {t('booking.success')}
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="text-xs text-stone-500">{t('booking.pending')}</p>
              <p className="mt-1 font-bold text-stone-900">
                {formatDate(booked.date)} — {booked.time}
              </p>
              <p className="text-xs text-stone-500">{t('booking.successDesc')}</p>
            </div>
            <button onClick={() => setBooked(null)} className="btn-ghost w-full">
              {t('booking.bookAgain')}
            </button>
          </div>
        ) : open ? (
          <div className="space-y-3">
            <div>
              <label className="label">{t('booking.date')}</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {dates.map((d) => (
                  <button key={d.val} onClick={() => setSelectedDate(d.val)}
                    className={`shrink-0 rounded-lg border-2 px-3 py-2 text-xs font-bold transition ${
                      selectedDate === d.val ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">{t('booking.time')}</label>
              <div className="grid grid-cols-4 gap-2">
                {times.map((tm) => (
                  <button key={tm} onClick={() => setSelectedTime(tm)} dir="ltr"
                    className={`rounded-lg border-2 px-2 py-2 text-xs font-bold transition ${
                      selectedTime === tm ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                    }`}>
                    {tm}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={confirm} disabled={!selectedDate || !selectedTime} className="btn-primary flex-1 disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" /> {t('booking.confirm')}
              </button>
              <button onClick={() => setOpen(false)} className="btn-ghost">{t('booking.cancel')}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="btn-primary w-full">
            <CalendarPlus className="h-4 w-4" /> {t('booking.title')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Referral widget ---------- */
function ReferralWidget({ customerName }: { customerName: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const code = `BARBER-${customerName.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const copy = () => {
    try { navigator.clipboard.writeText(code); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card overflow-hidden border-emerald-200">
      <div className="flex items-center gap-3 bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-emerald-50">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/20">
          <Gift className="h-5 w-5 text-emerald-200" />
        </div>
        <div>
          <p className="font-bold">{t('referral.title')}</p>
          <p className="text-xs text-emerald-100">{t('referral.desc')}</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-center font-display text-lg font-extrabold tracking-wider text-stone-800" dir="ltr">
            {code}
          </div>
          <button onClick={copy} className="btn-primary shrink-0">
            {copied ? <><CheckCircle2 className="h-4 w-4" /> {t('referral.copied')}</> : <><Copy className="h-4 w-4" /> {t('referral.copy')}</>}
          </button>
        </div>
        <p className="text-xs text-stone-500">{t('referral.share')}</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-stone-50 p-3 text-center">
            <Users className="mx-auto h-4 w-4 text-stone-400" />
            <p className="mt-1 font-display text-xl font-extrabold text-stone-900">0</p>
            <p className="text-[10px] font-bold text-stone-500">{t('referral.invited')}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-3 text-center">
            <CheckCircle2 className="mx-auto h-4 w-4 text-stone-400" />
            <p className="mt-1 font-display text-xl font-extrabold text-stone-900">0</p>
            <p className="text-[10px] font-bold text-stone-500">{t('referral.joined')}</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3 text-center">
            <Gift className="mx-auto h-4 w-4 text-amber-600" />
            <p className="mt-1 font-display text-xl font-extrabold text-amber-700">0</p>
            <p className="text-[10px] font-bold text-amber-600">{t('referral.earned')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Offers widget ---------- */
function OffersWidget({ totalVisits, active, daysLeft }: { totalVisits: number; active: boolean; daysLeft: number }) {
  const { t } = useI18n();
  const offers: { icon: typeof Tag; title: string; desc: string; color: string; bg: string }[] = [];

  if (active && daysLeft <= 7) {
    offers.push({
      icon: Tag, title: t('offers.renew'), desc: t('offers.renewDesc'),
      color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200',
    });
  }
  offers.push({
    icon: Gift, title: t('offers.refer'), desc: t('offers.referDesc'),
    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',
  });
  if (totalVisits >= 10 && totalVisits < 20) {
    offers.push({
      icon: Zap, title: t('offers.vip'), desc: t('offers.vipDesc'),
      color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',
    });
  }

  if (offers.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-stone-900">{t('offers.title')}</h3>
      {offers.map((o, i) => (
        <div key={i} className={`card flex items-start gap-3 border-2 p-4 ${o.bg}`}>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white ${o.color}`}>
            <o.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="badge bg-amber-500 text-stone-950">{t('offers.badge')}</span>
            </div>
            <p className="mt-1.5 font-bold text-stone-900">{o.title}</p>
            <p className="text-xs text-stone-600">{o.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Customer detail ---------- */
function CustomerDetail({ customer, shopId, shopName, onLogout }: { customer: Customer; shopId: string; shopName: string | null; onLogout: () => void }) {
  const { t, lang } = useI18n();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [s, v, p, shopData] = await Promise.all([
        getActiveSubscription(customer.id),
        getVisitsByCustomer(customer.id),
        getPlans(shopId),
        getShopById(shopId),
      ]);
      if (!mounted) return;
      setSub(s);
      setVisits(v);
      setPlans(p);
      setShop(shopData);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [customer.id, shopId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="space-y-4">
          <div className="h-24 animate-shimmer rounded-2xl" />
          <div className="h-48 animate-shimmer rounded-2xl" />
        </div>
      </div>
    );
  }

  const active = sub?.status === 'active';
  const remaining = sub && sub.plan ? sub.plan.haircut_count - sub.haircuts_used : 0;
  const totalVisits = visits.length;
  const totalPaid = visits.filter((v) => v.payment_type === 'paid').reduce((s, v) => s + Number(v.charge_amount), 0);
  const subscriptionVisits = visits.filter((v) => v.payment_type === 'subscription').length;
  const daysLeft = sub ? Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000) : 0;
  const L = lang === 'ar';

  const loyaltyLevel =
    totalVisits >= 20 ? { label: t('cust.level.gold'), icon: Crown, tone: 'text-amber-500', bg: 'bg-amber-50' } :
    totalVisits >= 10 ? { label: t('cust.level.silver'), icon: Medal, tone: 'text-slate-500', bg: 'bg-slate-50' } :
    totalVisits >= 5 ? { label: t('cust.level.bronze'), icon: Award, tone: 'text-orange-600', bg: 'bg-orange-50' } :
    { label: t('cust.level.new'), icon: User, tone: 'text-stone-500', bg: 'bg-stone-50' };
  const LoyaltyIcon = loyaltyLevel.icon;

  return (
    <div className="animate-fade-in mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-600 transition hover:bg-stone-100">
          <LogOut className="h-4 w-4" /> {t('cust.logout')}
        </button>
        <span className="inline-flex items-center gap-1.5 text-sm text-stone-500">
          <Lock className="h-3.5 w-3.5" /> {t('cust.secure')}
        </span>
      </div>

      {/* Header card */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-4 bg-gradient-to-br from-stone-900 to-stone-800 p-5 text-amber-50">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-amber-500/20 font-display text-2xl font-extrabold text-amber-400">
            {shop?.logo_url ? (
              <img src={shop.logo_url} alt={shop.shop_name || shopName || 'Shop logo'} className="h-full w-full object-cover" />
            ) : (
              (shopName || customer.name).charAt(0)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-2xl font-extrabold">{customer.name}</h2>
            <p className="text-sm text-stone-400">
              {shop?.shop_name || shopName ? `${shop?.shop_name || shopName} • ` : ''}{t('cust.customerSince')} {formatDate(customer.created_at)}
            </p>
            {shop && (
              <p className="mt-1 text-xs font-bold text-amber-300">
                {lang === 'ar' ? 'سعر الحلاقة العادية:' : 'Regular haircut:'} {formatPrice(Number(shop.regular_haircut_price ?? 50))}
              </p>
            )}
          </div>
        </div>

        {/* Subscription status */}
        <div className="p-5">
          <div className={`rounded-2xl border-2 p-4 ${active ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-stone-50'}`}>
            <div className="flex items-center gap-2">
              {active ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <XCircle className="h-6 w-6 text-stone-400" />}
              <div>
                <p className="font-bold text-stone-900">{active ? t('cust.subActive') : t('cust.subInactive')}</p>
                <p className="text-xs text-stone-500">
                  {active ? `${sub?.plan?.name ?? ''} — ${t('cust.subEnds')} ${formatDate(sub?.end_date ?? '')}` : t('cust.subAskBarber')}
                </p>
              </div>
            </div>
            {active && sub && (
              <>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-bold text-stone-600">
                    <span>{t('cust.used')}</span><span>{sub.haircuts_used} / {sub.plan?.haircut_count}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-emerald-600 transition-all duration-500"
                      style={{ width: `${Math.min(100, (sub.haircuts_used / (sub.plan?.haircut_count ?? 1)) * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-emerald-700">{remaining} {t('cust.remainingIn')}</p>
                </div>
                <div className={`mt-3 flex items-center gap-1.5 rounded-lg p-2.5 text-xs ${
                  daysLeft <= 3 ? 'bg-red-50 text-red-700' : daysLeft <= 7 ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {daysLeft <= 3 ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  {daysLeft > 0 ? `${t('cust.expiresIn')} ${daysLeft} ${t('cust.days')}` : t('cust.expired')}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Booking */}
      <div className="mt-4"><BookingWidget customerName={customer.name} /></div>

      {/* Hair consultation */}
      <div className="mt-4"><HairConsultation /></div>

      {/* Offers */}
      <div className="mt-4"><OffersWidget totalVisits={totalVisits} active={active} daysLeft={daysLeft} /></div>

      {/* Referral */}
      <div className="mt-4"><ReferralWidget customerName={customer.name} /></div>

      {/* Loyalty */}
      <div className="card mt-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`grid h-12 w-12 place-items-center rounded-xl ${loyaltyLevel.bg}`}>
              <LoyaltyIcon className={`h-6 w-6 ${loyaltyLevel.tone}`} />
            </div>
            <div>
              <p className="font-bold text-stone-900">{t('cust.loyalty')}: {loyaltyLevel.label}</p>
              <p className="text-xs text-stone-500">{t('cust.totalVisits')} {totalVisits} {t('cust.visits')}</p>
            </div>
          </div>
          <div className="text-left">
            <p className="font-display text-2xl font-extrabold text-stone-900">{totalVisits}</p>
            <p className="text-[11px] font-bold text-stone-500">{t('cust.haircuts')}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {[
            { min: 0, label: t('cust.level.new') },
            { min: 5, label: t('cust.level.bronze') },
            { min: 10, label: t('cust.level.silver') },
            { min: 20, label: t('cust.level.gold') },
          ].map((lvl, i) => {
            const reached = totalVisits >= lvl.min;
            return (
              <div key={lvl.label}
                className={`rounded-lg py-2 text-center text-[11px] font-bold transition ${
                  reached ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-400'
                }`}>
                {lvl.label}{i < 3 && <span className="mr-1 text-stone-300">›</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <CalendarCheck className="mx-auto h-5 w-5 text-emerald-500" />
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{subscriptionVisits}</p>
          <p className="text-[11px] font-bold text-stone-500">{t('cust.subVisits')}</p>
        </div>
        <div className="card p-3 text-center">
          <Scissors className="mx-auto h-5 w-5 text-amber-600" />
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{visits.length - subscriptionVisits}</p>
          <p className="text-[11px] font-bold text-stone-500">{t('cust.regVisits')}</p>
        </div>
        <div className="card p-3 text-center">
          <Coins className="mx-auto h-5 w-5 text-amber-600" />
          <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{formatPrice(totalPaid)}</p>
          <p className="text-[11px] font-bold text-stone-500">{t('cust.totalPaid')}</p>
        </div>
      </div>

      {/* Plans hint */}
      {!active && plans.length > 0 && (
        <div className="card mt-4 p-5">
          <h3 className="mb-3 font-bold text-stone-900">{t('cust.plansTitle')}</h3>
          <div className="space-y-2">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div>
                  <p className="font-bold text-stone-800">{p.name}</p>
                  <p className="text-xs text-stone-500">{p.haircut_count} {t('cust.haircuts')} • {p.duration_days} {t('home.days')}</p>
                </div>
                <span className="font-bold text-amber-600">{formatPrice(p.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visit history */}
      <div className="mt-4">
        <h3 className="mb-2 font-bold text-stone-900">{t('cust.history')}</h3>
        {visits.length === 0 ? (
          <div className="card p-6 text-center text-sm text-stone-500">{t('cust.noVisits')}</div>
        ) : (
          <div className="space-y-2">
            {visits.map((v) => (
              <div key={v.id} className="card flex items-center gap-3 p-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  v.payment_type === 'subscription' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-700'
                }`}>
                  {v.payment_type === 'subscription' ? <CheckCircle2 className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-stone-800">{v.haircut_type ?? t('cust.haircut')}</p>
                  <p className="flex items-center gap-1 text-xs text-stone-500">
                    <Clock className="h-3 w-3" /> {formatDateTime(v.visit_date)}
                  </p>
                </div>
                {v.payment_type === 'subscription' ? (
                  <span className="badge bg-emerald-100 text-emerald-700">{t('cust.subscription')}</span>
                ) : (
                  <span className="font-bold text-amber-700">{formatPrice(Number(v.charge_amount))}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}