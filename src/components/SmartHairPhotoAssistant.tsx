
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Download,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  compareHaircut,
  createHairAiConsultation,
  editHairAiPreview,
  getHairAiQuota,
  resizeImageToDataUrl,
  type HairAiRecommendation,
} from '@/lib/hairAi';

type CustomerIdentity = {
  id: string;
  phone: string | null;
};

type Props = {
  customer: CustomerIdentity;
  shopId: string;
  hairType: string;
  faceShape: string;
  stylePreference: string;
};

type ComparisonResult = {
  matchPercent: number | null;
  summaryAr: string;
  summaryEn: string;
  matchesAr: string;
  matchesEn: string;
  differencesAr: string;
  differencesEn: string;
};

export default function SmartHairPhotoAssistant({
  customer,
  shopId,
  hairType,
  faceShape,
  stylePreference,
}: Props) {
  const { lang } = useI18n();
  const isArabic = lang === 'ar';

  const selfieInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [afterPhotoDataUrl, setAfterPhotoDataUrl] = useState<string | null>(null);
  const [referenceImageDataUrl, setReferenceImageDataUrl] = useState<string | null>(null);

  const [compareSavedMode, setCompareSavedMode] = useState(false);
  const [comparisonConsent, setComparisonConsent] = useState(false);
  const [consent, setConsent] = useState(false);

  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(true);

  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [comparing, setComparing] = useState(false);

  const [error, setError] = useState('');

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [recommendation, setRecommendation] =
    useState<HairAiRecommendation | null>(null);

  const [editInstruction, setEditInstruction] = useState('');
  const [editsUsed, setEditsUsed] = useState(0);

  const [comparison, setComparison] =
    useState<ComparisonResult | null>(null);

  const customerContext = {
    customerId: customer.id,
    shopId,
    customerPhone: customer.phone ?? '',
  };

  // Load the customer's available photo attempts.
  useEffect(() => {
    let active = true;

    setLoadingQuota(true);

    getHairAiQuota(customerContext)
      .then((result) => {
        if (active) {
          setQuotaRemaining(result.remaining);
        }
      })
      .catch((quotaError) => {
        console.error('Could not load hair AI quota:', quotaError);

        if (active) {
          setQuotaRemaining(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoadingQuota(false);
        }
      });

    return () => {
      active = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, customer.phone, shopId]);

  // Prepare an image locally without uploading it to Supabase Storage.
  const choosePhoto = async (
    file: File | undefined,
    target: 'before' | 'after' | 'reference',
  ) => {
    if (!file) return;

    setError('');

    try {
      const image = await resizeImageToDataUrl(file, 480);

      if (target === 'before') {
        setPhotoDataUrl(image);
      } else if (target === 'after') {
        setAfterPhotoDataUrl(image);
      } else {
        setImageDataUrl(image);
        setReferenceImageDataUrl(image);

        setRecommendation(null);
        setSessionId(null);
        setComparison(null);
        setCompareSavedMode(false);
      }
    } catch (photoError) {
      setError(
        photoError instanceof Error
          ? photoError.message
          : 'تعذر تجهيز الصورة.',
      );
    }
  };

  // Analyze the customer's selfie and create a hairstyle preview.
  const startConsultation = async () => {
    if (!photoDataUrl || !consent) return;

    setWorking(true);
    setError('');
    setComparison(null);

    try {
      const result = await createHairAiConsultation({
        ...customerContext,
        photoDataUrl,
        hairType,
        faceShape,
        stylePreference,
      });

      setSessionId(result.sessionId);
      setRecommendation(result.recommendation);

      setImageDataUrl(result.imageDataUrl);
      setReferenceImageDataUrl(result.imageDataUrl);

      setQuotaRemaining(result.remaining);
      setEditsUsed(0);

      setPhotoDataUrl(null);
      setConsent(false);
      setComparisonConsent(false);

      if (selfieInputRef.current) {
        selfieInputRef.current.value = '';
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'تعذر إنشاء اقتراح الحلاقة.',
      );

      if (
        requestError instanceof Error &&
        requestError.message.includes('الأربع محاولات')
      ) {
        setQuotaRemaining(0);
      }
    } finally {
      setWorking(false);
    }
  };

  // Allow a maximum of two edits per consultation.
  const applyEdit = async () => {
    if (
      !sessionId ||
      !imageDataUrl ||
      !editInstruction.trim() ||
      editsUsed >= 2
    ) {
      return;
    }

    setEditing(true);
    setError('');

    try {
      const result = await editHairAiPreview({
        ...customerContext,
        sessionId,
        imageDataUrl,
        instruction: editInstruction.trim(),
      });

      setImageDataUrl(result.imageDataUrl);
      setReferenceImageDataUrl(result.imageDataUrl);

      setEditsUsed(result.editsUsed);
      setEditInstruction('');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'تعذر تعديل الصورة.',
      );
    } finally {
      setEditing(false);
    }
  };

  // Compare the selected target hairstyle with the actual haircut.
  const runComparison = async () => {
    const targetImage = referenceImageDataUrl || imageDataUrl;

    if (
      !targetImage ||
      !afterPhotoDataUrl ||
      !comparisonConsent
    ) {
      return;
    }

    setComparing(true);
    setError('');

    try {
      const result = await compareHaircut({
        ...customerContext,
        photoDataUrl: afterPhotoDataUrl,
        referenceImageDataUrl: targetImage,
      });

      setComparison(result);
      setQuotaRemaining(result.remaining);

      setAfterPhotoDataUrl(null);
      setComparisonConsent(false);

      if (afterInputRef.current) {
        afterInputRef.current.value = '';
      }

      if (referenceInputRef.current) {
        referenceInputRef.current.value = '';
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'تعذرت مقارنة النتيجة.',
      );
    } finally {
      setComparing(false);
    }
  };

  // Clear the temporary images and start a fresh consultation.
  const startOver = () => {
    setPhotoDataUrl(null);
    setAfterPhotoDataUrl(null);
    setReferenceImageDataUrl(null);

    setCompareSavedMode(false);
    setConsent(false);
    setComparisonConsent(false);

    setImageDataUrl(null);
    setSessionId(null);
    setRecommendation(null);

    setEditInstruction('');
    setEditsUsed(0);
    setComparison(null);
    setError('');

    if (selfieInputRef.current) {
      selfieInputRef.current.value = '';
    }

    if (afterInputRef.current) {
      afterInputRef.current.value = '';
    }

    if (referenceInputRef.current) {
      referenceInputRef.current.value = '';
    }
  };

  const haircutName = recommendation
    ? isArabic
      ? recommendation.haircutNameAr
      : recommendation.haircutNameEn
    : '';

  const canStart =
    !!photoDataUrl &&
    consent &&
    quotaRemaining !== 0 &&
    !loadingQuota &&
    !working;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-stone-100 bg-stone-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-900 text-amber-400">
            <Sparkles className="h-5 w-5" />
          </div>

          <div>
            <h4 className="font-display text-lg font-extrabold text-stone-900">
              {isArabic
                ? 'جرّب الحلاقة على صورتك'
                : 'Preview a haircut on your photo'}
            </h4>

            <p className="text-xs text-stone-500">
              {isArabic
                ? 'اقتراح بالصورة وإجاباتك، مع إمكانية تعديل النتيجة'
                : 'A photo-based suggestion using your answers, with two edits'}
            </p>
          </div>
        </div>

        <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600">
          {loadingQuota
            ? isArabic
              ? 'جاري التحقق من المحاولات...'
              : 'Checking attempts...'
            : quotaRemaining === null
              ? isArabic
                ? 'حد الصور غير متاح حاليًا'
                : 'Photo limit unavailable'
              : isArabic
                ? `متاح ${quotaRemaining} من 4 صور / 48 ساعة`
                : `${quotaRemaining} of 4 photos available / 48h`}
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Initial consultation */}
        {!imageDataUrl && (
          <>
            <p className="max-w-3xl text-sm leading-7 text-stone-600">
              {isArabic
                ? 'بعد إجابتك على الأسئلة الثلاثة، صوّر نفسك من الأمام بإضاءة واضحة. هنحلل شكل الشعر ونقترح قصة، وبعدها ننشئ معاينة تقريبية لشكلها عليك.'
                : 'After answering the three questions, take a clear front-facing photo in good light. We will analyze the hairstyle, recommend a cut, and create a preview.'}
            </p>

            <button
              type="button"
              onClick={() => selfieInputRef.current?.click()}
              className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center transition hover:border-amber-400 hover:bg-amber-50/40"
            >
              <Camera className="h-7 w-7 text-stone-500" />

              <span className="font-bold text-stone-800">
                {isArabic
                  ? 'التقط صورة أو اختر صورة من جهازك'
                  : 'Take a photo or choose one from your device'}
              </span>

              <span className="text-xs text-stone-500">
                {isArabic
                  ? 'صورة واضحة للوجه والشعر — JPG أو PNG أو WEBP'
                  : 'Clear face and hair photo — JPG, PNG or WEBP'}
              </span>
            </button>

            <input
              ref={selfieInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              className="hidden"
              onChange={(event) =>
                void choosePhoto(event.target.files?.[0], 'before')
              }
            />

            {photoDataUrl && (
              <div className="flex flex-col gap-3 rounded-xl border border-stone-200 p-3 sm:flex-row sm:items-center">
                <img
                  src={photoDataUrl}
                  alt="Selected customer photo"
                  className="h-28 w-24 rounded-lg bg-stone-100 object-cover"
                />

                <div className="min-w-0 flex-1">
                  <p className="font-bold text-stone-800">
                    {isArabic
                      ? 'الصورة جاهزة للتحليل'
                      : 'Photo ready for analysis'}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    {isArabic
                      ? 'تم تصغير الصورة داخل جهازك قبل إرسالها.'
                      : 'The image was resized on your device before sending.'}
                  </p>

                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl(null)}
                    className="mt-2 text-xs font-bold text-stone-500 underline"
                  >
                    {isArabic ? 'اختيار صورة أخرى' : 'Choose another photo'}
                  </button>
                </div>
              </div>
            )}

            {/* Photo processing consent */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-stone-50 p-3 text-xs leading-6 text-stone-600">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-4 w-4 accent-stone-900"
              />

              <span>
                {isArabic
                  ? 'أوافق على إرسال صورتي مؤقتًا إلى خدمة الذكاء الاصطناعي لتحليل الشعر وإنشاء المعاينة. لن يحفظ ShaveUp الصورة في قاعدة البيانات أو التخزين.'
                  : 'I agree to temporarily send my photo to the AI provider for hair analysis and preview generation. ShaveUp will not save the photo in its database or storage.'}
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
                <LockKeyhole className="h-3.5 w-3.5" />

                {isArabic
                  ? 'لا يتم رفع الصورة إلى Supabase Storage'
                  : 'The photo is not uploaded to Supabase Storage'}
              </span>

              <button
                type="button"
                onClick={() => void startConsultation()}
                disabled={!canStart}
                className="btn-primary min-w-44"
              >
                {working ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-amber-400" />
                )}

                {working
                  ? isArabic
                    ? 'جاري التحليل وإنشاء الصورة...'
                    : 'Analyzing and creating preview...'
                  : isArabic
                    ? 'اقترح لي حلاقة'
                    : 'Suggest a haircut'}
              </button>
            </div>

            {quotaRemaining === 0 && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-800">
                {isArabic
                  ? 'استخدمت كل الصور المتاحة خلال آخر 48 ساعة. جرّب بعد انتهاء فترة الانتظار.'
                  : 'You have used all photo attempts in the last 48 hours. Try again when the window resets.'}
              </p>
            )}

            {/* Use a previously downloaded target image */}
            <div className="border-t border-stone-100 pt-4">
              <button
                type="button"
                onClick={() =>
                  setCompareSavedMode((current) => !current)
                }
                className="text-sm font-bold text-stone-700 underline underline-offset-4"
              >
                {isArabic
                  ? 'عندي صورة الحلاقة اللي حفظتها وعايز أقارنها بعد الحلاقة'
                  : 'I saved my target haircut image and want to compare it later'}
              </button>

              {compareSavedMode && (
                <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <p className="text-sm leading-6 text-stone-600">
                    {isArabic
                      ? 'اختار صورة الحلاقة المستهدفة التي حملتها سابقًا. بعد ذلك صوّر نفسك بعد الحلاقة. صورة الهدف لا تُحسب من محاولات التصوير الأربع.'
                      : 'Choose the target haircut preview you downloaded earlier, then take an after-haircut photo. The saved target image does not use one of your four selfie attempts.'}
                  </p>

                  <button
                    type="button"
                    onClick={() => referenceInputRef.current?.click()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-100"
                  >
                    <Download className="h-4 w-4" />

                    {isArabic
                      ? 'اختيار صورة الحلاقة المحفوظة'
                      : 'Choose saved target image'}
                  </button>

                  <input
                    ref={referenceInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) =>
                      void choosePhoto(event.target.files?.[0], 'reference')
                    }
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* AI-generated recommendation */}
        {imageDataUrl && recommendation && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
            <div className="overflow-hidden rounded-2xl bg-stone-100">
              <img
                src={imageDataUrl}
                alt={
                  isArabic
                    ? 'معاينة قصة الشعر المقترحة'
                    : 'Suggested haircut preview'
                }
                className="max-h-[620px] w-full object-contain"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white p-3">
                <span className="text-xs font-bold text-stone-600">
                  {isArabic
                    ? 'معاينة تقريبية — راجعها مع الحلاق'
                    : 'AI preview — review it with your barber'}
                </span>

                <a
                  href={imageDataUrl}
                  download="ShaveUp-haircut-preview.png"
                  className="btn-primary px-4 py-2 text-xs"
                >
                  <Download className="h-4 w-4" />

                  {isArabic ? 'تحميل الصورة' : 'Download image'}
                </a>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-amber-700">
                  {isArabic ? 'اقتراحنا لك' : 'Our recommendation'}
                </span>

                <h5 className="mt-1 font-display text-2xl font-extrabold text-stone-900">
                  {haircutName}
                </h5>

                <p className="mt-2 text-sm leading-7 text-stone-600">
                  {isArabic
                    ? recommendation.whyAr
                    : recommendation.whyEn}
                </p>
              </div>

              <div className="rounded-xl border border-stone-200 p-3">
                <p className="mb-1 flex items-center gap-2 text-xs font-bold text-stone-700">
                  <Scissors className="h-4 w-4" />

                  {isArabic ? 'ملاحظات للحلاق' : 'Notes for the barber'}
                </p>

                <p className="text-sm leading-6 text-stone-600">
                  {isArabic
                    ? recommendation.barberInstructionsAr
                    : recommendation.barberInstructionsEn}
                </p>
              </div>

              {/* Two permitted edits */}
              <div className="rounded-xl bg-stone-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-stone-800">
                    {isArabic ? 'تحب تعدّل حاجة؟' : 'Would you like an adjustment?'}
                  </p>

                  <span className="text-xs font-bold text-stone-500">
                    {isArabic
                      ? `${2 - editsUsed} من تعديلين متبقيين`
                      : `${2 - editsUsed} of 2 edits left`}
                  </span>
                </div>

                <textarea
                  value={editInstruction}
                  onChange={(event) =>
                    setEditInstruction(event.target.value.slice(0, 220))
                  }
                  rows={3}
                  maxLength={220}
                  disabled={editsUsed >= 2 || editing}
                  placeholder={
                    isArabic
                      ? 'مثال: قصّر الجوانب أكثر وخلي الشعر من فوق أطول...'
                      : 'Example: Shorter sides and a little more length on top...'
                  }
                  className="input resize-none"
                />

                <button
                  type="button"
                  onClick={() => void applyEdit()}
                  disabled={
                    !editInstruction.trim() ||
                    editsUsed >= 2 ||
                    editing
                  }
                  className="btn-primary mt-3 w-full"
                >
                  {editing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}

                  {editing
                    ? isArabic
                      ? 'جاري التعديل...'
                      : 'Applying edit...'
                    : isArabic
                      ? 'تنفيذ التعديل'
                      : 'Apply edit'}
                </button>
              </div>

              <p className="text-xs leading-6 text-stone-500">
                {isArabic
                  ? 'الصورة الناتجة والتعديلات محفوظة في ذاكرة الصفحة فقط. عند إغلاق الصفحة ستحتاج إلى بدء استشارة جديدة.'
                  : 'The generated preview and edits stay in page memory only. Closing the page clears them.'}
              </p>
            </div>
          </div>
        )}

        {/* Previously downloaded target image */}
        {imageDataUrl && !recommendation && (
          <div className="flex flex-col gap-3 rounded-xl border border-stone-200 p-3 sm:flex-row sm:items-center">
            <img
              src={imageDataUrl}
              alt={isArabic ? 'صورة الحلاقة المستهدفة' : 'Saved target haircut'}
              className="h-28 w-24 rounded-lg bg-stone-100 object-cover"
            />

            <div className="min-w-0 flex-1">
              <p className="font-bold text-stone-800">
                {isArabic
                  ? 'صورة الحلاقة المستهدفة جاهزة للمقارنة'
                  : 'Target haircut image ready'}
              </p>

              <p className="mt-1 text-xs text-stone-500">
                {isArabic
                  ? 'الصورة موجودة على جهازك وفي ذاكرة الصفحة فقط.'
                  : 'This image stays on your device and in page memory only.'}
              </p>
            </div>

            <button
              type="button"
              onClick={startOver}
              className="text-xs font-bold text-stone-500 underline"
            >
              {isArabic ? 'العودة للاستشارة' : 'Back to consultation'}
            </button>
          </div>
        )}

        {/* Optional after haircut comparison */}
        {imageDataUrl && (
          <div className="space-y-4 border-t border-stone-100 pt-5">
            <div>
              <h5 className="font-display text-lg font-extrabold text-stone-900">
                {isArabic
                  ? 'بعد الحلاقة: تحب تقارن النتيجة؟'
                  : 'After your haircut: compare the result?'}
              </h5>

              <p className="mt-1 text-xs leading-6 text-stone-500">
                {isArabic
                  ? 'دي خطوة اختيارية. صوّر نفسك بعد الحلاقة، وهنقدّر مدى تشابه القصة الفعلية مع الصورة المستهدفة.'
                  : 'This is optional. Take a photo after the haircut and we will estimate how closely it matches the target preview.'}
              </p>
            </div>

            {!comparison ? (
              <>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-stone-50 p-3 text-xs leading-6 text-stone-600">
                  <input
                    type="checkbox"
                    checked={comparisonConsent}
                    onChange={(event) =>
                      setComparisonConsent(event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-stone-900"
                  />

                  <span>
                    {isArabic
                      ? 'أوافق على إرسال صورة الحلاقة المستهدفة وصورتي بعد الحلاقة مؤقتًا لخدمة الذكاء الاصطناعي لإجراء المقارنة.'
                      : 'I agree to temporarily send the target and after-haircut images to the AI service for comparison.'}
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => afterInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-4 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
                >
                  <Camera className="h-4 w-4" />

                  {isArabic
                    ? 'تصوير النتيجة بعد الحلاقة'
                    : 'Choose after-haircut photo'}
                </button>

                <input
                  ref={afterInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="user"
                  className="hidden"
                  onChange={(event) =>
                    void choosePhoto(event.target.files?.[0], 'after')
                  }
                />

                {afterPhotoDataUrl && (
                  <div className="flex flex-col gap-3 rounded-xl border border-stone-200 p-3 sm:flex-row sm:items-center">
                    <img
                      src={afterPhotoDataUrl}
                      alt="After haircut photo"
                      className="h-28 w-24 rounded-lg bg-stone-100 object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-stone-800">
                        {isArabic
                          ? 'صورة ما بعد الحلاقة جاهزة'
                          : 'After photo ready'}
                      </p>

                      <button
                        type="button"
                        onClick={() => setAfterPhotoDataUrl(null)}
                        className="mt-2 text-xs font-bold text-stone-500 underline"
                      >
                        {isArabic
                          ? 'اختيار صورة أخرى'
                          : 'Choose another photo'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void runComparison()}
                      disabled={
                        comparing ||
                        quotaRemaining === 0 ||
                        !comparisonConsent
                      }
                      className="btn-primary shrink-0"
                    >
                      {comparing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}

                      {comparing
                        ? isArabic
                          ? 'جاري المقارنة...'
                          : 'Comparing...'
                        : isArabic
                          ? 'قارن النتيجة'
                          : 'Compare result'}
                    </button>
                  </div>
                )}

                {quotaRemaining === 0 && (
                  <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-800">
                    {isArabic
                      ? 'لا توجد محاولات صور متبقية للمقارنة الآن؛ المقارنة تحتسب صورة إضافية من حد الـ 4 صور.'
                      : 'No photo attempts remain. Comparison uses one of the four photo attempts.'}
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-amber-400 bg-white text-center">
                    <span className="font-display text-2xl font-extrabold text-stone-900">
                      {comparison.matchPercent === null
                        ? '—'
                        : `${comparison.matchPercent}%`}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-stone-900">
                      {isArabic
                        ? 'تقدير التشابه البصري'
                        : 'Estimated visual similarity'}
                    </p>

                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      {isArabic
                        ? comparison.summaryAr
                        : comparison.summaryEn}
                    </p>
                  </div>
                </div>

                {(
                  (isArabic
                    ? comparison.matchesAr
                    : comparison.matchesEn) ||
                  (isArabic
                    ? comparison.differencesAr
                    : comparison.differencesEn)
                ) && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(isArabic
                      ? comparison.matchesAr
                      : comparison.matchesEn) && (
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs font-bold text-emerald-700">
                          {isArabic ? 'نقاط متشابهة' : 'Similarities'}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-stone-600">
                          {isArabic
                            ? comparison.matchesAr
                            : comparison.matchesEn}
                        </p>
                      </div>
                    )}

                    {(isArabic
                      ? comparison.differencesAr
                      : comparison.differencesEn) && (
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs font-bold text-stone-700">
                          {isArabic
                            ? 'اختلافات ملحوظة'
                            : 'Visible differences'}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-stone-600">
                          {isArabic
                            ? comparison.differencesAr
                            : comparison.differencesEn}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <p className="mt-3 text-xs leading-5 text-stone-500">
                  {isArabic
                    ? 'النسبة تقديرية وليست قياسًا دقيقًا؛ اختلاف زاوية التصوير والإضاءة قد يؤثر عليها.'
                    : 'The percentage is an estimate, not an exact measurement. Camera angle and lighting can affect it.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        {imageDataUrl && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
              <LockKeyhole className="h-3.5 w-3.5" />

              {isArabic
                ? 'لا يتم حفظ الصور في ShaveUp'
                : 'Images are not stored by ShaveUp'}
            </span>

            <button
              type="button"
              onClick={startOver}
              className="text-xs font-bold text-stone-600 underline underline-offset-4"
            >
              {isArabic
                ? 'بدء استشارة جديدة'
                : 'Start a new consultation'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
