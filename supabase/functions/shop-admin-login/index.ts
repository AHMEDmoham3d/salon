import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

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
): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = now + SESSION_DURATION_SECONDS;

  const header = encodeJson({
    alg: "HS256",
    typ: "JWT",
  });

  const payload = encodeJson({
    shop_id: shopId,
    admin_id: adminId,
    iat: now,
    exp: expiresAtSeconds,
  });

  const unsignedToken = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const token = `${unsignedToken}.${base64UrlEncode(
    new Uint8Array(signature)
  )}`;

  return {
    token,
    expiresAt: new Date(
      expiresAtSeconds * 1000
    ).toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "Method not allowed",
      },
      405
    );
  }

  try {
    let body: Record<string, unknown>;

    try {
      const parsedBody = await req.json();

      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return jsonResponse({ ok: false });
      }

      body = parsedBody as Record<string, unknown>;
    } catch {
      return jsonResponse({ ok: false });
    }

    const normalizedPhone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : "";

    const normalizedEmail =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (
      !normalizedPhone ||
      !normalizedEmail ||
      normalizedPhone.length > 30 ||
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return jsonResponse({ ok: false });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    const sessionSecret = Deno.env.get(
      "SHOP_SESSION_SECRET"
    );

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !sessionSecret
    ) {
      throw new Error(
        "Server configuration is incomplete"
      );
    }

    if (sessionSecret.length < 32) {
      throw new Error(
        "SHOP_SESSION_SECRET must be at least 32 characters"
      );
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

    const { data: admin, error: adminError } =
      await adminClient
        .from("shop_admins")
        .select(
          "id, shop_id, full_name, phone, email, national_id, created_at"
        )
        .eq("phone", normalizedPhone)
        .eq("email", normalizedEmail)
        .maybeSingle();

    if (adminError) {
      console.error(
        "Shop admin lookup failed:",
        adminError.message
      );

      throw new Error("Login lookup failed");
    }

    if (!admin) {
      return jsonResponse({ ok: false });
    }

    const { data: shop, error: shopError } =
      await adminClient
        .from("shops")
        .select("*")
        .eq("id", admin.shop_id)
        .maybeSingle();

    if (shopError) {
      console.error(
        "Shop lookup failed:",
        shopError.message
      );

      throw new Error("Shop lookup failed");
    }

    if (!shop) {
      return jsonResponse({ ok: false });
    }

    const session = await createShopSession(
      shop.id,
      admin.id,
      sessionSecret
    );

    return jsonResponse({
      ok: true,
      shop,
      admin,
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      expiresIn: SESSION_DURATION_SECONDS,
    });
  } catch (error) {
    console.error("Shop admin login error:", error);

    return jsonResponse(
      {
        ok: false,
        error: "حدث خطأ أثناء تسجيل الدخول.",
      },
      500
    );
  }
});