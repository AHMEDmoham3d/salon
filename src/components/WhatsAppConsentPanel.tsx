
import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Loader2, MessageCircle, X } from 'lucide-react';
import { getWhatsAppReceiptConsent, updateWhatsAppReceiptConsent } from '@/lib/api';

type Props = {
  customerName: string;
  phone: string | null;
};

export default function WhatsAppConsentPanel({ customerName, phone }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!phone?.trim()) {
        setLoading(false);
        return;
      }
      try {
        const consent = await getWhatsAppReceiptConsent(phone);
        if (!active) return;
        setEnabled(consent);
        setOpen(!consent);
      } catch (e) {
        console.error('WhatsApp consent lookup failed:', e);
        if (active) setError('تعذر تحميل حالة إشعارات واتساب. حاول مرة أخرى.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [phone]);

  const saveConsent = async (nextEnabled: boolean) => {
    if (!phone?.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await updateWhatsAppReceiptConsent(phone, nextEnabled);
      setEnabled(nextEnabled);
      setOpen(false);
      setNotice(nextEnabled
        ? 'تم تسجيل موافقتك. ستصلك إيصالات الزيارات بعد تفعيل خدمة الإرسال.'
        : 'تم إيقاف إيصالات الزيارات على واتساب.');
    } catch (e) {
      console.error('WhatsApp consent update failed:', e);
      setError('لم نتمكن من حفظ اختيارك. حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <>
      <section className="card mt-4 flex items-center gap-3 p-4">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-600'}`}>
          {enabled ? <CheckCircle2 className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-stone-900">إيصالات الزيارات على واتساب</p>
          <p className="text-xs text-stone-500">{enabled ? 'مفعّلة لهذا الرقم' : 'غير مفعّلة حاليًا'}</p>
        </div>
        <button type="button" onClick={() => { setError(''); setOpen(true); }} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
          {enabled ? 'إدارة' : 'تفعيل'}
        </button>
      </section>

      {notice && <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{notice}</p>}
      {error && !open && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-stone-950/50" role="dialog" aria-modal="true" aria-labelledby="whatsapp-consent-title">
          <button type="button" aria-label="إغلاق النافذة" onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full cursor-default" />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">اختياري</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-full p-2 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="my-auto">
              <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <MessageCircle className="h-9 w-9" />
              </div>

              <h2 id="whatsapp-consent-title" className="text-2xl font-extrabold text-stone-900">
                خلي زياراتك دايمًا معاك على واتساب 
              </h2>

              <p className="mt-3 text-sm leading-7 text-stone-600">
                أهلًا {customerName} 👋
              </p>

              <p className="mt-3 text-sm leading-7 text-stone-600">
                مع ShaveUp، كل زيارة ليك ليها إيصال!
              </p>

              <p className="mt-3 text-sm leading-7 text-stone-600">
                فعّل إيصالات الزيارات على واتساب، وهيوصلك بعد كل زيارة إيصال يوضح اسم المحل وتفاصيل الزيارة، علشان تتأكد إن زيارتك اتسجلت وتتابع رصيد زياراتك ومكافآتك بسهولة.
              </p>

              <div className="mt-4 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">
                الرسائل هتوصلك من رقم شركة ShaveUp، وتقدر توقفها في أي وقت من صفحتك الشخصية.
              </div>

              <p className="mt-4 text-xs leading-5 text-stone-500">
                الميزة اختيارية تمامًا، واستخدامك لـ ShaveUp مش مرتبط بتفعيلها.
              </p>

              {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>

            <div className="space-y-3 pt-6">
              {enabled ? (
                <button type="button" disabled={saving} onClick={() => void saveConsent(false)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} إلغاء موافقتي
                </button>
              ) : (
                <button type="button" disabled={saving || !phone?.trim()} onClick={() => void saveConsent(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} أوافق على استلام الإيصالات
                </button>
              )}
              <button type="button" disabled={saving} onClick={() => setOpen(false)} className="w-full rounded-xl border border-stone-200 px-4 py-3 font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-60">ليس الآن</button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
