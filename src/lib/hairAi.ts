import { supabase } from '@/lib/supabase';

export type HairAiCustomerContext = {
  customerId: string;
  shopId: string;
  customerPhone: string;
};

export type HairAiRecommendation = {
  haircutNameAr: string;
  haircutNameEn: string;
  whyAr: string;
  whyEn: string;
  barberInstructionsAr: string;
  barberInstructionsEn: string;
  imagePrompt: string;
};

export type HairAiQuota = {
  used: number;
  remaining: number;
};

export type HairAiResponse<T> = T & { ok: true };

async function invokeHairAi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('shaveup-hair-ai', { body });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json();
        if (typeof payload?.error === 'string') throw new Error(payload.error);
      } catch (nestedError) {
        if (nestedError instanceof Error && nestedError.message !== 'Unexpected end of JSON input') {
          throw nestedError;
        }
      }
    }
    throw new Error(error.message || 'تعذر الاتصال بخدمة استشارة الحلاقة.');
  }

  if (!data?.ok) throw new Error(data?.error || 'حدث خطأ أثناء استشارة الحلاقة.');
  return data as T;
}

export async function getHairAiQuota(context: HairAiCustomerContext): Promise<HairAiQuota> {
  return invokeHairAi<HairAiQuota & { ok: true }>({ action: 'quota', ...context });
}

export async function createHairAiConsultation(params: HairAiCustomerContext & {
  photoDataUrl: string;
  hairType: string;
  faceShape: string;
  stylePreference: string;
}): Promise<{
  ok: true;
  sessionId: string;
  recommendation: HairAiRecommendation;
  imageDataUrl: string;
  remaining: number;
  editsRemaining: number;
}> {
  return invokeHairAi({ action: 'consult', ...params });
}

export async function editHairAiPreview(params: HairAiCustomerContext & {
  sessionId: string;
  imageDataUrl: string;
  instruction: string;
}): Promise<{ ok: true; imageDataUrl: string; editsUsed: number; editsRemaining: number }> {
  // FLUX.2 Klein requires each reference input image to be smaller than 512x512.
  // Resize the generated preview in the browser before sending it for an edit.
  const editImageDataUrl = await resizeDataUrlToDataUrl(params.imageDataUrl, 480);
  return invokeHairAi({ action: 'edit', ...params, imageDataUrl: editImageDataUrl });
}

export async function compareHaircut(params: HairAiCustomerContext & {
  photoDataUrl: string;
  referenceImageDataUrl: string;
}): Promise<{
  ok: true;
  matchPercent: number | null;
  summaryAr: string;
  summaryEn: string;
  matchesAr: string;
  matchesEn: string;
  differencesAr: string;
  differencesEn: string;
  remaining: number;
}> {
  // Keep both reference images compact for a reliable request payload.
  const referenceImageDataUrl = await resizeDataUrlToDataUrl(params.referenceImageDataUrl, 480);
  return invokeHairAi({ action: 'compare', ...params, referenceImageDataUrl });
}

export async function resizeImageToDataUrl(file: File, maxDimension = 480): Promise<string> {
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(file.type)) throw new Error('اختار صورة بصيغة JPG أو PNG أو WEBP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('حجم الصورة كبير. اختار صورة أقل من 10 ميجابايت.');

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر تجهيز الصورة على هذا الجهاز.');
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('تعذر ضغط الصورة.'));
      }, 'image/jpeg', 0.84);
    });

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('تعذر قراءة الصورة.'));
      reader.onerror = () => reject(new Error('تعذر قراءة الصورة.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

export async function resizeDataUrlToDataUrl(dataUrl: string, maxDimension = 480): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) throw new Error('الصورة غير صالحة للتعديل.');

  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('تعذر قراءة الصورة الناتجة.');
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر تجهيز الصورة على هذا الجهاز.');
    context.drawImage(bitmap, 0, 0, width, height);

    const resizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('تعذر ضغط الصورة للتعديل.'));
      }, 'image/jpeg', 0.84);
    });

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('تعذر قراءة الصورة.'));
      reader.onerror = () => reject(new Error('تعذر قراءة الصورة.'));
      reader.readAsDataURL(resizedBlob);
    });
  } finally {
    bitmap.close();
  }
}