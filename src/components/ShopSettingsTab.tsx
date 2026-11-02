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
} from 'lucide-react';
import { supabase, type Plan, type Shop } from '@/lib/supabase';
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

const emptyPlan = {
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
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      const [shopData, plansResult] = await Promise.all([
        getShopById(shopId),
        supabase
          .from('plans')
          .select('*')
          .eq('shop_id', shopId)
          .order('price', { ascending: true }),
      ]);

      if (plansResult.error) throw plansResult.error;

      setShop(shopData);
      setPrice(String(shopData?.regular_haircut_price ?? 50));
      setPlans(plansResult.data ?? []);
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

  const savePlan = async () => {
    const haircut_count = Number(planForm.haircut_count);
    const priceValue = Number(planForm.price);
    const duration_days = Number(planForm.duration_days);

    if (
      !planForm.name.trim() ||
      !Number.isInteger(haircut_count) ||
      haircut_count < 1 ||
      !Number.isFinite(priceValue) ||
      priceValue < 0 ||
      !Number.isInteger(duration_days) ||
      duration_days < 1
    ) {
      setError('راجع اسم الباقة وعدد الحلاقات والسعر والمدة.');
      return;
    }

    setPlanSaving(true);
    setError('');
    setMessage('');

    const payload = {
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
        editingId ? 'تم تعديل الباقة.' : 'تمت إضافة الباقة.'
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'تعذر حفظ الباقة.'
      );
    } finally {
      setPlanSaving(false);
    }
  };

  const editPlan = (plan: Plan) => {
    setEditingId(plan.id);

    setPlanForm({
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
      plan.is_active ? 'تم إيقاف الباقة.' : 'تم تفعيل الباقة.'
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

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-extrabold text-stone-900">
          إعدادات المحل
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          إدارة هوية المحل والأسعار والباقات الخاصة به.
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
            باقات المحل
          </h3>
        </div>

        <div className="mb-6 rounded-xl bg-stone-50 p-4">
          <h4 className="mb-4 font-bold text-stone-800">
            {editingId ? 'تعديل الباقة' : 'إضافة باقة جديدة'}
          </h4>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={planForm.name}
              onChange={(e) =>
                setPlanForm({ ...planForm, name: e.target.value })
              }
              placeholder="اسم الباقة"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5"
            />

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
              min="0"
              step="0.01"
              value={planForm.price}
              onChange={(e) =>
                setPlanForm({ ...planForm, price: e.target.value })
              }
              placeholder="السعر بالجنيه"
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
          </div>

          <textarea
            value={planForm.description}
            onChange={(e) =>
              setPlanForm({
                ...planForm,
                description: e.target.value,
              })
            }
            placeholder="وصف الباقة (اختياري)"
            rows={2}
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
              {editingId ? 'حفظ التعديلات' : 'إضافة الباقة'}
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

        <div className="space-y-3">
          {plans.length === 0 ? (
            <p className="rounded-xl bg-stone-50 py-8 text-center text-sm text-stone-500">
              لا توجد باقات لهذا المحل حتى الآن.
            </p>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-extrabold text-stone-900">
                      {plan.name}
                    </h4>

                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${
                        plan.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {plan.is_active ? 'نشطة' : 'متوقفة'}
                    </span>
                  </div>

                  {plan.description && (
                    <p className="mt-1 text-sm text-stone-500">
                      {plan.description}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold text-stone-600">
                    <span>{plan.haircut_count} حلاقة</span>
                    <span>{formatPrice(Number(plan.price))}</span>
                    <span>{plan.duration_days} يوم</span>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => editPlan(plan)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50"
                  >
                    <Pencil className="h-4 w-4" />
                    تعديل
                  </button>

                  <button
                    type="button"
                    onClick={() => void togglePlan(plan)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50"
                  >
                    <Power className="h-4 w-4" />
                    {plan.is_active ? 'إيقاف' : 'تفعيل'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}