import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

type JsonRecord = Record<string, unknown>;
type HairAiContext = {
  customerId: string;
  shopId: string;
  customerPhone: string;
};

type Recommendation = {
  haircutNameAr: string;
  haircutNameEn: string;
  whyAr: string;
  whyEn: string;
  barberInstructionsAr: string;
  barberInstructionsEn: string;
  imagePrompt: string;
};

const QWEN_MODEL = "@cf/qwen/qwen3.8-27b";
const FLUX_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const MAX_IMAGE_DATA_URL_LENGTH = 2_400_000;

function json(data: JsonRecord, status = 200): Response {
  return Response.json(data, { status });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getImageDataUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_IMAGE_DATA_URL_LENGTH) return null;
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) return null;
  return value;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("Invalid image data");
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function extractModelText(payload: any): string {
  const candidates = [
    payload?.result?.response,
    payload?.result?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.message?.content,
    payload?.result?.output_text,
    payload?.output_text,
  ];
  const candidate = candidates.find((item) => typeof item === "string" && item.trim());
  if (typeof candidate === "string") return candidate.trim();
  throw new Error("The vision model returned an empty response");
}

function parseJsonText(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return valid JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeRecommendation(value: Record<string, unknown>): Recommendation {
  const stringValue = (key: string, fallback: string) =>
    typeof value[key] === "string" && String(value[key]).trim()
      ? String(value[key]).trim().slice(0, 1200)
      : fallback;

  return {
    haircutNameAr: stringValue("haircutNameAr", "قصة متدرجة عصرية"),
    haircutNameEn: stringValue("haircutNameEn", "Modern Taper"),
    whyAr: stringValue("whyAr", "اقتراح مبدئي يعتمد على الصورة وإجاباتك."),
    whyEn: stringValue("whyEn", "A starting recommendation based on your photo and answers."),
    barberInstructionsAr: stringValue("barberInstructionsAr", "اعرض الصورة على الحلاق واتفق معه على الطول المناسب."),
    barberInstructionsEn: stringValue("barberInstructionsEn", "Show the preview to your barber and agree on the final length."),
    imagePrompt: stringValue("imagePrompt", "A natural modern short haircut with a clean taper."),
  };
}

function cloudflareUrl(accountId: string, model: string) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

async function callQwen(
  accountId: string,
  token: string,
  content: Array<Record<string, unknown>>,
  systemPrompt: string,
): Promise<string> {
  const response = await fetch(cloudflareUrl(accountId, QWEN_MODEL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      max_completion_tokens: 700,
      temperature: 0.2,
      store: false,
    }),
    signal: AbortSignal.timeout(75_000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    console.error("Cloudflare Qwen error", response.status, payload?.errors ?? "request failed");
    throw new Error(`Vision request failed (${response.status})`);
  }
  return extractModelText(payload);
}

async function callFlux(
  accountId: string,
  token: string,
  inputImageDataUrl: string,
  prompt: string,
): Promise<string> {
  const form = new FormData();
  form.set("prompt", prompt.slice(0, 3500));
  form.set("width", "768");
  form.set("height", "1024");
  form.set("guidance", "4");
  form.set("input_image_0", dataUrlToBlob(inputImageDataUrl), "customer-reference.jpg");

  const response = await fetch(cloudflareUrl(accountId, FLUX_MODEL), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(75_000),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    console.error("Cloudflare FLUX error", response.status);
    throw new Error(`Image generation failed (${response.status})`);
  }

  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:${contentType.split(";")[0]};base64,${btoa(binary)}`;
  }

  const payload = await response.json().catch(() => ({}));
  const image = payload?.result?.image ?? payload?.image;
  if (typeof image !== "string" || !image.length) {
    console.error("Cloudflare FLUX returned no image", payload?.errors ?? "missing image field");
    throw new Error("Image model returned no image");
  }
  return image.startsWith("data:image/") ? image : `data:image/png;base64,${image}`;
}

function buildHaircutPrompt(recommendation: Recommendation) {
  return [
    "Edit the person in reference image 0 into a realistic barber haircut preview.",
    "Preserve the same person's identity and recognizable facial features, face shape, skin tone, expression, head angle, pose, clothing, background, camera framing, and lighting.",
    "Change the hairstyle and hair grooming only. Do not beautify, reshape, retouch, age, or alter the face.",
    `Requested haircut: ${recommendation.haircutNameEn}.`,
    `Haircut details: ${recommendation.imagePrompt}.`,
    "Photorealistic natural result, realistic hair texture, clean professional barbershop finish. No text, no labels, no watermark, no split screen.",
  ].join(" ");
}

async function reservePhotoAttempt(
  admin: any,
  context: HairAiContext,
  usageType: "consult" | "compare",
) {
  const { data, error } = await admin.rpc("reserve_customer_hair_ai_photo", {
    p_customer_id: context.customerId,
    p_shop_id: context.shopId,
    p_usage_type: usageType,
  });
  if (error) {
    console.error("Photo quota reservation failed", error);
    throw new Error("تعذر التحقق من عدد المحاولات. تأكد من تنفيذ SQL الخاص بالاستشارة الذكية.");
  }
  return data as {
    allowed: boolean;
    reason?: string;
    usage_id?: string;
    remaining?: number;
    retry_at?: string | null;
  };
}

async function releasePhotoAttempt(admin: any, usageId: string | undefined) {
  if (!usageId) return;
  const { error } = await admin.from("customer_hair_ai_photo_usage").delete().eq("id", usageId);
  if (error) console.error("Could not release failed photo attempt", error);
}

async function validateCustomer(admin: any, context: HairAiContext) {
  const { data, error } = await admin
    .from("customers")
    .select("id, name, phone, shop_id, is_blocked")
    .eq("id", context.customerId)
    .eq("shop_id", context.shopId)
    .eq("phone", context.customerPhone)
    .maybeSingle();

  if (error || !data || data.is_blocked) return false;
  return true;
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ ok: false, error: "POST method required" }, 405);

    let usageId: string | undefined;
    let editReservation: { sessionId: string; previousCount: number } | undefined;
    const admin = ctx.supabaseAdmin;

    try {
      const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
      const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
      if (!accountId || !token) return json({ ok: false, error: "Cloudflare secrets are missing" }, 500);

      const body = await req.json() as Record<string, unknown>;
      const action = body.action;
      const customerId = body.customerId;
      const shopId = body.shopId;
      const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";

      if (!isUuid(customerId) || !isUuid(shopId) || !customerPhone) {
        return json({ ok: false, error: "بيانات العميل غير مكتملة. سجّل خروجًا ثم ادخل مرة أخرى." }, 400);
      }

      const customerContext: HairAiContext = { customerId, shopId, customerPhone };
      const validCustomer = await validateCustomer(admin, customerContext);
      if (!validCustomer) return json({ ok: false, error: "تعذر التحقق من حساب العميل في هذا المحل." }, 403);

      if (action === "quota") {
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { count, error } = await admin
          .from("customer_hair_ai_photo_usage")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customerId)
          .eq("shop_id", shopId)
          .gte("created_at", since);
        if (error) throw new Error("تعذر قراءة حد الصور الحالي.");
        return json({ ok: true, used: count ?? 0, remaining: Math.max(0, 4 - (count ?? 0)) });
      }

      if (action === "consult") {
        const photoDataUrl = getImageDataUrl(body.photoDataUrl);
        const hairType = String(body.hairType ?? "").slice(0, 40);
        const faceShape = String(body.faceShape ?? "").slice(0, 40);
        const stylePreference = String(body.stylePreference ?? "").slice(0, 50);
        const validHairTypes = ["straight", "wavy", "curly", "coily"];
        const validFaceShapes = ["oval", "round", "square", "long"];
        const validStyles = ["classic", "modern", "bold", "low-maintenance"];
        if (
          !photoDataUrl ||
          !validHairTypes.includes(hairType) ||
          !validFaceShapes.includes(faceShape) ||
          !validStyles.includes(stylePreference)
        ) {
          return json({ ok: false, error: "الصورة أو إجابات الاستشارة غير مكتملة أو غير صحيحة." }, 400);
        }

        const reservation = await reservePhotoAttempt(admin, customerContext, "consult");
        if (!reservation.allowed) {
          return json({
            ok: false,
            code: "PHOTO_QUOTA_EXCEEDED",
            error: "استخدمت الأربع محاولات المتاحة خلال آخر 48 ساعة.",
            remaining: 0,
            retryAt: reservation.retry_at ?? null,
          }, 429);
        }
        usageId = reservation.usage_id;

        const analysisText = await callQwen(
          accountId,
          token,
          [
            {
              type: "text",
              text: [
                "Analyze only visible hairstyle characteristics and recommend one realistic men's haircut.",
                "Use the following customer answers as preferences, not as facts inferred from the photo:",
                `Hair type selected: ${hairType}. Face shape selected: ${faceShape}. Preferred style: ${stylePreference}.`,
                "Do not infer ethnicity, health, personality, identity, or other sensitive traits. Do not make absolute claims about facial suitability.",
                "Return valid JSON only with keys: haircutNameAr, haircutNameEn, whyAr, whyEn, barberInstructionsAr, barberInstructionsEn, imagePrompt.",
                "Keep advice practical for a barber. In imagePrompt describe the haircut shape, length, fade/taper and top texture clearly.",
              ].join("\n"),
            },
            { type: "image_url", image_url: { url: photoDataUrl } },
          ],
          "You are a careful professional barber consultation assistant. You provide practical, non-absolute hairstyle suggestions.",
        );
        const recommendation = normalizeRecommendation(parseJsonText(analysisText));
        const generatedImage = await callFlux(
          accountId,
          token,
          photoDataUrl,
          buildHaircutPrompt(recommendation),
                  const generatedImage = await callFlux(
          accountId,
          token,
          photoDataUrl,
          buildHaircutPrompt(recommendation),
        );

        // Save recommendation metadata only. No customer image is stored.
        const { data: session, error: sessionError } = await admin
          .from("customer_hair_ai_sessions")
          .insert({
            customer_id: customerId,
            shop_id: shopId,
            recommendation,
            edit_count: 0,
          })
          .select("id")
          .single();

        if (sessionError || !session) {
          throw new Error("تعذر حفظ بيانات جلسة الاستشارة.");
        }

        const { count, error: countError } = await admin
          .from("customer_hair_ai_photo_usage")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customerId)
          .eq("shop_id", shopId)
          .gte(
            "created_at",
            new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          );

        if (countError) {
          console.error("Could not calculate remaining quota", countError);
        }

        usageId = undefined;

        return json({
          ok: true,
          sessionId: session.id,
          recommendation,
          imageDataUrl: generatedImage,
          remaining: Math.max(0, 4 - (count ?? 1)),
          editsRemaining: 2,
        });
      }

      // ---------------------------------------------
      // EDIT THE GENERATED HAIRCUT PREVIEW
      // ---------------------------------------------
      if (action === "edit") {
        const sessionId = body.sessionId;
        const imageDataUrl = getImageDataUrl(body.imageDataUrl);
        const instruction =
          typeof body.instruction === "string"
            ? body.instruction.trim().slice(0, 220)
            : "";

        if (!isUuid(sessionId) || !imageDataUrl || !instruction) {
          return json(
            {
              ok: false,
              error: "بيانات التعديل غير مكتملة.",
            },
            400,
          );
        }

        const { data: session, error: sessionError } = await admin
          .from("customer_hair_ai_sessions")
          .select("id, recommendation, edit_count")
          .eq("id", sessionId)
          .eq("customer_id", customerId)
          .eq("shop_id", shopId)
          .maybeSingle();

        if (sessionError || !session) {
          return json(
            {
              ok: false,
              error: "جلسة الاستشارة غير موجودة.",
            },
            404,
          );
        }

        if (session.edit_count >= 2) {
          return json(
            {
              ok: false,
              code: "EDIT_LIMIT_REACHED",
              error: "استخدمت التعديلين المتاحين لهذه الاستشارة.",
            },
            429,
          );
        }

        // Reserve one of the two allowed edits atomically.
        const nextEditCount = session.edit_count + 1;

        const { data: reserved, error: reserveError } = await admin
          .from("customer_hair_ai_sessions")
          .update({
            edit_count: nextEditCount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId)
          .eq("edit_count", session.edit_count)
          .select("id")
          .maybeSingle();

        if (reserveError || !reserved) {
          return json(
            {
              ok: false,
              error: "تم إرسال تعديل آخر بالفعل. حدّث الصفحة وحاول مرة أخرى.",
            },
            409,
          );
        }

        editReservation = {
          sessionId,
          previousCount: session.edit_count,
        };

        const previousRecommendation = normalizeRecommendation(
          (session.recommendation ?? {}) as Record<string, unknown>,
        );

        const editedImage = await callFlux(
          accountId,
          token,
          imageDataUrl,
          [
            "Edit reference image 0.",
            "Preserve the same person and recognizable facial features.",
            "Preserve face shape, skin tone, expression, pose, clothes, camera framing and background.",
            "Change only the haircut according to this customer's requested adjustment.",
            `Original haircut: ${previousRecommendation.haircutNameEn}.`,
            `Customer adjustment: ${instruction}.`,
            "Keep the result photorealistic and natural.",
            "No text, no labels and no watermark.",
          ].join(" "),
        );

        editReservation = undefined;

        return json({
          ok: true,
          imageDataUrl: editedImage,
          editsUsed: nextEditCount,
          editsRemaining: 2 - nextEditCount,
        });
      }

      // ---------------------------------------------
      // OPTIONAL AFTER-HAIRCUT COMPARISON
      // ---------------------------------------------
      if (action === "compare") {
        const afterPhotoDataUrl = getImageDataUrl(body.photoDataUrl);
        const referenceImageDataUrl = getImageDataUrl(
          body.referenceImageDataUrl,
        );

        if (!afterPhotoDataUrl || !referenceImageDataUrl) {
          return json(
            {
              ok: false,
              error: "صورة النتيجة والصورة المستهدفة مطلوبتان للمقارنة.",
            },
            400,
          );
        }

        const reservation = await reservePhotoAttempt(
          admin,
          customerContext,
          "compare",
        );

        if (!reservation.allowed) {
          return json(
            {
              ok: false,
              code: "PHOTO_QUOTA_EXCEEDED",
              error: "استخدمت الأربع محاولات المتاحة خلال آخر 48 ساعة.",
              remaining: 0,
              retryAt: reservation.retry_at ?? null,
            },
            429,
          );
        }

        usageId = reservation.usage_id;

        const comparisonText = await callQwen(
          accountId,
          token,
          [
            {
              type: "text",
              text: [
                "Image 1 is the target haircut preview.",
                "Image 2 is the customer's actual haircut after the visit.",
                "Compare hairstyle similarity only.",
                "Ignore differences in background, clothes, camera angle and lighting.",
                "Return valid JSON only with these keys:",
                "matchPercent (number between 0 and 100),",
                "summaryAr, summaryEn, matchesAr, matchesEn, differencesAr, differencesEn.",
                "Treat the percentage as a visual estimate, not a precise measurement.",
                "Do not identify the person.",
              ].join(" "),
            },
            {
              type: "image_url",
              image_url: { url: referenceImageDataUrl },
            },
            {
              type: "text",
              text: "Image 2: actual result after haircut.",
            },
            {
              type: "image_url",
              image_url: { url: afterPhotoDataUrl },
            },
          ],
          "You compare hairstyle appearance between two images and explain uncertainty clearly.",
        );

        const comparison = parseJsonText(comparisonText);
        const rawPercent = Number(comparison.matchPercent);

        const matchPercent = Number.isFinite(rawPercent)
          ? Math.min(100, Math.max(0, Math.round(rawPercent)))
          : null;

        const { count, error: countError } = await admin
          .from("customer_hair_ai_photo_usage")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customerId)
          .eq("shop_id", shopId)
          .gte(
            "created_at",
            new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          );

        if (countError) {
          console.error("Could not calculate remaining quota", countError);
        }

        usageId = undefined;

        return json({
          ok: true,
          matchPercent,
          summaryAr: String(
            comparison.summaryAr ??
              "المقارنة تقديرية وقد تتأثر باختلاف زاوية التصوير والإضاءة.",
          ),
          summaryEn: String(
            comparison.summaryEn ??
              "This is an approximate visual comparison.",
          ),
          matchesAr: String(comparison.matchesAr ?? ""),
          matchesEn: String(comparison.matchesEn ?? ""),
          differencesAr: String(comparison.differencesAr ?? ""),
          differencesEn: String(comparison.differencesEn ?? ""),
          remaining: Math.max(0, 4 - (count ?? 1)),
        });
      }

      return json(
        {
          ok: false,
          error: "Unsupported action",
        },
        400,
      );
    } catch (error) {
      // Release the reserved selfie attempt after a technical failure.
      if (usageId) {
        await releasePhotoAttempt(admin, usageId);
      }

      // Release the edit reservation if image editing failed.
      if (editReservation) {
        const { error: rollbackError } = await admin
          .from("customer_hair_ai_sessions")
          .update({
            edit_count: editReservation.previousCount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editReservation.sessionId)
          .eq("edit_count", editReservation.previousCount + 1);

        if (rollbackError) {
          console.error(
            "Could not release failed edit reservation",
            rollbackError,
          );
        }
      }

      console.error("ShaveUp hair AI request failed", error);

      const message =
        error instanceof Error
          ? error.message
          : "Unexpected AI service error";

      return json(
        {
          ok: false,
          error: message.slice(0, 400),
        },
        502,
      );
    }
  }),
};