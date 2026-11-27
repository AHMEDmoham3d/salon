import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Gift,
  Users,
  Copy,
  Tag,
  Zap,
  Calendar,
  Ticket,
  ShieldCheck,
} from 'lucide-react';
import {
  findCustomerInShops,
  getActiveSubscription,
  getVisitsByCustomer,
  getPlans,
  getAvailableBookingSlots,
  evaluateCustomerBookingTrust,
  createCustomerBooking,
  getCustomerBookings,
  updateBookingStatus,
  formatPrice,
  formatDate,
  formatDateTime,
  type Customer,
  type CustomerInShop,
  type Subscription,
  type Visit,
  type Plan,
  type Booking,
  type CustomerBookingTrust,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { getAllShops, getShopById, type Shop } from '@/lib/shopApi';
import { useI18n } from '@/lib/i18n';
import WhatsAppConsentPanel from '@/components/WhatsAppConsentPanel';
import SmartHairPhotoAssistant from '@/components/SmartHairPhotoAssistant';

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
      <div className="animate-fade-in mx-auto flex min-h-[calc(100vh-64px)] max-w-md flex-col justify-center bg-stone-50 px-4 py-10 sm:px-6">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-stone-900 text-amber-400 shadow-sm">
            <Store className="h-8 w-8" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold text-stone-900">{t('cust.welcome')} {name.trim()}</h1>
          <p className="mt-2 text-sm text-stone-500">{t('cust.multiShop')}</p>
        </div>
        <div className="mt-8 space-y-2.5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          {matches.map((m) => (
            <button key={m.shop_id} onClick={() => onLogin(m.customer, m.shop_id, m.shop_name)}
              className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-right transition hover:border-amber-500 hover:bg-amber-50/40">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-stone-900 font-display text-lg font-extrabold text-amber-400">
                {m.shop_name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-stone-900">{m.shop_name}</p>
                <p className="text-xs text-stone-500">{t('cust.shopHint')}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-stone-400" />
            </button>
          ))}
          <button onClick={() => setMatches(null)} className="w-full rounded-xl py-2.5 text-sm font-bold text-stone-600 transition hover:bg-stone-100">
            {t('cust.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto flex min-h-[calc(100vh-64px)] max-w-md flex-col justify-center bg-stone-50 px-4 py-10 sm:px-6">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-stone-900 text-amber-400 shadow-sm">
          <User className="h-8 w-8" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-stone-900">{t('cust.title')}</h1>
        <p className="mt-2 text-sm text-stone-500">{t('cust.subtitle')}</p>
      </div>
      <div className="mt-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-2 block text-sm font-bold text-stone-600">{t('cust.fullName')}</label>
          <div className="relative">
            <User className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('cust.namePlaceholder')} className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-4 pr-11 text-sm text-stone-900 outline-none transition focus:border-amber-500" />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-bold text-stone-600">{t('cust.phone')}</label>
          <div className="relative">
            <Phone className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="01xxxxxxxxx" className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-4 pr-11 text-sm text-stone-900 outline-none transition focus:border-amber-500" dir="ltr" />
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        <button onClick={submit} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-700 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {loading ? t('cust.searching') : t('cust.login')}
        </button>
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span>{t('cust.smartHint')}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Customer booking widget (Multi-branch & Multi-barber aware) ---------- */
type ShopBranchOption = {
  id: string;
  name: string;
  address: string | null;
};

type BarberOption = {
  id: string;
  branch_id: string | null;
  name: string;
  chair_label: string | null;
  is_active: boolean;
  is_available_for_booking: boolean;
};

type SmartSlot = {
  start_at: string;
  end_at: string;
  label: string;
  available: boolean;
  freeChairsCount: number;
};

type CustomerBookingRow = Booking & {
  branch_id?: string | null;
  barber_id?: string | null;
};

function getUpcomingDates(count = 7): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = [];
  const base = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const label =
      i === 0
        ? `اليوم (${new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)})`
        : i === 1
        ? `غدًا (${new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)})`
        : new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
    list.push({ value: isoDate, label });
  }
  return list;
}

function bookingStatusBadge(status: Booking['status']): { label: string; cls: string } {
  switch (status) {
    case 'confirmed':
      return { label: 'مؤكد', cls: 'bg-emerald-100 text-emerald-700' };
    case 'pending':
      return { label: 'بانتظار تأكيد المحل', cls: 'bg-amber-100 text-amber-800' };
    case 'completed':
      return { label: 'تم الحضور والزيارة', cls: 'bg-blue-100 text-blue-700' };
    case 'cancelled':
      return { label: 'ملغي', cls: 'bg-stone-200 text-stone-600' };
    case 'no_show':
      return { label: 'لم يحضر بالموعد', cls: 'bg-red-100 text-red-700' };
  }
}

