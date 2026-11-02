
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Lang = 'ar' | 'en';

type Dict = Record<string, string>;

const ar: Dict = {
  // Nav
  'nav.home': 'الرئيسية',
  'nav.customer': 'صفحة العميل',
  'nav.admin': 'صفحه المحل',
  'nav.menu': 'القائمة',

  // Home
  'home.badge': 'حلاقة احترافية بنظام اشتراك وولاء',
  'home.title': 'FORM',
  'home.subtitle': 'تجربة حلاقة عصرية متكاملة — باقات اشتراك شهرية، نظام ولاء يكافئ ولاءك، وخدمة احترافية تليق بك. سجّل زياراتك، تابع اشتراكك، واستمتع بمزايا حصرية.',
  'home.customerBtn': 'صفحة العميل',
  'home.adminBtn': 'صفحه المحل',
  'home.stat.customers': 'عملاء',
  'home.stat.professional': 'احترافية',
  'home.stat.loyalty': 'مكافآت',
  'home.servicesTag': 'خدماتنا',
  'home.servicesTitle': 'خدمات الحلاقة',
  'home.servicesDesc': 'من الحلاقة الكلاسيكية إلى قصات الشعر العصرية — كل خدمة بأيدي حلاقين محترفين.',
  'home.svc1': 'حلاقة كلاسيكية',
  'home.svc1d': 'حلاقة احترافية بالماكينة والمقص مع تحديد الخط',
  'home.svc2': 'حلاقة + غسيل',
  'home.svc2d': 'حلاقة كاملة مع غسيل الشعر بالمنتجات الفاخرة',
  'home.svc3': 'قصات عصرية',
  'home.svc3d': 'أحدث القصات وتصفيف الشعر على أحدث صيحات الموضة',
  'home.svc4': 'تجهيز اللحية',
  'home.svc4d': 'تهذيب وتشكيل اللحية بدقة عالية',
  'home.svc5': 'باقات الأطفال',
  'home.svc5d': 'حلاقة للأطفال في جو مريح وودود',
  'home.svc6': 'حلاقة سريعة',
  'home.svc6d': 'حلاقة على الطاير لمن يبحث عن السرعة والجودة',
  'home.whyTag': 'لماذا FORM؟',
  'home.whyTitle': 'أكثر من مجرد حلاقة',
  'home.whyDesc': 'في FORM لا نكتفي بإتقان الحلاقة — نبني علاقة طويلة مع كل عميل. نظام الاشتراكات الشهرية يوفر عليك، ونظام الولاء يكافئ زياراتك المتكررة بخصومات ومزايا حصرية.',
  'home.feat1': 'باقات اشتراك مرنة',
  'home.feat1d': 'اختر الباقة المناسبة لك — من حلاقة واحدة إلى باقة VIP شهرية',
  'home.feat2': 'نظام ولاء ذكي',
  'home.feat2d': 'كل زيارة تُسجّل وتُحتسب — كلما زاد ولاؤك زادت مكافآتك',
  'home.feat3': 'شفافية كاملة',
  'home.feat3d': 'تابع اشتراكك وعدد حلاقاتك من صفحة العميل في أي وقت',
  'home.rating': 'تقييم العملاء',
  'home.plansTag': 'باقات الاشتراك',
  'home.plansTitle': 'اختر باقتك',
  'home.plansDesc': 'باقات اشتراك شهرية تناسب الجميع — كلما زاد عدد الحلاقات وفّرت أكثر.',
  'home.popular': 'الأكثر طلباً',
  'home.haircuts': 'عدد الحلاقات',
  'home.perCut': 'سعر الحلاقة',
  'home.subscribe': 'اشترك الآن',
  'home.days': 'يوم',
  'home.visitUs': 'زورونا اليوم',
  'home.visitDesc': 'احجز موعدك أو تعرف على باقات الاشتراك ونظام الولاء',
  'home.address': 'العنوان',
  'home.addressVal': 'شارع الجمهورية، وسط البلد',
  'home.hours': 'مواعيد العمل',
  'home.hoursVal': 'يومياً 10ص - 11م',
  'home.book': 'للحجز',
  'home.footer': 'FORM © 2026 — جميع الحقوق محفوظة',

  // Customer page
  'cust.title': 'صفحة العميل',
  'cust.subtitle': 'سجّل دخولك بالاسم ورقم الهاتف — والنظام يدوّر على حسابك في كل المحلات المعتمدة تلقائياً',
  'cust.fullName': 'الاسم بالكامل',
  'cust.namePlaceholder': 'اكتب اسمك كما سجّله الحلاق',
  'cust.phone': 'رقم الهاتف',
  'cust.login': 'دخول',
  'cust.searching': 'جاري البحث...',
  'cust.errorEmpty': 'من فضلك أدخل الاسم ورقم الهاتف',
  'cust.errorNoShops': 'لا توجد محلات معتمدة حالياً. اسأل حلاقك عن التسجيل.',
  'cust.errorNotFound': 'لم يتم العثور على حسابك. تأكد من اسمك ورقم هاتفك، أو اسأل حلاقك ليسجّلك على النظام.',
  'cust.errorBlocked': 'تم حظر حسابك من قبل إدارة المحل. يرجى التواصل مع الحلاق.',
  'cust.errorGeneric': 'حدث خطأ أثناء البحث. حاول مرة أخرى.',
  'cust.smartHint': 'اكتب اسمك ورقم هاتفك زي ما حلاقك سجّلك — النظام هيلاقيك في المحل اللي مشترك فيه ويدخّلك على صفحتك تلقائياً. لو مسجّل في أكتر من محل، هتختار المحل اللي عايز تشوفه.',
  'cust.welcome': 'أهلاً',
  'cust.multiShop': 'وجدناك مسجّل في أكتر من محل — اختر المحل اللي عايز تشوف صفحتك فيه',
  'cust.shopHint': 'للاطلاع على اشتراكك وزياراتك ومستوى ولائك',
  'cust.back': 'رجوع',
  'cust.logout': 'خروج',
  'cust.secure': 'جلسة آمنة',
  'cust.customerSince': 'عميل منذ',
  'cust.subActive': 'مشترك — اشتراك نشط',
  'cust.subInactive': 'غير مشترك حالياً',
  'cust.subEnds': 'تنتهي في',
  'cust.subAskBarber': 'اسأل الحلاق عن باقات الاشتراك المتوفرة',
  'cust.used': 'الحلاقات المستخدمة',
  'cust.remaining': 'متبقي',
  'cust.remainingIn': 'حلاقة في اشتراكك',
  'cust.expiresIn': 'ينتهي اشتراكك خلال',
  'cust.expired': 'اشتراكك انتهى — جدد في أقرب زيارة',
  'cust.days': 'يوم — جدد قبل ما يخلص',
  'cust.loyalty': 'مستوى الولاء',
  'cust.totalVisits': 'إجمالي',
  'cust.visits': 'زيارة',
  'cust.haircuts': 'حلاقة',
  'cust.subVisits': 'بالاشتراك',
  'cust.regVisits': 'حلاقة عادية',
  'cust.totalPaid': 'إجمالي مدفوع',
  'cust.plansTitle': 'باقات الاشتراك المتاحة',
  'cust.history': 'سجل زياراتي',
  'cust.noVisits': 'لا توجد زيارات مسجلة بعد',
  'cust.subscription': 'اشتراك',
  'cust.haircut': 'حلاقة',
  'cust.level.new': 'جديد',
  'cust.level.bronze': 'برونزي',
  'cust.level.silver': 'فضي',
  'cust.level.gold': 'ذهبي',

  // Consultation
  'consult.title': 'استشارة الحلاقة الذكية',
  'consult.subtitle': 'جواب على 3 أسئلة ونقترح لك أفضل حلاقة',
  'consult.intro': 'مش عارف تحلق إيه؟ جاوب على 3 أسئلة بسيطة عن نوع شعرك وشكل وجهك وأسلوبك المفضل، والنظام يقترح لك أحسن حلاقة تناسبك.',
  'consult.start': 'ابدأ الاستشارة',
  'consult.hairType': 'نوع شعرك؟',
  'consult.faceShape': 'شكل وجهك؟',
  'consult.stylePref': 'أسلوبك المفضل؟',
  'consult.hairStraight': 'شعر أملس',
  'consult.hairWavy': 'شعر مموج',
  'consult.hairCurly': 'شعر مجعد',
  'consult.hairCoily': 'شعر كيرلي دقيق',
  'consult.faceOval': 'بيضاوي',
  'consult.faceRound': 'دائري',
  'consult.faceSquare': 'مربع',
  'consult.faceLong': 'طويل',
  'consult.styleClassic': 'كلاسيكي',
  'consult.styleModern': 'عصري',
  'consult.styleBold': 'جريء',
  'consult.styleEasy': 'سهل العناية',
  'consult.result': 'اقتراحنا لك',
  'consult.summary': 'ملخص اختيارك:',
  'consult.disclaimer': 'هذا مجرد اقتراح — اسأل الحلاق عند زيارتك القادمة عن القصة المقترحة وسيقدمها لك باحترافية.',
  'consult.newConsult': 'استشارة جديدة',

  // Booking
  'booking.title': 'احجز موعد',
  'booking.subtitle': 'احجز موعدك مسبقاً ووفّر وقتك عند الحلاق',
  'booking.date': 'اختر اليوم',
  'booking.time': 'اختر الوقت',
  'booking.confirm': 'تأكيد الحجز',
  'booking.success': 'تم حجز موعدك بنجاح!',
  'booking.successDesc': 'سيتم تأكيد الحجز عند وصولك للمحل',
  'booking.cancel': 'إلغاء',
  'booking.pending': 'بانتظار الموعد',
  'booking.noBookings': 'لا توجد حجوزات قادمة',
  'booking.upcoming': 'حجوزاتي القادمة',
  'booking.bookAgain': 'احجز مرة أخرى',
  'booking.today': 'اليوم',
  'booking.tomorrow': 'غداً',

  // Referral
  'referral.title': 'ادعُ صديق واحصل على مكافأة',
  'referral.desc': 'عندما يسجّل صديقك في النظام ويقوم بأول حلاقة، تحصل أنت على حلاقة مجانية ضمن نظام الولاء!',
  'referral.code': 'كود الإحالة',
  'referral.copy': 'نسخ',
  'referral.copied': 'تم النسخ!',
  'referral.share': 'شارك الكود مع صديقك',
  'referral.stats': 'إحصائيات الإحالة',
  'referral.invited': 'مدعوون',
  'referral.joined': 'انضموا',
  'referral.earned': 'مكافآت مكتسبة',

  // Offers
  'offers.title': 'عروض حصرية لك',
  'offers.badge': 'عرض خاص',
  'offers.renew': 'جدد الآن ووفّر',
  'offers.renewDesc': 'جدد اشتراكك قبل ما يخلص واحصل على خصم 10% على الباقة القادمة',
  'offers.refer': 'هات صاحبك',
  'offers.referDesc': 'ادعُ صديق — أول حلاقة ليه مجانية، وتاخد أنت كمان حلاقة مكافأة',
  'offers.vip': 'اقترب من المستوى الذهبي',
  'offers.vipDesc': 'أنت قريب من المستوى الذهبي — خمس حلاقات وتحصل على خصم 20% دائم',
  'offers.claim': 'احصل على العرض',
};

