
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(value))
  );
}

async function createShopSession(
  shopId: string,
  adminId: string,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = encodeJson({
    alg: "HS256",
    typ: "JWT",
  });

  const payload = encodeJson({
    shop_id: shopId,
    admin_id: adminId,
    iat: now,
    exp: now + 8 * 60 * 60,
  });

  const unsignedToken = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  return `${unsignedToken}.${base64UrlEncode(
    new Uint8Array(signature)
  )}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = {
    ...corsHeaders,
    "Content-Type": "application/json",
  };

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders }
    );
  }

  try {
    const { phone, email } = await req.json();

    const normalizedPhone = String(phone ?? "").trim();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();

    if (
      !normalizedPhone ||
      !normalizedEmail ||
      normalizedPhone.length > 30 ||
      normalizedEmail.length > 254
    ) {
      return new Response(
        JSON.stringify({ ok: false }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sessionSecret = Deno.env.get("SHOP_SESSION_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !sessionSecret) {
      throw new Error("Server configuration is incomplete");
    }

    if (sessionSecret.length < 32) {
      throw new Error("SHOP_SESSION_SECRET must be at least 32 characters");
    }

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: admin, error: adminError } = await adminClient
      .from("shop_admins")
      .select("id, shop_id, full_name, phone, email, national_id, created_at")
      .eq("phone", normalizedPhone)
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (adminError) {
      console.error("Shop admin lookup failed:", adminError.message);
      throw new Error("Login lookup failed");
    }

    if (!admin) {
      return new Response(
        JSON.stringify({ ok: false }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("*")
      .eq("id", admin.shop_id)
      .maybeSingle();

    if (shopError) {
      console.error("Shop lookup failed:", shopError.message);
      throw new Error("Shop lookup failed");
    }

    if (!shop) {
      return new Response(
        JSON.stringify({ ok: false }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const sessionToken = await createShopSession(
      shop.id,
      admin.id,
      sessionSecret
    );

    return new Response(
      JSON.stringify({
        ok: true,
        shop,
        admin,
        sessionToken,
        expiresIn: 8 * 60 * 60,
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (error) {
    console.error("Shop admin login error:", error);

    return new Response(
      JSON.stringify({
        error: "حدث خطأ أثناء تسجيل الدخول.",
      }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
