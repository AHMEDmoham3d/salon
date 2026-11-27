import { useState } from 'react';
import { Menu, X, Shield, User, Home as HomeIcon, Globe } from 'lucide-react';
import Logo from './Logo';
import { useI18n, type Lang } from '@/lib/i18n';

type Page = 'home' | 'admin' | 'customer';

export default function NavBar({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const [open, setOpen] = useState(false);
  const { lang, setLang, t } = useI18n();

  const links: { key: Page; label: string; icon: typeof HomeIcon }[] = [
    { key: 'home', label: t('nav.home'), icon: HomeIcon },
    { key: 'customer', label: t('nav.customer'), icon: User },
  ];

  const go = (p: Page) => {
    onNavigate(p);
    setOpen(false);
  };

  const toggleLang = () => setLang(lang === 'ar' ? 'en' : 'ar');

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <button onClick={() => go('home')} className="transition active:scale-95">
          <Logo />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <Globe className="h-4 w-4 text-stone-500" />
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>

          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <button
                key={l.key}
                onClick={() => go(l.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200 ${
                  page === l.key
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 transition hover:bg-stone-100 md:hidden"
            aria-label={t('nav.menu')}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="animate-fade-in space-y-1 border-t border-stone-200 bg-white px-4 py-3 md:hidden">
          {links.map((l) => (
            <button
              key={l.key}
              onClick={() => go(l.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${
                page === l.key
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <l.icon className="h-4 w-4" />
              {l.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
