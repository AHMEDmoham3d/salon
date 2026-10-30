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
    <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-stone-50/80 backdrop-blur-lg">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <button onClick={() => go('home')} className="transition active:scale-95">
          <Logo />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100"
          >
            <Globe className="h-4 w-4" />
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>

          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <button
                key={l.key}
                onClick={() => go(l.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all duration-200 ${
                  page === l.key
                    ? 'bg-stone-900 text-amber-50 shadow-sm'
                    : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
                }`}
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-stone-300 bg-white text-stone-700 md:hidden"
            aria-label={t('nav.menu')}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="animate-fade-in border-t border-stone-200 bg-stone-50 px-4 py-3 md:hidden">
          {links.map((l) => (
            <button
              key={l.key}
              onClick={() => go(l.key)}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition ${
                page === l.key ? 'bg-stone-900 text-amber-50' : 'text-stone-700 hover:bg-stone-200/60'
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