const en: Dict = {
  // Nav
  'nav.home': 'Home',
  'nav.customer': 'Customer Page',
  'nav.admin': 'Admin Panel',
  'nav.menu': 'Menu',

  // Home
  'home.badge': 'Professional barbering with subscription & loyalty',
  'home.title': 'FORM',
  'home.subtitle': 'A complete modern grooming experience — monthly subscription plans, a loyalty system that rewards you, and professional service. Track your visits, monitor your subscription, and enjoy exclusive perks.',
  'home.customerBtn': 'Customer Page',
  'home.adminBtn': 'Admin Panel',
  'home.stat.customers': 'Customers',
  'home.stat.professional': 'Professional',
  'home.stat.loyalty': 'Rewards',
  'home.servicesTag': 'Our Services',
  'home.servicesTitle': 'Barbering Services',
  'home.servicesDesc': 'From classic cuts to modern styling — every service by professional barbers.',
  'home.svc1': 'Classic Haircut',
  'home.svc1d': 'Professional cut with clippers and scissors with a clean line',
  'home.svc2': 'Haircut + Wash',
  'home.svc2d': 'Full haircut with luxury hair wash',
  'home.svc3': 'Modern Styles',
  'home.svc3d': 'Latest cuts and styling on trend',
  'home.svc4': 'Beard Grooming',
  'home.svc4d': 'Precision beard shaping and trimming',
  'home.svc5': "Kids' Cuts",
  'home.svc5d': "Haircuts for kids in a comfortable, friendly atmosphere",
  'home.svc6': 'Quick Cut',
  'home.svc6d': 'Fast cut for those who want speed and quality',
  'home.whyTag': 'Why FORM?',
  'home.whyTitle': 'More Than Just a Haircut',
  'home.whyDesc': "At FORM we don't just master haircuts — we build long-term relationships. Monthly subscriptions save you money, and our loyalty system rewards your repeat visits with exclusive perks.",
  'home.feat1': 'Flexible Subscription Plans',
  'home.feat1d': 'Choose the plan that suits you — from a single cut to a monthly VIP package',
  'home.feat2': 'Smart Loyalty System',
  'home.feat2d': 'Every visit is tracked — the more loyal you are, the more you earn',
  'home.feat3': 'Full Transparency',
  'home.feat3d': 'Track your subscription and haircut count from the customer page anytime',
  'home.rating': 'Customer Rating',
  'home.plansTag': 'Subscription Plans',
  'home.plansTitle': 'Choose Your Plan',
  'home.plansDesc': 'Monthly subscription plans for everyone — the more haircuts, the more you save.',
  'home.popular': 'Most Popular',
  'home.haircuts': 'Haircuts',
  'home.perCut': 'Per Cut',
  'home.subscribe': 'Subscribe Now',
  'home.days': 'days',
  'home.visitUs': 'Visit Us Today',
  'home.visitDesc': 'Book your appointment or learn about subscriptions and loyalty',
  'home.address': 'Address',
  'home.addressVal': 'Tahrir Street, Downtown',
  'home.hours': 'Working Hours',
  'home.hoursVal': 'Daily 10AM - 11PM',
  'home.book': 'To Book',
  'home.footer': 'FORM © 2026 — All Rights Reserved',

  // Customer page
  'cust.title': 'Customer Page',
  'cust.subtitle': 'Enter your name and phone — the system finds your account across all approved shops automatically',
  'cust.fullName': 'Full Name',
  'cust.namePlaceholder': 'Type your name as your barber registered it',
  'cust.phone': 'Phone Number',
  'cust.login': 'Login',
  'cust.searching': 'Searching...',
  'cust.errorEmpty': 'Please enter your name and phone number',
  'cust.errorNoShops': 'No approved shops available. Ask your barber to register.',
  'cust.errorNotFound': 'Account not found. Check your name and phone, or ask your barber to register you on the system.',
  'cust.errorBlocked': 'Your account has been blocked by the shop. Please contact your barber.',
  'cust.errorGeneric': 'An error occurred during search. Try again.',
  'cust.smartHint': 'Enter your name and phone as your barber registered them — the system will find you in the shop you\'re subscribed to and take you to your page automatically. If you\'re registered in more than one shop, you\'ll choose which one to view.',
  'cust.welcome': 'Welcome',
  'cust.multiShop': 'We found you in multiple shops — choose which one to view',
  'cust.shopHint': 'View your subscription, visits, and loyalty level',
  'cust.back': 'Back',
  'cust.logout': 'Logout',
  'cust.secure': 'Secure Session',
  'cust.customerSince': 'Customer since',
  'cust.subActive': 'Subscribed — Active',
  'cust.subInactive': 'Not currently subscribed',
  'cust.subEnds': 'Ends on',
  'cust.subAskBarber': 'Ask your barber about available subscription plans',
  'cust.used': 'Haircuts Used',
  'cust.remaining': 'remaining',
  'cust.remainingIn': 'haircuts left in your subscription',
  'cust.expiresIn': 'Your subscription expires in',
  'cust.expired': 'Your subscription has expired — renew on your next visit',
  'cust.days': 'days — renew before it ends',
  'cust.loyalty': 'Loyalty Level',
  'cust.totalVisits': 'Total',
  'cust.visits': 'visits',
  'cust.haircuts': 'haircuts',
  'cust.subVisits': 'With Subscription',
  'cust.regVisits': 'Regular Cut',
  'cust.totalPaid': 'Total Paid',
  'cust.plansTitle': 'Available Subscription Plans',
  'cust.history': 'My Visit History',
  'cust.noVisits': 'No visits recorded yet',
  'cust.subscription': 'Subscription',
  'cust.haircut': 'Haircut',
  'cust.level.new': 'New',
  'cust.level.bronze': 'Bronze',
  'cust.level.silver': 'Silver',
  'cust.level.gold': 'Gold',

  // Consultation
  'consult.title': 'Smart Haircut Consultation',
  'consult.subtitle': 'Answer 3 questions and we\'ll suggest the best cut',
  'consult.intro': 'Not sure what to get? Answer 3 simple questions about your hair type, face shape, and preferred style, and the system will suggest the best haircut for you.',
  'consult.start': 'Start Consultation',
  'consult.hairType': 'Your hair type?',
  'consult.faceShape': 'Your face shape?',
  'consult.stylePref': 'Your preferred style?',
  'consult.hairStraight': 'Straight',
  'consult.hairWavy': 'Wavy',
  'consult.hairCurly': 'Curly',
  'consult.hairCoily': 'Coily',
  'consult.faceOval': 'Oval',
  'consult.faceRound': 'Round',
  'consult.faceSquare': 'Square',
  'consult.faceLong': 'Long',
  'consult.styleClassic': 'Classic',
  'consult.styleModern': 'Modern',
  'consult.styleBold': 'Bold',
  'consult.styleEasy': 'Low Maintenance',
  'consult.result': 'Our Suggestion',
  'consult.summary': 'Your selections:',
  'consult.disclaimer': 'This is just a suggestion — ask your barber about it on your next visit and they\'ll deliver it professionally.',
  'consult.newConsult': 'New Consultation',

  // Booking
  'booking.title': 'Book Appointment',
  'booking.subtitle': 'Book in advance and save time at the barbershop',
  'booking.date': 'Choose a day',
  'booking.time': 'Choose a time',
  'booking.confirm': 'Confirm Booking',
  'booking.success': 'Appointment booked successfully!',
  'booking.successDesc': 'Your booking will be confirmed when you arrive at the shop',
  'booking.cancel': 'Cancel',
  'booking.pending': 'Awaiting appointment',
  'booking.noBookings': 'No upcoming bookings',
  'booking.upcoming': 'My Upcoming Bookings',
  'booking.bookAgain': 'Book Again',
  'booking.today': 'Today',
  'booking.tomorrow': 'Tomorrow',

  // Referral
  'referral.title': 'Refer a Friend & Earn',
  'referral.desc': 'When your friend registers on the system and gets their first haircut, you get a free haircut as a loyalty reward!',
  'referral.code': 'Referral Code',
  'referral.copy': 'Copy',
  'referral.copied': 'Copied!',
  'referral.share': 'Share this code with your friend',
  'referral.stats': 'Referral Stats',
  'referral.invited': 'Invited',
  'referral.joined': 'Joined',
  'referral.earned': 'Rewards Earned',

  // Offers
  'offers.title': 'Exclusive Offers for You',
  'offers.badge': 'Special Offer',
  'offers.renew': 'Renew & Save',
  'offers.renewDesc': 'Renew your subscription before it expires and get 10% off your next plan',
  'offers.refer': 'Bring a Friend',
  'offers.referDesc': 'Invite a friend — their first cut is free, and you get a free haircut too',
  'offers.vip': 'Close to Gold Level',
  'offers.vipDesc': 'You\'re near Gold level — five more haircuts for a permanent 20% discount',
  'offers.claim': 'Claim Offer',
};

const dicts: Record<Lang, Dict> = { ar, en };

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('app_lang');
      return saved === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('app_lang', l);
    } catch {
      /* ignore */
    }
  };

  const t = (key: string) => dicts[lang][key] ?? key;

  return (
    <I18nContext.Provider value={{ lang, setLang, t, dir }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
