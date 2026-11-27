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
}