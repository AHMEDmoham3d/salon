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
    <div className="animate-fade-in bg-stone-50/50 text-stone-900">
      {/* Hero */}
      <section className="relative overflow-hidden bg-stone-900">
        <div className="absolute inset-0">
          <img
            src={HERO_IMG}
            alt={t('home.title')}
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-stone-950/90 via-stone-950/65 to-stone-950/35" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
          <div className="max-w-2xl animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-stone-900/75 px-4 py-1.5 text-xs font-bold text-stone-100 backdrop-blur-xs">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              {t('home.badge')}
            </span>

            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
              {lang === 'ar' ? (
                <>
                  محل حلاقة <span className="text-emerald-400">shaveup</span>
                </>
              ) : (
                <>
                  <span className="text-emerald-400">Al-Barimi</span> Barbershop
                </>
              )}
            </h1>

            <p className="mt-4 text-base leading-relaxed text-stone-200 sm:text-lg">
              {t('home.subtitle')}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('customer')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-xs font-extrabold text-stone-900 shadow-sm transition-all hover:bg-stone-100 active:scale-[0.99] sm:text-sm"
              >
                {t('home.customerBtn')}
                <ArrowLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-stone-900/70 px-6 text-xs font-bold text-white backdrop-blur-xs transition-all hover:bg-stone-900/90 active:scale-[0.99] sm:text-sm"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                {t('home.adminBtn')}
              </button>
            </div>

            <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
              {[
                { icon: Users, label: t('home.stat.customers'), value: '+500' },
                {
                  icon: Scissors,
                  label: t('home.stat.professional'),
                  value: lang === 'ar' ? 'احترافية' : 'Pro',
                },
                {
                  icon: Award,
                  label: t('home.stat.loyalty'),
                  value: lang === 'ar' ? 'مكافآت' : 'Rewards',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-white/15 bg-stone-950/65 p-3.5 text-center backdrop-blur-xs transition-colors hover:bg-stone-950/80"
                >
                  <s.icon className="mx-auto h-5 w-5 text-emerald-400" />
                  <p className="mt-1.5 font-display text-lg font-extrabold text-white">
                    {s.value}
                  </p>
                  <p className="text-[11px] font-bold text-stone-300">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="text-center">
          <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800">
            {t('home.servicesTag')}
          </span>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-stone-900 sm:text-4xl">
            {t('home.servicesTitle')}
          </h2>
          <p className="mx-auto mt-2.5 max-w-xl text-sm leading-relaxed text-stone-500 sm:text-base">
            {t('home.servicesDesc')}
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <div
              key={s.title}
              className="group card animate-fade-up border-stone-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-sm"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-900 text-white shadow-2xs transition-colors duration-200 group-hover:bg-emerald-700">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-base font-extrabold text-stone-900 sm:text-lg">
                {s.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-stone-500 sm:text-sm">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* About / Why us */}
      <section className="relative overflow-hidden bg-stone-900 py-14 text-white sm:py-20">
        <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-20 right-1/4 h-64 w-64 rounded-full bg-emerald-400/5" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div className="animate-fade-up">
            <span className="inline-block rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-extrabold text-emerald-300">
              {t('home.whyTag')}
            </span>
            <h2 className="mt-3 font-display text-3xl font-extrabold text-white sm:text-4xl">
              {t('home.whyTitle')}
            </h2>
            <p className="mt-3.5 text-sm leading-relaxed text-stone-300 sm:text-base">
              {t('home.whyDesc')}
            </p>
            <ul className="mt-6 space-y-3.5">
              {features.map((f) => (
                <li
                  key={f.t}
                  className="flex gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-3.5 transition-colors hover:bg-white/10"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-400">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-white">{f.t}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-stone-400">{f.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative animate-fade-up">
            <div className="overflow-hidden rounded-3xl border border-white/15 bg-stone-800 shadow-xl">
              <img
                src={ABOUT_IMG}
                alt={t('home.title')}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -left-4 hidden rounded-2xl border border-white/15 bg-stone-900/95 p-4 shadow-lg backdrop-blur-xs sm:block">
              <div className="flex items-center gap-2">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-emerald-400 text-emerald-400" />
                  ))}
                </div>
                <span className="font-display text-sm font-extrabold text-white">4.9</span>
              </div>
              <p className="mt-1 text-xs text-stone-400">{t('home.rating')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      {/* <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-bold tracking-widest text-emerald-700">{t('home.plansTag')}</p>
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
                    className={`relative card p-6 transition-all duration-200 hover:-translate-y-0.5 animate-fade-up ${
                      popular ? 'border-stone-900 ring-1 ring-stone-900' : 'hover:border-stone-300'
                    }`}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    {popular && (
                      <span className="absolute -top-3 right-6 rounded-full bg-stone-900 px-3 py-1 text-[10px] font-extrabold text-white shadow-2xs">
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
                        <span className="font-bold text-emerald-700">{formatPrice(perCut)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigate('customer')}
                      className={`mt-5 w-full ${popular ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      {t('home.subscribe')}
                    </button>
                  </div>
                );
              })}
        </div>
      </section> */}

      {/* Gallery strip */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {[CUT_IMG, ABOUT_IMG, HERO_IMG].map((src, i) => (
            <div
              key={i}
              className="group aspect-[4/3] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs"
            >
              <img
                src={src}
                alt={`${i + 1}`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Contact / CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-stone-800 bg-stone-900 px-5 py-12 text-center text-white shadow-sm sm:px-8 sm:py-16">
          <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-20 right-1/4 h-52 w-52 rounded-full bg-emerald-400/5" />

          <div className="relative mx-auto max-w-3xl">
            <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
              {t('home.visitUs')}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-300 sm:text-base">
              {t('home.visitDesc')}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {/* <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <MapPin className="mx-auto h-6 w-6 text-emerald-400" />
                <p className="mt-2 font-bold">{t('home.address')}</p>
                <p className="mt-1 text-sm text-stone-400">{t('home.addressVal')}</p>
              </div> */}
              {/* <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <Clock className="mx-auto h-6 w-6 text-emerald-400" />
                <p className="mt-2 font-bold">{t('home.hours')}</p>
                <p className="mt-1 text-sm text-stone-400">{t('home.hoursVal')}</p>
              </div> */}
              {/* <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <Phone className="mx-auto h-6 w-6 text-emerald-400" />
                <p className="mt-2 font-bold">{t('home.book')}</p>
                <p className="mt-1 text-sm text-stone-400" dir="ltr">0100 123 4567</p>
              </div> */}
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('customer')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-xs font-extrabold text-stone-900 transition-all hover:bg-stone-100 sm:text-sm"
              >
                {t('home.customerBtn')}
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 text-xs font-bold text-stone-100 transition-all hover:bg-white/15 sm:text-sm"
              >
                {t('home.adminBtn')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-500 sm:text-sm">
        <p>{t('home.footer')}</p>
      </footer>
    </div>
  );
}