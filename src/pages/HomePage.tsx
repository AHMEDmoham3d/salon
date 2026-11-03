import { useEffect, useState } from 'react';
import {
  Scissors,
  CalendarCheck,
  Award,
  Clock,
  Sparkles,
  ArrowLeft,
  Phone,
  MapPin,
  Star,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { getPlans, type Plan, formatPrice } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const HERO_IMG =
  'https://images.pexels.com/photos/7518739/pexels-photo-7518739.jpeg?auto=compress&cs=tinysrgb&h=900&w=1400';
const ABOUT_IMG =
  'https://images.pexels.com/photos/7195806/pexels-photo-7195806.jpeg?auto=compress&cs=tinysrgb&h=800&w=1100';
const CUT_IMG =
  'https://images.pexels.com/photos/3037244/pexels-photo-3037244.jpeg?auto=compress&cs=tinysrgb&h=700&w=900';

type Page = 'home' | 'admin' | 'customer';

export default function HomePage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, lang } = useI18n();

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const services = [
    { icon: Scissors, title: t('home.svc1'), desc: t('home.svc1d') },
    { icon: Sparkles, title: t('home.svc2'), desc: t('home.svc2d') },
    { icon: Star, title: t('home.svc3'), desc: t('home.svc3d') },
    { icon: CalendarCheck, title: t('home.svc4'), desc: t('home.svc4d') },
    { icon: Award, title: t('home.svc5'), desc: t('home.svc5d') },
    { icon: Clock, title: t('home.svc6'), desc: t('home.svc6d') },
  ];

  const features = [
    { icon: CalendarCheck, t: t('home.feat1'), d: t('home.feat1d') },
    { icon: Award, t: t('home.feat2'), d: t('home.feat2d') },
    { icon: ShieldCheck, t: t('home.feat3'), d: t('home.feat3d') },
  ];

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt={t('home.title')} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-l from-stone-950/95 via-stone-950/80 to-stone-950/60" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="max-w-2xl animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-bold text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t('home.badge')}
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight text-amber-50 sm:text-6xl">
              {lang === 'ar' ? (
                <>محل حلاقة <span className="text-amber-400">FORM</span></>
              ) : (
                <><span className="text-amber-400">Al-Barimi</span> Barbershop</>
              )}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-stone-300">{t('home.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => onNavigate('customer')} className="btn-gold">
                {t('home.customerBtn')}
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => onNavigate('admin')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-50/30 bg-white/10 px-6 py-3 text-sm font-bold text-amber-50 backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
              >
                <ShieldCheck className="h-4 w-4" />
                {t('home.adminBtn')}
              </button>
            </div>

            <div className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {[
                { icon: Users, label: t('home.stat.customers'), value: '+500' },
                { icon: Scissors, label: t('home.stat.professional'), value: lang === 'ar' ? 'احترافية' : 'Pro' },
                { icon: Award, label: t('home.stat.loyalty'), value: lang === 'ar' ? 'مكافآت' : 'Rewards' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur-sm">
                  <s.icon className="mx-auto h-5 w-5 text-amber-400" />
                  <p className="mt-1.5 font-display text-lg font-extrabold text-amber-50">{s.value}</p>
                  <p className="text-[11px] font-bold text-stone-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-bold tracking-widest text-amber-600">{t('home.servicesTag')}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold text-stone-900 sm:text-4xl">{t('home.servicesTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-stone-600">{t('home.servicesDesc')}</p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <div
              key={s.title}
              className="group card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-gold animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-stone-900 text-amber-400 transition group-hover:bg-amber-500 group-hover:text-stone-950">
                <s.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-stone-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About / Why us */}
      <section className="bg-stone-900 py-16 text-stone-100 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div className="animate-fade-up">
            <p className="text-xs font-bold tracking-widest text-amber-400">{t('home.whyTag')}</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold text-amber-50 sm:text-4xl">
              {t('home.whyTitle')}
            </h2>
            <p className="mt-4 leading-relaxed text-stone-300">{t('home.whyDesc')}</p>
            <ul className="mt-6 space-y-4">
              {features.map((f) => (
                <li key={f.t} className="flex gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-amber-50">{f.t}</p>
                    <p className="text-sm text-stone-400">{f.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative animate-fade-up">
            <div className="overflow-hidden rounded-3xl border border-stone-700 shadow-2xl">
              <img src={ABOUT_IMG} alt={t('home.title')} className="h-full w-full object-cover" />
            </div>
            <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-stone-700 bg-stone-800/90 p-4 backdrop-blur-sm sm:block">
              <div className="flex items-center gap-2">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="font-bold text-amber-50">4.9</span>
              </div>
              <p className="mt-1 text-xs text-stone-400">{t('home.rating')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      {/* <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-bold tracking-widest text-amber-600">{t('home.plansTag')}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold text-stone-900 sm:text-4xl">{t('home.plansTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-stone-600">{t('home.plansDesc')}</p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? [...Array(4)].map((_, i) => <div key={i} className="h-64 animate-shimmer rounded-2xl" />)
            : plans.map((p, i) => {
                const perCut = p.haircut_count > 0 ? p.price / p.haircut_count : p.price;
                const popular = p.haircut_count === 4;
                return (
                  <div
                    key={p.id}
                    className={`relative card p-6 transition-all duration-300 hover:-translate-y-1 animate-fade-up ${
                      popular ? 'ring-2 ring-amber-500 shadow-gold' : 'hover:shadow-soft'
                    }`}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    {popular && (
                      <span className="absolute -top-3 right-6 rounded-full bg-amber-500 px-3 py-1 text-[10px] font-extrabold text-stone-950 shadow">
                        {t('home.popular')}
                      </span>
                    )}
                    <h3 className="font-display text-xl font-extrabold text-stone-900">{p.name}</h3>
                    <p className="mt-1 text-xs text-stone-500">{p.description ?? ''}</p>
                    <div className="mt-4">
                      <span className="font-display text-4xl font-extrabold text-stone-900">{formatPrice(p.price)}</span>
                      <span className="text-sm text-stone-500"> / {p.duration_days} {t('home.days')}</span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500">{t('home.haircuts')}</span>
                        <span className="font-bold text-stone-800">{p.haircut_count} {t('cust.haircuts')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500">{t('home.perCut')}</span>
                        <span className="font-bold text-amber-600">{formatPrice(perCut)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigate('customer')}
                      className={`mt-5 w-full ${popular ? 'btn-gold' : 'btn-ghost'}`}
                    >
                      {t('home.subscribe')}
                    </button>
                  </div>
                );
              })}
        </div>
      </section> */}

      {/* Gallery strip */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[CUT_IMG, ABOUT_IMG, HERO_IMG].map((src, i) => (
            <div key={i} className="aspect-[4/3] overflow-hidden rounded-2xl border border-stone-200">
              <img src={src} alt={`${i + 1}`} className="h-full w-full object-cover transition duration-500 hover:scale-105" />
            </div>
          ))}
        </div>
      </section>

      {/* Contact / CTA */}
      <section className="bg-gradient-to-br from-stone-900 to-stone-800 py-16 text-amber-50 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{t('home.visitUs')}</h2>
          <p className="mt-3 text-stone-300">{t('home.visitDesc')}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {/* <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <MapPin className="mx-auto h-6 w-6 text-amber-400" />
              <p className="mt-2 font-bold">{t('home.address')}</p>
              <p className="mt-1 text-sm text-stone-400">{t('home.addressVal')}</p>
            </div> */}
            {/* <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <Clock className="mx-auto h-6 w-6 text-amber-400" />
              <p className="mt-2 font-bold">{t('home.hours')}</p>
              <p className="mt-1 text-sm text-stone-400">{t('home.hoursVal')}</p>
            </div> */}
            {/* <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <Phone className="mx-auto h-6 w-6 text-amber-400" />
              <p className="mt-2 font-bold">{t('home.book')}</p>
              <p className="mt-1 text-sm text-stone-400" dir="ltr">0100 123 4567</p>
            </div> */}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button onClick={() => onNavigate('customer')} className="btn-gold">
              {t('home.customerBtn')}
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button onClick={() => onNavigate('admin')} className="btn-ghost border-amber-50/30 bg-white/10 text-amber-50 hover:bg-white/20">
              {t('home.adminBtn')}
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-stone-50 py-6 text-center text-sm text-stone-500">
        <p>{t('home.footer')}</p>
      </footer>
    </div>
  );
}