function CustomerBookingSection({
  customer,
  shopId,
  plans,
  activeSub,
  onBookingChanged,
}: {
  customer: Customer;
  shopId: string;
  plans: Plan[];
  activeSub: Subscription | null;
  onBookingChanged: () => void;
}) {
  const dates = getUpcomingDates(7);
  const [selectedDate, setSelectedDate] = useState<string>(dates[0].value);
  const [branches, setBranches] = useState<ShopBranchOption[]>([]);
  const [barbers, setBarbers] = useState<BarberOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedBarberId, setSelectedBarberId] = useState<string>('any');

  const [slots, setSlots] = useState<SmartSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [bookings, setBookings] = useState<CustomerBookingRow[]>([]);
  const [trust, setTrust] = useState<CustomerBookingTrust | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadBranchesAndBarbers = useCallback(async () => {
    try {
      const [brRes, barbRes] = await Promise.all([
        supabase
          .from('shop_branches')
          .select('id, name, address')
          .eq('shop_id', shopId)
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('barbers')
          .select('id, branch_id, name, chair_label, is_active, is_available_for_booking')
          .eq('shop_id', shopId)
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
      ]);

      const activeBranches = (brRes.data ?? []) as ShopBranchOption[];
      const activeBarbers = (barbRes.data ?? []) as BarberOption[];

      setBranches(activeBranches);
      setBarbers(activeBarbers);

      if (activeBranches.length > 0) {
        setSelectedBranchId((prev) =>
          activeBranches.some((b) => b.id === prev) ? prev : activeBranches[0].id
        );
      }
    } catch (e) {
      console.error('Failed loading branches/barbers:', e);
    }
  }, [shopId]);

  const loadBookingsAndTrust = useCallback(async () => {
    try {
      const [userBookings, trustInfo] = await Promise.all([
        getCustomerBookings(shopId, customer.id),
        evaluateCustomerBookingTrust(shopId, customer.id),
      ]);
      setBookings(userBookings as CustomerBookingRow[]);
      setTrust(trustInfo);
    } catch (e) {
      console.error('Failed loading bookings/trust:', e);
    }
  }, [shopId, customer.id]);

  const branchBarbers = useMemo(
    () =>
      barbers.filter(
        (b) =>
          b.is_active &&
          b.is_available_for_booking &&
          (!selectedBranchId || !b.branch_id || b.branch_id === selectedBranchId)
      ),
    [barbers, selectedBranchId]
  );

  const loadSlots = useCallback(
    async (dateStr: string) => {
      setLoadingSlots(true);
      try {
        const dayStart = new Date(`${dateStr}T00:00:00`);
        const dayEnd = new Date(`${dateStr}T23:59:59`);

        let query = supabase
          .from('bookings')
          .select('id, barber_id, branch_id, start_at, end_at, status')
          .eq('shop_id', shopId)
          .in('status', ['pending', 'confirmed'])
          .lt('start_at', dayEnd.toISOString())
          .gt('end_at', dayStart.toISOString());

        if (selectedBranchId) {
          query = query.eq('branch_id', selectedBranchId);
        }

        const { data: dayBookings, error } = await query;
        if (error) throw error;

        const activeBookings = dayBookings ?? [];
        const currentBranchBarbers = barbers.filter(
          (b) =>
            b.is_active &&
            b.is_available_for_booking &&
            (!selectedBranchId || !b.branch_id || b.branch_id === selectedBranchId)
        );

        const candidateBarbers =
          selectedBarberId !== 'any'
            ? currentBranchBarbers.filter((b) => b.id === selectedBarberId)
            : currentBranchBarbers;

        const now = new Date();
        const generated: SmartSlot[] = [];

        for (let hour = 11; hour < 23; hour += 1) {
          const slotStart = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
          const slotEnd = new Date(slotStart.getTime() + 60 * 60000);
          const isPast = slotStart.getTime() <= now.getTime();

          let freeChairsCount = 0;

          if (!isPast && candidateBarbers.length > 0) {
            for (const barber of candidateBarbers) {
              const isBarberBusy = activeBookings.some((bk) => {
                const sameBarber =
                  bk.barber_id === barber.id ||
                  (!bk.barber_id && candidateBarbers.length === 1);
                if (!sameBarber) return false;
                return (
                  new Date(bk.start_at).getTime() < slotEnd.getTime() &&
                  new Date(bk.end_at).getTime() > slotStart.getTime()
                );
              });
              if (!isBarberBusy) freeChairsCount += 1;
            }
          }

          const label = slotStart.toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
          });

          generated.push({
            start_at: slotStart.toISOString(),
            end_at: slotEnd.toISOString(),
            label,
            available: !isPast && freeChairsCount > 0,
            freeChairsCount,
          });
        }

        setSlots(generated);
        const firstAvail = generated.find((s) => s.available);
        setSelectedSlot((prev) =>
          generated.some((s) => s.start_at === prev && s.available)
            ? prev
            : firstAvail?.start_at ?? ''
        );
      } catch (e) {
        console.error('Failed loading smart slots:', e);
        try {
          const fallback = await getAvailableBookingSlots(shopId, dateStr, {
            startHour: 11,
            endHour: 23,
            slotMinutes: 60,
          });
          setSlots(
            fallback.map((s) => ({
              ...s,
              freeChairsCount: s.available ? 1 : 0,
            }))
          );
        } catch {
          setSlots([]);
        }
      } finally {
        setLoadingSlots(false);
      }
    },
    [shopId, selectedBranchId, selectedBarberId, barbers]
  );

  useEffect(() => {
    void loadBranchesAndBarbers();
    void loadBookingsAndTrust();
  }, [loadBranchesAndBarbers, loadBookingsAndTrust]);

  useEffect(() => {
    void loadSlots(selectedDate);
  }, [loadSlots, selectedDate]);

  const hasSub =
    activeSub?.status === 'active' &&
    activeSub.haircuts_used < (activeSub.plan?.haircut_count ?? 0);

  const chosenPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const serviceName = chosenPlan
    ? chosenPlan.name
    : hasSub && activeSub?.plan
    ? `حلاقة ضمن باقة (${activeSub.plan.name})`
    : 'حلاقة عادية';

  const barberMap = new Map(barbers.map((b) => [b.id, b]));
  const branchMap = new Map(branches.map((b) => [b.id, b]));

  const handleBook = async () => {
    if (!selectedSlot) {
      setFeedback({ type: 'err', text: 'اختر ميعادًا متاحًا أولًا.' });
      return;
    }

    if (branchBarbers.length === 0) {
      setFeedback({
        type: 'err',
        text: 'لا يوجد حلاقون متاحون حاليًا في هذا الفرع.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const startIso = selectedSlot;
      const endIso = new Date(new Date(startIso).getTime() + 60 * 60000).toISOString();
      const targetBranchId = selectedBranchId || branches[0]?.id || null;
      const requestedBarberId = selectedBarberId === 'any' ? null : selectedBarberId;

      const { data: assignedBarberId, error: assignErr } = await supabase.rpc(
        'assign_available_barber',
        {
          p_shop_id: shopId,
          p_branch_id: targetBranchId,
          p_barber_id: requestedBarberId,
          p_start_at: startIso,
          p_end_at: endIso,
        }
      );

      if (assignErr) {
        throw new Error(assignErr.message || 'الموعد اكتمل للتو، اختر موعدًا آخر.');
      }

      const created = await createCustomerBooking({
        shopId,
        customer,
        serviceName,
        planId: chosenPlan?.id ?? activeSub?.plan_id ?? null,
        startAt: startIso,
        durationMinutes: 60,
        notes,
      });

      if (created?.id) {
        await supabase
          .from('bookings')
          .update({
            branch_id: targetBranchId,
            barber_id: assignedBarberId,
          })
          .eq('id', created.id);
      }

      const assignedBarber = assignedBarberId ? barberMap.get(String(assignedBarberId)) : null;
      const assignedBranch = targetBranchId ? branchMap.get(targetBranchId) : null;

      setNotes('');
      await Promise.all([loadSlots(selectedDate), loadBookingsAndTrust()]);
      onBookingChanged();

      const placeSummary = [
        assignedBranch ? `الفرع: ${assignedBranch.name}` : null,
        assignedBarber ? `الحلاق: ${assignedBarber.name}` : null,
      ]
        .filter(Boolean)
        .join(' — ');

      setFeedback({
        type: 'ok',
        text:
          created.status === 'confirmed'
            ? `تم تأكيد حجزك تلقائيًا! رقم حجزك: ${created.booking_code} — الموعد: ${formatDateTime(created.start_at)}${placeSummary ? ` (${placeSummary})` : ''}`
            : `تم إرسال طلب حجزك برقم ${created.booking_code} وهو بانتظار تأكيد المحل${placeSummary ? ` (${placeSummary})` : ''}.`,
      });
    } catch (e) {
      setFeedback({
        type: 'err',
        text: e instanceof Error ? e.message : 'تعذر إتمام الحجز.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (booking: CustomerBookingRow) => {
    setCancellingId(booking.id);
    setFeedback(null);
    try {
      await updateBookingStatus(booking.id, 'cancelled');
      await Promise.all([loadSlots(selectedDate), loadBookingsAndTrust()]);
      onBookingChanged();
      setFeedback({
        type: 'ok',
        text: `تم إلغاء الحجز رقم ${booking.booking_code} وإتاحة الموعد لعملاء آخرين.`,
      });
    } catch (e) {
      setFeedback({
        type: 'err',
        text: e instanceof Error ? e.message : 'تعذر إلغاء الحجز.',
      });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div id="customer-booking" className="mt-6 scroll-mt-6 space-y-5">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-stone-900 text-amber-400">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-display text-xl font-extrabold text-stone-900">
                احجز موعدك الآن
              </h3>
              <p className="text-xs text-stone-500">
                اختر اليوم والوقت المتاح واحصل على رقم حجز خاص بك فورًا
              </p>
            </div>
          </div>

          {trust && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                trust.isTrusted
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {trust.trustBadge}
            </span>
          )}
        </div>

        {trust && !trust.canBook ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {trust.blockReason}
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {branches.length > 1 && (
              <div>
                <label className="mb-2 block text-xs font-extrabold text-stone-700">
                  اختر الفرع
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {branches.map((br) => {
                    const activeBranch = selectedBranchId === br.id;
                    return (
                      <button
                        key={br.id}
                        type="button"
                        onClick={() => {
                          setSelectedBranchId(br.id);
                          setSelectedBarberId('any');
                        }}
                        className={`rounded-xl border p-3 text-right transition ${
                          activeBranch
                            ? 'border-stone-900 bg-stone-900 text-white'
                            : 'border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100'
                        }`}
                      >
                        <p className="text-xs font-extrabold">{br.name}</p>
                        {br.address && (
                          <p
                            className={`mt-0.5 text-[11px] ${
                              activeBranch ? 'text-stone-300' : 'text-stone-500'
                            }`}
                          >
                            {br.address}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {branchBarbers.length > 1 && (
              <div>
                <label className="mb-2 block text-xs font-extrabold text-stone-700">
                  اختر الحلاق / الكرسي
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBarberId('any')}
                    className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                      selectedBarberId === 'any'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    أقرب حلاق متاح ({branchBarbers.length})
                  </button>
                  {branchBarbers.map((barber) => {
                    const activeBarber = selectedBarberId === barber.id;
                    return (
                      <button
                        key={barber.id}
                        type="button"
                        onClick={() => setSelectedBarberId(barber.id)}
                        className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                          activeBarber
                            ? 'border-stone-900 bg-stone-900 text-white'
                            : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {barber.name}
                        {barber.chair_label ? ` (${barber.chair_label})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-extrabold text-stone-700">
                1. اختر اليوم
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {dates.map((d) => {
                  const activeDay = selectedDate === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setSelectedDate(d.value)}
                      className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                        activeDay
                          ? 'border-stone-900 bg-stone-900 text-white'
                          : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-extrabold text-stone-700">
                  2. اختر الوقت المتاح (المواعيد المحجوزة بالكامل مغلقة)
                </label>
                {loadingSlots && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
              </div>

              {branchBarbers.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-xs font-bold text-amber-800">
                  جميع الحلاقين في إجازة حاليًا. يرجى المحاولة لاحقًا أو اختيار فرع آخر.
                </div>
              ) : loadingSlots ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="h-11 animate-shimmer rounded-xl" />
                  ))}
                </div>
              ) : slots.every((s) => !s.available) ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center text-xs font-bold text-stone-500">
                  جميع الكراسي محجوزة في هذا اليوم. جرّب يومًا آخر.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot === slot.start_at && slot.available;
                    return (
                      <button
                        key={slot.start_at}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedSlot(slot.start_at)}
                        className={`rounded-xl border px-3 py-2.5 text-center text-xs font-bold transition ${
                          !slot.available
                            ? 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400 line-through'
                            : isSelected
                            ? 'border-amber-600 bg-amber-600 text-white shadow-sm'
                            : 'border-stone-200 bg-white text-stone-800 hover:border-amber-500 hover:bg-amber-50/50'
                        }`}
                      >
                        <div>{slot.label}</div>
                        {slot.available && branchBarbers.length > 1 && selectedBarberId === 'any' && (
                          <div
                            className={`mt-0.5 text-[10px] ${
                              isSelected ? 'text-amber-100' : 'text-emerald-700'
                            }`}
                          >
                            متاح {slot.freeChairsCount} كرسي
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-extrabold text-stone-700">
                  3. الخدمة أو الباقة
                </label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500"
                >
                  <option value="">
                    {hasSub && activeSub?.plan
                      ? `حلاقة ضمن باقتي النشطة (${activeSub.plan.name})`
                      : 'حلاقة عادية'}
                  </option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatPrice(Number(p.price))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-extrabold text-stone-700">
                  ملاحظات للحلاق (اختياري)
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: تدرج متوسط + تهذيب لحية"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {feedback && (
              <div
                className={`rounded-xl border p-3.5 text-xs font-bold ${
                  feedback.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {feedback.text}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleBook()}
              disabled={submitting || !selectedSlot}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ticket className="h-4 w-4" />
              )}
              {submitting ? 'جارٍ تأكيد الحجز...' : 'تأكيد الحجز وإصدار رقم الحجز'}
            </button>
          </div>
        )}
      </div>

      {/* Customer's bookings list */}
      {bookings.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h4 className="mb-3 flex items-center gap-2 font-extrabold text-stone-900">
            <Ticket className="h-4 w-4 text-amber-600" />
            حجوزاتي ({bookings.length})
          </h4>
          <div className="space-y-2.5">
            {bookings.map((b) => {
              const badge = bookingStatusBadge(b.status);
              const canCancel = b.status === 'pending' || b.status === 'confirmed';
              const bBranch = b.branch_id ? branchMap.get(b.branch_id) : null;
              const bBarber = b.barber_id ? barberMap.get(b.barber_id) : null;

              return (
                <div
                  key={b.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-stone-900 px-2.5 py-0.5 font-mono text-xs font-extrabold text-amber-400">
                        {b.booking_code}
                      </span>
                      <span className="text-sm font-extrabold text-stone-900">
                        {b.service_name}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-600">
                      الموعد: {formatDateTime(b.start_at)}
                      {bBranch && branches.length > 1 ? ` · الفرع: ${bBranch.name}` : ''}
                      {bBarber ? ` · الحلاق: ${bBarber.name}` : ''}
                    </p>
                    {b.notes && (
                      <p className="mt-1 text-xs text-stone-500">ملاحظة: {b.notes}</p>
                    )}
                  </div>

                  {canCancel && (
                    <button
                      type="button"
                      disabled={cancellingId === b.id}
                      onClick={() => void handleCancelBooking(b)}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {cancellingId === b.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      إلغاء الحجز
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
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

function HairConsultation({ customer, shopId }: { customer: Customer; shopId: string }) {
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
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <Camera className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-stone-900">{t('consult.title')}</h3>
            <p className="text-xs text-stone-500">{t('consult.subtitle')}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{t('consult.intro')}</p>
        <button onClick={() => setStep('hair')} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-700">
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
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 bg-stone-900 p-4 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" /><span className="font-extrabold">{t('consult.result')}</span>
        </div>
      </div>
      <div className="p-5">
        {result && (
          <>
            <h3 className="font-display text-2xl font-extrabold text-stone-900">{L ? result.name_ar : result.name_en}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{L ? result.desc_ar : result.desc_en}</p>
            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-bold text-stone-500">{t('consult.summary')}</p>
              <p className="mt-1 text-xs font-bold text-stone-700">
                {L ? `شعر ${hair === 'straight' ? 'أملس' : hair === 'wavy' ? 'مموج' : hair === 'curly' ? 'مجعد' : 'كيرلي'}` : `Hair: ${hair}`}
                {' • '}
                {L ? `وجه ${face === 'oval' ? 'بيضاوي' : face === 'round' ? 'دائري' : face === 'square' ? 'مربع' : 'طويل'}` : `Face: ${face}`}
                {' • '}
                {L ? `أسلوب ${style === 'classic' ? 'كلاسيكي' : style === 'modern' ? 'عصري' : style === 'bold' ? 'جريء' : 'سهل'}` : `Style: ${style}`}
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
              <Info className="h-3.5 w-3.5 shrink-0 text-amber-600" /> {t('consult.disclaimer')}
            </div>
            <button onClick={reset} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100">
              <ChevronLeft className="h-4 w-4" /> {t('consult.newConsult')}
            </button>
            <SmartHairPhotoAssistant
              customer={customer}
              shopId={shopId}
              hairType={hair ?? ''}
              faceShape={face ?? ''}
              stylePreference={style ?? ''}
            />
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
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-stone-900 text-amber-400">{icon}</div>
        <h3 className="font-extrabold text-stone-900">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <button key={o.value} onClick={() => onSelect(o.value)}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition ${
              selected === o.value ? 'border-amber-600 bg-amber-50 text-amber-900' : 'border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100'
            }`}>
            <span className="text-2xl">{o.emoji}</span>
            <span className="text-sm font-bold">{o.label}</span>
          </button>
        ))}
      </div>
      <button onClick={onBack} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-stone-500 hover:text-stone-800">
        <ChevronLeft className="h-4 w-4" /> {t('cust.back')}
      </button>
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
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-stone-200 bg-stone-50 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
          <Gift className="h-5 w-5" />
        </div>
        <div>
          <p className="font-extrabold text-stone-900">{t('referral.title')}</p>
          <p className="text-xs text-stone-500">{t('referral.desc')}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-center font-display text-lg font-extrabold tracking-wider text-stone-900" dir="ltr">
            {code}
          </div>
          <button onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-3 text-xs font-bold text-white transition hover:bg-stone-700">
            {copied ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> {t('referral.copied')}</> : <><Copy className="h-4 w-4" /> {t('referral.copy')}</>}
          </button>
        </div>
        <p className="text-xs text-stone-500">{t('referral.share')}</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-stone-200/80 bg-stone-50 p-3 text-center">
            <Users className="mx-auto h-4 w-4 text-stone-400" />
            <p className="mt-1 font-display text-xl font-extrabold text-stone-900">0</p>
            <p className="text-[10px] font-bold text-stone-500">{t('referral.invited')}</p>
          </div>
          <div className="rounded-xl border border-stone-200/80 bg-stone-50 p-3 text-center">
            <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
            <p className="mt-1 font-display text-xl font-extrabold text-stone-900">0</p>
            <p className="text-[10px] font-bold text-stone-500">{t('referral.joined')}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <Gift className="mx-auto h-4 w-4 text-amber-600" />
            <p className="mt-1 font-display text-xl font-extrabold text-amber-900">0</p>
            <p className="text-[10px] font-bold text-amber-700">{t('referral.earned')}</p>
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
      color: 'text-amber-700', bg: 'bg-amber-50/70 border-amber-200',
    });
  }
  offers.push({
    icon: Gift, title: t('offers.refer'), desc: t('offers.referDesc'),
    color: 'text-emerald-700', bg: 'bg-emerald-50/70 border-emerald-200',
  });
  if (totalVisits >= 10 && totalVisits < 20) {
    offers.push({
      icon: Zap, title: t('offers.vip'), desc: t('offers.vipDesc'),
      color: 'text-amber-700', bg: 'bg-stone-50 border-stone-200',
    });
  }

  if (offers.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-extrabold text-stone-900">{t('offers.title')}</h3>
      {offers.map((o, i) => (
        <div key={i} className={`flex items-start gap-3 rounded-2xl border p-4 shadow-sm ${o.bg}`}>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-white ${o.color}`}>
            <o.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-[11px] font-bold text-white">{t('offers.badge')}</span>
            </div>
            <p className="mt-1.5 font-extrabold text-stone-900">{o.title}</p>
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
  const [loadError, setLoadError] = useState(false);

  const loadCustomerData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const [s, v, p, shopData] = await Promise.all([
        getActiveSubscription(customer.id),
        getVisitsByCustomer(customer.id),
        getPlans(shopId),
        getShopById(shopId),
      ]);

      setSub(s);
      setVisits(v);
      setPlans(p);
      setShop(shopData);
    } catch (error) {
      console.error('Customer page data loading failed:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [customer.id, shopId]);

  useEffect(() => {
    void loadCustomerData();
  }, [loadCustomerData]);

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

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
          تعذر تحميل بيانات حسابك حاليًا. من فضلك حاول مرة أخرى.
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-700"
        >
          إعادة المحاولة
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 text-sm font-bold text-stone-500 underline"
        >
          تسجيل الخروج
        </button>
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

  const packageItems = plans.filter((p) => p.item_type !== 'service');
  const serviceItems = plans.filter((p) => p.item_type === 'service');

  const loyaltyLevel =
    totalVisits >= 20 ? { label: t('cust.level.gold'), icon: Crown, tone: 'text-amber-600', bg: 'bg-amber-50' } :
    totalVisits >= 10 ? { label: t('cust.level.silver'), icon: Medal, tone: 'text-stone-700', bg: 'bg-stone-100' } :
    totalVisits >= 5 ? { label: t('cust.level.bronze'), icon: Award, tone: 'text-amber-700', bg: 'bg-amber-50/70' } :
    { label: t('cust.level.new'), icon: User, tone: 'text-stone-600', bg: 'bg-stone-100' };
  const LoyaltyIcon = loyaltyLevel.icon;

  return (
    <div id="customer-top" className="customer-page animate-fade-in mx-auto min-h-screen max-w-6xl bg-stone-50 px-4 pb-28 pt-5 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-100">
          <LogOut className="h-4 w-4" /> {t('cust.logout')}
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-500 shadow-sm">
          <Lock className="h-3.5 w-3.5 text-amber-600" /> {t('cust.secure')}
        </span>
      </div>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="relative flex items-center gap-4 border-b border-stone-200 bg-stone-50 px-5 py-6 text-stone-900 sm:px-7">
          <div className="grid h-[68px] w-[68px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-stone-200 bg-white font-display text-2xl font-extrabold text-stone-900 shadow-sm">
            {shop?.logo_url ? (
              <img src={shop.logo_url} alt={shop.shop_name || shopName || 'Shop logo'} className="h-full w-full object-contain p-1.5" />
            ) : (
              (shopName || customer.name).charAt(0)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[11px] font-bold tracking-wide text-amber-700">{L ? 'أهلاً بيك في' : 'WELCOME TO'}</p>
            <h2 className="truncate font-display text-2xl font-extrabold text-stone-900">{customer.name}</h2>
            <p className="mt-1 text-sm text-stone-500">
              {shop?.shop_name || shopName ? `${shop?.shop_name || shopName} • ` : ''}{t('cust.customerSince')} {formatDate(customer.created_at)}
            </p>
            {shop && (
              <p className="mt-2 inline-flex rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                {lang === 'ar' ? 'سعر الحلاقة العادية:' : 'Regular haircut:'} {formatPrice(Number(shop.regular_haircut_price ?? 50))}
              </p>
            )}
          </div>
        </div>

        {/* Subscription status */}
        <div className="bg-white p-4 sm:p-5">
          <div className={`rounded-xl border p-4 ${active ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200 bg-stone-50'}`}>
            <div className="flex items-center gap-2">
              {active ? <CheckCircle2 className="h-6 w-6 text-emerald-700" /> : <XCircle className="h-6 w-6 text-stone-400" />}
              <div>
                <p className="font-extrabold text-stone-900">{active ? t('cust.subActive') : t('cust.subInactive')}</p>
                <p className="text-xs text-stone-500">
                  {active ? `${sub?.plan?.name ?? ''} — ${t('cust.subEnds')} ${formatDate(sub?.end_date ?? '')}` : t('cust.subAskBarber')}
                </p>
              </div>
            </div>
            {active && sub?.plan?.description && (
              <p className="mt-2.5 whitespace-pre-line rounded-xl border border-stone-200/80 bg-white p-3 text-xs leading-relaxed text-stone-700">
                {sub.plan.description}
              </p>
            )}
            {active && sub && (
              <>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-bold text-stone-600">
                    <span>{t('cust.used')}</span><span>{sub.haircuts_used} / {sub.plan?.haircut_count}</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                      style={{ width: `${Math.min(100, (sub.haircuts_used / (sub.plan?.haircut_count ?? 1)) * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-emerald-700">{remaining} {t('cust.remainingIn')}</p>
                </div>
                <div className={`mt-3 flex items-center gap-1.5 rounded-xl p-2.5 text-xs font-bold ${
                  daysLeft <= 3 ? 'bg-red-50 text-red-700' : daysLeft <= 7 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {daysLeft <= 3 ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  {daysLeft > 0 ? `${t('cust.expiresIn')} ${daysLeft} ${t('cust.days')}` : t('cust.expired')}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Smart Booking Section */}
      <CustomerBookingSection
        customer={customer}
        shopId={shopId}
        plans={plans}
        activeSub={sub}
        onBookingChanged={() => void loadCustomerData()}
      />

      <WhatsAppConsentPanel customerName={customer.name} phone={customer.phone} />

      {/* Hair consultation */}
      <div id="hair-consultation" className="mt-6 scroll-mt-6"><HairConsultation customer={customer} shopId={shopId} /></div>

      {/* Secondary customer information */}
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)]">
        <div className="space-y-5">
          {/* Offers */}
          <OffersWidget totalVisits={totalVisits} active={active} daysLeft={daysLeft} />

          {/* Loyalty */}
          <div id="loyalty" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`grid h-12 w-12 place-items-center rounded-xl border border-stone-200/80 ${loyaltyLevel.bg}`}>
                  <LoyaltyIcon className={`h-6 w-6 ${loyaltyLevel.tone}`} />
                </div>
                <div>
                  <p className="font-extrabold text-stone-900">{t('cust.loyalty')}: {loyaltyLevel.label}</p>
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
                    className={`rounded-xl py-2 text-center text-[11px] font-bold transition ${
                      reached ? 'bg-stone-900 text-amber-400' : 'bg-stone-100 text-stone-400'
                    }`}>
                    {lvl.label}{i < 3 && <span className="mr-1 text-stone-400">›</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-sm">
              <CalendarCheck className="mx-auto h-5 w-5 text-emerald-700" />
              <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{subscriptionVisits}</p>
              <p className="text-[11px] font-bold text-stone-500">{t('cust.subVisits')}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-sm">
              <Scissors className="mx-auto h-5 w-5 text-amber-600" />
              <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{visits.length - subscriptionVisits}</p>
              <p className="text-[11px] font-bold text-stone-500">{t('cust.regVisits')}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-sm">
              <Coins className="mx-auto h-5 w-5 text-amber-600" />
              <p className="mt-1 font-display text-xl font-extrabold text-stone-900">{formatPrice(totalPaid)}</p>
              <p className="text-[11px] font-bold text-stone-500">{t('cust.totalPaid')}</p>
            </div>
          </div>

          {/* Plans & Services with full description */}
          {packageItems.length > 0 && (
            <div id="plans" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 font-extrabold text-stone-900">{t('cust.plansTitle')}</h3>
              <div className="space-y-2.5">
                {packageItems.map((p) => (
                  <div key={p.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-stone-900">{p.name}</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {p.haircut_count} {t('cust.haircuts')} • {p.duration_days} {t('home.days')}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-amber-200">{formatPrice(p.price)}</span>
                    </div>
                    {p.description && (
                      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-stone-600">
                        {p.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {serviceItems.length > 0 && (
            <div id="services" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 font-extrabold text-stone-900">
                {L ? 'الخدمات العادية المتاحة' : 'Available Services'}
              </h3>
              <div className="space-y-2.5">
                {serviceItems.map((s) => (
                  <div key={s.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-extrabold text-stone-900">{s.name}</p>
                      <span className="shrink-0 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-amber-200">{formatPrice(s.price)}</span>
                    </div>
                    {s.description && (
                      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-stone-600">
                        {s.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          {/* Referral */}
          <div id="rewards" className="scroll-mt-6"><ReferralWidget customerName={customer.name} /></div>

          {/* Visit history */}
          <div id="visit-history" className="scroll-mt-6">
            <h3 className="mb-3 font-display text-lg font-extrabold text-stone-900">{t('cust.history')}</h3>
            {visits.length === 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500 shadow-sm">{t('cust.noVisits')}</div>
            ) : (
              <div className="space-y-2">
                {visits.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      v.payment_type === 'subscription' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    }`}>
                      {v.payment_type === 'subscription' ? <CheckCircle2 className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-stone-900">{v.haircut_type ?? t('cust.haircut')}</p>
                      <p className="flex items-center gap-1 text-xs text-stone-500">
                        <Clock className="h-3 w-3" /> {formatDateTime(v.visit_date)}
                      </p>
                    </div>
                    {v.payment_type === 'subscription' ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{t('cust.subscription')}</span>
                    ) : (
                      <span className="font-extrabold text-amber-700">{formatPrice(Number(v.charge_amount))}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <nav aria-label={L ? 'تنقل صفحة العميل' : 'Customer navigation'} className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 shadow-sm backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          <button type="button" onClick={() => document.getElementById('customer-top')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold text-stone-700 transition hover:bg-stone-100">
            <Store className="h-5 w-5 text-stone-800" />{L ? 'الرئيسية' : 'Home'}
          </button>
          <button type="button" onClick={() => document.getElementById('customer-booking')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold text-stone-700 transition hover:bg-stone-100">
            <Calendar className="h-5 w-5 text-amber-600" />{L ? 'الحجز' : 'Book'}
          </button>
          <button type="button" onClick={() => document.getElementById('visit-history')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold text-stone-700 transition hover:bg-stone-100">
            <CalendarCheck className="h-5 w-5 text-stone-800" />{L ? 'زياراتي' : 'Visits'}
          </button>
          <button type="button" onClick={() => document.getElementById('rewards')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold text-stone-700 transition hover:bg-stone-100">
            <Gift className="h-5 w-5 text-amber-600" />{L ? 'المكافآت' : 'Rewards'}
          </button>
        </div>
      </nav>
    </div>
  );
}