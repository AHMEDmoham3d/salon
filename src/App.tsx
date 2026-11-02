
import { useEffect, useState } from 'react';
import { I18nProvider } from '@/lib/i18n';
import NavBar from '@/components/NavBar';
import HomePage from '@/pages/HomePage';
import AdminPage from '@/pages/AdminPageWrapper';
import CustomerPage from '@/pages/CustomerPage';
import CompanyPage from '@/pages/CompanyPage';
import { CompanyAuthGate, CompanyLoginPage } from '@/pages/CompanyAccess';
import { supabase } from '@/lib/supabase';

type Page = 'home' | 'admin' | 'customer' | 'company' | 'company-login';

function parseHash(): Page {
  const h = window.location.hash.replace('#/', '').replace('#', '');

  if (h === 'admin') return 'admin';
  if (h === 'company') return 'company';
  if (h === 'company-login') return 'company-login';
  if (h === 'customer') return 'customer';

  return 'home';
}

function App() {
  const [page, setPage] = useState<Page>(parseHash);

  useEffect(() => {
    const onHash = () => setPage(parseHash());

    window.addEventListener('hashchange', onHash);

    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (p: Page) => {
    window.location.hash = p === 'home' ? '' : `/${p}`;
    setPage(p);
    window.scrollTo(0, 0);
  };

  // Admin, Company and Company Login pages are full-screen.
  if (
    page === 'admin' ||
    page === 'company' ||
    page === 'company-login'
  ) {
    return (
      <I18nProvider>
        <div className="min-h-screen bg-stone-50 text-stone-900">
          {page === 'admin' && <AdminPage />}

          {page === 'company-login' && (
            <CompanyLoginPage
                onSuccess={() => navigate('company')}
            />
          )}

          {page === 'company' && (
            <CompanyAuthGate
              onUnauthorized={() => navigate('company-login')}
            >
              <CompanyPage
                onLogout={async () => {
                  await supabase.auth.signOut();
                  navigate('company-login');
                }}
              />
            </CompanyAuthGate>
          )}
        </div>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <div className="min-h-screen bg-stone-50 text-stone-900">
        <NavBar page={page} onNavigate={navigate} />

        {page === 'home' && <HomePage onNavigate={navigate} />}

        {page === 'customer' && <CustomerPage />}
      </div>
    </I18nProvider>
  );
}

export default App;
