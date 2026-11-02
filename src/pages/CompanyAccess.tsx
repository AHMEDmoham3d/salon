import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Building2, Loader2, LockKeyhole, LogIn } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AccessState = 'checking' | 'allowed' | 'denied';

async function hasCompanyAccess(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('company_admins')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Company access check failed:', error.message);
    return false;
  }

  return Boolean(data);
}

export function CompanyAuthGate({ children, onUnauthorized }: { children: ReactNode; onUnauthorized: () => void }) {
  const [state, setState] = useState<AccessState>('checking');

  useEffect(() => {
    let active = true;

    const verify = async (userId: string | null) => {
      if (!userId) {
        if (active) {
          setState('denied');
          onUnauthorized();
        }
        return;
      }

      const allowed = await hasCompanyAccess(userId);
      if (!active) return;

      if (allowed) {
        setState('allowed');
      } else {
        await supabase.auth.signOut();
        if (active) {
          setState('denied');
          onUnauthorized();
        }
      }
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        if (active) {
          setState('denied');
          onUnauthorized();
        }
        return;
      }
      void verify(data.session?.user.id ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void verify(session?.user.id ?? null);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [onUnauthorized]);

  if (state === 'allowed') return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 text-amber-50">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-5">
        <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
        <span className="text-sm font-bold">جارٍ التحقق من صلاحية الدخول...</span>
      </div>
    </div>
  );
}

export function CompanyLoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError || !data.user) {
        throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      }

      const allowed = await hasCompanyAccess(data.user.id);
      if (!allowed) {
        await supabase.auth.signOut();
        throw new Error('هذا الحساب غير مصرح له بدخول لوحة الشركة.');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-stone-950 px-4 py-10 text-stone-900">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-stone-900 to-stone-800 px-8 py-8 text-amber-50">
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-400">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold">دخول إدارة الشركة</h1>
          <p className="mt-2 text-sm text-stone-300">هذه الصفحة مخصصة لمسؤولي الشركة المعتمدين فقط.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-8">
          <div>
            <label htmlFor="company-email" className="mb-2 block text-sm font-bold text-stone-700">البريد الإلكتروني</label>
            <input
              id="company-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-left outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              placeholder="admin@example.com"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="company-password" className="mb-2 block text-sm font-bold text-stone-700">كلمة المرور</label>
            <input
              id="company-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-left outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3.5 font-bold text-amber-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>

          <p className="flex items-center justify-center gap-2 text-xs text-stone-500">
            <LockKeyhole className="h-3.5 w-3.5" /> دخول آمن لحسابات الشركة المعتمدة
          </p>
        </form>
      </div>
    </main>
  );
}