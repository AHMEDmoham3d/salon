import { useEffect, useState } from 'react';
import { I18nProvider } from '@/lib/i18n';
import NavBar from '@/components/NavBar';
import HomePage from '@/pages/HomePage';
import AdminPage from '@/pages/AdminPageWrapper';
import CustomerPage from '@/pages/CustomerPage';
import CompanyPage from '@/pages/CompanyPage';

type Page = 'home' | 'admin' | 'customer' | 'company';

function parseHash(): Page {
  const h = window.location.hash.replace('#/', '').replace('#', '');
  if (h === 'admin') return 'admin';
  if (h === 'company') return 'company';
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

  // Admin and Company pages are full-screen (no navbar, hidden access)
  if (page === 'admin' || page === 'company') {
    return (
      <I18nProvider>
        <div className="min-h-screen bg-stone-50 text-stone-900">
          {page === 'admin' && <AdminPage />}
          {page === 'company' && <CompanyPage />}
        </div>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <div className="min-h-screen bg-stone-50 text-stone-900">
        <NavBar page={page === 'company' ? 'home' : page} onNavigate={navigate} />
        {page === 'home' && <HomePage onNavigate={navigate} />}
        {page === 'customer' && <CustomerPage />}
      </div>
    </I18nProvider>
  );
}

export default App;
