import { supabase } from './supabase';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.error('Service worker registration failed:', error);
    return null;
  }
}

export async function enableShopBookingPush(shopId: string): Promise<{ ok: boolean; message: string }> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, message: 'هذا المتصفح لا يدعم الإشعارات الفورية.' };
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { ok: false, message: 'مفتاح VAPID العام (VITE_VAPID_PUBLIC_KEY) غير مضبوط.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      message: 'تم رفض إذن الإشعارات. فعّل الإشعارات من إعدادات المتصفح للموقع.',
    };
  }

  const reg = await registerServiceWorker();
  if (!reg || !reg.pushManager) {
    return { ok: false, message: 'تعذر تفعيل خدمة الإشعارات في الخلفية.' };
  }

  const existingSub = await reg.pushManager.getSubscription();
  const subscription =
    existingSub ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return { ok: false, message: 'بيانات اشتراك الإشعارات غير مكتملة.' };
  }

  const { error } = await supabase
    .from('shop_push_subscriptions')
    .upsert(
      {
        shop_id: shopId,
        endpoint,
        p256dh,
        auth,
        device_label: navigator.userAgent.slice(0, 100),
      },
      { onConflict: 'endpoint' }
    );

  if (error) {
    return { ok: false, message: `تعذر حفظ جهاز الإشعارات: ${error.message}` };
  }

  playBookingAlertSound();
  return {
    ok: true,
    message: 'تم تفعيل الإشعارات والصوت والاهتزاز على هذا الجهاز بنجاح.',
  };
}

export function playBookingAlertSound(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([500, 180, 500, 180, 750]);
    }
  } catch {
    // ignore unsupported vibration
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const notes = [880, 1174.66, 880, 1318.51];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);

      gain.gain.setValueAtTime(0.001, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.35, now + idx * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.15);
    });

    setTimeout(() => {
      void ctx.close();
    }, 1200);
  } catch {
    // ignore autoplay restriction if audio context isn't unlocked yet
  }
}

export async function triggerBookingPushNotification(payload: {
  shop_id: string;
  booking_id?: string | null;
  booking_code?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  service_name?: string | null;
  start_at?: string | null;
  auto_confirmed?: boolean;
  status?: string | null;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-booking-push', {
      body: payload,
    });
  } catch (error) {
    console.error('Failed to trigger booking push notification:', error);
  }
}