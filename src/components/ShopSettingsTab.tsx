import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Pencil,
  X,
  Power,
  Package,
  Scissors,
  Building2,
  UserCheck,
  MapPin,
} from 'lucide-react';
import {
  supabase,
  type Plan,
  type PlanItemType,
  type Shop,
} from '@/lib/supabase';
import {
  getShopById,
  updateShopSettings,
  uploadShopLogo,
} from '@/lib/shopApi';
import { formatPrice } from '@/lib/api';

type Props = {
  shopId: string;
  onUpdated: (shop: Shop) => void;
};

type ShopBranch = {
  id: string;
  shop_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at?: string;
};

type BarberChair = {
  id: string;
  shop_id: string;
  branch_id: string | null;
  name: string;
  chair_label: string | null;
  is_active: boolean;
  is_available_for_booking: boolean;
  created_at?: string;
};

type PlanFormState = {
  item_type: PlanItemType;
  name: string;
  description: string;
  haircut_count: string;
  price: string;
  duration_days: string;
};

const emptyPlan: PlanFormState = {
  item_type: 'package',
  name: '',
  description: '',
  haircut_count: '1',
  price: '',
  duration_days: '30',
};

export default function ShopSettingsTab({ shopId, onUpdated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [shop, setShop] = useState<Shop | null>(null);
  const [price, setPrice] = useState('50');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlan);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [branches, setBranches] = useState<ShopBranch[]>([]);
  const [barbers, setBarbers] = useState<BarberChair[]>([]);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchSaving, setBranchSaving] = useState(false);

  const [barberName, setBarberName] = useState('');
  const [chairLabel, setChairLabel] = useState('');
  const [barberBranchId, setBarberBranchId] = useState<string>('');
  const [barberSaving, setBarberSaving] = useState(false);
  const [togglingBarberId, setTogglingBarberId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [shopData, plansResult, branchesResult, barbersResult] = await Promise.all([
        getShopById(shopId),
        supabase
          .from('plans')
          .select('*')
          .eq('shop_id', shopId)
          .order('price', { ascending: true }),
        supabase
          .from('shop_branches')
          .select('*')
          .eq('shop_id', shopId)
          .order('created_at', { ascending: true }),
        supabase
          .from('barbers')
          .select('*')
          .eq('shop_id', shopId)
          .order('created_at', { ascending: true }),
      ]);

      if (plansResult.error) throw plansResult.error;
      if (branchesResult.error) throw branchesResult.error;
      if (barbersResult.error) throw barbersResult.error;

      const loadedBranches = (branchesResult.data ?? []) as ShopBranch[];
      setShop(shopData);
      setPrice(String(shopData?.regular_haircut_price ?? 50));
      setPlans((plansResult.data ?? []) as Plan[]);
      setBranches(loadedBranches);
      setBarbers((barbersResult.data ?? []) as BarberChair[]);

      if (loadedBranches.length > 0) {
        setBarberBranchId((prev) =>
          loadedBranches.some((b) => b.id === prev) ? prev : loadedBranches[0].id
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'تعذر تحميل إعدادات المحل.'
      );
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addBranch = async () => {
    if (!branchName.trim()) {
      setError('أدخل اسم الفرع أولًا.');
      return;
    }

    setBranchSaving(true);
    setError('');
    setMessage('');

    try {
      const { error: insertErr } = await supabase.from('shop_branches').insert({
        shop_id: shopId,
        name: branchName.trim(),
        address: branchAddress.trim() || null,
        phone: branchPhone.trim() || null,
        is_active: true,
      });

      if (insertErr) throw insertErr;

      setBranchName('');
      setBranchAddress('');
      setBranchPhone('');
      await load();
      setMessage('تمت إضافة الفرع بنجاح.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إضافة الفرع.');
    } finally {
      setBranchSaving(false);
    }
  };

  const addBarber = async () => {
    if (!barberName.trim()) {
      setError('أدخل اسم الحلاق أو الكرسي أولًا.');
      return;
    }

    setBarberSaving(true);
    setError('');
    setMessage('');

    try {
      const resolvedBranchId = barberBranchId || branches[0]?.id || null;
      const nextChairNumber = barbers.length + 1;

      const { error: insertErr } = await supabase.from('barbers').insert({
        shop_id: shopId,
        branch_id: resolvedBranchId,
        name: barberName.trim(),
        chair_label: chairLabel.trim() || `كرسي ${nextChairNumber}`,
        is_active: true,
        is_available_for_booking: true,
      });

      if (insertErr) throw insertErr;

      setBarberName('');
      setChairLabel('');
      await load();
      setMessage('تمت إضافة الحلاق / الكرسي بنجاح.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إضافة الحلاق.');
    } finally {
      setBarberSaving(false);
    }
  };

  const toggleBarberAvailability = async (barber: BarberChair) => {
    setTogglingBarberId(barber.id);
    setError('');
    setMessage('');

    try {
      const nextAvailable = !barber.is_available_for_booking;
      const { error: updateErr } = await supabase
        .from('barbers')
        .update({ is_available_for_booking: nextAvailable })
        .eq('id', barber.id)
        .eq('shop_id', shopId);

      if (updateErr) throw updateErr;

      setBarbers((prev) =>
        prev.map((b) =>
          b.id === barber.id ? { ...b, is_available_for_booking: nextAvailable } : b
        )
      );
      setMessage(
        nextAvailable
          ? `تم تفعيل حجز (${barber.name}) كمتاح.`
          : `تم تسجيل (${barber.name}) كإجازة / غير متاح للحجز.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحديث حالة الحلاق.');
    } finally {
      setTogglingBarberId(null);
    }
  };

  const savePrice = async () => {
    const value = Number(price);

    if (!Number.isFinite(value) || value < 0) {
      setError('أدخل سعرًا صحيحًا أكبر من أو يساوي صفر.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const updated = await updateShopSettings(shopId, {
        regular_haircut_price: value,
      });

      setShop(updated);
      onUpdated(updated);
      setMessage('تم حفظ سعر الحلاقة بنجاح.');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'تعذر حفظ السعر.'
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file?: File) => {
    if (!file) return;

    setUploading(true);
    setError('');
    setMessage('');

    try {
      const updated = await uploadShopLogo(shopId, file);

      setShop(updated);
      onUpdated(updated);
      setMessage('تم تحديث لوجو المحل بنجاح.');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'تعذر رفع اللوجو.'
      );
    } finally {
      setUploading(false);

      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };

  const handleTypeChange = (nextType: PlanItemType) => {
    setPlanForm((prev) => ({
      ...prev,
      item_type: nextType,
      haircut_count: nextType === 'service' ? '1' : prev.haircut_count || '4',
      duration_days: nextType === 'service' ? '1' : prev.duration_days || '30',
    }));
  };

  const savePlan = async () => {
    const isService = planForm.item_type === 'service';
    const haircut_count = isService ? 1 : Number(planForm.haircut_count);
    const priceValue = Number(planForm.price);
    const duration_days = isService ? 1 : Number(planForm.duration_days);

    if (
      !planForm.name.trim() ||
      !Number.isInteger(haircut_count) ||
      haircut_count < 1 ||
      !Number.isFinite(priceValue) ||
      priceValue < 0 ||
      !Number.isInteger(duration_days) ||
      duration_days < 1
    ) {
      setError(
        isService
          ? 'راجع اسم الخدمة والسعر.'
          : 'راجع اسم الباقة وعدد الحلاقات والسعر والمدة.'
      );
      return;
    }

    setPlanSaving(true);
    setError('');
    setMessage('');

    const payload = {
      item_type: planForm.item_type,
      name: planForm.name.trim(),
      description: planForm.description.trim() || null,
      haircut_count,
      price: priceValue,
      duration_days,
      shop_id: shopId,
      is_active: true,
    };

    try {
      const result = editingId
        ? await supabase
            .from('plans')
            .update(payload)
            .eq('id', editingId)
            .eq('shop_id', shopId)
        : await supabase
            .from('plans')
            .insert(payload);

      if (result.error) throw result.error;

      setPlanForm(emptyPlan);
      setEditingId(null);

      await load();

      setMessage(
        editingId
          ? isService
            ? 'تم تعديل الخدمة.'
            : 'تم تعديل الباقة.'
          : isService
          ? 'تمت إضافة الخدمة.'
          : 'تمت إضافة الباقة.'
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'تعذر الحفظ.'
      );
    } finally {
      setPlanSaving(false);
    }
  };

  const editPlan = (plan: Plan) => {
    const resolvedType: PlanItemType =
      plan.item_type === 'service' ? 'service' : 'package';

    setEditingId(plan.id);

    setPlanForm({
      item_type: resolvedType,
      name: plan.name,
      description: plan.description ?? '',
      haircut_count: String(plan.haircut_count),
      price: String(plan.price),
      duration_days: String(plan.duration_days),
    });

    setError('');
    setMessage('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPlanForm(emptyPlan);
  };

  const togglePlan = async (plan: Plan) => {
    setError('');
    setMessage('');
    const isService = plan.item_type === 'service';

    const { error: updateError } = await supabase
      .from('plans')
      .update({ is_active: !plan.is_active })
      .eq('id', plan.id)
      .eq('shop_id', shopId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(
      plan.is_active
        ? isService
          ? 'تم إيقاف الخدمة.'
          : 'تم إيقاف الباقة.'
        : isService
        ? 'تم تفعيل الخدمة.'
        : 'تم تفعيل الباقة.'
    );

    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-stone-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        جارٍ تحميل إعدادات المحل...
      </div>
    );
  }

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const availableBarbersCount = barbers.filter(
    (b) => b.is_active && b.is_available_for_booking
  ).length;

  const isEditingService = planForm.item_type === 'service';
  const packagesList = plans.filter((p) => p.item_type !== 'service');
  const servicesList = plans.filter((p) => p.item_type === 'service');

  const renderPlanCard = (item: Plan) => {
    const isService = item.item_type === 'service';

    return (
      <div
        key={item.id}
        className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 p-4 sm:flex-row sm:items-center"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-extrabold text-stone-900">
              {item.name}
            </h4>

            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
              {isService ? 'خدمة عادية' : 'باقة'}
            </span>

            <span
              className={`rounded-full px-2 py-1 text-xs font-bold ${
                item.is_active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-stone-100 text-stone-500'
              }`}
            >
              {item.is_active ? 'نشطة' : 'متوقفة'}
            </span>
          </div>

          {item.description && (
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-stone-600">
              {item.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold text-stone-600">
            <span>{formatPrice(Number(item.price))}</span>
            {!isService && (
              <>
                <span>{item.haircut_count} حلاقة</span>
                <span>{item.duration_days} يوم</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => editPlan(item)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50"
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </button>

          <button
            type="button"
            onClick={() => void togglePlan(item)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50"
          >
            <Power className="h-4 w-4" />
            {item.is_active ? 'إيقاف' : 'تفعيل'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-extrabold text-stone-900">
          إعدادات المحل
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          إدارة هوية المحل والأسعار والباقات والخدمات والفروع والحلاقين والكراسي.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {/* الفروع والحلاقين / الكراسي */}
      <section className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-amber-600" />
            <div>
              <h3 className="font-extrabold text-stone-900">
                الفروع والحلاقين / الكراسي
              </h3>
              <p className="text-xs text-stone-500">
                عرّف عدد الحلاقين/الكراسي وحالة كل حلاق (متاح أو إجازة) ليحسب النظام الطاقة المتاحة بدقة.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-extrabold">
            <span className="rounded-lg bg-stone-100 px-3 py-1.5 text-stone-800">
              الفروع: {branches.length}
            </span>
            <span className="rounded-lg bg-stone-100 px-3 py-1.5 text-stone-800">
              إجمالي الكراسي/الحلاقين: {barbers.length}
            </span>
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-200">
              المتاح حاليًا: {availableBarbersCount}
            </span>
          </div>
        </div>

        {/* إضافة حلاق / كرسي */}
        <div className="rounded-xl border border-stone-200/80 bg-stone-50 p-4">
          <h4 className="mb-3 text-sm font-extrabold text-stone-800">
            إضافة حلاق / كرسي جديد
          </h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <input
              value={barberName}
              onChange={(e) => setBarberName(e.target.value)}
              placeholder="اسم الحلاق (مثال: كريم)"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={chairLabel}
              onChange={(e) => setChairLabel(e.target.value)}
              placeholder="رقم/اسم الكرسي (مثال: كرسي 2)"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
            />
            <select
              value={barberBranchId}
              onChange={(e) => setBarberBranchId(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
            >
              {branches.map((br) => (
                <option key={br.id} value={br.id}>
                  {br.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void addBarber()}
              disabled={barberSaving}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {barberSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              إضافة حلاق
            </button>
          </div>

          {/* قائمة الحلاقين وحالة متاح / إجازة */}
          <div className="mt-4 space-y-2">
            {barbers.map((barber) => {
              const branchLabel = barber.branch_id
                ? branchNameById.get(barber.branch_id) ?? 'الفرع الرئيسي'
                : 'الفرع الرئيسي';
              const isAvail = barber.is_active && barber.is_available_for_booking;

              return (
                <div
                  key={barber.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-stone-900">
                        {barber.name}
                      </span>
                      {barber.chair_label && (
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-700">
                          {barber.chair_label}
                        </span>
                      )}
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                        {branchLabel}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isAvail
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-red-50 text-red-700 ring-1 ring-red-200'
                        }`}
                      >
                        {isAvail ? 'متاح للحجز' : 'إجازة / غير متاح'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={togglingBarberId === barber.id}
                    onClick={() => void toggleBarberAvailability(barber)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition disabled:opacity-50 ${
                      isAvail
                        ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                    }`}
                  >
                    {togglingBarberId === barber.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="h-3.5 w-3.5" />
                    )}
                    {isAvail ? 'تسجيل إجازة اليوم' : 'تفعيل كمتاح'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* إضافة فرع */}
        <div className="rounded-xl border border-stone-200/80 bg-stone-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-stone-700" />
            <h4 className="text-sm font-extrabold text-stone-800">
              إدارة الفروع (للمحلات متعددة الفروع)
            </h4>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="اسم الفرع (مثال: فرع سموحة)"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={branchAddress}
              onChange={(e) => setBranchAddress(e.target.value)}
              placeholder="عنوان الفرع (اختياري)"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={branchPhone}
              onChange={(e) => setBranchPhone(e.target.value)}
              placeholder="رقم هاتف الفرع (اختياري)"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => void addBranch()}
              disabled={branchSaving}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {branchSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              إضافة فرع
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {branches.map((br) => (
              <div
                key={br.id}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs"
              >
                <div>
                  <p className="font-extrabold text-stone-900">{br.name}</p>
                  {br.address && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-stone-500">
                      <MapPin className="h-3 w-3" />
                      {br.address}
                    </p>
                  )}
                </div>
                <span className="rounded-md bg-stone-100 px-2 py-0.5 font-bold text-stone-700">
                  {barbers.filter((b) => b.branch_id === br.id).length} كرسي/حلاق
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ImagePlus className="h-5 w-5 text-amber-600" />
          <h3 className="font-extrabold text-stone-900">
            لوجو المحل
          </h3>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
            {shop?.logo_url ? (
              <img
                src={shop.logo_url}
                alt={shop.shop_name}
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <ImagePlus className="h-8 w-8 text-stone-300" />
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="font-bold text-stone-900">
                {shop?.shop_name}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                اختر صورة اللوجو التي ستظهر لعملاء المحل.
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                void uploadLogo(e.target.files?.[0]);
              }}
            />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-stone-700 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {uploading ? 'جارٍ رفع اللوجو...' : 'اختيار لوجو'}
            </button>

            <p className="text-xs text-stone-400">
              PNG أو JPG أو WEBP، بحد أقصى 2 ميجابايت.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Save className="h-5 w-5 text-amber-600" />
          <h3 className="font-extrabold text-stone-900">
            سعر الحلاقة العادية
          </h3>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-2 block text-sm font-bold text-stone-600">
              السعر بالجنيه المصري
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="button"
            onClick={() => void savePrice()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ السعر
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <Package className="h-5 w-5 text-amber-600" />
          <h3 className="font-extrabold text-stone-900">
            الباقات والخدمات العادية للمحل
          </h3>
        </div>

        <div className="mb-6 rounded-xl bg-stone-50 p-4">
          <h4 className="mb-3 font-bold text-stone-800">
            {editingId
              ? isEditingService
                ? 'تعديل الخدمة العادية'
                : 'تعديل الباقة'
              : 'إضافة باقة أو خدمة عادية'}
          </h4>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTypeChange('package')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                !isEditingService
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Package className="h-4 w-4" />
              باقة اشتراك
            </button>

            <button
              type="button"
              onClick={() => handleTypeChange('service')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                isEditingService
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Scissors className="h-4 w-4" />
              خدمة عادية
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={planForm.name}
              onChange={(e) =>
                setPlanForm({ ...planForm, name: e.target.value })
              }
              placeholder={isEditingService ? 'اسم الخدمة العادية (مثال: تهذيب لحية)' : 'اسم الباقة'}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={planForm.price}
              onChange={(e) =>
                setPlanForm({ ...planForm, price: e.target.value })
              }
              placeholder="السعر بالجنيه"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5"
            />

            {!isEditingService && (
              <>
                <input
                  type="number"
                  min="1"
                  value={planForm.haircut_count}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      haircut_count: e.target.value,
                    })
                  }
                  placeholder="عدد الحلاقات"
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2.5"
                />

                <input
                  type="number"
                  min="1"
                  value={planForm.duration_days}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      duration_days: e.target.value,
                    })
                  }
                  placeholder="المدة بالأيام"
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2.5"
                />
              </>
            )}
          </div>

          <textarea
            value={planForm.description}
            onChange={(e) =>
              setPlanForm({
                ...planForm,
                description: e.target.value,
              })
            }
            placeholder={
              isEditingService
                ? 'وصف وتفاصيل الخدمة العادية بالكامل (سيظهر للعميل)'
                : 'مميزات ووصف الباقة بالكامل (سيظهر للعميل)'
            }
            rows={3}
            className="mt-3 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void savePlan()}
              disabled={planSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 font-bold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {planSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editingId
                ? 'حفظ التعديلات'
                : isEditingService
                ? 'إضافة الخدمة'
                : 'إضافة الباقة'}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2.5 font-bold text-stone-600 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
                إلغاء
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <h4 className="font-extrabold text-stone-900">
              الباقات ({packagesList.length})
            </h4>
            {packagesList.length === 0 ? (
              <p className="rounded-xl bg-stone-50 py-6 text-center text-sm text-stone-500">
                لا توجد باقات لهذا المحل حتى الآن.
              </p>
            ) : (
              packagesList.map(renderPlanCard)
            )}
          </div>

          <div className="space-y-3">
            <h4 className="font-extrabold text-stone-900">
              الخدمات العادية ({servicesList.length})
            </h4>
            {servicesList.length === 0 ? (
              <p className="rounded-xl bg-stone-50 py-6 text-center text-sm text-stone-500">
                لا توجد خدمات عادية مضافة لهذا المحل حتى الآن.
              </p>
            ) : (
              servicesList.map(renderPlanCard)
            )}
          </div>
        </div>
      </section>
    </div>
  );
// }
// ```[cite: 3]

// ---

// ### 2. كود القسم المعدّل كاملًا في `src/pages/CustomerPage.tsx`

// هذا هو الجزء الكامل من `Customer booking widget` وحتى نهاية `CustomerBookingSection` بعد التعديل[cite: 2]:

// ```tsx
// /* ---------- Customer booking widget (Multi-branch & Multi-barber aware) ---------- */
// type ShopBranchOption = {
//   id: string;
//   name: string;
//   address: string | null;
// };

// type BarberOption = {
//   id: string;
//   branch_id: string | null;
//   name: string;
//   chair_label: string | null;
//   is_active: boolean;
//   is_available_for_booking: boolean;
// };

// type SmartSlot = {
//   start_at: string;
//   end_at: string;
//   label: string;
//   available: boolean;
//   freeChairsCount: number;
// };

// type CustomerBookingRow = Booking & {
//   branch_id?: string | null;
//   barber_id?: string | null;
// };

// function getUpcomingDates(count = 7): { value: string; label: string }[] {
//   const list: { value: string; label: string }[] = [];
//   const base = new Date();
//   for (let i = 0; i < count; i += 1) {
//     const d = new Date(base);
//     d.setDate(base.getDate() + i);
//     const yyyy = d.getFullYear();
//     const mm = String(d.getMonth() + 1).padStart(2, '0');
//     const dd = String(d.getDate()).padStart(2, '0');
//     const isoDate = `${yyyy}-${mm}-${dd}`;
//     const label =
//       i === 0
//         ? `اليوم (${new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)})`
//         : i === 1
//         ? `غدًا (${new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)})`
//         : new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
//     list.push({ value: isoDate, label });
//   }
//   return list;
// }

// function bookingStatusBadge(status: Booking['status']): { label: string; cls: string } {
//   switch (status) {
//     case 'confirmed':
//       return { label: 'مؤكد', cls: 'bg-emerald-100 text-emerald-700' };
//     case 'pending':
//       return { label: 'بانتظار تأكيد المحل', cls: 'bg-amber-100 text-amber-800' };
//     case 'completed':
//       return { label: 'تم الحضور والزيارة', cls: 'bg-blue-100 text-blue-700' };
//     case 'cancelled':
//       return { label: 'ملغي', cls: 'bg-stone-200 text-stone-600' };
//     case 'no_show':
//       return { label: 'لم يحضر بالموعد', cls: 'bg-red-100 text-red-700' };
//   }
// }

// function CustomerBookingSection({
//   customer,
//   shopId,
//   plans,
//   activeSub,
//   onBookingChanged,
// }: {
//   customer: Customer;
//   shopId: string;
//   plans: Plan[];
//   activeSub: Subscription | null;
//   onBookingChanged: () => void;
// }) {
//   const dates = getUpcomingDates(7);
//   const [selectedDate, setSelectedDate] = useState<string>(dates[0].value);
//   const [branches, setBranches] = useState<ShopBranchOption[]>([]);
//   const [barbers, setBarbers] = useState<BarberOption[]>([]);
//   const [selectedBranchId, setSelectedBranchId] = useState<string>('');
//   const [selectedBarberId, setSelectedBarberId] = useState<string>('any');

//   const [slots, setSlots] = useState<SmartSlot[]>([]);
//   const [selectedSlot, setSelectedSlot] = useState<string>('');
//   const [selectedPlanId, setSelectedPlanId] = useState<string>('');
//   const [notes, setNotes] = useState('');
//   const [bookings, setBookings] = useState<CustomerBookingRow[]>([]);
//   const [trust, setTrust] = useState<CustomerBookingTrust | null>(null);
//   const [loadingSlots, setLoadingSlots] = useState(true);
//   const [submitting, setSubmitting] = useState(false);
//   const [cancellingId, setCancellingId] = useState<string | null>(null);
//   const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

//   const loadBranchesAndBarbers = useCallback(async () => {
//     try {
//       const [brRes, barbRes] = await Promise.all([
//         supabase
//           .from('shop_branches')
//           .select('id, name, address')
//           .eq('shop_id', shopId)
//           .eq('is_active', true)
//           .order('created_at', { ascending: true }),
//         supabase
//           .from('barbers')
//           .select('id, branch_id, name, chair_label, is_active, is_available_for_booking')
//           .eq('shop_id', shopId)
//           .eq('is_active', true)
//           .order('created_at', { ascending: true }),
//       ]);

//       const activeBranches = (brRes.data ?? []) as ShopBranchOption[];
//       const activeBarbers = (barbRes.data ?? []) as BarberOption[];

//       setBranches(activeBranches);
//       setBarbers(activeBarbers);

//       if (activeBranches.length > 0) {
//         setSelectedBranchId((prev) =>
//           activeBranches.some((b) => b.id === prev) ? prev : activeBranches[0].id
//         );
//       }
//     } catch (e) {
//       console.error('Failed loading branches/barbers:', e);
//     }
//   }, [shopId]);

//   const loadBookingsAndTrust = useCallback(async () => {
//     try {
//       const [userBookings, trustInfo] = await Promise.all([
//         getCustomerBookings(shopId, customer.id),
//         evaluateCustomerBookingTrust(shopId, customer.id),
//       ]);
//       setBookings(userBookings as CustomerBookingRow[]);
//       setTrust(trustInfo);
//     } catch (e) {
//       console.error('Failed loading bookings/trust:', e);
//     }
//   }, [shopId, customer.id]);

//   const branchBarbers = barbers.filter(
//     (b) =>
//       b.is_active &&
//       b.is_available_for_booking &&
//       (!selectedBranchId || !b.branch_id || b.branch_id === selectedBranchId)
//   );

//   const loadSlots = useCallback(
//     async (dateStr: string) => {
//       setLoadingSlots(true);
//       try {
//         const dayStart = new Date(`${dateStr}T00:00:00`);
//         const dayEnd = new Date(`${dateStr}T23:59:59`);

//         let query = supabase
//           .from('bookings')
//           .select('id, barber_id, branch_id, start_at, end_at, status')
//           .eq('shop_id', shopId)
//           .in('status', ['pending', 'confirmed'])
//           .lt('start_at', dayEnd.toISOString())
//           .gt('end_at', dayStart.toISOString());

//         if (selectedBranchId) {
//           query = query.eq('branch_id', selectedBranchId);
//         }

//         const { data: dayBookings, error } = await query;
//         if (error) throw error;

//         const activeBookings = dayBookings ?? [];
//         const candidateBarbers =
//           selectedBarberId !== 'any'
//             ? branchBarbers.filter((b) => b.id === selectedBarberId)
//             : branchBarbers;

//         const now = new Date();
//         const generated: SmartSlot[] = [];

//         for (let hour = 11; hour < 23; hour += 1) {
//           const slotStart = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
//           const slotEnd = new Date(slotStart.getTime() + 60 * 60000);
//           const isPast = slotStart.getTime() <= now.getTime();

//           let freeChairsCount = 0;

//           if (!isPast && candidateBarbers.length > 0) {
//             for (const barber of candidateBarbers) {
//               const isBarberBusy = activeBookings.some((bk) => {
//                 const sameBarber =
//                   bk.barber_id === barber.id ||
//                   (!bk.barber_id && candidateBarbers.length === 1);
//                 if (!sameBarber) return false;
//                 return (
//                   new Date(bk.start_at).getTime() < slotEnd.getTime() &&
//                   new Date(bk.end_at).getTime() > slotStart.getTime()
//                 );
//               });
//               if (!isBarberBusy) freeChairsCount += 1;
//             }
//           }

//           const label = slotStart.toLocaleTimeString('ar-EG', {
//             hour: '2-digit',
//             minute: '2-digit',
//           });

//           generated.push({
//             start_at: slotStart.toISOString(),
//             end_at: slotEnd.toISOString(),
//             label,
//             available: !isPast && freeChairsCount > 0,
//             freeChairsCount,
//           });
//         }

//         setSlots(generated);
//         const firstAvail = generated.find((s) => s.available);
//         setSelectedSlot((prev) =>
//           generated.some((s) => s.start_at === prev && s.available)
//             ? prev
//             : firstAvail?.start_at ?? ''
//         );
//       } catch (e) {
//         console.error('Failed loading smart slots:', e);
//         const fallback = await getAvailableBookingSlots(shopId, dateStr, {
//           startHour: 11,
//           endHour: 23,
//           slotMinutes: 60,
//         });
//         setSlots(
//           fallback.map((s) => ({
//             ...s,
//             freeChairsCount: s.available ? 1 : 0,
//           }))
//         );
//       } finally {
//         setLoadingSlots(false);
//       }
//     },
//     [shopId, selectedBranchId, selectedBarberId, branchBarbers]
//   );

//   useEffect(() => {
//     void loadBranchesAndBarbers();
//     void loadBookingsAndTrust();
//   }, [loadBranchesAndBarbers, loadBookingsAndTrust]);

//   useEffect(() => {
//     void loadSlots(selectedDate);
//   }, [loadSlots, selectedDate]);

//   const hasSub =
//     activeSub?.status === 'active' &&
//     activeSub.haircuts_used < (activeSub.plan?.haircut_count ?? 0);

//   const chosenPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
//   const serviceName = chosenPlan
//     ? chosenPlan.name
//     : hasSub && activeSub?.plan
//     ? `حلاقة ضمن باقة (${activeSub.plan.name})`
//     : 'حلاقة عادية';

//   const barberMap = new Map(barbers.map((b) => [b.id, b]));
//   const branchMap = new Map(branches.map((b) => [b.id, b]));

//   const handleBook = async () => {
//     if (!selectedSlot) {
//       setFeedback({ type: 'err', text: 'اختر ميعادًا متاحًا أولًا.' });
//       return;
//     }

//     if (branchBarbers.length === 0) {
//       setFeedback({
//         type: 'err',
//         text: 'لا يوجد حلاقون متاحون حاليًا في هذا الفرع.',
//       });
//       return;
//     }

//     setSubmitting(true);
//     setFeedback(null);

//     try {
//       const startIso = selectedSlot;
//       const endIso = new Date(new Date(startIso).getTime() + 60 * 60000).toISOString();
//       const targetBranchId = selectedBranchId || branches[0]?.id || null;
//       const requestedBarberId = selectedBarberId === 'any' ? null : selectedBarberId;

//       const { data: assignedBarberId, error: assignErr } = await supabase.rpc(
//         'assign_available_barber',
//         {
//           p_shop_id: shopId,
//           p_branch_id: targetBranchId,
//           p_barber_id: requestedBarberId,
//           p_start_at: startIso,
//           p_end_at: endIso,
//         }
//       );

//       if (assignErr) {
//         throw new Error(assignErr.message || 'الموعد اكتمل للتو، اختر موعدًا آخر.');
//       }

//       const created = await createCustomerBooking({
//         shopId,
//         customer,
//         serviceName,
//         planId: chosenPlan?.id ?? activeSub?.plan_id ?? null,
//         startAt: startIso,
//         durationMinutes: 60,
//         notes,
//       });

//       if (created?.id) {
//         await supabase
//           .from('bookings')
//           .update({
//             branch_id: targetBranchId,
//             barber_id: assignedBarberId,
//           })
//           .eq('id', created.id);
//       }

//       const assignedBarber = assignedBarberId ? barberMap.get(String(assignedBarberId)) : null;
//       const assignedBranch = targetBranchId ? branchMap.get(targetBranchId) : null;

//       setNotes('');
//       await Promise.all([loadSlots(selectedDate), loadBookingsAndTrust()]);
//       onBookingChanged();

//       const placeSummary = [
//         assignedBranch ? `الفرع: ${assignedBranch.name}` : null,
//         assignedBarber ? `الحلاق: ${assignedBarber.name}` : null,
//       ]
//         .filter(Boolean)
//         .join(' — ');

//       setFeedback({
//         type: 'ok',
//         text:
//           created.status === 'confirmed'
//             ? `تم تأكيد حجزك تلقائيًا! رقم حجزك: ${created.booking_code} — الموعد: ${formatDateTime(created.start_at)}${placeSummary ? ` (${placeSummary})` : ''}`
//             : `تم إرسال طلب حجزك برقم ${created.booking_code} وهو بانتظار تأكيد المحل${placeSummary ? ` (${placeSummary})` : ''}.`,
//       });
//     } catch (e) {
//       setFeedback({
//         type: 'err',
//         text: e instanceof Error ? e.message : 'تعذر إتمام الحجز.',
//       });
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   const handleCancelBooking = async (booking: CustomerBookingRow) => {
//     setCancellingId(booking.id);
//     setFeedback(null);
//     try {
//       await updateBookingStatus(booking.id, 'cancelled');
//       await Promise.all([loadSlots(selectedDate), loadBookingsAndTrust()]);
//       onBookingChanged();
//       setFeedback({
//         type: 'ok',
//         text: `تم إلغاء الحجز رقم ${booking.booking_code} وإتاحة الموعد لعملاء آخرين.`,
//       });
//     } catch (e) {
//       setFeedback({
//         type: 'err',
//         text: e instanceof Error ? e.message : 'تعذر إلغاء الحجز.',
//       });
//     } finally {
//       setCancellingId(null);
//     }
//   };

//   return (
//     <div id="customer-booking" className="mt-6 scroll-mt-6 space-y-5">
//       <div className="rounded-[26px] border border-[#e9e2d8] bg-white p-5 shadow-[0_10px_30px_rgba(48,38,28,0.05)] sm:p-6">
//         <div className="flex flex-wrap items-start justify-between gap-3">
//           <div className="flex items-center gap-3">
//             <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-stone-900 text-amber-400">
//               <Calendar className="h-6 w-6" />
//             </div>
//             <div>
//               <h3 className="font-display text-xl font-extrabold text-stone-900">
//                 احجز موعدك الآن
//               </h3>
//               <p className="text-xs text-stone-500">
//                 اختر اليوم والوقت المتاح واحصل على رقم حجز خاص بك فورًا
//               </p>
//             </div>
//           </div>

//           {trust && (
//             <span
//               className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
//                 trust.isTrusted
//                   ? 'bg-emerald-100 text-emerald-800'
//                   : 'bg-amber-100 text-amber-800'
//               }`}
//             >
//               <ShieldCheck className="h-3.5 w-3.5" />
//               {trust.trustBadge}
//             </span>
//           )}
//         </div>

//         {trust && !trust.canBook ? (
//           <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
//             {trust.blockReason}
//           </div>
//         ) : (
//           <div className="mt-5 space-y-5">
//             {branches.length > 1 && (
//               <div>
//                 <label className="mb-2 block text-xs font-extrabold text-stone-700">
//                   اختر الفرع
//                 </label>
//                 <div className="grid gap-2 sm:grid-cols-2">
//                   {branches.map((br) => {
//                     const activeBranch = selectedBranchId === br.id;
//                     return (
//                       <button
//                         key={br.id}
//                         type="button"
//                         onClick={() => {
//                           setSelectedBranchId(br.id);
//                           setSelectedBarberId('any');
//                         }}
//                         className={`rounded-xl border p-3 text-right transition ${
//                           activeBranch
//                             ? 'border-stone-900 bg-stone-900 text-white'
//                             : 'border-stone-200 bg-[#faf8f5] text-stone-800 hover:bg-stone-100'
//                         }`}
//                       >
//                         <p className="text-xs font-extrabold">{br.name}</p>
//                         {br.address && (
//                           <p
//                             className={`mt-0.5 text-[11px] ${
//                               activeBranch ? 'text-stone-300' : 'text-stone-500'
//                             }`}
//                           >
//                             {br.address}
//                           </p>
//                         )}
//                       </button>
//                     );
//                   })}
//                 </div>
//               </div>
//             )}

//             {branchBarbers.length > 1 && (
//               <div>
//                 <label className="mb-2 block text-xs font-extrabold text-stone-700">
//                   اختر الحلاق / الكرسي
//                 </label>
//                 <div className="flex flex-wrap gap-2">
//                   <button
//                     type="button"
//                     onClick={() => setSelectedBarberId('any')}
//                     className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
//                       selectedBarberId === 'any'
//                         ? 'border-stone-900 bg-stone-900 text-white'
//                         : 'border-stone-200 bg-[#faf8f5] text-stone-700 hover:bg-stone-100'
//                     }`}
//                   >
//                     أقرب حلاق متاح ({branchBarbers.length})
//                   </button>
//                   {branchBarbers.map((barber) => {
//                     const activeBarber = selectedBarberId === barber.id;
//                     return (
//                       <button
//                         key={barber.id}
//                         type="button"
//                         onClick={() => setSelectedBarberId(barber.id)}
//                         className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
//                           activeBarber
//                             ? 'border-stone-900 bg-stone-900 text-white'
//                             : 'border-stone-200 bg-[#faf8f5] text-stone-700 hover:bg-stone-100'
//                         }`}
//                       >
//                         {barber.name}
//                         {barber.chair_label ? ` (${barber.chair_label})` : ''}
//                       </button>
//                     );
//                   })}
//                 </div>
//               </div>
//             )}

//             <div>
//               <label className="mb-2 block text-xs font-extrabold text-stone-700">
//                 1. اختر اليوم
//               </label>
//               <div className="flex gap-2 overflow-x-auto pb-1">
//                 {dates.map((d) => {
//                   const activeDay = selectedDate === d.value;
//                   return (
//                     <button
//                       key={d.value}
//                       type="button"
//                       onClick={() => setSelectedDate(d.value)}
//                       className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
//                         activeDay
//                           ? 'border-stone-900 bg-stone-900 text-white'
//                           : 'border-stone-200 bg-[#faf8f5] text-stone-700 hover:bg-stone-100'
//                       }`}
//                     >
//                       {d.label}
//                     </button>
//                   );
//                 })}
//               </div>
//             </div>

//             <div>
//               <div className="mb-2 flex items-center justify-between">
//                 <label className="text-xs font-extrabold text-stone-700">
//                   2. اختر الوقت المتاح (المواعيد المحجوزة بالكامل مغلقة)
//                 </label>
//                 {loadingSlots && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
//               </div>

//               {branchBarbers.length === 0 ? (
//                 <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-xs font-bold text-amber-800">
//                   جميع الحلاقين في إجازة حاليًا. يرجى المحاولة لاحقًا أو اختيار فرع آخر.
//                 </div>
//               ) : loadingSlots ? (
//                 <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
//                   {[1, 2, 3, 4].map((n) => (
//                     <div key={n} className="h-11 animate-shimmer rounded-xl" />
//                   ))}
//                 </div>
//               ) : slots.every((s) => !s.available) ? (
//                 <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center text-xs font-bold text-stone-500">
//                   جميع الكراسي محجوزة في هذا اليوم. جرّب يومًا آخر.
//                 </div>
//               ) : (
//                 <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
//                   {slots.map((slot) => {
//                     const isSelected = selectedSlot === slot.start_at && slot.available;
//                     return (
//                       <button
//                         key={slot.start_at}
//                         type="button"
//                         disabled={!slot.available}
//                         onClick={() => setSelectedSlot(slot.start_at)}
//                         className={`rounded-xl border px-3 py-2.5 text-center text-xs font-bold transition ${
//                           !slot.available
//                             ? 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400 line-through'
//                             : isSelected
//                             ? 'border-amber-500 bg-amber-500 text-stone-950 shadow-sm'
//                             : 'border-stone-200 bg-white text-stone-800 hover:border-amber-400 hover:bg-amber-50/50'
//                         }`}
//                       >
//                         <div>{slot.label}</div>
//                         {slot.available && branchBarbers.length > 1 && selectedBarberId === 'any' && (
//                           <div
//                             className={`mt-0.5 text-[10px] ${
//                               isSelected ? 'text-stone-900' : 'text-emerald-700'
//                             }`}
//                           >
//                             متاح {slot.freeChairsCount} كرسي
//                           </div>
//                         )}
//                       </button>
//                     );
//                   })}
//                 </div>
//               )}
//             </div>

//             <div className="grid gap-3 sm:grid-cols-2">
//               <div>
//                 <label className="mb-1.5 block text-xs font-extrabold text-stone-700">
//                   3. الخدمة أو الباقة
//                 </label>
//                 <select
//                   value={selectedPlanId}
//                   onChange={(e) => setSelectedPlanId(e.target.value)}
//                   className="input bg-white"
//                 >
//                   <option value="">
//                     {hasSub && activeSub?.plan
//                       ? `حلاقة ضمن باقتي النشطة (${activeSub.plan.name})`
//                       : 'حلاقة عادية'}
//                   </option>
//                   {plans.map((p) => (
//                     <option key={p.id} value={p.id}>
//                       {p.name} ({formatPrice(Number(p.price))})
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               <div>
//                 <label className="mb-1.5 block text-xs font-extrabold text-stone-700">
//                   ملاحظات للحلاق (اختياري)
//                 </label>
//                 <input
//                   value={notes}
//                   onChange={(e) => setNotes(e.target.value)}
//                   placeholder="مثال: تدرج متوسط + تهذيب لحية"
//                   className="input bg-white"
//                 />
//               </div>
//             </div>

//             {feedback && (
//               <div
//                 className={`rounded-xl border p-3.5 text-xs font-bold ${
//                   feedback.type === 'ok'
//                     ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
//                     : 'border-red-200 bg-red-50 text-red-700'
//                 }`}
//               >
//                 {feedback.text}
//               </div>
//             )}

//             <button
//               type="button"
//               onClick={() => void handleBook()}
//               disabled={submitting || !selectedSlot}
//               className="btn-gold w-full disabled:opacity-50"
//             >
//               {submitting ? (
//                 <Loader2 className="h-4 w-4 animate-spin" />
//               ) : (
//                 <Ticket className="h-4 w-4" />
//               )}
//               {submitting ? 'جارٍ تأكيد الحجز...' : 'تأكيد الحجز وإصدار رقم الحجز'}
//             </button>
//           </div>
//         )}
//       </div>

//       {bookings.length > 0 && (
//         <div className="rounded-[24px] border border-[#e9e2d8] bg-white p-5 shadow-sm">
//           <h4 className="mb-3 flex items-center gap-2 font-bold text-stone-900">
//             <Ticket className="h-4 w-4 text-amber-600" />
//             حجوزاتي ({bookings.length})
//           </h4>
//           <div className="space-y-2.5">
//             {bookings.map((b) => {
//               const badge = bookingStatusBadge(b.status);
//               const canCancel = b.status === 'pending' || b.status === 'confirmed';
//               const bBranch = b.branch_id ? branchMap.get(b.branch_id) : null;
//               const bBarber = b.barber_id ? barberMap.get(b.barber_id) : null;

//               return (
//                 <div
//                   key={b.id}
//                   className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-[#faf8f5] p-3.5 sm:flex-row sm:items-center"
//                 >
//                   <div>
//                     <div className="flex flex-wrap items-center gap-2">
//                       <span className="rounded-lg bg-stone-900 px-2.5 py-0.5 font-mono text-xs font-extrabold text-amber-400">
//                         {b.booking_code}
//                       </span>
//                       <span className="text-sm font-extrabold text-stone-900">
//                         {b.service_name}
//                       </span>
//                       <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge.cls}`}>
//                         {badge.label}
//                       </span>
//                     </div>
//                     <p className="mt-1 text-xs text-stone-600">
//                       الموعد: {formatDateTime(b.start_at)}
//                       {bBranch && branches.length > 1 ? ` · الفرع: ${bBranch.name}` : ''}
//                       {bBarber ? ` · الحلاق: ${bBarber.name}` : ''}
//                     </p>
//                     {b.notes && (
//                       <p className="mt-1 text-xs text-stone-500">ملاحظة: {b.notes}</p>
//                     )}
//                   </div>

//                   {canCancel && (
//                     <button
//                       type="button"
//                       disabled={cancellingId === b.id}
//                       onClick={() => void handleCancelBooking(b)}
//                       className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
//                     >
//                       {cancellingId === b.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
//                       إلغاء الحجز
//                     </button>
//                   )}
//                 </div>
//               );
//             })}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
// ```[cite: 2]

// ---

// ### 3. كود `BookingsTab` المعدّل كاملًا في `src/pages/AdminPage.tsx`

// هذا هو الجزء الكامل الخاص بـ `BookingsTab` بعد التعديل ليعرض الفرع والحلاق/الكرسي، ويتيح **"إشغال كرسي الآن (زبون من الشارع)"**، وينقل `branch_id` و`barber_id` عند تسجيل الزيارة[cite: 1]:

// ```tsx
// /* ---------- Bookings management tab (Multi-branch & Multi-chair aware) ---------- */
// type AdminBookingRow = Booking & {
//   branch_id?: string | null;
//   barber_id?: string | null;
// };

// type AdminBranch = {
//   id: string;
//   name: string;
// };

// type AdminBarber = {
//   id: string;
//   branch_id: string | null;
//   name: string;
//   chair_label: string | null;
//   is_active: boolean;
//   is_available_for_booking: boolean;
// };

// function BookingsTab({
//   shopId,
//   onVisitRecorded,
// }: {
//   shopId: string;
//   onVisitRecorded: () => void;
// }) {
//   const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
//   const [branches, setBranches] = useState<AdminBranch[]>([]);
//   const [barbers, setBarbers] = useState<AdminBarber[]>([]);
//   const [walkInBarberId, setWalkInBarberId] = useState<string>('');
//   const [walkInNote, setWalkInNote] = useState<string>('');
//   const [occupyingWalkIn, setOccupyingWalkIn] = useState(false);

//   const [filter, setFilter] = useState<'all' | Booking['status']>('all');
//   const [loading, setLoading] = useState(true);
//   const [busyId, setBusyId] = useState<string | null>(null);
//   const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

//   const load = useCallback(async () => {
//     setLoading(true);
//     try {
//       const [rows, brRes, barbRes] = await Promise.all([
//         getShopBookings(shopId),
//         supabase
//           .from('shop_branches')
//           .select('id, name')
//           .eq('shop_id', shopId)
//           .eq('is_active', true)
//           .order('created_at', { ascending: true }),
//         supabase
//           .from('barbers')
//           .select('id, branch_id, name, chair_label, is_active, is_available_for_booking')
//           .eq('shop_id', shopId)
//           .eq('is_active', true)
//           .order('created_at', { ascending: true }),
//       ]);

//       const loadedBarbers = (barbRes.data ?? []) as AdminBarber[];
//       setBookings(rows as AdminBookingRow[]);
//       setBranches((brRes.data ?? []) as AdminBranch[]);
//       setBarbers(loadedBarbers);

//       const firstAvailBarber = loadedBarbers.find((b) => b.is_available_for_booking);
//       if (firstAvailBarber) {
//         setWalkInBarberId((prev) =>
//           loadedBarbers.some((b) => b.id === prev) ? prev : firstAvailBarber.id
//         );
//       }
//     } catch (e) {
//       setBanner({
//         type: 'err',
//         text: e instanceof Error ? e.message : 'تعذر تحميل الحجوزات.',
//       });
//     } finally {
//       setLoading(false);
//     }
//   }, [shopId]);

//   useEffect(() => {
//     void load();
//   }, [load]);

//   const branchMap = new Map(branches.map((b) => [b.id, b.name]));
//   const barberMap = new Map(barbers.map((b) => [b.id, b]));

//   const handleOccupyChairNow = async () => {
//     if (!walkInBarberId) {
//       setBanner({ type: 'err', text: 'اختر كرسيًا أو حلاقًا متاحًا أولًا.' });
//       return;
//     }

//     const chosenBarber = barberMap.get(walkInBarberId);
//     if (!chosenBarber) return;

//     setOccupyingWalkIn(true);
//     setBanner(null);

//     try {
//       const now = new Date();
//       const startIso = now.toISOString();
//       const endIso = new Date(now.getTime() + 60 * 60000).toISOString();

//       const { data: assignedId, error: rpcErr } = await supabase.rpc(
//         'assign_available_barber',
//         {
//           p_shop_id: shopId,
//           p_branch_id: chosenBarber.branch_id,
//           p_barber_id: chosenBarber.id,
//           p_start_at: startIso,
//           p_end_at: endIso,
//         }
//       );

//       if (rpcErr) {
//         throw new Error(rpcErr.message || 'هذا الكرسي مشغول حاليًا في هذا الوقت.');
//       }

//       const code = `WLK-${Math.floor(1000 + Math.random() * 9000)}`;
//       const { error: insErr } = await supabase.from('bookings').insert({
//         shop_id: shopId,
//         branch_id: chosenBarber.branch_id,
//         barber_id: assignedId || chosenBarber.id,
//         booking_code: code,
//         customer_name: walkInNote.trim() || 'زبون من المحل (Walk-in)',
//         customer_phone: '',
//         service_name: 'حلاقة عادية (زبون مباشر)',
//         start_at: startIso,
//         end_at: endIso,
//         status: 'confirmed',
//         notes: walkInNote.trim() || 'إشغال مباشر من لوحة المحل لمدة ساعة',
//       });

//       if (insErr) throw insErr;

//       setWalkInNote('');
//       await load();
//       setBanner({
//         type: 'ok',
//         text: `تم إشغال (${chosenBarber.name} - ${chosenBarber.chair_label || 'كرسي'}) لمدة ساعة ومنع الحجز الأونلاين عليه خلال هذه الفترة.`,
//       });
//     } catch (e) {
//       setBanner({
//         type: 'err',
//         text: e instanceof Error ? e.message : 'تعذر إشغال الكرسي.',
//       });
//     } finally {
//       setOccupyingWalkIn(false);
//     }
//   };

//   const handleStatus = async (b: AdminBookingRow, next: Booking['status']) => {
//     setBusyId(b.id);
//     setBanner(null);
//     try {
//       await updateBookingStatus(b.id, next);
//       await load();
//       setBanner({ type: 'ok', text: `تم تحديث حالة الحجز ${b.booking_code}.` });
//     } catch (e) {
//       setBanner({
//         type: 'err',
//         text: e instanceof Error ? e.message : 'تعذر تحديث الحالة.',
//       });
//     } finally {
//       setBusyId(null);
//     }
//   };

//   const handleCompleteAndRecordVisit = async (b: AdminBookingRow) => {
//     setBusyId(b.id);
//     setBanner(null);
//     try {
//       let customerId = b.customer_id;
//       if (!customerId && b.customer_phone) {
//         const cleanPhone = b.customer_phone.replace(/\D/g, '');
//         const existing = await findCustomerByPhone(shopId, cleanPhone);
//         if (existing) {
//           customerId = existing.id;
//         } else {
//           const created = await createCustomer({
//             shopId,
//             fullName: b.customer_name || 'عميل حجز',
//             phone: cleanPhone,
//           });
//           customerId = created.id;
//         }
//       }

//       if (!customerId) {
//         await updateBookingStatus(b.id, 'completed');
//         await load();
//         setBanner({
//           type: 'ok',
//           text: `تم إنهاء الحجز ${b.booking_code} كحالة مكتملة.`,
//         });
//         return;
//       }

//       const activeSub = await getCustomerActiveSubscription(shopId, customerId);
//       const shop = await getShopById(shopId);
//       const defaultPrice = Number(shop?.regular_haircut_price ?? 50);

//       const visitResult = await recordVisit({
//         shopId,
//         customerId,
//         activeSubscription: activeSub,
//         serviceName: b.service_name,
//         amountPaid: activeSub ? 0 : defaultPrice,
//         notes: `من الحجز ${b.booking_code}${b.notes ? ` — ${b.notes}` : ''}`,
//       });

//       if (visitResult?.id && (b.branch_id || b.barber_id)) {
//         await supabase
//           .from('visits')
//           .update({
//             branch_id: b.branch_id ?? null,
//             barber_id: b.barber_id ?? null,
//           })
//           .eq('id', visitResult.id);
//       }

//       await updateBookingStatus(b.id, 'completed');
//       await load();
//       onVisitRecorded();
//       setBanner({
//         type: 'ok',
//         text: `تم تسجيل زيارة العميل ${b.customer_name} وتحديث الحجز ${b.booking_code} إلى مكتمل.`,
//       });
//     } catch (e) {
//       setBanner({
//         type: 'err',
//         text: e instanceof Error ? e.message : 'تعذر تسجيل الزيارة.',
//       });
//     } finally {
//       setBusyId(null);
//     }
//   };

//   const filtered =
//     filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

//   const pendingCount = bookings.filter((b) => b.status === 'pending').length;
//   const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;

//   return (
//     <div className="space-y-5">
//       <div>
//         <h2 className="font-display text-2xl font-extrabold text-stone-900">
//           إدارة الحجوزات والمواعيد
//         </h2>
//         <p className="mt-1 text-sm text-stone-500">
//           تأكيد الحجوزات الجديدة، إشغال كرسي لزبون مباشر، وتسجيل الزيارة عند حضور العميل.
//         </p>
//       </div>

//       {/* إشغال كرسي الآن لزبون مباشر */}
//       {barbers.length > 0 && (
//         <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
//           <h3 className="mb-3 text-sm font-extrabold text-stone-900">
//             إشغال كرسي الآن (زبون من المحل بدون حجز مسبق)
//           </h3>
//           <div className="grid gap-3 sm:grid-cols-3">
//             <select
//               value={walkInBarberId}
//               onChange={(e) => setWalkInBarberId(e.target.value)}
//               className="input bg-stone-50"
//             >
//               {barbers.map((brb) => (
//                 <option key={brb.id} value={brb.id}>
//                   {brb.name} {brb.chair_label ? `(${brb.chair_label})` : ''}
//                   {brb.branch_id && branchMap.get(brb.branch_id)
//                     ? ` — ${branchMap.get(brb.branch_id)}`
//                     : ''}
//                   {!brb.is_available_for_booking ? ' [إجازة]' : ''}
//                 </option>
//               ))}
//             </select>
//             <input
//               value={walkInNote}
//               onChange={(e) => setWalkInNote(e.target.value)}
//               placeholder="اسم أو ملاحظة سريعة (اختياري)"
//               className="input bg-stone-50"
//             />
//             <button
//               type="button"
//               disabled={occupyingWalkIn}
//               onClick={() => void handleOccupyChairNow()}
//               className="btn-primary justify-center"
//             >
//               {occupyingWalkIn && <Loader2 className="h-4 w-4 animate-spin" />}
//               إشغال الكرسي لمدة ساعة الآن
//             </button>
//           </div>
//         </div>
//       )}

//       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
//         <div className="rounded-2xl border border-stone-200 bg-white p-4">
//           <p className="text-xs font-bold text-stone-400">بانتظار التأكيد</p>
//           <p className="mt-1 font-display text-2xl font-extrabold text-amber-600">{pendingCount}</p>
//         </div>
//         <div className="rounded-2xl border border-stone-200 bg-white p-4">
//           <p className="text-xs font-bold text-stone-400">مواعيد مؤكدة</p>
//           <p className="mt-1 font-display text-2xl font-extrabold text-emerald-700">{confirmedCount}</p>
//         </div>
//         <div className="rounded-2xl border border-stone-200 bg-white p-4">
//           <p className="text-xs font-bold text-stone-400">إجمالي الحجوزات</p>
//           <p className="mt-1 font-display text-2xl font-extrabold text-stone-900">{bookings.length}</p>
//         </div>
//         <div className="rounded-2xl border border-stone-200 bg-white p-4">
//           <p className="text-xs font-bold text-stone-400">مكتملة</p>
//           <p className="mt-1 font-display text-2xl font-extrabold text-blue-700">
//             {bookings.filter((b) => b.status === 'completed').length}
//           </p>
//         </div>
//       </div>

//       <div className="flex flex-wrap gap-2">
//         {(
//           [
//             ['all', 'الكل'],
//             ['pending', 'بانتظار التأكيد'],
//             ['confirmed', 'مؤكد'],
//             ['completed', 'مكتمل'],
//             ['cancelled', 'ملغي'],
//             ['no_show', 'لم يحضر'],
//           ] as const
//         ).map(([key, label]) => (
//           <button
//             key={key}
//             type="button"
//             onClick={() => setFilter(key)}
//             className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
//               filter === key
//                 ? 'bg-stone-900 text-white'
//                 : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
//             }`}
//           >
//             {label}
//           </button>
//         ))}
//       </div>

//       {banner && (
//         <div
//           className={`rounded-2xl border p-3.5 text-xs font-bold ${
//             banner.type === 'ok'
//               ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
//               : 'border-red-200 bg-red-50 text-red-700'
//           }`}
//         >
//           {banner.text}
//         </div>
//       )}

//       {loading ? (
//         <div className="space-y-3">
//           {[1, 2, 3].map((n) => (
//             <div key={n} className="h-24 animate-shimmer rounded-2xl" />
//           ))}
//         </div>
//       ) : filtered.length === 0 ? (
//         <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-400">
//           لا توجد حجوزات في هذا التصنيف حاليًا.
//         </div>
//       ) : (
//         <div className="space-y-3">
//           {filtered.map((b) => {
//             const isBusy = busyId === b.id;
//             const bBranchName = b.branch_id ? branchMap.get(b.branch_id) : null;
//             const bBarber = b.barber_id ? barberMap.get(b.barber_id) : null;

//             const badgeMap: Record<Booking['status'], { label: string; cls: string }> = {
//               pending: { label: 'بانتظار التأكيد', cls: 'bg-amber-100 text-amber-800' },
//               confirmed: { label: 'مؤكد', cls: 'bg-emerald-100 text-emerald-700' },
//               completed: { label: 'مكتمل', cls: 'bg-blue-100 text-blue-700' },
//               cancelled: { label: 'ملغي', cls: 'bg-stone-200 text-stone-600' },
//               no_show: { label: 'لم يحضر', cls: 'bg-red-100 text-red-700' },
//             };
//             const st = badgeMap[b.status];

//             return (
//               <div
//                 key={b.id}
//                 className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center"
//               >
//                 <div className="space-y-1">
//                   <div className="flex flex-wrap items-center gap-2">
//                     <span className="rounded-lg bg-stone-900 px-2.5 py-0.5 font-mono text-xs font-extrabold text-amber-400">
//                       {b.booking_code}
//                     </span>
//                     <span className="text-sm font-extrabold text-stone-900">
//                       {b.customer_name}
//                     </span>
//                     {b.customer_phone && (
//                       <span className="text-xs text-stone-500" dir="ltr">
//                         {b.customer_phone}
//                       </span>
//                     )}
//                     <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>
//                       {st.label}
//                     </span>
//                   </div>
//                   <p className="text-xs font-bold text-stone-700">
//                     الموعد: {formatDateTime(b.start_at)} · {b.service_name}
//                     {bBranchName ? ` · الفرع: ${bBranchName}` : ''}
//                     {bBarber
//                       ? ` · الحلاق: ${bBarber.name}${bBarber.chair_label ? ` (${bBarber.chair_label})` : ''}`
//                       : ''}
//                   </p>
//                   {b.notes && <p className="text-xs text-stone-500">ملاحظات: {b.notes}</p>}
//                 </div>

//                 <div className="flex flex-wrap items-center gap-2">
//                   {b.status === 'pending' && (
//                     <button
//                       type="button"
//                       disabled={isBusy}
//                       onClick={() => void handleStatus(b, 'confirmed')}
//                       className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
//                     >
//                       <CheckCircle2 className="h-3.5 w-3.5" />
//                       تأكيد الموعد
//                     </button>
//                   )}

//                   {(b.status === 'pending' || b.status === 'confirmed') && (
//                     <>
//                       <button
//                         type="button"
//                         disabled={isBusy}
//                         onClick={() => void handleCompleteAndRecordVisit(b)}
//                         className="btn-gold px-3 py-2 text-xs"
//                       >
//                         {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
//                         حضور وتسجيل زيارة
//                       </button>

//                       <button
//                         type="button"
//                         disabled={isBusy}
//                         onClick={() => void handleStatus(b, 'no_show')}
//                         className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
//                       >
//                         <UserX className="h-3.5 w-3.5" />
//                         لم يحضر
//                       </button>

//                       <button
//                         type="button"
//                         disabled={isBusy}
//                         onClick={() => void handleStatus(b, 'cancelled')}
//                         className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
//                       >
//                         <XCircle className="h-3.5 w-3.5" />
//                         إلغاء
//                       </button>
//                     </>
//                   )}
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       )}
//     </div>
//   );
// }